import React, { useState } from 'react';
import {
  SKILLS, EMPLOYMENT, LIFT, LOCAL_OFF_DAYS, LOCAL_OFF_FREQUENCIES,
  TRAVEL_PROFILES, TIME_OFF_TYPES,
} from '../lib/constants.js';
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
                    <th>Day off / travel</th>
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
                                localOffEvery: employment === 'Local' ? (p.localOffEvery || 2) : 0,
                                longTravel: employment === 'Local' ? false : p.longTravel,
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
                                style={{ width: 92 }}
                                value={p.localOffEvery ?? 0}
                                onChange={(e) => set(p.id, { localOffEvery: +e.target.value, localOffOffset: 0 })}
                                title="How often this local takes a day off"
                              >
                                {LOCAL_OFF_FREQUENCIES.map((f) => (
                                  <option key={f.value} value={f.value}>{f.label}</option>
                                ))}
                              </select>
                              <select
                                className="select"
                                style={{ width: 62 }}
                                value={p.localOffDay}
                                disabled={!p.localOffEvery}
                                onChange={(e) => set(p.id, { localOffDay: e.target.value })}
                              >
                                {LOCAL_OFF_DAYS.map((d) => (
                                  <option key={d}>{d}</option>
                                ))}
                              </select>
                              <select
                                className="select"
                                style={{ width: 74 }}
                                value={p.localOffOffset ?? 0}
                                disabled={!p.localOffEvery}
                                onChange={(e) => set(p.id, { localOffOffset: +e.target.value })}
                                title="Which week of the cycle they take it"
                              >
                                {Array.from({ length: Math.max(1, p.localOffEvery || 1) }, (_, i) => (
                                  <option key={i} value={i}>Wk {i + 1}</option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              <label className="skillbox" style={{ width: 'auto' }} title="Long flight — alternate travel days each rotation">
                                <input
                                  type="checkbox"
                                  checked={!!p.longTravel}
                                  onChange={(e) => set(p.id, { longTravel: e.target.checked })}
                                />
                                <span className="skillbox-face" aria-hidden="true">✈</span>
                              </label>
                              {p.longTravel && (
                                <select
                                  className="select"
                                  style={{ width: 148 }}
                                  value={p.travelPhase ?? 0}
                                  onChange={(e) => set(p.id, { travelPhase: +e.target.value })}
                                  title="Travel profile for their first rotation — it alternates after that"
                                >
                                  {TRAVEL_PROFILES.map((t) => (
                                    <option key={t.value} value={t.value}>1st: {t.label}</option>
                                  ))}
                                </select>
                              )}
                            </div>
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
          sets these for you.
        </p>
        <p style={{ marginTop: 8 }}>
          For <strong>locals</strong>, pick how often they take a Monday or Friday off — every 2 weeks,
          every 3 weeks, or never — and which week of that cycle it falls on. Auto-balance staggers the
          day and the week across your locals but never changes the frequency you set.
        </p>
        <p style={{ marginTop: 8 }}>
          For <strong>travelers</strong>, the default is fly in Sunday, fly out Friday night, so they are
          on site all five days. Tick <strong>✈ Long travel</strong> for anyone with a flight too long to
          do that every week: they alternate between flying in Monday and out late Friday for one
          rotation, then in Sunday and out Thursday night for the next. That trades one day a week for a
          long block at home between rotations. <strong>Lock</strong> pins a person so auto-balance works
          around them.
        </p>
      </div>
    </div>
  );
}
