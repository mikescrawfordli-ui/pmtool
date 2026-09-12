/**
 * A local harness for looking at the tabs without signing in.
 *
 * The real app is behind Google auth and a shared Firestore board, which
 * makes "click this and see what happens" awkward. This mounts the same
 * components against fixture data with plain local state, so the grid can be
 * driven by hand.
 *
 * Dev only: Vite builds index.html, so this entry never ships.
 */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { buildSeed } from './lib/seed.js';
import Dashboard from './components/Dashboard.jsx';
import Roster from './components/Roster.jsx';
import Schedule from './components/Schedule.jsx';
import Requirements from './components/Requirements.jsx';
import './styles.css';

const TABS = ['Schedule', 'Roster', 'Dashboard', 'Requirements'];

function Harness() {
  const [state, setState] = useState(() => {
    const st = buildSeed();
    const site = st.sites[0];
    const people = st.people.filter((p) => p.siteId === site.id);
    // Someone with a pinned home week, so the case under test is on screen.
    people[0] = {
      ...people[0],
      name: 'Pinned P',
      employment: 'Traveler',
      rotationStart: 0,
      timeOff: [{ start: 5, end: 5, type: 'Home week', kind: 'home' }],
    };
    return { ...st, people: [...people, ...st.people.filter((p) => p.siteId !== site.id)] };
  });
  const [tab, setTab] = useState('Schedule');

  const site = state.sites[0];
  const people = state.people.filter((p) => p.siteId === site.id);
  const update = (id, patch) =>
    setState((s) => ({ ...s, people: s.people.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  const updateSite = (id, patch) =>
    setState((s) => ({ ...s, sites: s.sites.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const noop = () => {};
  const common = { site, people, program: state.program, skills: state.skills };

  return (
    <div className="app">
      <nav className="navbar">
        {TABS.map((t) => (
          <button key={t} className={`navtab ${t === tab ? 'is-active' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>
      <main className="main">
        {tab === 'Schedule' && (
          <Schedule {...common} update={update} onBalance={noop} balanceInfo={null} />
        )}
        {tab === 'Roster' && (
          <Roster
            {...common}
            sites={state.sites}
            update={update}
            addMany={(list) => setState((s) => ({ ...s, people: [...s.people, ...list] }))}
            removeOne={(id) => setState((s) => ({ ...s, people: s.people.filter((p) => p.id !== id) }))}
            addSkill={noop}
            updateSkill={(id, patch) =>
              setState((s) => ({ ...s, skills: s.skills.map((x) => (x.id === id ? { ...x, ...patch } : x)) }))}
            removeSkill={noop}
            moveSkill={noop}
          />
        )}
        {tab === 'Dashboard' && <Dashboard {...common} onBalance={noop} />}
        {tab === 'Requirements' && (
          <Requirements site={site} program={state.program} updateSite={updateSite} skills={state.skills} />
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
