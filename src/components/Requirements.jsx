import React, { useState } from 'react';
import { SKILLS, SKILL_LABELS } from '../lib/constants.js';
import { reqFor, fmtWeek } from '../lib/schedule.js';

export default function Requirements({ site, program, updateSite }) {
  const { numWeeks, startDate } = program;
  const weeks = Array.from({ length: numWeeks }, (_, i) => i);
  const reqs = site.requirements;

  const [bulk, setBulk] = useState({ skill: SKILLS[0], from: 1, to: numWeeks, min: 0 });

  const setBase = (skill, key, raw) => {
    const value = raw === '' ? (key === 'max' ? null : 0) : Math.max(0, +raw);
    updateSite(site.id, {
      requirements: {
        ...reqs,
        base: { ...reqs.base, [skill]: { ...reqs.base[skill], [key]: value } },
      },
    });
  };

  const setOverride = (w, skill, raw) => {
    const overrides = { ...(reqs.overrides || {}) };
    const week = { ...(overrides[w] || {}) };

    if (raw === '') {
      delete week[skill];
    } else {
      week[skill] = { ...(week[skill] || {}), min: Math.max(0, +raw) };
    }

    if (Object.keys(week).length === 0) delete overrides[w];
    else overrides[w] = week;

    updateSite(site.id, { requirements: { ...reqs, overrides } });
  };

  const applyBulk = () => {
    const from = Math.max(0, Math.min(bulk.from, bulk.to) - 1);
    const to = Math.min(numWeeks - 1, Math.max(bulk.from, bulk.to) - 1);
    const overrides = { ...(reqs.overrides || {}) };
    for (let w = from; w <= to; w++) {
      overrides[w] = { ...(overrides[w] || {}), [bulk.skill]: { min: Math.max(0, +bulk.min) } };
    }
    updateSite(site.id, { requirements: { ...reqs, overrides } });
  };

  const clearOverrides = () => {
    updateSite(site.id, { requirements: { ...reqs, overrides: {} } });
  };

  const overrideCount = Object.keys(reqs.overrides || {}).length;

  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <div style={{ flex: 1 }}>
            <h2 className="card-title">{site.name} skill targets</h2>
            <p className="card-sub">
              How many people with each skill must be on site every day. These are the numbers the
              dashboard checks and auto-balance optimizes against.
            </p>
          </div>
        </div>
        <div className="card-body is-flush">
          <div className="tablewrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Skill</th>
                  <th className="is-center">Minimum per day</th>
                  <th className="is-center">Maximum before overstaffed</th>
                  <th>Meaning</th>
                </tr>
              </thead>
              <tbody>
                {SKILLS.map((s) => (
                  <tr key={s}>
                    <td>
                      <strong>{s}</strong>{' '}
                      <span className="muted small">{SKILL_LABELS[s]}</span>
                    </td>
                    <td className="is-center">
                      <input
                        className="input is-num is-tiny"
                        type="number"
                        min="0"
                        value={reqs.base[s].min}
                        onChange={(e) => setBase(s, 'min', e.target.value)}
                      />
                    </td>
                    <td className="is-center">
                      <input
                        className="input is-num is-tiny"
                        type="number"
                        min="0"
                        placeholder="—"
                        value={reqs.base[s].max ?? ''}
                        onChange={(e) => setBase(s, 'max', e.target.value)}
                      />
                    </td>
                    <td className="muted small">
                      {reqs.base[s].min === 0
                        ? 'Not tracked at this site'
                        : `Red below ${reqs.base[s].min}/day${
                            reqs.base[s].max != null ? `, amber above ${reqs.base[s].max}/day` : ''
                          }`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div style={{ flex: 1 }}>
            <h2 className="card-title">Week-by-week overrides</h2>
            <p className="card-sub">
              Targets change as a project moves through its phases. Type a number into any week to
              override the minimum above; clear it to fall back to the base target.
            </p>
          </div>
          {overrideCount > 0 && (
            <button className="btn is-danger is-sm" onClick={clearOverrides}>
              Clear all {overrideCount}
            </button>
          )}
        </div>

        <div className="card-body">
          <div className="row" style={{ marginBottom: 14 }}>
            <div className="field">
              <label>Set skill</label>
              <select
                className="select"
                value={bulk.skill}
                onChange={(e) => setBulk({ ...bulk, skill: e.target.value })}
              >
                {SKILLS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>From week</label>
              <input
                className="input is-num"
                style={{ width: 68 }}
                type="number"
                min="1"
                max={numWeeks}
                value={bulk.from}
                onChange={(e) => setBulk({ ...bulk, from: +e.target.value })}
              />
            </div>
            <div className="field">
              <label>Through week</label>
              <input
                className="input is-num"
                style={{ width: 68 }}
                type="number"
                min="1"
                max={numWeeks}
                value={bulk.to}
                onChange={(e) => setBulk({ ...bulk, to: +e.target.value })}
              />
            </div>
            <div className="field">
              <label>Minimum</label>
              <input
                className="input is-num"
                style={{ width: 68 }}
                type="number"
                min="0"
                value={bulk.min}
                onChange={(e) => setBulk({ ...bulk, min: +e.target.value })}
              />
            </div>
            <button className="btn" onClick={applyBulk}>Apply to range</button>
          </div>

          <div className="tablewrap">
            <table className="data">
              <thead>
                <tr>
                  <th className="sticky-col">Skill</th>
                  {weeks.map((w) => (
                    <th key={w} className="is-center" style={{ minWidth: 50 }}>
                      <div className="num" style={{ fontSize: 12 }}>{w + 1}</div>
                      <div className="num" style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 400 }}>
                        {fmtWeek(startDate, w)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SKILLS.map((s) => (
                  <tr key={s}>
                    <td className="sticky-col"><strong>{s}</strong></td>
                    {weeks.map((w) => {
                      const isOverride = !!(reqs.overrides?.[w]?.[s]);
                      const value = reqFor(site, w, s).min;
                      return (
                        <td key={w} className="is-center" style={{ padding: 3 }}>
                          <input
                            className="input is-num"
                            style={{
                              width: 44,
                              padding: '3px 5px',
                              borderColor: isOverride ? 'var(--blue)' : 'var(--line-soft)',
                              background: isOverride ? 'var(--blue-soft)' : 'var(--surface)',
                              fontWeight: isOverride ? 600 : 400,
                            }}
                            type="number"
                            min="0"
                            value={value}
                            title={isOverride ? 'Overridden for this week' : 'Inherited from the base target'}
                            onChange={(e) => setOverride(w, s, e.target.value)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="muted small" style={{ marginTop: 10, marginBottom: 0 }}>
            Blue cells are week-specific overrides. To drop one back to the base target, clear the box.
          </p>
        </div>
      </div>
    </div>
  );
}
