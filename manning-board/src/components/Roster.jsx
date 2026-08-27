import React, { useState } from 'react';
import { SKILLS, EMPLOYMENT, LIFT, LOCAL_OFF_DAYS, TIME_OFF_TYPES } from '../lib/constants.js';
import { fmtWeekLong } from '../lib/schedule.js';
import { newPerson } from '../lib/seed.js';

function TimeOffEditor({ person, program, onChange, onClose }) {
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [type, setType] = useState('Vacation');
  const weeks = Array.from({ length: program.numWeeks }, (_, i) => i);

  const add = () => {
    const s = Math.min(start, end);
    const e = Math.max(start, end);
    onChange([...(person.timeOff || []), { start: s, end: e, type }]);
  };

  const remove = (idx) => {
    onChange((person.timeOff || []).filter((_, i) => i !== idx));
  };

  return (
    <tr>
      <td colSpan={SKILLS.length + 10} style={{ background: 'var(--surface-2)', padding: '14px 16px' }}>
        <div className="row" style={{ marginBottom: 10 }}>
          <div className="field">
            <label>From week</label>
            <select className="select" value={start} onChange={(e) => setStart(+e.target.value)}>
              {weeks.map((w) => (
                <option key={w} value={w}>
                  Wk {w + 1} — {fmtWeekLong(program.startDate, w)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Through week</label>
            <select className="select" value={end} onChange={(e) => setEnd(+e.target.value)}>
              {weeks.map((w) => (
                <option key={w} value={w}>
                  Wk {w + 1} — {fmtWeekLong(program.startDate, w)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Reason</label>
            <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
              {TIME_OFF_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <button className="btn is-primary" onClick={add}>Add time off</button>
          <button className="btn is-ghost" onClick={onClose}>Done</button>
        </div>

        {(person.timeOff || []).length === 0 ? (
          <p className="muted small" style={{ margin: 0 }}>
            No time off booked for {person.name || 'this person'}.
          </p>
        ) : (
          <div className="row" style={{ gap: 8 }}>
            {(person.timeOff || []).map((t, i) => (
              <span key={i} className="chip is-amber">
                {t.type}: wk {t.start + 1}
                {t.end !== t.start ? `–${t.end + 1}` : ''}
                <button
                  className="btn is-ghost is-sm"
                  style={{ padding: '0 3px', marginLeft: 2 }}
                  onClick={() => remove(i)}
                  aria-label="Remove time off"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </td>
    </tr>
  );
}

export default function Roster({ site, sites, people, program, update, addMany, removeOne }) {
  const [openTimeOff, setOpenTimeOff] = useState(null);

  const set = (id, patch) => update(id, patch);

  const setSkill = (p, skill, on) => {
    set(p.id, { skills: { ...p.skills, [skill]: on } });
  };

  const addPerson = () => {
    addMany([newPerson(site.id)]);
  };

  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <div style={{ flex: 1 }}>
            <h2 className="card-title">{site.name} roster</h2>
            <p className="card-sub">
              {people.length} people · {people.filter((p) => p.employment === 'Local').length} local ·{' '}
              {people.filter((p) => p.employment === 'Traveler').length} traveler
            </p>
          </div>
          <button className="btn is-primary" onClick={addPerson}>+ Add person</button>
        </div>

        <div className="card-body is-flush">
          {people.length === 0 ? (
            <div className="empty">
              <h3>No one assigned yet</h3>
              <p>Add people to {site.name} to start building a schedule.</p>
              <button className="btn is-primary" onClick={addPerson}>+ Add person</button>
            </div>
          ) : (
            <div className="tablewrap">
              <table className="data">
                <thead>
                  <tr>
                    <th className="sticky-col">Name</th>
                    <th>Role</th>
                    <th>Type</th>
                    <th>Lift</th>
                    {SKILLS.map((s) => (
                      <th key={s} className="is-center">{s}</th>
                    ))}
                    <th>Day off</th>
                    <th className="is-center">Rotation</th>
                    <th className="is-center">Lock</th>
                    <th>Time off</th>
                    <th>Site</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {people.map((p) => (
                    <React.Fragment key={p.id}>
                      <tr>
                        <td className="sticky-col">
                          <input
                            className="input"
                            style={{ width: 110 }}
                            value={p.name}
                            placeholder="First L"
                            onChange={(e) => set(p.id, { name: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            className="input"
                            style={{ width: 170 }}
                            value={p.role}
                            placeholder="Role"
                            onChange={(e) => set(p.id, { role: e.target.value })}
                          />
                        </td>
                        <td>
                          <select
                            className="select"
                            value={p.employment}
                            onChange={(e) => {
                              const employment = e.target.value;
                              set(p.id, {
                                employment,
                                localOffDay: employment === 'Local' ? (p.localOffDay === 'None' ? 'Fri' : p.localOffDay) : 'None',
                              });
                            }}
                          >
                            {EMPLOYMENT.map((t) => (
                              <option key={t}>{t}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            className="select"
                            value={p.lift}
                            onChange={(e) => set(p.id, { lift: e.target.value })}
                          >
                            {LIFT.map((l) => (
                              <option key={l.value} value={l.value}>{l.label}</option>
                            ))}
                          </select>
                        </td>

                        {SKILLS.map((s) => (
                          <td key={s} className="is-center">
                            <label className="skillbox" title={`${p.name || 'Person'} — ${s}`}>
                              <input
                                type="checkbox"
                                checked={!!p.skills[s]}
                                onChange={(e) => setSkill(p, s, e.target.checked)}
                              />
                              <span className="skillbox-face" aria-hidden="true">✓</span>
                            </label>
                          </td>
                        ))}

                        <td>
                          {p.employment === 'Local' ? (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <select
                                className="select"
                                style={{ width: 74 }}
                                value={p.localOffDay}
                                onChange={(e) => set(p.id, { localOffDay: e.target.value })}
                              >
                                {LOCAL_OFF_DAYS.map((d) => (
                                  <option key={d}>{d}</option>
                                ))}
                              </select>
                              <select
                                className="select"
                                style={{ width: 74 }}
                                value={p.localOffParity}
                                disabled={p.localOffDay === 'None'}
                                onChange={(e) => set(p.id, { localOffParity: +e.target.value })}
                              >
                                <option value={0}>Odd wks</option>
                                <option value={1}>Even wks</option>
                              </select>
                            </div>
                          ) : (
                            <span className="muted small">—</span>
                          )}
                        </td>

                        <td className="is-center">
                          {p.employment === 'Traveler' ? (
                            <select
                              className="select"
                              style={{ width: 66 }}
                              value={p.rotationStart}
                              onChange={(e) => set(p.id, { rotationStart: +e.target.value })}
                              title="Weeks already worked entering week 1 — this staggers who is home when"
                            >
                              {Array.from({ length: program.maxConsecutive + 1 }, (_, i) => (
                                <option key={i} value={i}>{i}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="muted small">—</span>
                          )}
                        </td>

                        <td className="is-center">
                          <label className="skillbox" title="Lock so auto-balance leaves this person alone">
                            <input
                              type="checkbox"
                              checked={!!p.locked}
                              onChange={(e) => set(p.id, { locked: e.target.checked })}
                            />
                            <span className="skillbox-face" aria-hidden="true">L</span>
                          </label>
                        </td>

                        <td>
                          <button
                            className="btn is-sm"
                            onClick={() => setOpenTimeOff(openTimeOff === p.id ? null : p.id)}
                          >
                            {(p.timeOff || []).length > 0 ? `${p.timeOff.length} booked` : 'Add'}
                          </button>
                        </td>

                        <td>
                          <select
                            className="select"
                            style={{ width: 96 }}
                            value={p.siteId}
                            onChange={(e) => set(p.id, { siteId: e.target.value })}
                            title="Move this person to another site"
                          >
                            {sites.map((s) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </td>

                        <td>
                          <button
                            className="btn is-danger is-sm"
                            onClick={() => {
                              if (confirm(`Remove ${p.name || 'this person'} from the roster?`)) removeOne(p.id);
                            }}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>

                      {openTimeOff === p.id && (
                        <TimeOffEditor
                          person={p}
                          program={program}
                          onChange={(timeOff) => set(p.id, { timeOff })}
                          onClose={() => setOpenTimeOff(null)}
                        />
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="callout is-info">
        <p className="callout-title">How the columns drive the schedule</p>
        <p>
          <strong>Rotation</strong> is how many weeks a traveler has already worked heading into week 1, so
          0 means they start a fresh three-week run and 3 means week 1 is their home week. Auto-balance
          sets these for you. <strong>Day off</strong> gives each local one Monday or Friday off every
          other week. <strong>Lock</strong> pins a person's rotation so auto-balance works around them.
        </p>
      </div>
    </div>
  );
}
