/**
 * The skill columns a fresh board starts with. They are only a starting
 * point: the live list lives in the board state and is edited on the Roster
 * tab, so it can be added to, renamed and reordered per program.
 *
 * `id` is the storage key and never changes — it is what person.skills and
 * requirements.base are keyed by. `code` is the column header and `label`
 * the long name, and both are freely editable. Keeping them apart is what
 * lets a rename be a rename rather than a quiet data loss.
 *
 * The seeded ids match the names the columns had when they were hardcoded,
 * so existing boards keep every tick and every target.
 */
export const DEFAULT_SKILLS = [
  { id: 'RCx', code: 'RCx', label: 'Relay Cx' },
  { id: 'ECx', code: 'ECx', label: 'Electrical Cx' },
  { id: 'MCx', code: 'MCx', label: 'Mechanical Cx' },
  { id: 'Quality', code: 'Quality', label: 'Quality' },
  { id: 'Injection', code: 'Injection', label: 'Injection' },
  { id: 'SCCAF', code: 'SCCAF', label: 'SCCAF' },
  { id: 'OFE', code: 'OFE', label: 'OFE' },
  { id: 'VTWeld', code: 'VT Weld', label: 'VT Weld' },
];

/**
 * Skills are packed one-per-bit into a 32-bit integer for the dedicated
 * allocation matching, so the column count has a hard ceiling. Stopping well
 * short of 31 keeps that an abstract limit rather than a lurking bug.
 */
export const MAX_SKILLS = 24;

/** ['RCx', 'ECx', ...] — the storage keys, in display order. */
export function skillIds(skills) {
  return skills.map((s) => s.id);
}

/** Look-ups the render path would otherwise rebuild on every row. */
export function skillIndex(skills) {
  const out = {};
  skills.forEach((s, i) => { out[s.id] = i; });
  return out;
}

export function skillCodes(skills) {
  const out = {};
  for (const s of skills) out[s.id] = s.code || s.id;
  return out;
}

export function skillLabels(skills) {
  const out = {};
  for (const s of skills) out[s.id] = s.label || s.code || s.id;
  return out;
}

// Work week. Travelers are present all five days on an "on" week.
// Locals drop one day every other week (their Mon or Fri).
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

// Weekly status codes
export const ON = 'ON';
export const ROT_OFF = 'ROT_OFF'; // rotation home week
export const TIME_OFF = 'TIME_OFF'; // vacation / PTO / pinned home week
// Before someone arrives on the program or after they leave. Distinct from a
// home week: a rotation gap means they come back, this means they are not
// part of the crew that week at all.
export const OFF_PROGRAM = 'OFF_PROGRAM';
// A home week pinned by hand. Unlike PTO it resets the rotation counter, which
// is how you short-cycle someone and shift everything after them.
export const FORCED_HOME = 'FORCED_HOME';

/**
 * Traveler and Visitor both run the rotation; Local does not. Visitor is a
 * short, dated engagement — a specialist in for a week or a month — and the
 * only structural difference is that their window is entered as real dates.
 * Every rotation branch keys off `!== 'Local'` so a Visitor never silently
 * picks up a local's day-off behaviour.
 */
export const EMPLOYMENT = ['Traveler', 'Local', 'Visitor'];

export function runsRotation(person) {
  return person.employment !== 'Local';
}
export const LIFT = [
  { value: 'X', label: 'Certified' },
  { value: 'P', label: 'Pending' },
  { value: '', label: 'None' },
];

// Locals may take their recurring day off on a Monday or a Friday.
export const LOCAL_OFF_DAYS = ['Mon', 'Fri'];

// How often a local takes that day off. 0 means they never do.
export const LOCAL_OFF_FREQUENCIES = [
  { value: 0, label: 'Never' },
  { value: 2, label: 'Every 2 weeks' },
  { value: 3, label: 'Every 3 weeks' },
];

/**
 * Travel days for people flying in and out.
 *
 * A standard traveler flies in Sunday and out Friday night, so they are on
 * site all five days. Someone with a long flight can't do that sustainably,
 * so the "Long travel" option alternates them between two profiles, switching
 * every rotation:
 *
 *   LATE_IN  — fly in Monday, fly out late Friday   -> loses Monday
 *   EARLY_OUT — fly in Sunday, fly out Thursday night -> loses Friday
 *
 * Alternating means the changeover between one rotation and the next gives
 * them a long block at home (out Thursday night, back the following Monday)
 * instead of two short weekends.
 */
export const TRAVEL_PROFILES = [
  { value: 0, key: 'LATE_IN', label: 'In Mon / out Fri night', lostDay: 'Mon' },
  { value: 1, key: 'EARLY_OUT', label: 'In Sun / out Thu night', lostDay: 'Fri' },
];

export const TIME_OFF_TYPES = ['Vacation', 'Home week', 'Training', 'Medical', 'Other'];

export const DEFAULT_MAX_CONSECUTIVE = 3;
