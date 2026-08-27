import { SKILLS } from './constants.js';
import { emptyRequirements } from './schedule.js';

let uid = 0;
const id = (prefix) => `${prefix}_${Date.now().toString(36)}_${(uid++).toString(36)}`;

function sk(...list) {
  const out = {};
  for (const s of SKILLS) out[s] = false;
  for (const s of list) out[s] = true;
  return out;
}

/**
 * Seed roster, transcribed from the manning plan document.
 * Names are stored as first name + last initial.
 *
 * Two skills the document does not track — SCCAF and OFE — start unchecked
 * for everyone. Tick them on the Roster tab as you confirm who is qualified.
 *
 * Lift: X = certified, P = was pending certification by 8/31/26. Both count
 * as certified for scheduling from September onward.
 */
function person(name, role, employment, lift, skills, extra = {}) {
  return {
    id: id('p'),
    name,
    role,
    employment,
    lift,
    skills,
    rotationStart: 0,
    // Locals: a day off every other week by default.
    localOffDay: 'Fri',
    localOffEvery: employment === 'Local' ? 2 : 0,
    localOffOffset: 0,
    // Travelers: standard Sunday-in / Friday-night-out, on site all five days.
    longTravel: false,
    travelPhase: 0,
    timeOff: [],
    locked: false,
    notes: '',
    ...extra,
  };
}

export function buildSeed() {
  const adc2 = { id: id('s'), name: 'ADC2', active: true, requirements: emptyRequirements() };
  const adc3 = { id: id('s'), name: 'ADC3', active: true, requirements: emptyRequirements() };
  const adc4 = { id: id('s'), name: 'ADC4', active: false, requirements: emptyRequirements() };

  // Starting thresholds from the original plan. Everything here is editable
  // on the Requirements tab, per week.
  adc2.requirements.base.RCx = { min: 4, max: 7 };
  adc2.requirements.base.Injection = { min: 1, max: null };
  adc2.requirements.base.ECx = { min: 3, max: null };
  adc2.requirements.base.MCx = { min: 2, max: null };
  adc2.requirements.base.Quality = { min: 1, max: null };

  adc3.requirements.base.RCx = { min: 2, max: 6 };
  adc3.requirements.base.Injection = { min: 1, max: null };
  adc3.requirements.base.ECx = { min: 3, max: null };
  adc3.requirements.base.MCx = { min: 2, max: null };
  adc3.requirements.base.Quality = { min: 1, max: null };

  const people = [];

  // ---- ADC2 -------------------------------------------------------------
  const A2 = adc2.id;
  people.push(
    { ...person('Mike C', 'Project Coordinator', 'Traveler', 'X', sk()), siteId: A2 },
    { ...person('Jake S', 'Quality Site Lead', 'Local', 'X', sk('Quality')), siteId: A2 },
    { ...person('Sean H', 'Electrical Lead / RCx', 'Local', 'X', sk('ECx', 'RCx')), siteId: A2 },
    { ...person('Tyler C', 'Mechanical Lead', 'Local', 'X', sk('MCx')), siteId: A2 },
    { ...person('Rene A', 'ECx / RCx', 'Traveler', 'X', sk('ECx', 'RCx')), siteId: A2 },
    { ...person('Luis M', 'Quality', 'Traveler', 'X', sk('Quality')), siteId: A2 },
    { ...person('Isaiah B', 'ECx / RCx', 'Local', '', sk('ECx', 'RCx')), siteId: A2 },
    { ...person('Kaiden W', 'ECx', 'Traveler', '', sk('ECx')), siteId: A2 },
    { ...person('Gerry C', 'ECx / RCx / Injection', 'Traveler', '', sk('ECx', 'RCx', 'Injection')), siteId: A2 },
    { ...person('Joshua C', 'MCx', 'Traveler', '', sk('MCx')), siteId: A2 },
    { ...person('Marquel J', 'Quality', 'Traveler', '', sk('Quality')), siteId: A2 },
    { ...person('Rodney P', 'ECx / RCx', 'Traveler', '', sk('ECx', 'RCx')), siteId: A2 },
    { ...person('Renordo B', 'MCx', 'Traveler', '', sk('MCx')), siteId: A2 },
    { ...person('Ryan W', 'MCx', 'Traveler', 'X', sk('MCx')), siteId: A2 },
    { ...person('Melvin P', 'MCx', 'Traveler', '', sk('MCx')), siteId: A2 },
  );

  // ---- ADC3 -------------------------------------------------------------
  const A3 = adc3.id;
  people.push(
    { ...person('Seth P', 'Project Coordinator / Injection', 'Local', '', sk('Injection')), siteId: A3 },
    { ...person('Langston A', 'Electrical Lead / RCx', 'Traveler', '', sk('ECx', 'RCx')), siteId: A3 },
    { ...person("De'Sean D", 'Quality Site Lead', 'Local', 'X', sk('Quality')), siteId: A3 },
    { ...person('Michael M', 'Mechanical Lead', 'Traveler', 'X', sk('MCx')), siteId: A3 },
    { ...person('Bryce M', 'ECx', 'Traveler', 'P', sk('ECx')), siteId: A3 },
    { ...person('Chandra C', 'ECx', 'Traveler', '', sk('ECx')), siteId: A3 },
    { ...person('Amr F', 'Quality / MCx', 'Traveler', 'X', sk('Quality', 'MCx')), siteId: A3 },
    { ...person('Justus A', 'ECx / RCx', 'Traveler', 'P', sk('ECx', 'RCx')), siteId: A3 },
    { ...person('Roderick J', 'ECx / RCx', 'Traveler', 'P', sk('ECx', 'RCx')), siteId: A3 },
    { ...person('Joel S', 'ECx / RCx / Injection', 'Local', '', sk('ECx', 'RCx', 'Injection')), siteId: A3 },
    { ...person('Kellan H', 'Quality', 'Traveler', 'X', sk('Quality')), siteId: A3 },
    { ...person('Stephen Y', 'MCx / Injection', 'Traveler', '', sk('MCx', 'Injection')), siteId: A3 },
    { ...person('Taha S', 'ECx / RCx / Injection', 'Traveler', 'P', sk('ECx', 'RCx', 'Injection')), siteId: A3 },
    { ...person('Travis W', 'MCx', 'Traveler', 'P', sk('MCx')), siteId: A3 },
    { ...person('Jerry E', 'MCx', 'Traveler', 'P', sk('MCx')), siteId: A3 },
    { ...person('Braden S', 'ECx', 'Traveler', 'P', sk('ECx')), siteId: A3 },
  );

  // ---- ADC4 (not mobilized) --------------------------------------------
  const A4 = adc4.id;
  people.push(
    { ...person('Kaleel J', 'Project Coordinator', 'Traveler', 'P', sk()), siteId: A4 },
    { ...person('Quang N', 'Quality Site Lead', 'Traveler', 'X', sk('Quality')), siteId: A4 },
    { ...person('Mohamed S', 'Quality / MCx / ECx', 'Traveler', '', sk('Quality', 'MCx', 'ECx')), siteId: A4 },
  );

  return {
    version: 1,
    program: {
      startDate: '2026-09-07', // Monday of the first full week of September
      numWeeks: 16,
      maxConsecutive: 3,
    },
    sites: [adc2, adc3, adc4],
    people,
  };
}

export function newPerson(siteId) {
  const p = person('New person', '', 'Traveler', '', {});
  for (const s of SKILLS) p.skills[s] = false;
  return { ...p, siteId, name: '' };
}

export function newSite(name) {
  return { id: id('s'), name, active: true, requirements: emptyRequirements() };
}
