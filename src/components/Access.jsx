import React, { useState } from 'react';
import { ROLES, ROLE_LABEL, setMember, removeMember } from '../lib/storage.js';

/**
 * Who can open this board, and as what.
 *
 * Everything here writes to the `members` collection, which is the same list
 * firestore.rules reads to decide what a request is allowed to do. Changing a
 * role takes effect on that person's screen straight away, without a reload
 * and without anyone redeploying rules.
 */
export default function Access({ user, members, ownerEmail, notify }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async (fn, okMsg) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (okMsg) notify(okMsg);
    } catch (err) {
      console.error(err);
      setError(
        err?.code === 'permission-denied'
          ? 'Firestore refused that change. Only admins can manage access.'
          : err?.message || 'That did not work.',
      );
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    const clean = email.trim().toLowerCase();
    if (!clean || !clean.includes('@')) {
      setError('Enter a full email address.');
      return;
    }
    run(async () => {
      await setMember(clean, role, user);
      setEmail('');
    }, `${clean} can now sign in`);
  };

  const isOwner = (m) => m.email === ownerEmail;

  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <div style={{ flex: 1 }}>
            <h2 className="card-title">Who can open this board</h2>
            <p className="card-sub">
              People sign in with Google using the address you add here. Anyone not on this list
              gets a sign-in screen and nothing else — the check runs on Google's servers, not in
              the browser, so it cannot be worked around.
            </p>
          </div>
        </div>

        <div className="card-body">
          <div className="row" style={{ marginBottom: 6 }}>
            <div className="field" style={{ flex: 1, minWidth: 220 }}>
              <label>Google account email</label>
              <input
                className="input"
                type="email"
                placeholder="someone@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && add()}
              />
            </div>
            <div className="field">
              <label>Access level</label>
              <select className="select" value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <button className="btn is-primary" onClick={add} disabled={busy}>
              Give access
            </button>
          </div>

          <p className="muted small" style={{ margin: 0 }}>
            {ROLES.find((r) => r.value === role)?.blurb}
          </p>
          {error && <p className="gate-error small" style={{ marginBottom: 0 }}>{error}</p>}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Access list</h2>
          <p className="card-sub" style={{ flex: 1 }}>
            {members.length} {members.length === 1 ? 'person' : 'people'} with access
          </p>
        </div>
        <div className="card-body is-flush">
          <div className="tablewrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Access level</th>
                  <th>Added by</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {members.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted small">Nobody added yet.</td>
                  </tr>
                )}
                {members.map((m) => (
                  <tr key={m.email}>
                    <td>
                      <strong>{m.email}</strong>
                      {m.email === user.email?.toLowerCase() && (
                        <span className="chip is-mute" style={{ marginLeft: 6 }}>you</span>
                      )}
                      {isOwner(m) && (
                        <span className="chip is-ok" style={{ marginLeft: 6 }}>owner</span>
                      )}
                    </td>
                    <td>
                      {isOwner(m) ? (
                        <span className="muted small">{ROLE_LABEL[m.role] || m.role} — fixed</span>
                      ) : (
                        <select
                          className="select"
                          value={m.role}
                          disabled={busy}
                          onChange={(e) =>
                            run(
                              () => setMember(m.email, e.target.value, user),
                              `${m.email} is now ${ROLE_LABEL[e.target.value]}`,
                            )
                          }
                        >
                          {ROLES.map((r) => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="muted small">{m.addedBy || '—'}</td>
                    <td>
                      {!isOwner(m) && (
                        <button
                          className="btn is-danger is-sm"
                          disabled={busy}
                          onClick={() => {
                            if (!window.confirm(`Remove access for ${m.email}?`)) return;
                            run(() => removeMember(m.email), `${m.email} removed`);
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <h2 className="card-title" style={{ marginBottom: 8 }}>What the levels mean</h2>
          <ul className="muted small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
            {ROLES.map((r) => (
              <li key={r.value}><strong>{r.label}</strong> — {r.blurb}</li>
            ))}
          </ul>
          <p className="muted small" style={{ marginTop: 12, marginBottom: 0 }}>
            <strong>{ownerEmail}</strong> is the owner and always keeps admin access. That is set in
            firestore.rules rather than here, so no change on this page can lock everyone out.
          </p>
        </div>
      </div>
    </div>
  );
}
