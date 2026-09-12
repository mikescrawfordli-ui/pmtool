import { DAYS, DEFAULT_MAX_CONSECUTIVE } from './constants.js';
import { presenceGrid, isLiftCertified, reqFor, skillMask, allocateDay, onProgram } from './schedule.js';

/* Weights: a missing body is worth far more than an extra one, and both
   outweigh cosmetic week-to-week smoothing. */
const W_SHORT = 1000;
const W_OVER = 25;
const W_SPREAD = 2;

/**
 * The knobs the balancer is allowed to turn for one person.
 *
 * Travelers: which rotation slot they start in, plus — for long-travel people
 * — which travel profile their first stint uses, since that decides whether
 * they lose Mondays or Fridays first.
 *
 * Locals: which day and which week in their cycle. The *frequency* itself is a
 * policy decision (as is "Never"), so the balancer keeps whatever you chose and
 * only moves the day-off around within it.
 */
export function optionsFor(person, maxOn = DEFAULT_MAX_CONSECUTIVE) {
  if (person.employment === 'Traveler') {
    const opts = [];
    const phases = person.longTravel ? [0, 1] : [person.travelPhase ?? 0];
    for (let i = 0; i <= maxOn; i++) {
      for (const ph of phases) opts.push({ rotationStart: i, travelPhase: ph });
    }
    return opts;
  }

  const every = person.localOffEvery ?? 0;
  if (!every) {
    // No recurring day off — nothing to arrange, and not ours to hand back.
    return [{ localOffEvery: 0, localOffDay: person.localOffDay || 'Fri', localOffOffset: 0 }];
  }

  const opts = [];
  for (const day of ['Fri', 'Mon']) {
    for (let off = 0; off < every; off++) {
      opts.push({ localOffEvery: every, localOffDay: day, localOffOffset: off });
    }
  }
  return opts;
}

function withOption(person, opt) {
  return { ...person, ...opt };
}

/**
 * What the balancer keeps per day.
 *
 * Scoring dedicated requirements needs to know *which* people are on site,
 * not just how many hold each skill — two RCx bodies who also do Injection
 * are a different situation from two who do not. So each day carries a count
 * per distinct skill-set ("group") present, which is enough to reconstruct
 * the day's roster for the matching while still updating in O(1) per person.
 */
function blankCoverage(numWeeks, nGroups) {
  const cov = [];
  for (let w = 0; w < numWeeks; w++) {
    const days = [];
    for (let d = 0; d < DAYS.length; d++) {
      days.push({ _total: 0, _lift: 0, groups: new Int16Array(nGroups) });
    }
    cov.push(days);
  }
  return cov;
}

/** Add (sign=+1) or remove (sign=-1) one person's contribution in place. */
function applyDelta(cov, grid, group, lift, sign) {
  for (let w = 0; w < grid.length; w++) {
    for (let d = 0; d < DAYS.length; d++) {
      if (!grid[w][d]) continue;
      const c = cov[w][d];
      c._total += sign;
      if (lift) c._lift += sign;
      c.groups[group] += sign;
    }
  }
}

/**
 * Requirements for one week, flattened into the form scoring wants: dedicated
 * demands as an array indexed by skill, soft minimums and caps as short lists.
 * Built once per balance rather than re-read inside the hot loop.
 */
function buildWeekPlans(site, numWeeks, ids) {
  const plans = [];
  for (let w = 0; w < numWeeks; w++) {
    const demand = new Array(ids.length).fill(0);
    const soft = [];
    const caps = [];
    let anyHard = false;
    for (let i = 0; i < ids.length; i++) {
      const r = reqFor(site, w, ids[i]);
      if (r.min > 0) {
        if (r.hard) {
          demand[i] = r.min;
          anyHard = true;
        } else {
          soft.push({ i, min: r.min });
        }
      }
      if (r.max != null && r.max !== '') caps.push({ i, max: r.max });
    }
    plans.push({
      demand,
      soft,
      caps,
      anyHard,
      key: `${demand.join('.')}|${soft.map((x) => `${x.i}:${x.min}`).join('.')}|${caps
        .map((x) => `${x.i}:${x.max}`)
        .join('.')}`,
    });
  }
  return plans;
}

