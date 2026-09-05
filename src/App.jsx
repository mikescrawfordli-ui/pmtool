import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  loadState, saveState, clearState, subscribeBoard, saveBoard, migrate,
  subscribeMembers, setMember, roleCanEdit, roleIsAdmin, ROLE_LABEL,
} from './lib/storage.js';
import { watchAuth, signIn, signOut, configPlaceholder, OWNER_EMAIL } from './lib/firebase.js';
import { buildSeed, newSite as makeSite } from './lib/seed.js';
import { findGaps } from './lib/schedule.js';
import { autoBalance } from './lib/balancer.js';

import Dashboard from './components/Dashboard.jsx';
import Roster from './components/Roster.jsx';
import Schedule from './components/Schedule.jsx';
import Requirements from './components/Requirements.jsx';
import Setup from './components/Setup.jsx';
import Access from './components/Access.jsx';

const BASE_TABS = ['Dashboard', 'Roster', 'Schedule', 'Requirements', 'Setup'];

// Every keystroke changes state, and every change would otherwise be a
// Firestore write. Wait for a pause in the typing instead.
const SAVE_DEBOUNCE_MS = 800;

const SYNC_LABEL = {
  connecting: 'Connecting',
  live: 'Saved to cloud',
  denied: 'No access',
  error: 'Offline - local only',
};

