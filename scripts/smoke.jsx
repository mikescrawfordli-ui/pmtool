/**
 * Render every tab once, in Node, and fail if any of them throws.
 *
 * This exists because `vite build` cannot catch the mistake that motivated
 * it. A function used but never imported is a bare identifier, which the
 * bundler treats as a global rather than an error — so the build passes and
 * the tab blanks the moment it renders. Only actually rendering finds that.
 *
 * The fixture deliberately covers the awkward states rather than a clean
 * roster: a visitor with a mid-week arrival, leave, a pinned home week and a
 * single-day booking. Those are the paths a clean seed never exercises.
 */
import { renderToString } from 'react-dom/server';
import { buildSeed } from '../src/lib/seed.js';
import Dashboard from '../src/components/Dashboard.jsx';
import Roster from '../src/components/Roster.jsx';
import Schedule from '../src/components/Schedule.jsx';
import Requirements from '../src/components/Requirements.jsx';
import Setup from '../src/components/Setup.jsx';
import Access from '../src/components/Access.jsx';

const st = buildSeed();
const site = st.sites[0];
const people = st.people.filter((p) => p.siteId === site.id);

// A visitor who lands on a Wednesday and leaves on a Thursday.
people.push({
  ...people[0],
  id: 'smoke_visitor',
  name: 'Vis A',
  employment: 'Visitor',
  startWeek: 1,
  startDay: 2,
  endWeek: 2,
  endDay: 3,
  visitFrom: '2026-09-16',
  visitTo: '2026-09-24',
});

// Leave, a pinned home week, and one day booked off.
people[1] = {
  ...people[1],
  timeOff: [
    { start: 3, end: 3, type: 'Vacation', kind: 'pto' },
    { start: 5, end: 5, type: 'Home week', kind: 'home' },
    { start: 7, end: 7, type: 'Vacation', days: [4] },
  ],
};

// A renamed column and one nobody holds, so the dynamic path is exercised.
const skills = [
  ...st.skills.map((s) => (s.id === 'RCx' ? { ...s, code: 'Relay', label: 'Relay Testing' } : s)),
  { id: 'smoke_new', code: 'New', label: 'Newly added' },
];

const noop = () => {};
const common = { site, people, program: st.program, skills };

const cases = {
  Dashboard: <Dashboard {...common} onBalance={noop} />,
  Roster: (
    <Roster
      {...common}
      sites={st.sites}
      update={noop}
      addMany={noop}
      removeOne={noop}
      addSkill={noop}
      updateSkill={noop}
      removeSkill={noop}
      moveSkill={noop}
    />
  ),
  Schedule: <Schedule {...common} update={noop} onBalance={noop} balanceInfo={null} />,
  Requirements: (
    <Requirements site={site} program={st.program} updateSite={noop} skills={skills} />
  ),
  Setup: (
    <Setup
      state={st}
      setProgram={noop}
      sites={st.sites}
      updateSite={noop}
      addSite={noop}
      removeSite={noop}
      replaceState={noop}
      resetAll={noop}
      notify={noop}
      skills={skills}
    />
  ),
  Access: (
    <Access
      user={{ email: 'owner@example.com' }}
      members={[
        { email: 'owner@example.com', role: 'admin' },
        { email: 'someone@example.com', role: 'viewer' },
      ]}
      ownerEmail="owner@example.com"
      notify={noop}
    />
  ),
};

let failed = 0;
for (const [name, el] of Object.entries(cases)) {
  try {
    const html = renderToString(el);
    if (!html.length) throw new Error('rendered nothing');
    console.log(`  ${name.padEnd(13)} ok   ${html.length} chars`);
  } catch (err) {
    failed++;
    console.error(`  ${name.padEnd(13)} FAILED  ${err.message}`);
  }
}

if (failed) {
  console.error(`\n${failed} component${failed === 1 ? '' : 's'} crashed on render`);
  process.exit(1);
}
console.log('\nall tabs render');
