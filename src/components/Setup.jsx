import React, { useRef, useState } from 'react';
import { SKILLS } from '../lib/constants.js';
import { buildPattern, fmtWeekLong, weekMin, computeCoverage } from '../lib/schedule.js';
import { exportFile, exportCsv } from '../lib/storage.js';

export default function Setup({
  state, setProgram, sites, updateSite, addSite, removeSite, replaceState, resetAll, notify,
  canEdit = true,
}) {
  const fileRef = useRef(null);
  const [newSiteName, setNewSiteName] = useState('');
  const { program } = state;

  const importFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed.sites || !parsed.people) throw new Error('Not a manning board file');
        replaceState(parsed);
        notify('Plan imported');
      } catch (err) {
        notify(`Could not read that file: ${err.message}`);
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  const exportSchedule = () => {
    const header = ['Site', 'Name', 'Role', 'Type', 'Lift', 'Long travel', 'Day off', ...SKILLS];
    for (let w = 0; w < program.numWeeks; w++) header.push(`Wk${w + 1} ${fmtWeekLong(program.startDate, w)}`);
    const rows = [header];

    for (const site of sites) {
      for (const p of state.people.filter((x) => x.siteId === site.id)) {
        const pattern = buildPattern(p, program.numWeeks, program.maxConsecutive);
        rows.push([
          site.name, p.name, p.role, p.employment, p.lift || '',
          p.employment === 'Traveler' && p.longTravel ? 'Y' : '',
          p.employment === 'Local' && p.localOffEvery
            ? `${p.localOffDay} every ${p.localOffEvery} wks`
            : p.employment === 'Local' ? 'None' : '',
          ...SKILLS.map((s) => (p.skills[s] ? 'Y' : '')),
          ...pattern.map((st) => (st === 'ON' ? 'ON' : st === 'TIME_OFF' ? 'PTO' : 'HOME')),
        ]);
      }
    }

    rows.push([]);
    for (const site of sites) {
      const sitePeople = state.people.filter((x) => x.siteId === site.id);
      const { cov } = computeCoverage(sitePeople, program.numWeeks, program.maxConsecutive, site);
      rows.push([`${site.name} — worst-day coverage`]);
      rows.push(['Skill', 'Target', 'Dedicated', ...Array.from({ length: program.numWeeks }, (_, w) => `Wk${w + 1}`)]);
      for (const s of SKILLS) {
        const base = site.requirements.base[s].min;
        if (!base && !sitePeople.some((p) => p.skills[s])) continue;
        rows.push([
          s, base, site.requirements.base[s].hard ? 'Y' : '',
          ...Array.from({ length: program.numWeeks }, (_, w) => weekMin(cov, w, s)),
        ]);
      }
      rows.push([]);
    }

    exportCsv(rows, `manning-schedule-${new Date().toISOString().slice(0, 10)}.csv`);
    notify('Schedule exported as CSV');
  };

  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <div style={{ flex: 1 }}>
            <h2 className="card-title">Program window</h2>
            <p className="card-sub">The stretch of weeks every site is scheduled across.</p>
          </div>
        </div>
        <div className="card-body">
          <div className="row">
            <div className="field">
              <label>First Monday</label>
              <input
                className="input"
                type="date"
                disabled={!canEdit}
                value={program.startDate}
                onChange={(e) => setProgram({ startDate: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Weeks to plan</label>
              <input
                className="input is-num"
                style={{ width: 84 }}
                type="number"
                min="1"
                max="260"
                disabled={!canEdit}
                value={program.numWeeks}
                onChange={(e) => setProgram({ numWeeks: Math.max(1, Math.min(260, +e.target.value || 1)) })}
              />
            </div>
            <div className="field">
              <label>Add time</label>
              <div className="row" style={{ gap: 4 }}>
                {[
                  { label: '+1 month', weeks: 4 },
                  { label: '+3 months', weeks: 13 },
                  { label: '+6 months', weeks: 26 },
                ].map((step) => (
                  <button
                    key={step.label}
                    className="btn is-sm"
                    disabled={!canEdit}
                    onClick={() =>
                      setProgram({ numWeeks: Math.min(260, program.numWeeks + step.weeks) })
                    }
                  >
                    {step.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Max weeks in a row</label>
              <input
                className="input is-num"
                style={{ width: 84 }}
                type="number"
                min="1"
                max="8"
                disabled={!canEdit}
                value={program.maxConsecutive}
                onChange={(e) => setProgram({ maxConsecutive: Math.max(1, Math.min(8, +e.target.value || 3)) })}
              />
            </div>
          </div>
          <p className="muted small" style={{ marginTop: 10, marginBottom: 0 }}>
            Travelers can never be scheduled past the consecutive-week limit.{' '}
            {program.numWeeks} weeks is about {Math.round((program.numWeeks / 4.345) * 10) / 10}{' '}
            months, ending {fmtWeekLong(program.startDate, program.numWeeks - 1)}. Adding weeks
            never disturbs what is already planned.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div style={{ flex: 1 }}>
            <h2 className="card-title">Sites</h2>
            <p className="card-sub">Mark a site inactive to keep its roster without scheduling it.</p>
          </div>
        </div>
        <div className="card-body is-flush">
          <div className="tablewrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="is-num">People</th>
                  <th className="is-center">Active</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sites.map((s) => {
                  const count = state.people.filter((p) => p.siteId === s.id).length;
                  return (
                    <tr key={s.id}>
                      <td>
                        <input
                          className="input"
                          disabled={!canEdit}
                          value={s.name}
                          onChange={(e) => updateSite(s.id, { name: e.target.value })}
                        />
                      </td>
                      <td className="is-num">{count}</td>
                      <td className="is-center">
                        <label className="skillbox">
                          <input
                            type="checkbox"
                            disabled={!canEdit}
                            checked={!!s.active}
                            onChange={(e) => updateSite(s.id, { active: e.target.checked })}
                          />
                          <span className="skillbox-face" aria-hidden="true">✓</span>
                        </label>
                      </td>
                      <td>
                        <button
                          className="btn is-danger is-sm"
                          disabled={!canEdit || sites.length <= 1}
                          onClick={() => {
                            if (confirm(`Delete ${s.name}? Its ${count} people will be deleted too.`)) {
                              removeSite(s.id);
                            }
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="row" style={{ padding: 16 }}>
            <div className="field">
              <label>New site name</label>
              <input
                className="input"
                placeholder="ADC5"
                disabled={!canEdit}
                value={newSiteName}
                onChange={(e) => setNewSiteName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newSiteName.trim()) {
                    addSite(newSiteName.trim());
                    setNewSiteName('');
                  }
                }}
              />
            </div>
            <button
              className="btn is-primary"
              disabled={!canEdit || !newSiteName.trim()}
              onClick={() => {
                addSite(newSiteName.trim());
                setNewSiteName('');
              }}
            >
              + Add site
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div style={{ flex: 1 }}>
            <h2 className="card-title">Your data</h2>
            <p className="card-sub">
              The plan lives in the shared cloud board and follows you to any machine you sign in
              from. Your browser keeps a local copy so it loads instantly and stays readable
              offline. Export a backup before anything drastic — a shared board is not a backup.
            </p>
          </div>
        </div>
        <div className="card-body">
          <div className="row">
            <button className="btn is-primary" onClick={() => { exportFile(state); notify('Backup downloaded'); }}>
              Export backup (.json)
            </button>
            <button className="btn" disabled={!canEdit} onClick={() => fileRef.current?.click()}>
              Import backup
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={importFile}
            />
            <button className="btn" onClick={exportSchedule}>Export schedule (.csv)</button>
            <div className="rail-spacer" />
            <button
              className="btn is-danger"
              disabled={!canEdit}
              onClick={() => {
                if (confirm('Reset everything back to the starting roster? Your changes will be lost.')) {
                  resetAll();
                }
              }}
            >
              Reset to starting roster
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
