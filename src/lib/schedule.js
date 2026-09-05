import { SKILLS, SKILL_INDEX, DAYS, ON, ROT_OFF, TIME_OFF, DEFAULT_MAX_CONSECUTIVE } from './constants.js';

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

export function weekStart(programStart, w) {
  const d = new Date(`${programStart}T00:00:00`);
  d.setDate(d.getDate() + w * 7);
  return d;
}

export function fmtWeek(programStart, w) {
  const d = weekStart(programStart, w);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function fmtWeekLong(programStart, w) {
  const d = weekStart(programStart, w);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ------------------------------------------------------------------ */
/* Time off                                                            */
/* ------------------------------------------------------------------ */

/**
 * Time off comes in two shapes.
 *
 * A whole-week booking (no `days`) takes the person off site for every week in
 * its range — that is a home week, and it resets the consecutive-week counter.
 *
 * A day booking (`days: [0, 4]`) keeps the person on the rotation and only
 * removes those weekdays. Booking Friday off is not a week of leave, and
 * treating it as one would both understate the crew and hand the person a
 * bonus rotation reset.
 *
 * A day booking that covers all five days is just a whole week, so it is
 * treated as one.
 */
export function isFullWeekOff(entry) {
  return !entry.days || entry.days.length === 0 || entry.days.length >= DAYS.length;
}

/** True only for whole-week absence — this is what drives the ON/TIME_OFF pattern. */
export function isTimeOff(person, w) {
  const list = person.timeOff || [];
  for (const t of list) if (w >= t.start && w <= t.end && isFullWeekOff(t)) return true;
  return false;
}

export function timeOffEntry(person, w) {
  const list = person.timeOff || [];
  for (const t of list) if (w >= t.start && w <= t.end && isFullWeekOff(t)) return t;
  return null;
}

/** Every booking touching week w, whole-week or single days. */
export function timeOffEntriesFor(person, w) {
  return (person.timeOff || []).filter((t) => w >= t.start && w <= t.end);
}

/** Days booked off inside week w, as a bitmask over DAYS. */
export function partialOffMask(person, w) {
  let mask = 0;
  for (const t of person.timeOff || []) {
    if (w < t.start || w > t.end || isFullWeekOff(t)) continue;
    for (const d of t.days) mask |= 1 << d;
  }
  return mask;
}

/* ------------------------------------------------------------------ */
/* Rotation pattern                                                    */
/* ------------------------------------------------------------------ */

/**
 * Build a person's weekly ON / ROT_OFF / TIME_OFF pattern.
 *
 * Travelers run a rolling "max N weeks on, then one week home" cycle. We walk
 * the weeks and carry a counter of consecutive worked weeks rather than using
 * a modulo, which gives two properties we need:
 *   1. It is structurally impossible to exceed maxOn weeks in a row.
 *   2. Vacation resets the counter, so a traveler coming back from time off
 *      gets a full fresh run instead of an almost-immediate home week.
 *
 * `rotationStart` is how many weeks the person has already worked heading into
 * week 0, so it staggers who is home when. 0 = starts a fresh run.
 */
export function buildPattern(person, numWeeks, maxOn = DEFAULT_MAX_CONSECUTIVE) {
  const out = [];

  if (person.employment === 'Local') {
    for (let w = 0; w < numWeeks; w++) out.push(isTimeOff(person, w) ? TIME_OFF : ON);
    return out;
  }

  let worked = Math.max(0, Math.min(person.rotationStart || 0, maxOn));
  for (let w = 0; w < numWeeks; w++) {
    if (isTimeOff(person, w)) {
      out.push(TIME_OFF);
      worked = 0;
    } else if (worked >= maxOn) {
      out.push(ROT_OFF);
      worked = 0;
    } else {
      out.push(ON);
      worked++;
    }
  }
  return out;
}

/**
 * The pattern plus, for each week, which rotation stint it belongs to.
 * A stint is one unbroken run of ON weeks. Long-travel travelers flip their
 * travel profile from one stint to the next, so we need them numbered.
 */
export function buildSchedule(person, numWeeks, maxOn = DEFAULT_MAX_CONSECUTIVE) {
  const pattern = buildPattern(person, numWeeks, maxOn);
  const stintOf = new Array(numWeeks).fill(-1);
  let stint = -1;
  let prevOn = false;
  for (let w = 0; w < numWeeks; w++) {
    const on = pattern[w] === ON;
    if (on && !prevOn) stint++;
    stintOf[w] = on ? stint : -1;
    prevOn = on;
  }
  return { pattern, stintOf };
}

/** Which day index this local is off in week w, or -1. */
export function localOffDayIndex(person, w) {
  if (person.employment !== 'Local') return -1;
  const every = person.localOffEvery ?? 0;
  if (!every) return -1;
  const day = person.localOffDay;
  if (!day || day === 'None') return -1;
  const offset = (person.localOffOffset ?? 0) % every;
  if (w % every !== offset) return -1;
  return DAYS.indexOf(day);
}

/**
 * Which day a long-travel traveler loses to flying, or -1.
 * Profile flips each stint: lose Monday one rotation, Friday the next.
 */
export function travelOffDayIndex(person, stintIdx) {
  if (person.employment === 'Local') return -1;
  if (!person.longTravel || stintIdx < 0) return -1;
  const phase = ((person.travelPhase ?? 0) + stintIdx) % 2;
  return phase === 0 ? 0 : DAYS.length - 1;
}

/** The single day this person is off in week w for any reason, or -1. */
export function offDayIndex(person, w, stintOf) {
  if (person.employment === 'Local') return localOffDayIndex(person, w);
  return travelOffDayIndex(person, stintOf ? stintOf[w] : -1);
}

/**
 * grid[w][d] -> boolean present on site.
 *
 * Three things can take a day away: the week is off entirely, it is the
 * person's rotation or travel day, or they have booked that day as PTO.
 */
export function presenceGrid(person, numWeeks, maxOn = DEFAULT_MAX_CONSECUTIVE) {
  const { pattern, stintOf } = buildSchedule(person, numWeeks, maxOn);
  const grid = pattern.map((status, w) => {
    if (status !== ON) return DAYS.map(() => false);
    const offIdx = offDayIndex(person, w, stintOf);
    const pto = partialOffMask(person, w);
    return DAYS.map((_, d) => d !== offIdx && !(pto & (1 << d)));
  });
  return { pattern, stintOf, grid };
}

/** Every day index this person is away in week w, for display. */
export function offDaysFor(person, w, stintOf) {
  const out = [];
  const rota = offDayIndex(person, w, stintOf);
  const pto = partialOffMask(person, w);
  for (let d = 0; d < DAYS.length; d++) {
    if (d === rota || pto & (1 << d)) out.push(d);
  }
  return out;
}

export function skillList(person) {
  return SKILLS.filter((s) => person.skills && person.skills[s]);
}

export function isLiftCertified(person) {
  return person.lift === 'X' || person.lift === 'P';
}

/* ------------------------------------------------------------------ */
/* Requirements                                                        */
/* ------------------------------------------------------------------ */

export function emptyRequirements() {
  const base = {};
  for (const s of SKILLS) base[s] = { min: 0, max: null, hard: false };
  return { base, overrides: {} };
}

/**
 * Effective {min, max, hard} for a skill in a given week.
 *
 * `hard` is a property of the skill at this site, not of the week — whether
 * RCx needs its own dedicated bodies is a policy, while how many it needs can
 * change phase by phase. So the weekly override carries min/max only, and
 * `hard` always comes from the base.
 */
export function reqFor(site, w, skill) {
  const reqs = site.requirements || emptyRequirements();
  const ov = reqs.overrides && reqs.overrides[w] && reqs.overrides[w][skill];
  const base = (reqs.base && reqs.base[skill]) || { min: 0, max: null, hard: false };
  const hard = !!base.hard;
  if (!ov) return { min: base.min || 0, max: base.max ?? null, hard };
  return {
    min: ov.min == null ? base.min || 0 : ov.min,
    max: ov.max === undefined ? base.max ?? null : ov.max,
    hard,
  };
}

/* ------------------------------------------------------------------ */
/* Dedicated allocation                                                */
/* ------------------------------------------------------------------ */

/** A person's skills packed into one integer, one bit per SKILLS index. */
export function skillMask(person) {
  let m = 0;
  for (const s of SKILLS) if (person.skills && person.skills[s]) m |= 1 << SKILL_INDEX[s];
  return m;
}

/**
 * Hand the people present on one day out to the skills that need *dedicated*
 * bodies — one person to one skill, nobody counted twice.
 *
 * This is the difference between "five people here can do RCx" and "four
 * people are doing RCx and nothing else". A person ticked for both RCx and
 * Injection can fill either slot, but not both at once, so satisfying a set
 * of dedicated targets is an assignment problem rather than a sum.
 *
 * Solved as bipartite matching with augmenting paths (Kuhn's algorithm). Each
 * demanded slot tries to claim a free person; failing that, it takes someone
 * already assigned and recursively re-homes whoever loses them. That
 * re-homing is what makes the result a true maximum rather than a greedy
 * guess — a naive pass that hands the only Injection-capable person to RCx
 * would report a false Injection shortfall.
 *
 * `demand[i]` is how many dedicated people skill i needs; 0 for skills that
 * are not hard requirements. Skills are filled scarcest-first so the
 * hard-to-staff ones get first claim on the people who can do them.
 *
 * Returns `filled[i]` (how many skill i actually got, never above demand) and
 * `owner[p]` (the skill index person p is committed to, or -1 if free).
 */
export function allocateDay(masks, demand, count) {
  const n = count === undefined ? masks.length : count;
  const nSkills = SKILLS.length;
  const owner = new Int8Array(n).fill(-1);
  const filled = new Array(nSkills).fill(0);

  // Visit stamps rather than a fresh array per augmenting search.
  const seen = new Int32Array(n);
  let stamp = 0;

  function augment(skill) {
    const bit = 1 << skill;
    for (let p = 0; p < n; p++) {
      if (!(masks[p] & bit)) continue;
      if (seen[p] === stamp) continue;
      seen[p] = stamp;
      if (owner[p] === -1 || augment(owner[p])) {
        owner[p] = skill;
        return true;
      }
    }
    return false;
  }

  // Scarcest skill first: fewest qualified people present per body demanded.
  const order = [];
  for (let i = 0; i < nSkills; i++) {
    if (!demand[i]) continue;
    let qualified = 0;
    const bit = 1 << i;
    for (let p = 0; p < n; p++) if (masks[p] & bit) qualified++;
    order.push({ skill: i, slack: qualified - demand[i] });
  }
  order.sort((a, b) => a.slack - b.slack);

  for (const { skill } of order) {
    for (let k = 0; k < demand[skill]; k++) {
      stamp++;
      if (!augment(skill)) break; // no arrangement fills another slot
      filled[skill]++;
    }
  }

  return { filled, owner };
}

/* ------------------------------------------------------------------ */
/* Coverage                                                            */
/* ------------------------------------------------------------------ */

function blankDay() {
  const c = { _total: 0, _lift: 0, _flex: 0 };
  for (const s of SKILLS) c[s] = 0;
  return c;
}

/**
 * Two views of the same day, because they answer different questions.
 *
 * `raw[w][d][skill]` — how many people on site can do that skill. Someone with
 * three skills counts in all three rows. This is the honest answer to "who is
 * qualified?" and it is what the overstaffing cap is judged against.
 *
 * `cov[w][d][skill]` — how many people are actually *doing* that skill, once
 * everyone has been committed to one job. Skills marked hard get dedicated
 * people first (see allocateDay); skills left soft are then covered by whoever
 * was not consumed. This is what shortfalls are judged against, because it is
 * the number that reflects work happening in parallel.
 *
 * With no hard requirements the two are identical, which is exactly how the
 * app behaved before dedicated skills existed.
 *
 * Both carry _total headcount and _lift per day; cov also carries _flex, the
 * people no hard requirement claimed.
 */
export function computeCoverage(people, numWeeks, maxOn = DEFAULT_MAX_CONSECUTIVE, site = null) {
  const entries = people.map((p) => ({
    person: p,
    ...presenceGrid(p, numWeeks, maxOn),
    skills: skillList(p),
    mask: skillMask(p),
    lift: isLiftCertified(p),
  }));

  const cov = [];
  const raw = [];

  for (let w = 0; w < numWeeks; w++) {
    // What this week demands in dedicated bodies, per skill index.
    const demand = new Array(SKILLS.length).fill(0);
    let anyHard = false;
    if (site) {
      for (let i = 0; i < SKILLS.length; i++) {
        const r = reqFor(site, w, SKILLS[i]);
        if (r.hard && r.min > 0) {
          demand[i] = r.min;
          anyHard = true;
        }
      }
    }

    const days = [];
    const rawDays = [];

    for (let d = 0; d < DAYS.length; d++) {
      const rawC = blankDay();
      const masks = [];
      for (const e of entries) {
        if (!e.grid[w][d]) continue;
        rawC._total++;
        if (e.lift) rawC._lift++;
        for (const s of e.skills) rawC[s]++;
        masks.push(e.mask);
      }
      rawC._flex = rawC._total;

      const c = blankDay();
      c._total = rawC._total;
      c._lift = rawC._lift;

      if (!anyHard) {
        for (const s of SKILLS) c[s] = rawC[s];
        c._flex = rawC._total;
      } else {
        const { filled, owner } = allocateDay(masks, demand);
        for (let i = 0; i < SKILLS.length; i++) {
          if (demand[i]) c[SKILLS[i]] = filled[i];
        }
        // Everyone a hard requirement did not claim is still available to the
        // soft skills, and to each other — soft skills may share people.
        let flex = 0;
        for (let pi = 0; pi < masks.length; pi++) {
          if (owner[pi] !== -1) continue;
          flex++;
          for (let i = 0; i < SKILLS.length; i++) {
            if (demand[i]) continue;
            if (masks[pi] & (1 << i)) c[SKILLS[i]]++;
          }
        }
        c._flex = flex;
      }

      days.push(c);
      rawDays.push(rawC);
    }

    cov.push(days);
    raw.push(rawDays);
  }

  return { cov, raw, entries };
}

/** Worst (lowest) daily count for a skill in a week — what we red-flag on. */
export function weekMin(cov, w, key) {
  let m = Infinity;
  for (let d = 0; d < DAYS.length; d++) m = Math.min(m, cov[w][d][key]);
  return m === Infinity ? 0 : m;
}

export function weekMax(cov, w, key) {
  let m = -Infinity;
  for (let d = 0; d < DAYS.length; d++) m = Math.max(m, cov[w][d][key]);
  return m === -Infinity ? 0 : m;
}

export function weekAvg(cov, w, key) {
  let t = 0;
  for (let d = 0; d < DAYS.length; d++) t += cov[w][d][key];
  return t / DAYS.length;
}

/**
 * Every place the plan breaks. Shortfall is judged on the worst day of the
 * week, because "4 RCx per day" means every day, not the average.
 */
export function findGaps(site, people, numWeeks, maxOn = DEFAULT_MAX_CONSECUTIVE) {
  const { cov, raw } = computeCoverage(people, numWeeks, maxOn, site);
  const gaps = [];
  for (let w = 0; w < numWeeks; w++) {
    for (const s of SKILLS) {
      const r = reqFor(site, w, s);
      const lo = weekMin(cov, w, s);
      // Overstaffing is about bodies present, not jobs assigned, so it reads
      // the raw view.
      const hi = weekMax(raw, w, s);
      if (r.min > 0 && lo < r.min) {
        const days = [];
        for (let d = 0; d < DAYS.length; d++) if (cov[w][d][s] < r.min) days.push(DAYS[d]);
        gaps.push({ type: 'short', week: w, skill: s, have: lo, need: r.min, days, hard: r.hard });
      } else if (r.max != null && r.max !== '' && hi > r.max) {
        gaps.push({ type: 'over', week: w, skill: s, have: hi, need: r.max, days: [] });
      }
    }
  }
  return { gaps, cov, raw };
}

/** Safety net: flag anyone scheduled past the consecutive-week cap. */
export function overworkedRuns(people, numWeeks, maxOn = DEFAULT_MAX_CONSECUTIVE) {
  const flags = [];
  for (const p of people) {
    if (p.employment !== 'Traveler') continue;
    const pattern = buildPattern(p, numWeeks, maxOn);
    let run = 0;
    let start = 0;
    for (let w = 0; w < numWeeks; w++) {
      if (pattern[w] === ON) {
        if (run === 0) start = w;
        run++;
        if (run > maxOn) flags.push({ personId: p.id, name: p.name, start, length: run });
      } else {
        run = 0;
      }
    }
  }
  return flags;
}
