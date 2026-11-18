'use client';
import type { ReactNode } from 'react';
import { Ambulance, Clock3, Hospital as HospitalIcon, Stethoscope, Truck, type LucideIcon } from 'lucide-react';
import type { Run } from '@/lib/simulation';
import { CARE_LABELS, arrivalIntervals, incomingAmbulances, simulationClock, type IncomingAmbulance } from '@/lib/incoming';

const INTERVAL_MINUTES = 15;
const BAR_MAX_PX = 120;

function Metric({ label, value, sub, icon: Icon }: { label: string; value: ReactNode; sub: string; icon: LucideIcon }) {
  return <article className="metric"><div className="metric-label">{label}<Icon size={17}/></div><strong>{value}</strong><span>{sub}</span></article>;
}

/** Network overview: every hospital's inbound count and all arrivals. Rows open the hospital's own page. */
export function NetworkIncoming({ run, onSelectHospital }: { run: Run; onSelectHospital: (id: string) => void }) {
  const everyone = incomingAmbulances(run);
  const next = everyone[0];
  const specialist = everyone.filter(r => r.careLevel === 'specialist').length;
  const receiving = run.hospitals.filter(h => everyone.some(r => r.hospitalId === h.id)).length;
  return <>
    <div className="metrics-grid compact">
      <Metric label="Incoming ambulances" value={everyone.length} sub="Confirmed destinations, en route" icon={Ambulance}/>
      <Metric label="Next arrival" value={next ? <>{next.etaMinutes}<small> min</small></> : '—'} sub={next ? `${next.ambulanceId} · ${simulationClock(next.etaMinute)} at ${next.hospitalName}` : 'No ambulances en route'} icon={Clock3}/>
      <Metric label="Specialist care incoming" value={specialist} sub="Patients needing specialist capability" icon={Stethoscope}/>
      <Metric label="Hospitals receiving" value={<>{receiving}<small> / {run.hospitals.length}</small></>} sub="Sites with at least one inbound ambulance" icon={HospitalIcon}/>
    </div>
    <section className="panel">
      <div className="panel-heading"><div><h2>By hospital</h2><p>Select a hospital to open its own page</p></div><Badge tone="neutral">Simulated arrivals</Badge></div>
      <div className="table-scroll"><table>
        <thead><tr><th>HOSPITAL</th><th>INCOMING</th><th>NEXT ARRIVAL</th><th>NEXT ETA</th></tr></thead>
        <tbody>{run.hospitals.map(h => {
          const hRows = everyone.filter(r => r.hospitalId === h.id);
          const first = hRows[0];
          return <tr key={h.id}>
            <td><button className="text-button" onClick={() => onSelectHospital(h.id)}><strong>{h.name}</strong></button><small>{h.address}</small></td>
            <td><strong>{hRows.length}</strong> <small>ambulances</small></td>
            <td>{first ? simulationClock(first.etaMinute) : '—'}</td>
            <td>{first ? <Badge tone={first.etaMinutes <= 10 ? 'amber' : 'green'}>{first.etaMinutes} min</Badge> : <span className="subtle">None inbound</span>}</td>
          </tr>;
        })}</tbody>
      </table></div>
    </section>
    <UnitList rows={everyone} title="All incoming ambulances" empty="No ambulance is currently en route to a hospital." showDestination/>
  </>;
}