export default function App() {
  // undefined = still checking with Firebase, null = signed out.
  const [user, setUser] = useState(undefined);
  const [sync, setSync] = useState('connecting');
  const [state, setState] = useState(loadState);
  const [siteId, setSiteId] = useState(() => state.sites[0]?.id);
  const [tab, setTab] = useState('Dashboard');
  const [toast, setToast] = useState(null);
  const [balanceInfo, setBalanceInfo] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [members, setMembers] = useState(null); // null until the list loads

  // The exact JSON last agreed on with the server. Both directions of the
  // sync compare against it, which is what stops a save and a snapshot from
  // ping-ponging each other forever.
  const syncedJson = useRef(null);

  // Lets the snapshot handler read current state without resubscribing.
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  // Cache locally on every change, always. This is what paints the board
  // instantly on the next visit and keeps it readable with no connection.
  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => watchAuth((u) => {
    setUser(u);
    if (!u) {
      setSync('connecting');
      syncedJson.current = null;
    }
  }), []);

  // Live subscription: pick up edits made on any other device as they happen.
  useEffect(() => {
    if (!user) return undefined;
    setSync('connecting');

    return subscribeBoard(
      (remote) => {
        if (remote === null) {
          // Nothing saved yet — this device's plan becomes the first board.
          const seedState = stateRef.current;
          syncedJson.current = JSON.stringify(seedState);
          saveBoard(seedState, user).catch(() => setSync('error'));
          setSync('live');
          return;
        }
        const json = JSON.stringify(remote);
        setSync('live');
        if (json === syncedJson.current) return; // our own write echoing back
        syncedJson.current = json;
        setState(remote);
        setSiteId((cur) => (remote.sites.some((x) => x.id === cur) ? cur : remote.sites[0]?.id));
      },
      (err) => {
        console.error('Board sync failed.', err);
        setSync(err?.code === 'permission-denied' ? 'denied' : 'error');
      },
    );
  }, [user]);

  // Access list. Everyone who can open the board can read it, which is how
  // the app learns its own role; a non-member is refused here exactly as they
  // are refused the board.
  useEffect(() => {
    if (!user) {
      setMembers(null);
      return undefined;
    }
    return subscribeMembers(setMembers, (err) => {
      console.error('Could not read the access list.', err);
      setMembers([]);
    });
  }, [user]);

  const myEmail = (user?.email || '').toLowerCase();
  const isOwner = !!myEmail && myEmail === OWNER_EMAIL.toLowerCase();
  const myMember = members?.find((m) => m.email === myEmail) || null;
  // The owner is an admin whether or not a member document says so.
  const role = isOwner ? 'admin' : myMember?.role || null;
  const canEdit = roleCanEdit(role);
  const isAdmin = roleIsAdmin(role);

  // Put the owner on the list the first time they open it, so the Access tab
  // is not mysteriously empty and the roster of who has access is complete.
  useEffect(() => {
    if (!user || !isOwner || members === null) return;
    if (members.some((m) => m.email === myEmail)) return;
    setMember(myEmail, 'admin', user).catch((err) =>
      console.error('Could not add the owner to the access list.', err),
    );
  }, [user, isOwner, members, myEmail]);

  // Push local edits up, once the typing stops.
  useEffect(() => {
    if (!user || sync === 'denied' || !canEdit) return undefined;
    const json = JSON.stringify(state);
    if (json === syncedJson.current) return undefined;

    const timer = setTimeout(() => {
      syncedJson.current = json;
      saveBoard(state, user)
        .then(() => setSync('live'))
        .catch((err) => {
          console.error('Could not save the board.', err);
          // Let the next edit try again rather than stranding this one.
          syncedJson.current = null;
          setSync(err?.code === 'permission-denied' ? 'denied' : 'error');
        });
    }, SAVE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [state, user, sync]);

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
    // Just clear the selection rather than naming the next site from a copy
    // of the list that may already be out of date — a snapshot from another
    // device can replace state between this render and this click. `site`
    // falls back to the first remaining site on its own, and it reads the
    // state this update produces rather than the one that was captured.
    setSiteId((cur) => (cur === id ? undefined : cur));
  }, []);

  const setProgram = useCallback((patch) => {
    setState((s) => ({ ...s, program: { ...s.program, ...patch } }));
  }, []);

  const replaceState = useCallback((next) => {
    // Imported backups can predate any number of schema changes.
    const ready = migrate(next);
    setState(ready);
    setSiteId(ready.sites[0]?.id);
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
    if (!site || sitePeople.length === 0 || !canEdit) return;
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

  /* --- gates ------------------------------------------------------------ */

  // Nothing works until the web config is pasted in, so say so plainly
  // instead of letting the Firebase SDK throw something cryptic.
  if (configPlaceholder) {
    return (
      <div className="app">
        <div className="gate">
          <h3>Firebase not configured</h3>
          <p>
            Paste your Firebase web config into <code>src/lib/firebase.js</code> and reload.
            It is in the Firebase console under Project settings &rarr; Your apps &rarr; the
            web app &rarr; SDK setup and configuration.
          </p>
        </div>
      </div>
    );
  }

  if (user === undefined) {
    return (
      <div className="app">
        <div className="gate"><h3>Connecting</h3></div>
      </div>
    );
  }

  if (user === null) {
    return (
      <div className="app">
        <div className="gate">
          <h3>Manning Board</h3>
          <p>Sign in with the Google account on the crew list to open the board.</p>
          <button
            className="btn is-primary"
            onClick={() => {
              setAuthError(null);
              signIn().catch((err) => {
                // Closing the popup is a normal thing to do, not an error
                // worth shouting about.
                if (err?.code === 'auth/popup-closed-by-user') return;
                setAuthError(
                  err?.code === 'auth/popup-blocked'
                    ? 'Your browser blocked the sign-in popup. Allow popups for this site and try again.'
                    : `Sign-in failed: ${err?.code || err?.message || 'unknown error'}`,
                );
              });
            }}
          >
            Sign in with Google
          </button>
          {authError && <p className="gate-error">{authError}</p>}
        </div>
      </div>
    );
  }

  // Signed in, but the address is not in the crew list in firestore.rules.
  if (sync === 'denied') {
    return (
      <div className="app">
        <div className="gate">
          <h3>Not on the crew list</h3>
          <p>
            You are signed in as <strong>{user.email}</strong>, but that address is not
            allowed to open this board. Ask whoever runs it to add you to the crew list
            in <code>firestore.rules</code>.
          </p>
          <button className="btn" onClick={() => signOut()}>Sign out</button>
        </div>
      </div>
    );
  }

  const tabs = isAdmin ? [...BASE_TABS, 'Access'] : BASE_TABS;
  const activeTab = tabs.includes(tab) ? tab : 'Dashboard';

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
        <div className="rail-note" title={user.email}>
          <span className={`syncdot is-${sync}`} aria-hidden="true" />
          {SYNC_LABEL[sync]}
          {role && <> · {ROLE_LABEL[role] || role}</>}
        </div>
        <button className="btn is-sm is-ghost" onClick={() => signOut()}>Sign out</button>
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
        {tabs.map((t) => (
          <button
            key={t}
            className={`navtab ${t === activeTab ? 'is-active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>

      {role && !canEdit && (
        <div className="ro-banner">
          View only — you have <strong>{ROLE_LABEL[role] || role}</strong> access. Ask an admin for
          Content manager access to make changes.
        </div>
      )}

      <main className="main">
        {activeTab === 'Dashboard' && (
          <Dashboard
            site={site}
            people={sitePeople}
            program={state.program}
            onBalance={handleBalance}
            canEdit={canEdit}
          />
        )}
        {activeTab === 'Roster' && (
          <fieldset className="ro-wrap" disabled={!canEdit}>
            <Roster
              site={site}
              sites={state.sites}
              people={sitePeople}
              program={state.program}
              update={updatePerson}
              addMany={addPeople}
              removeOne={removePerson}
            />
          </fieldset>
        )}
        {activeTab === 'Schedule' && (
          <fieldset className="ro-wrap" disabled={!canEdit}>
            <Schedule
              site={site}
              people={sitePeople}
              program={state.program}
              update={updatePerson}
              onBalance={handleBalance}
              balanceInfo={balanceInfo}
            />
          </fieldset>
        )}
        {activeTab === 'Requirements' && (
          <fieldset className="ro-wrap" disabled={!canEdit}>
            <Requirements site={site} program={state.program} updateSite={updateSite} />
          </fieldset>
        )}
        {activeTab === 'Setup' && (
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
            canEdit={canEdit}
          />
        )}
        {activeTab === 'Access' && (
          <Access
            user={user}
            members={members || []}
            ownerEmail={OWNER_EMAIL.toLowerCase()}
            notify={notify}
          />
        )}
      </main>

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