/**
 * The score contribution of one day, memoised.
 *
 * Hill climbing revisits the same day composition constantly — a traveler
 * moving between rotation slots leaves most weeks looking exactly as they did
 * before. The cost of a day depends only on which skill-sets are present and
 * what that week demands, so the answer can be cached on those two things.
 * Weeks with identical requirements share entries via the plan key, which is
 * most of them.
 */
function dayCost(plan, day, ctx) {
  const { groupMasks, scratch, memo } = ctx;

  let n = 0;
  let sig = plan.key;
  for (let g = 0; g < groupMasks.length; g++) {
    const k = day.groups[g];
    sig += `,${k}`;
    for (let j = 0; j < k; j++) scratch[n++] = groupMasks[g];
  }

  const hit = memo.get(sig);
  if (hit !== undefined) return hit;

  let short = 0;
  let over = 0;

  if (plan.anyHard) {
    const { filled, owner } = allocateDay(scratch, plan.demand, n, plan.demand.length);
    for (let i = 0; i < plan.demand.length; i++) {
      if (plan.demand[i]) short += plan.demand[i] - filled[i];
    }
    for (const { i, min } of plan.soft) {
      const bit = 1 << i;
      let free = 0;
      for (let p = 0; p < n; p++) if (owner[p] === -1 && scratch[p] & bit) free++;
      if (free < min) short += min - free;
    }
  } else {
    for (const { i, min } of plan.soft) {
      const bit = 1 << i;
      let have = 0;
      for (let p = 0; p < n; p++) if (scratch[p] & bit) have++;
      if (have < min) short += min - have;
    }
  }

  for (const { i, max } of plan.caps) {
    const bit = 1 << i;
    let have = 0;
    for (let p = 0; p < n; p++) if (scratch[p] & bit) have++;
    if (have > max) over += have - max;
  }

  const cost = { short, over };
  memo.set(sig, cost);
  return cost;
}

function scoreCoverage(cov, plans, numWeeks, ctx) {
  let short = 0;
  let over = 0;

  for (let w = 0; w < numWeeks; w++) {
    const plan = plans[w];
    for (let d = 0; d < DAYS.length; d++) {
      const cost = dayCost(plan, cov[w][d], ctx);
      short += cost.short;
      over += cost.over;
    }
  }

  // Keep crew size steady week to week — churn is disruptive even when
  // every minimum is technically met.
  let mean = 0;
  const totals = [];
  for (let w = 0; w < numWeeks; w++) {
    let t = 0;
    for (let d = 0; d < DAYS.length; d++) t += cov[w][d]._total;
    const avg = t / DAYS.length;
    totals.push(avg);
    mean += avg;
  }
  mean /= Math.max(1, numWeeks);
  let spread = 0;
  for (const t of totals) spread += (t - mean) ** 2;
  spread /= Math.max(1, numWeeks);

  return short * W_SHORT + over * W_OVER + spread * W_SPREAD;
}

function buildContribution(person, numWeeks, maxOn, groupOf, index) {
  const { grid } = presenceGrid(person, numWeeks, maxOn);
  return { grid, group: groupOf(skillMask(person, index)), lift: isLiftCertified(person) };
}

/* Every field optionsFor() is allowed to hand back. Kept in step with it so
   the change count picks up a flipped travel phase or a shifted day-off week,
   not just a new rotation slot. */
const TURNED = ['rotationStart', 'travelPhase', 'localOffEvery', 'localOffDay', 'localOffOffset'];

/**
 * Hill-climb the rotation offsets (travelers) and biweekly day-off slots
 * (locals) until coverage stops improving. Locked people are left alone.
 *
 * Because each candidate move only swaps one person's contribution in and out
 * of a running coverage tally, evaluating an option is cheap enough to brute
 * force every person against every option, many times over.
 */
