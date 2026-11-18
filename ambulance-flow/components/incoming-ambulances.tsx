'use client';
import { useState, type ReactNode } from 'react';
import { Ambulance, Clock3, Hospital as HospitalIcon, Stethoscope, Truck, type LucideIcon } from 'lucide-react';
import type { Run } from '@/lib/simulation';
import { CARE_LABELS, arrivalIntervals, incomingAmbulances, simulationClock } from '@/lib/incoming';

const INTERVAL_MINUTES = 15;

function Metric({ label, value, sub, icon: Icon }: { label: string; value: ReactNode; sub: string; icon: LucideIcon }) {
  return <article className="metric"><div className="metric-label">{label}<Icon size={17}/></div><strong>{value}</strong><span>{sub}</span></article>;
}

export default function IncomingAmbulances({ run }: { run: Run }) {
  const [hospitalId, setHospitalId] = useState('all');
  const everyone = incomingAmbulances(run);
  const rows = incomingAmbulances(run, hospitalId === 'all' ? undefined : hospitalId);
  const selectedHospital = run.hospitals.find(h => h.id === hospitalId);
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
      <div className="panel-heading"><div><h2>By hospital</h2><p>Select a hospital to see its arrival timeline</p></div><Badge tone="neutral">Simulated arrivals</Badge></div>
      <div className="table-scroll"><table>
        <thead><tr><th>HOSPITAL</th><th>INCOMING</th><th>NEXT ARRIVAL</th><th>NEXT ETA</th></tr></thead>
        <tbody>{run.hospitals.map(h => {
          const hRows = everyone.filter(r => r.hospitalId === h.id);
          const first = hRows[0];
          const selected = hospitalId === h.id;
          return <tr key={h.id} className={selected ? 'recommended' : undefined}>
            <td><button className="text-button" aria-pressed={selected} onClick={() => setHospitalId(selected ? 'all' : h.id)}><strong>{h.name}</strong></button><small>{h.address}</small></td>
            <td><strong>{hRows.length}</strong> <small>ambulances</small></td>
            <td>{first ? simulationClock(first.etaMinute) : '—'}</td>
            <td>{first ? <Badge tone={first.etaMinutes <= 10 ? 'amber' : 'green'}>{first.etaMinutes} min</Badge> : <span className="subtle">None inbound</span>}</td>
          </tr>;
        })}</tbody>
      </table></div>
    </section>

    {selectedHospital && <ArrivalTimeline run={run} hospitalName={selectedHospital.name} rows={rows} onClose={() => setHospitalId('all')}/>}

    <section className="panel" style={{ marginTop: 20 }}>
      <div className="panel-heading">
        <div><h2>Incoming ambulances</h2><p>{rows.length} shown · soonest first</p></div>
        <select aria-label="Filter incoming ambulances by hospital" value={hospitalId} onChange={e => setHospitalId(e.target.value)}>
          <option value="all">All hospitals</option>
          {run.hospitals.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
      </div>
      {rows.length === 0
        ? <div className="empty"><Truck size={28}/><h3>No incoming ambulances</h3><p>{hospitalId === 'all' ? 'No ambulance is currently en route to a hospital.' : 'No ambulance is currently en route to this hospital.'}</p></div>
        : <div className="table-scroll"><table>
          <thead><tr><th>UNIT</th><th>DESTINATION</th><th>ETA</th><th>EXPECTED ARRIVAL</th><th>PATIENT (SIMULATED)</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.ambulanceId}>
            <td><strong>{r.ambulanceId}</strong><small>{r.incidentId}</small></td>
            <td>{r.hospitalName}</td>
            <td><Badge tone={r.etaMinutes <= 10 ? 'amber' : 'green'}>{r.etaMinutes} min</Badge></td>
            <td>{simulationClock(r.etaMinute)}</td>
            <td><Badge tone={r.careLevel === 'specialist' ? 'amber' : 'neutral'}>{CARE_LABELS[r.careLevel]}</Badge>{r.pickedUpAt !== undefined && <small>Picked up {simulationClock(r.pickedUpAt)}</small>}</td>
          </tr>)}</tbody>
        </table></div>}
      <p className="form-note" style={{ padding: '0 22px 20px' }}>Arrival times are simulated estimates. Patient details are synthetic: only care level and pickup time are modelled.</p>
    </section>
  </>;
}

function ArrivalTimeline({ run, hospitalName, rows, onClose }: { run: Run; hospitalName: string; rows: ReturnType<typeof incomingAmbulances>; onClose: () => void }) {
  const intervals = arrivalIntervals(rows, INTERVAL_MINUTES);
  const peak = Math.max(1, ...intervals.map(i => i.ambulances.length));
  return <section className="panel" style={{ marginTop: 20 }}>
    <div className="panel-heading">
      <div><h2>Arrival timeline · {hospitalName}</h2><p>{rows.length} incoming · counted in {INTERVAL_MINUTES}-minute intervals from {simulationClock(run.time)}</p></div>
      <button className="text-button" onClick={onClose}>Show all hospitals</button>
    </div>
    {rows.length === 0
      ? <div className="empty"><Truck size={28}/><h3>Nothing inbound</h3><p>No ambulance is currently en route to {hospitalName}.</p></div>
      : <div className="table-scroll" style={{ padding: '0 22px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${intervals.length}, minmax(120px, 1fr))`, gap: 10, minWidth: intervals.length * 130 }}>
          {intervals.map(b => <div key={b.start} className="metric" style={{ padding: 14 }}>
            <div className="metric-label">{b.start}–{b.end} min<small>{simulationClock(run.time + b.start)}–{simulationClock(run.time + b.end)}</small></div>
            <strong>{b.ambulances.length}</strong>
            <div style={{ height: 6, background: '#edf0e8', borderRadius: 3, margin: '8px 0 10px' }}>
              <div style={{ height: '100%', width: `${(b.ambulances.length / peak) * 100}%`, background: b.ambulances.length ? '#235d48' : 'transparent', borderRadius: 3 }}/>
            </div>
            {b.ambulances.length === 0
              ? <span className="subtle">None</span>
              : b.ambulances.map(r => <div key={r.ambulanceId} style={{ display: 'flex', justifyContent: 'space-between', gap: 6, padding: '4px 0', borderTop: '1px solid #edf0e8' }}>
                <span><strong>{r.ambulanceId}</strong></span>
                <span className={r.careLevel === 'specialist' ? 'text-warm' : undefined}>{r.etaMinutes} min · {simulationClock(r.etaMinute)}</span>
              </div>)}
          </div>)}
        </div>
      </div>}
  </section>;
}

function Badge({ children, tone = 'green' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
