import React from 'react';
import { ON, TIME_OFF, OFF_PROGRAM, FORCED_HOME, DAYS } from '../lib/constants.js';
import { buildSchedule, fmtWeek, timeOffEntry, offDaysFor, isFullWeekOff, overworkedRuns } from '../lib/schedule.js';

/**
 * Clicking a week cycles it: on -> PTO -> home week -> on.
 *
 * The two middle states are not the same thing. PTO takes the person off site
 * but leaves the rotation exactly where it was, so their home weeks do not
 * move. A pinned home week restarts the run, which shifts everything after it
 * — that is the point of it, and it is how you short-cycle someone.
 */
function cycleWeek(person, w) {
  const list = person.timeOff || [];
  // Day bookings are not week states and must survive a click on their week.
  const hit = list.find((t) => w >= t.start && w <= t.end && isFullWeekOff(t));

  if (!hit) return [...list, { start: w, end: w, type: 'Vacation', kind: 'pto' }];

  const rest = list.filter((t) => t !== hit);
  // Carve week w out of whatever range covers it, keeping the rest intact.
  const remainder = [];
  if (hit.start < w) remainder.push({ ...hit, end: w - 1 });
  if (hit.end > w) remainder.push({ ...hit, start: w + 1 });

  if (entryKind(hit) === 'pto') {
    return [...rest, ...remainder, { ...hit, start: w, end: w, type: 'Home week', kind: 'home' }];
  }
  return [...rest, ...remainder]; // was a home week: clear it
}

export default function Schedule({ site, people, program, update, onBalance, balanceInfo }) {
  const { numWeeks, startDate, maxConsecutive } = program;
  const weeks = Array.from({ length: numWeeks }, (_, i) => i);

  const rows = people.map((p) => {
    const { pattern, stintOf } = buildSchedule(p, numWeeks, maxConsecutive);
    return { person: p, pattern, stintOf };
  });

  const overworked = overworkedRuns(people, numWeeks, maxConsecutive);
  const overworkedIds = new Set(overworked.map((o) => o.personId));

  const weekTotals = weeks.map((w) => rows.filter((r) => r.pattern[w] === ON).length);

  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <div style={{ flex: 1 }}>
            <h2 className="card-title">{site.name} rotation</h2>
            <p className="card-sub">
              Click any week to pin it as a home week. Click it again to release it.
            </p>
          </div>
          <button className="btn is-primary" onClick={onBalance}>Auto-balance</button>
        </div>

        {balanceInfo && (
          <div style={{ padding: '0 16px', marginTop: 12 }}>
            <div className={`callout ${balanceInfo.gaps === 0 ? 'is-ok' : 'is-amber'}`}>
              <p className="callout-title">
                {balanceInfo.gaps === 0 ? 'Schedule balanced' : 'Balanced as far as the roster allows'}
              </p>
              <p>
                Adjusted {balanceInfo.changed} {balanceInfo.changed === 1 ? 'person' : 'people'}.{' '}
                {balanceInfo.gaps === 0
                  ? 'Every skill target is met on every day.'
                  : `${balanceInfo.gaps} coverage ${balanceInfo.gaps === 1 ? 'problem remains' : 'problems remain'} — see the Dashboard for what is blocking them.`}
              </p>
            </div>
          </div>
        )}

        <div className="card-body">
          <div className="legend" style={{ marginBottom: 12 }}>
            <span className="legend-key"><span className="legend-swatch" style={{ background: 'var(--ok-soft)', borderColor: '#b6dfd0' }} /> On site</span>
            <span className="legend-key"><span className="legend-swatch" style={{ background: 'var(--surface-2)' }} /> Home week (rotation)</span>
            <span className="legend-key"><span className="legend-swatch" style={{ background: 'var(--amber-soft)', borderColor: '#e8cfa4' }} /> Time off (pinned)</span>
            <span className="legend-key">−Fri = day off or travel day, so 4 days on site</span>
          </div>

          <div className="tablewrap">
            <table className="data">
              <thead>
                <tr>
                  <th className="sticky-col">Name</th>
                  <th>Type</th>
                  {weeks.map((w) => (
                    <th key={w} className="is-center" style={{ minWidth: 46 }}>
                      <div className="num" style={{ fontSize: 12 }}>{w + 1}</div>
                      <div className="num" style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 400 }}>
                        {fmtWeek(startDate, w)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ person, pattern, stintOf }) => (
                  <tr key={person.id}>
                    <td className="sticky-col" style={{ whiteSpace: 'nowrap' }}>
                      {person.name || <span className="muted">Unnamed</span>}
                      {overworkedIds.has(person.id) && (
                        <span className="chip is-alarm" style={{ marginLeft: 6 }}>Over {maxConsecutive}</span>
                      )}
                    </td>
                    <td>
                      <span className={`chip ${person.employment === 'Local' ? 'is-local' : 'is-traveler'}`}>
                        {person.employment === 'Local'
                          ? 'Local'
                          : person.employment === 'Visitor'
                          ? 'Visit'
                          : person.longTravel ? '✈ Trav' : 'Trav'}
                      </span>
                    </td>
                    {weeks.map((w) => {
                      const st = pattern[w];
                      const entry = st === TIME_OFF ? timeOffEntry(person, w) : null;
                      // Rotation/travel day and any booked PTO days, together.
                      const offList = st === ON ? offDaysFor(person, w, stintOf) : [];
                      const away = st === OFF_PROGRAM;
                      const forced = st === FORCED_HOME;
                      const cls = away
                        ? 'is-away'
                        : st === ON ? 'is-on'
                        : st === TIME_OFF ? 'is-time'
                        : forced ? 'is-forced' : 'is-rot';
                      const label = away
                        ? '·'
                        : st === ON ? 'ON' : st === TIME_OFF ? 'PTO' : 'HOME';
                      return (
                        <td key={w} style={{ padding: '2px 2px' }}>
                          <button
                            className={`wk ${cls}`}
                            disabled={away}
                            title={
                              away
                                ? 'Not on the program this week'
                                : forced
                                ? 'Pinned home week — the rotation restarts here. Click to clear.'
                                : st === TIME_OFF
                                ? `${entry?.type || 'Time off'} — leave, rotation unaffected. Click to pin a home week instead.`
                                : st === ON
                                  ? `On site ${DAYS.length - offList.length} of ${DAYS.length} days${
                                      offList.length
                                        ? `, away ${offList.map((d) => DAYS[d]).join(', ')}`
                                        : ''
                                    } — click to pin a home week`
                                  : 'Rotation home week — click to pin as time off'
                            }
                            onClick={() => update(person.id, { timeOff: cycleWeek(person, w) })}
                          >
                            <span>{label}</span>
                            {offList.length > 0 && (
                              <span className="wk-sub">
                                −{offList.map((d) => DAYS[d]).join(',')}
                              </span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="sticky-col plate" style={{ fontSize: 12 }}>On site</td>
                  <td />
                  {weekTotals.map((t, w) => (
                    <td key={w} className="is-num is-center" style={{ fontWeight: 600 }}>{t}</td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {overworked.length > 0 && (
        <div className="callout is-alarm">
          <p className="callout-title">Consecutive week limit exceeded</p>
          <p>
            {overworked.map((o) => `${o.name} (${o.length} weeks from wk ${o.start + 1})`).join(', ')}. Raise
            the limit on the Setup tab or pin a home week for them.
          </p>
        </div>
      )}
    </div>
  );
}