export function autoBalance(people, site, numWeeks, opts = {}) {
  const ids = opts.ids || [];
  const index = {};
  ids.forEach((id, i) => { index[id] = i; });
  const maxOn = opts.maxOn || DEFAULT_MAX_CONSECUTIVE;
  const restarts = opts.restarts ?? 5;
  const maxPasses = opts.maxPasses ?? 12;

  const movable = people.map((p, i) => (p.locked ? -1 : i)).filter((i) => i >= 0);
  if (movable.length === 0) {
    return { people, score: null, changed: 0 };
  }

  // Rotation changes move people around; they never change what a person can
  // do. So the distinct skill-sets are fixed for the whole balance and each
  // person's group index can be computed once.
  const groupMasks = [];
  const groupIndex = new Map();
  const groupOf = (mask) => {
    let g = groupIndex.get(mask);
    if (g === undefined) {
      g = groupMasks.length;
      groupMasks.push(mask);
      groupIndex.set(mask, g);
    }
    return g;
  };
  for (const p of people) groupOf(skillMask(p, index));

  const plans = buildWeekPlans(site, numWeeks, ids);
  const ctx = { groupMasks, scratch: new Int32Array(people.length), memo: new Map() };

  let bestPeople = people.map((p) => ({ ...p }));
  let bestScore = Infinity;

  for (let restart = 0; restart < restarts; restart++) {
    const cur = people.map((p) => ({ ...p }));

    // First restart keeps the current plan as its starting point so a plan
    // that is already good does not get shuffled for no reason. Later
    // restarts jump to a random corner to escape local minima.
    if (restart > 0) {
      for (const i of movable) {
        const o = optionsFor(cur[i], maxOn);
        Object.assign(cur[i], o[Math.floor(Math.random() * o.length)]);
      }
    }

    const contrib = cur.map((p) => buildContribution(p, numWeeks, maxOn, groupOf, index));
    const cov = blankCoverage(numWeeks, groupMasks.length);
    for (const c of contrib) applyDelta(cov, c.grid, c.group, c.lift, 1);

    let improved = true;
    let passes = 0;
    while (improved && passes < maxPasses) {
      improved = false;
      passes++;

      for (const i of movable) {
        const person = cur[i];
        const options = optionsFor(person, maxOn);
        if (options.length < 2) continue;

        applyDelta(cov, contrib[i].grid, contrib[i].group, contrib[i].lift, -1);

        let bestOpt = null;
        let bestOptScore = Infinity;
        let bestContrib = null;

        for (const opt of options) {
          const candidate = withOption(person, opt);
          const c = buildContribution(candidate, numWeeks, maxOn, groupOf, index);
          applyDelta(cov, c.grid, c.group, c.lift, 1);
          const s = scoreCoverage(cov, plans, numWeeks, ctx);
          applyDelta(cov, c.grid, c.group, c.lift, -1);
          if (s < bestOptScore - 1e-9) {
            bestOptScore = s;
            bestOpt = opt;
            bestContrib = c;
          }
        }

        const changedThis =
          bestOpt &&
          Object.keys(bestOpt).some((k) => person[k] !== bestOpt[k]);

        Object.assign(person, bestOpt);
        contrib[i] = bestContrib;
        applyDelta(cov, bestContrib.grid, bestContrib.group, bestContrib.lift, 1);
        if (changedThis) improved = true;
      }
    }

    const score = scoreCoverage(cov, plans, numWeeks, ctx);
    if (score < bestScore - 1e-9) {
      bestScore = score;
      bestPeople = cur.map((p) => ({ ...p }));
    }
  }

  let changed = 0;
  for (let i = 0; i < people.length; i++) {
    const a = people[i];
    const b = bestPeople[i];
    if (TURNED.some((k) => a[k] !== b[k])) changed++;
  }

  return { people: bestPeople, score: bestScore, changed };
}

