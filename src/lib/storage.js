import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { SKILLS } from './constants.js';
import { buildSeed } from './seed.js';
import { db } from './firebase.js';

const KEY = 'manning-board:v1';

/**
 * The whole plan lives in one document. There is one board, shared by the
 * crew, so the id is fixed rather than per-user.
 *
 * It is stored as a single JSON string rather than as native Firestore fields.
 * The plan is one blob that is always read and written whole, so there is
 * nothing to gain from field-level structure, and stringifying sidesteps every
 * Firestore type restriction (no undefined, no nested arrays, string-only map
 * keys) in one move. It also matches exactly what Export backup already writes.
 * Firestore caps a document at 1 MB; a 120-person, 52-week plan is well under
 * 200 KB.
 */
const BOARD_COLLECTION = 'boards';
const BOARD_ID = 'main';

/**
 * localStorage is now a cache, not the system of record — Firestore is.
 *
 * Keeping it does two useful things: the board paints instantly from the last
 * known plan instead of flashing empty while the network round-trips, and the
 * app stays readable if the connection drops.
 */
export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return buildSeed();
    const parsed = JSON.parse(raw);
    return migrate(parsed);
  } catch (err) {
    console.warn('Could not read saved plan, starting from the seed roster.', err);
    return buildSeed();
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.error('Could not save plan.', err);
    return false;
  }
}

export function clearState() {
  localStorage.removeItem(KEY);
}

/**
 * Bring a plan up to the current shape, whatever version wrote it.
 *
 * Exported because it guards every way state enters the app — the local
 * cache, the Firestore snapshot, and Import backup. A file exported before a
 * skill was added has no entry for it, and the Requirements tab reads
 * base[skill].min directly, so skipping this on any one path is a crash.
 */
export function migrate(state) {
  if (!state || typeof state !== 'object') return buildSeed();
  if (!Array.isArray(state.sites) || !Array.isArray(state.people)) return buildSeed();
  state.program = {
    startDate: '2026-09-07',
    numWeeks: 16,
    maxConsecutive: 3,
    ...(state.program || {}),
  };
  // v3 adds a skill (VT Weld) and the hard/dedicated flag. A board saved
  // before either existed has no entry for the new skill, and reading
  // base[skill].min off `undefined` would throw on the Requirements tab.
  for (const site of state.sites) {
    if (!site.requirements) site.requirements = { base: {}, overrides: {} };
    if (!site.requirements.base) site.requirements.base = {};
    for (const s of SKILLS) {
      const cur = site.requirements.base[s];
      site.requirements.base[s] = {
        min: cur?.min ?? 0,
        max: cur?.max ?? null,
        hard: !!cur?.hard,
      };
    }
  }

  for (const p of state.people) {
    p.skills = p.skills || {};
    p.timeOff = p.timeOff || [];
    if (p.rotationStart == null) p.rotationStart = 0;

    // v1 stored a Mon/Fri/None day plus an odd/even parity. v2 splits that into
    // a frequency (0 = never, 2, 3) and an offset within that cycle.
    if (p.localOffEvery == null) {
      const hadNone = !p.localOffDay || p.localOffDay === 'None';
      p.localOffEvery = p.employment === 'Local' && !hadNone ? 2 : 0;
      p.localOffOffset = p.localOffParity ? 1 : 0;
      if (hadNone) p.localOffDay = 'Fri';
    }
    if (p.localOffOffset == null) p.localOffOffset = 0;
    if (p.localOffDay == null || p.localOffDay === 'None') p.localOffDay = 'Fri';
    delete p.localOffParity;

    if (p.longTravel == null) p.longTravel = false;
    if (p.travelPhase == null) p.travelPhase = 0;
  }
  return state;
}

/* ------------------------------------------------------------------ */
/* Firestore — the shared copy                                         */
/* ------------------------------------------------------------------ */

function boardRef() {
  return doc(db, BOARD_COLLECTION, BOARD_ID);
}

/**
 * Watch the shared board. `onData` fires with the plan on connect and again
 * on every change made from any device, which is what keeps two people's
 * screens in step. It fires with null when no board has been saved yet.
 *
 * `onError` gets Firestore's error. The one to expect is
 * 'permission-denied', which means the signed-in address is not in the crew
 * list in firestore.rules.
 *
 * Returns the unsubscribe function.
 */
export function subscribeBoard(onData, onError) {
  return onSnapshot(
    boardRef(),
    (snap) => {
      // Our own writes echo back locally before they reach the server. Let
      // the confirmed version through instead so we don't re-apply our own
      // change as though it were someone else's.
      if (snap.metadata.hasPendingWrites) return;
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const raw = snap.data().json;
      if (typeof raw !== 'string') {
        onData(null);
        return;
      }
      try {
        onData(migrate(JSON.parse(raw)));
      } catch (err) {
        console.error('Board document is not readable JSON.', err);
        onError?.(err);
      }
    },
    onError,
  );
}

/**
 * Write the plan to the shared board, stamped with who saved it and when so
 * the Setup tab can show it. Throws on failure — callers surface that rather
 * than letting a write fail silently.
 */
export async function saveBoard(state, user) {
  await setDoc(boardRef(), {
    json: JSON.stringify(state),
    updatedAt: Date.now(),
    updatedBy: user?.email || 'unknown',
  });
}


/* ------------------------------------------------------------------ */
/* Members — who may open the board, and as what                       */
/* ------------------------------------------------------------------ */

export const ROLES = [
  { value: 'admin', label: 'Admin', blurb: 'Everything, including managing access' },
  { value: 'editor', label: 'Content manager', blurb: 'Everything except managing access' },
  { value: 'viewer', label: 'Viewer', blurb: 'Read only — can look and export, cannot change' },
];

export const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.value, r.label]));

/** Roles allowed to change the plan. Mirrors canWrite() in firestore.rules. */
export function roleCanEdit(role) {
  return role === 'admin' || role === 'editor';
}

export function roleIsAdmin(role) {
  return role === 'admin';
}

/**
 * Watch the access list. Fires with an array of { email, role, addedBy,
 * addedAt } on every change, so promoting someone takes effect on their
 * screen without a reload.
 */
export function subscribeMembers(onData, onError) {
  return onSnapshot(
    collection(db, 'members'),
    (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ email: d.id, ...d.data() }));
      list.sort((a, b) => a.email.localeCompare(b.email));
      onData(list);
    },
    onError,
  );
}

/** Add someone, or change the role of someone already on the list. */
export async function setMember(email, role, byUser) {
  const key = String(email).trim().toLowerCase();
  if (!key) throw new Error('An email address is required.');
  await setDoc(
    doc(db, 'members', key),
    { role, addedBy: byUser?.email || 'unknown', addedAt: Date.now() },
    { merge: true },
  );
  return key;
}

export async function removeMember(email) {
  await deleteDoc(doc(db, 'members', String(email).trim().toLowerCase()));
}

export function exportFile(state) {
  const stamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `manning-board-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportCsv(rows, filename) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