/** A single hospital's page: summary, interval timeline and its incoming units. */
export function HospitalIncoming({ run, hospitalId }: { run: Run; hospitalId: string }) {
  const hospital = run.hospitals.find(h => h.id === hospitalId);
  if (!hospital) return <section className="panel"><div className="empty"><HospitalIcon size={28}/><h3>Hospital not found</h3><p>This hospital is not part of the current simulation.</p></div></section>;
  const rows = incomingAmbulances(run, hospital.id);
  const next = rows[0];
  const specialist = rows.filter(r => r.careLevel === 'specialist').length;
  // Show at least one hour of windows so the timeline reads over time, even when arrivals are close together.
  const computed = arrivalIntervals(rows, INTERVAL_MINUTES);
  const windows = Math.max(4, computed.length);
  const intervals = Array.from({ length: windows }, (_, i) => computed[i] ?? { start: i * INTERVAL_MINUTES, end: (i + 1) * INTERVAL_MINUTES, ambulances: [] });
  const busiest = intervals.reduce((best, b) => (b.ambulances.length > best.ambulances.length ? b : best), intervals[0]);
  return <>
    <section className="panel" style={{ marginBottom: 20 }}>
      <div className="panel-heading"><div><h2>{hospital.name}</h2><p>{hospital.address}</p></div><Badge tone="neutral">Simulated arrivals</Badge></div>
    </section>
    <div className="metrics-grid compact">
      <Metric label="Incoming ambulances" value={rows.length} sub={`En route to ${hospital.name}`} icon={Ambulance}/>
      <Metric label="Next arrival" value={next ? <>{next.etaMinutes}<small> min</small></> : '—'} sub={next ? `${next.ambulanceId} · ${simulationClock(next.etaMinute)}` : 'Nothing inbound'} icon={Clock3}/>
      <Metric label="Specialist care incoming" value={specialist} sub="Patients needing specialist capability" icon={Stethoscope}/>
      <Metric label="Busiest window" value={rows.length ? busiest.ambulances.length : '—'} sub={rows.length ? `${busiest.start}–${busiest.end} min from now (${simulationClock(run.time + busiest.start)}–${simulationClock(run.time + busiest.end)})` : 'No arrivals to plan for'} icon={HospitalIcon}/>
    </div>

    <section className="panel">
      <div className="panel-heading">
        <div><h2>Arrival timeline</h2><p>Incoming ambulances per {INTERVAL_MINUTES}-minute window, starting now ({simulationClock(run.time)})</p></div>
      </div>
      {rows.length === 0
        ? <div className="empty"><Truck size={28}/><h3>Nothing inbound</h3><p>No ambulance is currently en route to {hospital.name}.</p></div>
        : <div className="table-scroll" style={{ padding: '0 22px 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${intervals.length}, minmax(130px, 1fr))`, gap: 10, minWidth: intervals.length * 140, alignItems: 'start' }}>
            {intervals.map(b => {
              const n = b.ambulances.length;
              return <div key={b.start} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: '#78896e' }}><strong style={{ color: 'var(--ink)' }}>{b.start}–{b.end} min</strong><div>{simulationClock(run.time + b.start)}–{simulationClock(run.time + b.end)}</div></div>
                <div style={{ height: BAR_MAX_PX + 8, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: '#f6f8f3', borderRadius: 8, padding: '4px 0' }}>
                  <div title={`${n} ambulance${n === 1 ? '' : 's'} arriving ${b.start}–${b.end} min`} style={{ width: '60%', maxWidth: 80, height: n ? Math.max(8, (n / Math.max(1, busiest.ambulances.length)) * BAR_MAX_PX) : 2, background: n ? '#235d48' : '#dfe6da', borderRadius: 5, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', color: '#f2f4dc', fontWeight: 600, fontSize: 13, paddingTop: 4 }}>{n || ''}</div>
                </div>
                <div style={{ display: 'grid', gap: 5, minHeight: 40 }}>
                  {n === 0
                    ? <span className="subtle" style={{ fontSize: 11 }}>None</span>
                    : b.ambulances.map(r => <div key={r.ambulanceId} className="badge neutral" style={{ justifyContent: 'space-between', display: 'flex', gap: 6, borderLeft: `3px solid ${r.careLevel === 'specialist' ? '#b48a40' : '#235d48'}` }}>
                      <strong>{r.ambulanceId}</strong><span>{r.etaMinutes} min · {simulationClock(r.etaMinute)}</span>
                    </div>)}
                </div>
              </div>;
            })}
          </div>
        </div>}
    </section>

    <UnitList rows={rows} title={`Incoming to ${hospital.name}`} empty={`No ambulance is currently en route to ${hospital.name}.`}/>
  </>;
}

function UnitList({ rows, title, empty, showDestination = false }: { rows: IncomingAmbulance[]; title: string; empty: string; showDestination?: boolean }) {
  return <section className="panel" style={{ marginTop: 20 }}>
    <div className="panel-heading"><div><h2>{title}</h2><p>{rows.length} shown · soonest first</p></div></div>
    {rows.length === 0
      ? <div className="empty"><Truck size={28}/><h3>No incoming ambulances</h3><p>{empty}</p></div>
      : <div className="table-scroll"><table>
        <thead><tr><th>UNIT</th>{showDestination && <th>DESTINATION</th>}<th>ETA</th><th>EXPECTED ARRIVAL</th><th>PATIENT (SIMULATED)</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.ambulanceId}>
          <td><strong>{r.ambulanceId}</strong><small>{r.incidentId}</small></td>
          {showDestination && <td>{r.hospitalName}</td>}
          <td><Badge tone={r.etaMinutes <= 10 ? 'amber' : 'green'}>{r.etaMinutes} min</Badge></td>
          <td>{simulationClock(r.etaMinute)}</td>
          <td><Badge tone={r.careLevel === 'specialist' ? 'amber' : 'neutral'}>{CARE_LABELS[r.careLevel]}</Badge>{r.pickedUpAt !== undefined && <small>Picked up {simulationClock(r.pickedUpAt)}</small>}</td>
        </tr>)}</tbody>
      </table></div>}
    <p className="form-note" style={{ padding: '0 22px 20px' }}>Arrival times are simulated estimates. Patient details are synthetic: only care level and pickup time are modelled.</p>
  </section>;
}

function Badge({ children, tone = 'green' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