/**
 * Can this roster hit its targets at all, no matter how the rotation is
 * arranged? Headcount alone overstates capacity, because on any given day
 * some travelers are on their home week, some locals are on their recurring
 * day off, and some long-travel people are in the air.
 *
 * The floor is the guaranteed worst-day count under the *best possible*
 * arrangement:
 *   - Travelers spread across (maxOn + 1) rotation slots, so at best
 *     ceil(T / (maxOn+1)) are home simultaneously.
 *   - Locals on an every-f-weeks day off spread across 2*f slots (Mon/Fri x
 *     which week), so at best ceil(n / 2f) are out on any one day.
 *   - Long-travel travelers lose a day each; split evenly between the two
 *     travel profiles, at best ceil(LT / 2) are out on the worst day.
 *
 * If the floor is below the requirement, no amount of rebalancing fixes it —
 * the roster needs another body, a relaxed target, a less frequent day off,
 * or one fewer long-travel person on that skill.
 */
export function capacityCheck(people, site, numWeeks, maxOn = DEFAULT_MAX_CONSECUTIVE, skills = []) {
  const slots = maxOn + 1;
  const out = [];

  // The guaranteed floor for one week, given who is actually on the program
  // that week.
  const floorOf = (withSkill) => {
    const locals = withSkill.filter((p) => p.employment === 'Local');
    const travelers = withSkill.filter((p) => p.employment !== 'Local');

    // Locals out on the worst day, grouped by how often they take a day off.
    const byFreq = new Map();
    for (const p of locals) {
      const f = p.localOffEvery ?? 0;
      if (!f) continue;
      byFreq.set(f, (byFreq.get(f) || 0) + 1);
    }
    let localsOut = 0;
    for (const [f, n] of byFreq) localsOut += Math.ceil(n / (2 * f));

    const travelersHome = travelers.length === 0 ? 0 : Math.ceil(travelers.length / slots);

    const longTravel = travelers.filter((p) => p.longTravel).length;
    const longTravelOnSite = Math.max(0, longTravel - Math.ceil(longTravel / slots));
    const travelDaysOut = Math.ceil(longTravelOnSite / 2);

    return {
      headcount: withSkill.length,
      locals: locals.length,
      travelers: travelers.length,
      localsOut,
      travelersHome,
      travelDaysOut,
      floor: locals.length - localsOut + (travelers.length - travelersHome) - travelDaysOut,
    };
  };

  for (const sk of skills) {
    // id is the storage key; code is what the user calls the column.
    const s = sk.id;
    const name = sk.code || sk.id;
    const skilled = people.filter((p) => p.skills && p.skills[s]);

    // Walk the weeks rather than judging the roster as a whole. Short-term
    // people are only crew inside their window, so a single program-wide
    // figure would credit a four-week specialist to all sixteen weeks and
    // claim cover that is gone the moment they leave.
    let hard = false;
    let peakNeed = 0;
    let worst = null;

    for (let w = 0; w < numWeeks; w++) {
      const r = reqFor(site, w, s);
      if (r.hard) hard = true;
      peakNeed = Math.max(peakNeed, r.min);
      if (r.min <= 0) continue;

      const here = skilled.filter((p) => onProgram(p, w));
      const cap = floorOf(here);
      const deficit = r.min - cap.floor;
      const impossible = cap.headcount < r.min;

      // Worst week first by "cannot be done at all", then by how far short.
      const better =
        !worst ||
        (impossible && !worst.impossible) ||
        (impossible === worst.impossible && deficit > worst.deficit);
      if (better) worst = { ...cap, week: w, need: r.min, deficit, impossible };
    }

    const bodies = hard ? 'dedicated people' : 'people';
    // No tracked requirement: describe the roster as it stands.
    const base = worst || { ...floorOf(skilled), week: null, need: 0, deficit: 0, impossible: false };
    const when = base.week == null ? '' : ` in week ${base.week + 1}`;

    let status = 'ok';
    let advice = '';

    if (base.need > 0 && base.impossible) {
      status = 'impossible';
      const gap = base.need - base.headcount;
      const n = base.headcount;
      advice =
        `${n === 0 ? 'Nobody' : `Only ${n} ${n === 1 ? 'person' : 'people'}`} on the program${when} ` +
        `${n === 1 ? 'has' : 'have'} ${name}, and the target is ${base.need} ${bodies} per day. ` +
        `Tick ${name} for ${gap} more ${gap === 1 ? 'person' : 'people'}, bring ${gap} in from another ` +
        `site, or widen a short-term person's on-site window to cover${when || ' that week'}.`;
    } else if (base.need > 0 && base.deficit > 0) {
      status = 'tight';
      const short = base.deficit;
      const reasons = [];
      if (base.travelersHome > 0) reasons.push(`${base.travelersHome} home on rotation`);
      if (base.localsOut > 0) reasons.push(`${base.localsOut} local on a day off`);
      if (base.travelDaysOut > 0) reasons.push(`${base.travelDaysOut} travelling`);
      if (reasons.length === 0) reasons.push('the crew on site that week');

      const fixes = [];
      if (base.travelersHome > 0) fixes.push(`add ${short} more ${name} ${short > 1 ? 'people' : 'person'}`);
      if (base.localsOut > 0) fixes.push(`stretch a ${name} local's day off to every 3 weeks, or to Never`);
      if (base.travelDaysOut > 0) fixes.push(`turn off Long travel for a ${name} traveler`);
      fixes.push(`lower the target to ${base.floor}`);

      advice =
        `Headcount is ${base.headcount}${when}, but on the worst day only ${base.floor} ` +
        `${base.floor === 1 ? 'is' : 'are'} guaranteed on site (${reasons.join(', ')}). ` +
        `To hold ${base.need} every day: ${fixes.join(', or ')}.`;
    }

    out.push({
      skill: s,
      code: name,
      headcount: base.headcount,
      locals: base.locals,
      travelers: base.travelers,
      floor: base.floor,
      peakNeed,
      worstWeek: base.week,
      hard,
      status,
      advice,
    });
  }
  return out;
}

