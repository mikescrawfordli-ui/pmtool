// Skill columns tracked on every person. Add to this list and the whole app
// (roster checkboxes, requirements grid, dashboard strips) picks it up.
export const SKILLS = ['RCx', 'ECx', 'MCx', 'Quality', 'Injection', 'SCCAF', 'OFE', 'VTWeld'];

export const SKILL_LABELS = {
  RCx: 'Relay Cx',
  ECx: 'Electrical Cx',
  MCx: 'Mechanical Cx',
  Quality: 'Quality',
  Injection: 'Injection',
  SCCAF: 'SCCAF',
  OFE: 'OFE',
  VTWeld: 'VT Weld',
};

// Position in SKILLS, used as the bit position when a person's skills are
// packed into an integer for the dedicated-allocation matching.
export const SKILL_INDEX = Object.fromEntries(SKILLS.map((s, i) => [s, i]));

// Work week. Travelers are present all five days on an "on" week.
// Locals drop one day every other week (their Mon or Fri).
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

// Weekly status codes
export const ON = 'ON';
export const ROT_OFF = 'ROT_OFF'; // rotation home week
export const TIME_OFF = 'TIME_OFF'; // vacation / PTO / pinned home week

export const EMPLOYMENT = ['Traveler', 'Local'];
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
