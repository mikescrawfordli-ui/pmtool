import { buildSeed } from './seed.js';

const KEY = 'manning-board:v1';

/**
 * Everything lives in this browser's localStorage. No account, no server, and
 * nothing leaves the machine. Use Export on the Setup tab to back it up or
 * carry the plan to another computer.
 *
 * To move to a shared database later, replace the two functions below with
 * fetch() calls to an API route — nothing else in the app touches storage.
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

function migrate(state) {
  if (!state || typeof state !== 'object') return buildSeed();
  if (!Array.isArray(state.sites) || !Array.isArray(state.people)) return buildSeed();
  state.program = {
    startDate: '2026-09-07',
    numWeeks: 16,
    maxConsecutive: 3,
    ...(state.program || {}),
  };
  for (const p of state.people) {
    p.skills = p.skills || {};
    p.timeOff = p.timeOff || [];
    if (p.rotationStart == null) p.rotationStart = 0;
    if (p.localOffParity == null) p.localOffParity = 0;
    if (p.localOffDay == null) p.localOffDay = p.employment === 'Local' ? 'Fri' : 'None';
  }
  return state;
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