/**
 * Where dedicated skills fight over the same people.
 *
 * Checking skills one at a time misses the most common way a dedicated plan
 * fails. Five people hold RCx and one holds Injection, so each target looks
 * satisfiable — but if that Injection person is one of the five, four
 * dedicated RCx plus one dedicated Injection needs five distinct bodies out of
 * five, and any absence breaks it.
 *
 * So this checks every *combination* of dedicated skills: the people who can
 * do at least one skill in the group must number at least the sum of the
 * group's demands. (This is Hall's condition; when it holds for every group,
 * an assignment exists.) Only minimal failing groups are reported — if RCx and
 * Injection already conflict, saying so again with MCx added is noise.
 *
 * Counts are raw headcount, ignoring who is away, so anything reported here is
 * broken before rotation is even considered.
 */
export function contentionCheck(people, site, numWeeks, skills = []) {
  const hard = [];
  for (const sk of skills) {
    const s = sk.id;
    let need = 0;
    let isHard = false;
    for (let w = 0; w < numWeeks; w++) {
      const r = reqFor(site, w, s);
      if (r.hard && r.min > 0) {
        isHard = true;
        need = Math.max(need, r.min);
      }
    }
    if (isHard) hard.push({ skill: s, code: sk.code || sk.id, need });
  }
  if (hard.length < 2) return [];

  const found = [];
  const n = hard.length;
  for (let bits = 1; bits < 1 << n; bits++) {
    const group = [];
    let need = 0;
    for (let i = 0; i < n; i++) {
      if (bits & (1 << i)) {
        group.push(hard[i]);
        need += hard[i].need;
      }
    }
    if (group.length < 2) continue;

    const pool = people.filter((p) => p.skills && group.some((g) => p.skills[g.skill])).length;
    if (pool >= need) continue;

    // Skip any group that merely contains an already-reported conflict.
    if (found.some((f) => (f.bits & bits) === f.bits)) continue;

    found.push({
      bits,
      skills: group.map((g) => g.code),
      demands: group.map((g) => `${g.code} ${g.need}`),
      need,
      pool,
      short: need - pool,
    });
  }

  return found.map(({ bits, ...rest }) => ({
    ...rest,
    advice:
      `${rest.demands.join(' and ')} per day needs ${rest.need} different people, but only ` +
      `${rest.pool} on this roster can do any of them. Even with nobody away you are ` +
      `${rest.short} short. Cross-train someone, bring ${rest.short} in from another site, or ` +
      `drop one of these skills back to a shared requirement.`,
  }));
}
