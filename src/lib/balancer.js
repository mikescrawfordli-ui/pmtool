import { SKILLS, DAYS, DEFAULT_MAX_CONSECUTIVE } from './constants.js';
import { presenceGrid, skillList, isLiftCertified, reqFor } from './schedule.js';

/* Weights: a missing body is worth far more than an extra one, and both
   outweigh cosmetic week-to-week smoothing. */
const W_SHORT = 1000;
const W_OVER = 25;
const W_SPREAD = 2;

/**
 * The knobs the balancer is allowed to turn for one person.
 *
 * Setting a local's day off to "None" is a deliberate decision — usually the
 * only way to hold a target that a biweekly day off would otherwise break — so
 * the balancer leaves it alone instead of handing the day back.
 */
export function optionsFor(person, maxOn = DEFAULT_MAX_CONSECUTIVE) {
  if (person.employment === 'Traveler') {
    const opts = [];
    for (let i = 0; i <= maxOn; i++) opts.push({ rotationStart: i });
    return opts;
  }
  if (!person.localOffDay || person.localOffDay === 'None') {
    return [{ localOffDay: 'None', localOffParity: person.localOffParity || 0 }];
  }
  return [
    { localOffDay: 'Fri', localOffParity: 0 },
    { localOffDay: 'Fri', localOffParity: 1 },
    { localOffDay: 'Mon', localOffParity: 0 },
    { localOffDay: 'Mon', localOffParity: 1 },
  ];
}

function withOption(person, opt) {
  return { ...person, ...opt };
}

function blankCoverage(numWeeks) {
  const cov = [];
  for (let w = 0; w < numWeeks; w++) {
    const days = [];
    for (let d = 0; d < DAYS.length; d++) {
      const c = { _total: 0, _lift: 0 };
      for (const s of SKILLS) c[s] = 0;
      days.push(c);
    }
    cov.push(days);
  }
  return cov;
}

/** Add (sign=+1) or remove (sign=-1) one person's contribution in place. */
function applyDelta(cov, grid, skills, lift, sign) {
  for (let w = 0; w < grid.length; w++) {
    for (let d = 0; d < DAYS.length; d++) {
      if (!grid[w][d]) continue;
      const c = cov[w][d];
      c._total += sign;
      if (lift) c._lift += sign;
      for (const s of skills) c[s] += sign;
    }
  }
}

