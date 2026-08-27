// Skill columns tracked on every person. Add to this list and the whole app
// (roster checkboxes, requirements grid, dashboard strips) picks it up.
export const SKILLS = ['RCx', 'ECx', 'MCx', 'Quality', 'Injection', 'SCCAF', 'OFE'];

export const SKILL_LABELS = {
  RCx: 'Relay Cx',
  ECx: 'Electrical Cx',
  MCx: 'Mechanical Cx',
  Quality: 'Quality',
  Injection: 'Injection',
  SCCAF: 'SCCAF',
  OFE: 'OFE',
};

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

// Locals may take their biweekly day off on a Monday or a Friday.
export const LOCAL_OFF_DAYS = ['Mon', 'Fri', 'None'];

export const TIME_OFF_TYPES = ['Vacation', 'Home week', 'Training', 'Medical', 'Other'];

export const DEFAULT_MAX_CONSECUTIVE = 3;
