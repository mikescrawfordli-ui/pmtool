import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, Cell,
} from 'recharts';
import { SKILLS, SKILL_LABELS } from '../lib/constants.js';
import { computeCoverage, reqFor, weekMin, weekMax, weekAvg, findGaps, fmtWeek } from '../lib/schedule.js';
import { capacityCheck } from '../lib/balancer.js';

const AXIS = { fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', fill: '#66748a' };

/** How a week reads for one skill: short / tight / ok / over / untracked. */
function cellState(have, req) {
  if (!req.min && (req.max == null || req.max === '')) return 'off';
  if (req.min && have < req.min) return 'short';
  if (req.max != null && req.max !== '' && have > req.max) return 'over';
  if (req.min && have === req.min) return 'tight';
  return 'ok';
}

export default function Dashboard({ site, people, program, onBalance }) {
  const { numWeeks, startDate, maxConsecutive } = program;
  const weeks = useMemo(() => Array.from({ length: numWeeks }, (_, i) => i), [numWeeks]);

  const { cov } = useMemo(
    () => computeCoverage(people, numWeeks, maxConsecutive),
    [people, numWeeks, maxConsecutive],
  );

  const { gaps } = useMemo(
    () => findGaps(site, people, numWeeks, maxConsecutive),
    [site, people, numWeeks, maxConsecutive],
  );

  const capacity = useMemo(
    () => capacityCheck(people, site, numWeeks, maxConsecutive),
    [people, site, numWeeks, maxConsecutive],
  );

  const tracked = SKILLS.filter((s) => {
    const anyReq = weeks.some((w) => {
      const r = reqFor(site, w, s);
      return r.min > 0 || (r.max != null && r.max !== '');
    });
    const anyPeople = people.some((p) => p.skills && p.skills[s]);
    return anyReq || anyPeople;
  });

  const [focusSkillRaw, setFocusSkill] = useState(tracked[0] || SKILLS[0]);
  const [focusWeekRaw, setFocusWeek] = useState(0);

  // Skills stop being tracked and the window shrinks; keep the selectors valid
  // rather than rendering an empty chart.
  const focusSkill = tracked.includes(focusSkillRaw) ? focusSkillRaw : tracked[0] || SKILLS[0];
  const focusWeek = Math.min(focusWeekRaw, numWeeks - 1);

  const shortages = gaps.filter((g) => g.type === 'short');
  const surpluses = gaps.filter((g) => g.type === 'over');
  const cleanWeeks = weeks.filter((w) => !gaps.some((g) => g.week === w)).length;

  const headcounts = weeks.map((w) => weekAvg(cov, w, '_total'));
  const minHead = Math.min(...headcounts, 0);
  const maxHead = Math.max(...headcounts, 0);

  // --- chart data ---------------------------------------------------------
  const trendData = weeks.map((w) => ({
    week: `W${w + 1}`,
    worst: weekMin(cov, w, focusSkill),
    best: weekMax(cov, w, focusSkill),
    target: reqFor(site, w, focusSkill).min,
  }));

  const crewData = weeks.map((w) => ({
    week: `W${w + 1}`,
    crew: Math.round(weekAvg(cov, w, '_total') * 10) / 10,
    lift: Math.round(weekAvg(cov, w, '_lift') * 10) / 10,
  }));

  const mixData = tracked.map((s) => {
    const have = weekMin(cov, focusWeek, s);
    const need = reqFor(site, focusWeek, s).min;
    return { skill: s, have, need, delta: have - need };
  });

  const problemSkills = capacity.filter((c) => c.status !== 'ok');

  if (people.length === 0) {
    return (
      <div className="card">
        <div className="empty">
          <h3>Nothing to show yet</h3>
          <p>Add people to {site.name} on the Roster tab and the dashboard will fill in.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      {/* ---- Status band ---- */}
      <div className="card">
        <div className="stats">
          <div className="stat">
            <div className="stat-label">Understaffed days</div>
            <div className={`stat-value ${shortages.length ? 'is-alarm' : 'is-ok'}`}>
              {shortages.length}
            </div>
            <div className="stat-foot">skill-weeks below target</div>
          </div>
          <div className="stat">
            <div className="stat-label">Overstaffed</div>
            <div className={`stat-value ${surpluses.length ? '' : 'is-ok'}`}>{surpluses.length}</div>
            <div className="stat-foot">skill-weeks above cap</div>
          </div>
          <div className="stat">
            <div className="stat-label">Clean weeks</div>
            <div className="stat-value">{cleanWeeks}<span style={{ fontSize: 15, color: 'var(--muted)' }}>/{numWeeks}</span></div>
            <div className="stat-foot">no problems at all</div>
          </div>
          <div className="stat">
            <div className="stat-label">Crew size</div>
            <div className="stat-value">{minHead === maxHead ? minHead.toFixed(0) : `${minHead.toFixed(0)}–${maxHead.toFixed(0)}`}</div>
            <div className="stat-foot">people on site per day</div>
          </div>
          <div className="stat">
            <div className="stat-label">Roster</div>
            <div className="stat-value">{people.length}</div>
            <div className="stat-foot">
              {people.filter((p) => p.employment === 'Local').length} local ·{' '}
              {people.filter((p) => p.employment === 'Traveler').length} traveler
            </div>
          </div>
        </div>
      </div>

      {/* ---- What is blocking coverage ---- */}
      {problemSkills.length > 0 && (
        <div>
          {problemSkills.map((c) => (
            <div key={c.skill} className={`callout ${c.status === 'impossible' ? 'is-alarm' : 'is-amber'}`}>
              <p className="callout-title">
                {c.skill} — {c.status === 'impossible' ? 'not enough people' : 'target cannot be held every day'}
              </p>
              <p>{c.advice}</p>
            </div>
          ))}
        </div>
      )}

      {shortages.length > 0 && problemSkills.length === 0 && (
        <div className="callout is-amber">
          <p className="callout-title">Coverage gaps that rebalancing can fix</p>
          <p>
            The roster has the people; they are just arranged badly.{' '}
            <button className="btn is-sm is-primary" onClick={onBalance}>Auto-balance</button>
          </p>
        </div>
      )}

      {gaps.length === 0 && (
        <div className="callout is-ok">
          <p className="callout-title">Fully covered</p>
          <p>Every skill target is met on every day of all {numWeeks} weeks, with no overstaffing.</p>
        </div>
      )}

      {/* ---- Coverage strip: the signature view ---- */}
      <div className="card">
        <div className="card-head">
          <div style={{ flex: 1 }}>
            <h2 className="card-title">Coverage strip</h2>
            <p className="card-sub">
              Worst day of each week, per skill. Hatched red is below target; amber is above the cap.
            </p>
          </div>
          <div className="legend">
            <span className="legend-key"><span className="legend-swatch" style={{ background: 'var(--alarm)' }} /> Short</span>
            <span className="legend-key"><span className="legend-swatch" style={{ background: '#eaf3ec' }} /> Exactly at target</span>
            <span className="legend-key"><span className="legend-swatch" style={{ background: 'var(--ok-soft)' }} /> Above target</span>
            <span className="legend-key"><span className="legend-swatch" style={{ background: 'var(--amber-soft)' }} /> Over cap</span>
          </div>
        </div>
        <div className="card-body">
          <div className="tablewrap">
            <div className="strip" style={{ minWidth: 120 + numWeeks * 46 }}>
              <div
                className="strip-row"
                style={{ gridTemplateColumns: `120px repeat(${numWeeks}, minmax(40px, 1fr))` }}
              >
                <div />
                {weeks.map((w) => (
                  <div key={w} className="strip-head">
                    {w + 1}
                    <span>{fmtWeek(startDate, w)}</span>
                  </div>
                ))}
              </div>

              {tracked.map((s) => (
                <div
                  key={s}
                  className="strip-row"
                  style={{ gridTemplateColumns: `120px repeat(${numWeeks}, minmax(40px, 1fr))` }}
                >
                  <div className="strip-label">{s}</div>
                  {weeks.map((w) => {
                    const have = weekMin(cov, w, s);
                    const req = reqFor(site, w, s);
                    const state = cellState(have, req);
                    return (
                      <div
                        key={w}
                        className={`strip-cell is-${state}`}
                        title={`${SKILL_LABELS[s]} · week ${w + 1}: ${have} on the worst day, target ${req.min}${
                          req.max != null && req.max !== '' ? `, cap ${req.max}` : ''
                        }`}
                      >
                        {have}
                      </div>
                    );
                  })}
                </div>
              ))}

              <div
                className="strip-row"
                style={{ gridTemplateColumns: `120px repeat(${numWeeks}, minmax(40px, 1fr))`, marginTop: 6 }}
              >
                <div className="strip-label" style={{ color: 'var(--muted)' }}>Lift cert</div>
                {weeks.map((w) => (
                  <div key={w} className="strip-cell is-off" title={`Lift-certified on site, week ${w + 1}`}>
                    {weekMin(cov, w, '_lift')}
                  </div>
                ))}
              </div>
              <div
                className="strip-row"
                style={{ gridTemplateColumns: `120px repeat(${numWeeks}, minmax(40px, 1fr))` }}
              >
                <div className="strip-label" style={{ color: 'var(--muted)' }}>Crew</div>
                {weeks.map((w) => (
                  <div key={w} className="strip-cell is-off" title={`Total on site, week ${w + 1}`}>
                    {weekMin(cov, w, '_total')}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ---- Charts ---- */}
      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <div style={{ flex: 1 }}>
              <h2 className="card-title">Coverage against target</h2>
              <p className="card-sub">Worst and best day of each week</p>
            </div>
            <select
              className="select"
              value={focusSkill}
              onChange={(e) => setFocusSkill(e.target.value)}
            >
              {tracked.map((s) => (
                <option key={s} value={s}>{s} — {SKILL_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trendData} margin={{ top: 6, right: 10, left: -22, bottom: 0 }}>
                <CartesianGrid stroke="#e3e8ed" vertical={false} />
                <XAxis dataKey="week" tick={AXIS} tickLine={false} axisLine={{ stroke: '#c7d0da' }} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontFamily: 'Inter, sans-serif', fontSize: 12, borderRadius: 3, border: '1px solid #c7d0da' }}
                />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Inter, sans-serif' }} />
                <Line type="stepAfter" dataKey="target" name="Target" stroke="#c8102e" strokeWidth={2} strokeDasharray="5 4" dot={false} />
                <Line type="monotone" dataKey="worst" name="Worst day" stroke="#0057b8" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="best" name="Best day" stroke="#7fa9dc" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div style={{ flex: 1 }}>
              <h2 className="card-title">Skill balance</h2>
              <p className="card-sub">Surplus and shortfall against target</p>
            </div>
            <select
              className="select"
              value={focusWeek}
              onChange={(e) => setFocusWeek(+e.target.value)}
            >
              {weeks.map((w) => (
                <option key={w} value={w}>Week {w + 1} — {fmtWeek(startDate, w)}</option>
              ))}
            </select>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={mixData} margin={{ top: 6, right: 10, left: -22, bottom: 0 }}>
                <CartesianGrid stroke="#e3e8ed" vertical={false} />
                <XAxis dataKey="skill" tick={AXIS} tickLine={false} axisLine={{ stroke: '#c7d0da' }} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontFamily: 'Inter, sans-serif', fontSize: 12, borderRadius: 3, border: '1px solid #c7d0da' }}
                  formatter={(v, n) => [v, n === 'delta' ? 'Over / under target' : n]}
                />
                <Bar dataKey="delta" name="Over / under target" radius={[2, 2, 0, 0]}>
                  {mixData.map((d, i) => (
                    <Cell key={i} fill={d.delta < 0 ? '#c8102e' : d.delta === 0 ? '#93a3b5' : '#0b7a5a'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="muted small" style={{ marginBottom: 0 }}>
              Bars below zero are skills you are short on in week {focusWeek + 1}. Tall green bars are
              people you could lend to another site.
            </p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Crew size by week</h2>
          <p className="card-sub" style={{ flex: 1 }}>Average people on site per day, and how many are lift certified</p>
        </div>
        <div className="card-body">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={crewData} margin={{ top: 6, right: 10, left: -22, bottom: 0 }}>
              <CartesianGrid stroke="#e3e8ed" vertical={false} />
              <XAxis dataKey="week" tick={AXIS} tickLine={false} axisLine={{ stroke: '#c7d0da' }} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ fontFamily: 'Inter, sans-serif', fontSize: 12, borderRadius: 3, border: '1px solid #c7d0da' }} />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Inter, sans-serif' }} />
              <Bar dataKey="crew" name="On site" fill="#0057b8" radius={[2, 2, 0, 0]} />
              <Bar dataKey="lift" name="Lift certified" fill="#7fa9dc" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ---- Gap list ---- */}
      {gaps.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2 className="card-title">Every problem, week by week</h2>
          </div>
          <div className="card-body is-flush">
            <div className="tablewrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Week</th>
                    <th>Skill</th>
                    <th>Issue</th>
                    <th className="is-num">Have</th>
                    <th className="is-num">Target</th>
                    <th>Days affected</th>
                  </tr>
                </thead>
                <tbody>
                  {gaps.map((g, i) => (
                    <tr key={i}>
                      <td className="num">
                        {g.week + 1} <span className="muted">· {fmtWeek(startDate, g.week)}</span>
                      </td>
                      <td><strong>{g.skill}</strong></td>
                      <td>
                        <span className={`chip ${g.type === 'short' ? 'is-alarm' : 'is-amber'}`}>
                          {g.type === 'short' ? `Short ${g.need - g.have}` : `Over ${g.have - g.need}`}
                        </span>
                      </td>
                      <td className="is-num">{g.have}</td>
                      <td className="is-num">{g.need}</td>
                      <td className="muted small">{g.days.length ? g.days.join(', ') : 'All week'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ---- Bench depth ---- */}
      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Bench depth</h2>
          <p className="card-sub" style={{ flex: 1 }}>
            Guaranteed floor is the worst-day count once travelers' home weeks and locals' days off are
            accounted for.
          </p>
        </div>
        <div className="card-body is-flush">
          <div className="tablewrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Skill</th>
                  <th className="is-num">On roster</th>
                  <th className="is-num">Local</th>
                  <th className="is-num">Traveler</th>
                  <th className="is-num">Guaranteed floor</th>
                  <th className="is-num">Peak target</th>
                  <th>Verdict</th>
                </tr>
              </thead>
              <tbody>
                {capacity.map((c) => (
                  <tr key={c.skill}>
                    <td><strong>{c.skill}</strong> <span className="muted small">{SKILL_LABELS[c.skill]}</span></td>
                    <td className="is-num">{c.headcount}</td>
                    <td className="is-num">{c.locals}</td>
                    <td className="is-num">{c.travelers}</td>
                    <td className="is-num">{c.floor}</td>
                    <td className="is-num">{c.peakNeed || '—'}</td>
                    <td>
                      {c.peakNeed === 0 ? (
                        <span className="chip is-mute">Not tracked</span>
                      ) : c.status === 'ok' ? (
                        <span className="chip is-ok">Holds</span>
                      ) : c.status === 'tight' ? (
                        <span className="chip is-amber">Short on worst day</span>
                      ) : (
                        <span className="chip is-alarm">Not enough people</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
