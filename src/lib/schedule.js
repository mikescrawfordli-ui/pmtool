import { SKILLS, DAYS, ON, ROT_OFF, TIME_OFF, DEFAULT_MAX_CONSECUTIVE } from './constants.js';

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

export function isTimeOff(person, w) {
  const list = person.timeOff || [];
  for (const t of list) if (w >= t.start && w <= t.end) return true;
  return false;
}

export function timeOffEntry(person, w) {
  const list = person.timeOff || [];
  for (const t of list) if (w >= t.start && w <= t.end) return t;
  return null;
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

/** grid[w][d] -> boolean present on site. */
export function presenceGrid(person, numWeeks, maxOn = DEFAULT_MAX_CONSECUTIVE) {
  const { pattern, stintOf } = buildSchedule(person, numWeeks, maxOn);
  const grid = pattern.map((status, w) => {
    if (status !== ON) return DAYS.map(() => false);
    const offIdx = offDayIndex(person, w, stintOf);
    return DAYS.map((_, d) => d !== offIdx);
  });
  return { pattern, stintOf, grid };
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
  for (const s of SKILLS) base[s] = { min: 0, max: null };
  return { base, overrides: {} };
}

/** Effective {min,max} for a skill in a given week. */
export function reqFor(site, w, skill) {
  const reqs = site.requirements || emptyRequirements();
  const ov = reqs.overrides && reqs.overrides[w] && reqs.overrides[w][skill];
  const base = (reqs.base && reqs.base[skill]) || { min: 0, max: null };
  if (!ov) return base;
  return {
    min: ov.min == null ? base.min : ov.min,
    max: ov.max === undefined ? base.max : ov.max,
  };
}

/* ------------------------------------------------------------------ */
/* Coverage                                                            */
/* ------------------------------------------------------------------ */

function blankDay() {
  const c = { _total: 0, _lift: 0 };
  for (const s of SKILLS) c[s] = 0;
  return c;
}

/**
 * cov[w][d][skill] = how many people with that skill are on site that day.
 * Also carries _total headcount and _lift (lift-certified) per day.
 */
export function computeCoverage(people, numWeeks, maxOn = DEFAULT_MAX_CONSECUTIVE) {
  const entries = people.map((p) => ({
    person: p,
    ...presenceGrid(p, numWeeks, maxOn),
    skills: skillList(p),
    lift: isLiftCertified(p),
  }));

  const cov = [];
  for (let w = 0; w < numWeeks; w++) {
    const days = [];
    for (let d = 0; d < DAYS.length; d++) {
      const c = blankDay();
      for (const e of entries) {
        if (!e.grid[w][d]) continue;
        c._total++;
        if (e.lift) c._lift++;
        for (const s of e.skills) c[s]++;
      }
      days.push(c);
    }
    cov.push(days);
  }
  return { cov, entries };
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
  const { cov } = computeCoverage(people, numWeeks, maxOn);
  const gaps = [];
  for (let w = 0; w < numWeeks; w++) {
    for (const s of SKILLS) {
      const r = reqFor(site, w, s);
      const lo = weekMin(cov, w, s);
      const hi = weekMax(cov, w, s);
      if (r.min > 0 && lo < r.min) {
        const days = [];
        for (let d = 0; d < DAYS.length; d++) if (cov[w][d][s] < r.min) days.push(DAYS[d]);
        gaps.push({ type: 'short', week: w, skill: s, have: lo, need: r.min, days });
      } else if (r.max != null && r.max !== '' && hi > r.max) {
        gaps.push({ type: 'over', week: w, skill: s, have: hi, need: r.max, days: [] });
      }
    }
  }
  return { gaps, cov };
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