function scoreCoverage(cov, site, numWeeks) {
  let short = 0;
  let over = 0;

  for (let w = 0; w < numWeeks; w++) {
    for (const s of SKILLS) {
      const r = reqFor(site, w, s);
      const hasMin = r.min > 0;
      const hasMax = r.max != null && r.max !== '';
      if (!hasMin && !hasMax) continue;
      for (let d = 0; d < DAYS.length; d++) {
        const c = cov[w][d][s];
        if (hasMin && c < r.min) short += r.min - c;
        if (hasMax && c > r.max) over += c - r.max;
      }
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

function buildContribution(person, numWeeks, maxOn) {
  const { grid } = presenceGrid(person, numWeeks, maxOn);
  return { grid, skills: skillList(person), lift: isLiftCertified(person) };
}

/**
 * Hill-climb the rotation offsets (travelers) and biweekly day-off slots
 * (locals) until coverage stops improving. Locked people are left alone.
 *
 * Because each candidate move only swaps one person's contribution in and out
 * of a running coverage tally, evaluating an option is cheap enough to brute
 * force every person against every option, many times over.
 */
export function autoBalance(people, site, numWeeks, opts = {}) {
  const maxOn = opts.maxOn || DEFAULT_MAX_CONSECUTIVE;
  const restarts = opts.restarts ?? 5;
  const maxPasses = opts.maxPasses ?? 12;

  const movable = people.map((p, i) => (p.locked ? -1 : i)).filter((i) => i >= 0);
  if (movable.length === 0) {
    return { people, score: null, changed: 0 };
  }

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

    const contrib = cur.map((p) => buildContribution(p, numWeeks, maxOn));
    const cov = blankCoverage(numWeeks);
    for (const c of contrib) applyDelta(cov, c.grid, c.skills, c.lift, 1);

    let improved = true;
    let passes = 0;
    while (improved && passes < maxPasses) {
      improved = false;
      passes++;

      for (const i of movable) {
        const person = cur[i];
        const options = optionsFor(person, maxOn);
        if (options.length < 2) continue;

        applyDelta(cov, contrib[i].grid, contrib[i].skills, contrib[i].lift, -1);

        let bestOpt = null;
        let bestOptScore = Infinity;
        let bestContrib = null;

        for (const opt of options) {
          const candidate = withOption(person, opt);
          const c = buildContribution(candidate, numWeeks, maxOn);
          applyDelta(cov, c.grid, c.skills, c.lift, 1);
          const s = scoreCoverage(cov, site, numWeeks);
          applyDelta(cov, c.grid, c.skills, c.lift, -1);
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
        applyDelta(cov, bestContrib.grid, bestContrib.skills, bestContrib.lift, 1);
        if (changedThis) improved = true;
      }
    }

    const score = scoreCoverage(cov, site, numWeeks);
    if (score < bestScore - 1e-9) {
      bestScore = score;
      bestPeople = cur.map((p) => ({ ...p }));
    }
  }

  let changed = 0;
  for (let i = 0; i < people.length; i++) {
    const a = people[i];
    const b = bestPeople[i];
    if (
      a.rotationStart !== b.rotationStart ||
      a.localOffDay !== b.localOffDay ||
      a.localOffParity !== b.localOffParity
    ) {
      changed++;
    }
  }

  return { people: bestPeople, score: bestScore, changed };
}

/**
 * Can this roster hit its targets at all, no matter how the rotation is
 * arranged? Headcount alone overstates capacity, because on any given day
 * some travelers are on their home week and some locals are on their
 * biweekly day off.
 *
 * The floor is the guaranteed worst-day count under the *best possible*
 * arrangement:
 *   - Travelers spread across (maxOn + 1) rotation slots, so at best
 *     ceil(T / (maxOn+1)) are home simultaneously.
 *   - Locals with a day off spread across 4 slots (Mon/Fri x odd/even week),
 *     so at best ceil(L_off / 4) are out on any one day.
 *
 * If the floor is below the requirement, no amount of rebalancing fixes it —
 * the roster needs another body, a relaxed target, or a local who keeps their
 * Fridays.
 */
export function capacityCheck(people, site, numWeeks, maxOn = DEFAULT_MAX_CONSECUTIVE) {
  const slots = maxOn + 1;
  const out = [];

  for (const s of SKILLS) {
    const withSkill = people.filter((p) => p.skills && p.skills[s]);
    const locals = withSkill.filter((p) => p.employment === 'Local');
    const travelers = withSkill.filter((p) => p.employment !== 'Local');
    const localsWithDayOff = locals.filter((p) => p.localOffDay && p.localOffDay !== 'None');

    const travelersHome = travelers.length === 0 ? 0 : Math.ceil(travelers.length / slots);
    const localsOut = localsWithDayOff.length === 0 ? 0 : Math.ceil(localsWithDayOff.length / 4);

    const floor = locals.length - localsOut + (travelers.length - travelersHome);
    const peak = withSkill.length;

    let peakNeed = 0;
    for (let w = 0; w < numWeeks; w++) peakNeed = Math.max(peakNeed, reqFor(site, w, s).min);

    let status = 'ok';
    let advice = '';
    if (peakNeed > 0 && peak < peakNeed) {
      status = 'impossible';
      const gap = peakNeed - peak;
      advice =
        `${peak === 0 ? 'Nobody' : `Only ${peak} ${peak === 1 ? 'person' : 'people'}`} on this roster ` +
        `${peak <= 1 ? 'has' : 'have'} ${s}, and the target is ${peakNeed} per day. ` +
        `Tick ${s} for ${gap} more ${gap === 1 ? 'person' : 'people'} on the Roster tab, or bring ${gap} in from another site.`;
    } else if (peakNeed > 0 && floor < peakNeed) {
      status = 'tight';
      const short = peakNeed - floor;
      const fixes = [];
      if (travelersHome > 0) {
        fixes.push(`add ${short} more ${s} traveler${short > 1 ? 's' : ''}`);
      }
      if (localsOut > 0) {
        fixes.push(`set a ${s}-qualified local's day off to None`);
      }
      fixes.push(`lower the target to ${floor}`);
      advice =
        `Headcount is ${peak}, but on the worst day only ${floor} are guaranteed on site ` +
        `(${travelersHome} traveler${travelersHome === 1 ? '' : 's'} home, ${localsOut} local${localsOut === 1 ? '' : 's'} on a day off). ` +
        `To hold ${peakNeed} every day: ${fixes.join(', or ')}.`;
    }

    out.push({
      skill: s,
      headcount: peak,
      locals: locals.length,
      travelers: travelers.length,
      floor,
      peakNeed,
      status,
      advice,
    });
  }
  return out;
}
