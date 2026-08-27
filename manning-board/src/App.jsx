import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { loadState, saveState, clearState } from './lib/storage.js';
import { buildSeed, newSite as makeSite } from './lib/seed.js';
import { findGaps } from './lib/schedule.js';
import { autoBalance } from './lib/balancer.js';

import Dashboard from './components/Dashboard.jsx';
import Roster from './components/Roster.jsx';
import Schedule from './components/Schedule.jsx';
import Requirements from './components/Requirements.jsx';
import Setup from './components/Setup.jsx';

const TABS = ['Dashboard', 'Roster', 'Schedule', 'Requirements', 'Setup'];

export default function App() {
  const [state, setState] = useState(loadState);
  const [siteId, setSiteId] = useState(() => state.sites[0]?.id);
  const [tab, setTab] = useState('Dashboard');
  const [toast, setToast] = useState(null);
  const [balanceInfo, setBalanceInfo] = useState(null);

  // Save on every change. There is no explicit save button by design — the
  // plan is always the plan.
  useEffect(() => {
    saveState(state);
  }, [state]);

  const notify = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }, []);

  const site = useMemo(
    () => state.sites.find((s) => s.id === siteId) || state.sites[0],
    [state.sites, siteId],
  );

  const sitePeople = useMemo(
    () => (site ? state.people.filter((p) => p.siteId === site.id) : []),
    [state.people, site],
  );

  /* --- mutations -------------------------------------------------------- */

  const updatePerson = useCallback((id, patch) => {
    setState((s) => ({
      ...s,
      people: s.people.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  }, []);

  const addPeople = useCallback((list) => {
    setState((s) => ({ ...s, people: [...s.people, ...list] }));
  }, []);

  const removePerson = useCallback((id) => {
    setState((s) => ({ ...s, people: s.people.filter((p) => p.id !== id) }));
  }, []);

  const updateSite = useCallback((id, patch) => {
    setState((s) => ({
      ...s,
      sites: s.sites.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    }));
  }, []);

  const addSite = useCallback((name) => {
    const s = makeSite(name);
    setState((prev) => ({ ...prev, sites: [...prev.sites, s] }));
    setSiteId(s.id);
    setTab('Roster');
    notify(`${name} added`);
  }, [notify]);

  const removeSite = useCallback((id) => {
    setState((s) => ({
      ...s,
      sites: s.sites.filter((x) => x.id !== id),
      people: s.people.filter((p) => p.siteId !== id),
    }));
    setSiteId((cur) => {
      if (cur !== id) return cur;
      const remaining = state.sites.filter((x) => x.id !== id);
      return remaining[0]?.id;
    });
  }, [state.sites]);

  const setProgram = useCallback((patch) => {
    setState((s) => ({ ...s, program: { ...s.program, ...patch } }));
  }, []);

  const replaceState = useCallback((next) => {
    setState(next);
    setSiteId(next.sites[0]?.id);
  }, []);

  const resetAll = useCallback(() => {
    clearState();
    const seed = buildSeed();
    setState(seed);
    setSiteId(seed.sites[0].id);
    setBalanceInfo(null);
    notify('Reset to the starting roster');
  }, [notify]);

  /* --- balance ---------------------------------------------------------- */

  const handleBalance = useCallback(() => {
    if (!site || sitePeople.length === 0) return;
    const { numWeeks, maxConsecutive } = state.program;
    const result = autoBalance(sitePeople, site, numWeeks, { maxOn: maxConsecutive });

    const byId = new Map(result.people.map((p) => [p.id, p]));
    setState((s) => ({
      ...s,
      people: s.people.map((p) => (byId.has(p.id) ? { ...p, ...byId.get(p.id) } : p)),
    }));

    const { gaps } = findGaps(site, result.people, numWeeks, maxConsecutive);
    setBalanceInfo({ changed: result.changed, gaps: gaps.length });
    notify(
      gaps.length === 0
        ? `${site.name} balanced — all targets met`
        : `${site.name} balanced — ${gaps.length} problem${gaps.length === 1 ? '' : 's'} left`,
    );
  }, [site, sitePeople, state.program, notify]);

  // A fresh balance summary shouldn't linger after you change something else.
  useEffect(() => { setBalanceInfo(null); }, [siteId]);

  /* --- alarm dots on site tabs ------------------------------------------ */

  const siteStatus = useMemo(() => {
    const out = {};
    for (const s of state.sites) {
      const ppl = state.people.filter((p) => p.siteId === s.id);
      if (!s.active || ppl.length === 0) {
        out[s.id] = 'idle';
        continue;
      }
      const { gaps } = findGaps(s, ppl, state.program.numWeeks, state.program.maxConsecutive);
      out[s.id] = gaps.some((g) => g.type === 'short') ? 'alarm' : 'ok';
    }
    return out;
  }, [state.sites, state.people, state.program]);

  if (!site) {
    return (
      <div className="app">
        <div className="empty">
          <h3>No sites</h3>
          <button className="btn is-primary" onClick={() => addSite('Site 1')}>Add a site</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="rail">
        <div className="brand">
          <span className="brand-mark">Manning Board</span>
          <span className="brand-sub">COMMISSIONING LABOR PLANNER</span>
        </div>
        <div className="rail-spacer" />
        <div className="rail-note">
          {state.people.length} people · {state.sites.length} sites · {state.program.numWeeks} weeks
        </div>
      </header>

      <nav className="sitebar" aria-label="Sites">
        {state.sites.map((s) => (
          <button
            key={s.id}
            className={`sitetab ${s.id === site.id ? 'is-active' : ''}`}
            onClick={() => setSiteId(s.id)}
          >
            <span className={`sitetab-dot is-${siteStatus[s.id]}`} aria-hidden="true" />
            {s.name}
            {!s.active && <span style={{ fontSize: 10, opacity: 0.65 }}>idle</span>}
          </button>
        ))}
        <button
          className="sitetab-add"
          onClick={() => {
            const name = prompt('Name the new site');
            if (name && name.trim()) addSite(name.trim());
          }}
        >
          + Site
        </button>
      </nav>

      <nav className="navbar" aria-label="Sections">
        {TABS.map((t) => (
          <button
            key={t}
            className={`navtab ${t === tab ? 'is-active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>

      <main className="main">
        {tab === 'Dashboard' && (
          <Dashboard
            site={site}
            people={sitePeople}
            program={state.program}
            onBalance={handleBalance}
          />
        )}
        {tab === 'Roster' && (
          <Roster
            site={site}
            sites={state.sites}
            people={sitePeople}
            program={state.program}
            update={updatePerson}
            addMany={addPeople}
            removeOne={removePerson}
          />
        )}
        {tab === 'Schedule' && (
          <Schedule
            site={site}
            people={sitePeople}
            program={state.program}
            update={updatePerson}
            onBalance={handleBalance}
            balanceInfo={balanceInfo}
          />
        )}
        {tab === 'Requirements' && (
          <Requirements site={site} program={state.program} updateSite={updateSite} />
        )}
        {tab === 'Setup' && (
          <Setup
            state={state}
            setProgram={setProgram}
            sites={state.sites}
            updateSite={updateSite}
            addSite={addSite}
            removeSite={removeSite}
            replaceState={replaceState}
            resetAll={resetAll}
            notify={notify}
          />
        )}
      </main>

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
