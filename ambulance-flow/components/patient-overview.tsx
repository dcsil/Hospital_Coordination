'use client';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Clock3, MapPin, Navigation, RotateCcw } from 'lucide-react';
import NetworkMap from './network-map';
import { journeyNetwork, journeySchema, LOCATIONS, resolveLocation, type Journey } from '@/lib/patient-journey';

const KEY = 'kinetic-patient-journey-v1';
export default function PatientOverview() {
  const [location, setLocation] = useState('');
  const [urgency, setUrgency] = useState<Journey['urgency'] | ''>('');
  const [journey, setJourney] = useState<Journey | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(0);
  useEffect(() => {
    try { const raw = localStorage.getItem(KEY); if (raw) { const saved = journeySchema.parse(JSON.parse(raw)); const options = journeyNetwork(saved.origin, saved.urgency).ranked; if (!options.some(c => c.hospitalId === saved.selected) || (saved.status !== 'choosing' && saved.startedAt === null)) throw new Error(); setJourney(saved); setLocation(saved.location); setUrgency(saved.urgency); } } catch { localStorage.removeItem(KEY); }
    setNow(Date.now()); setReady(true);
  }, []);
  useEffect(() => { if (!ready) return; try { if (journey) localStorage.setItem(KEY, JSON.stringify(journey)); else localStorage.removeItem(KEY); } catch { setError('Browser storage is unavailable. Keep this tab open to retain your journey.'); } }, [journey, ready]);
  useEffect(() => { if (journey?.status !== 'en_route') return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [journey?.status]);
  const network = useMemo(() => journey ? journeyNetwork(journey.origin, journey.urgency) : null, [journey?.origin, journey?.urgency]);
  const selected = network?.ranked.find(c => c.hospitalId === journey?.selected);
  const hospital = network?.run.hospitals.find(h => h.id === selected?.hospitalId);
  const elapsed = journey?.startedAt ? Math.max(0, (now - journey.startedAt) / 1000) : 0;
  const progress = journey?.status === 'arrived' ? 1 : journey?.status === 'en_route' && selected ? Math.min(1, elapsed / selected.travel) : 0;
  const mapRun = network && journey ? { ...network.run, ambulances: network.run.ambulances.filter(a => a.id === 'YOUR-AMBULANCE').map(a => ({ ...a, status: journey.status === 'choosing' ? 'AWAITING_DECISION' as const : 'EN_ROUTE' as const, destination: selected?.hospitalId, lat: a.lat + ((hospital?.lat ?? a.lat) - a.lat) * progress, lng: a.lng + ((hospital?.lng ?? a.lng) - a.lng) * progress })) } : null;
  function reset() { setJourney(null); setLocation(''); setUrgency(''); setError(''); }
  if (!ready) return <p role="status">Loading patient journey…</p>;
  return <div className="patient-overview">
    <div className="patient-steps" aria-label="Journey progress">{['Patient details', 'Choose hospital', 'On the way', 'Arrived'].map((s, i) => <span key={s} className={i === (!journey ? 0 : journey.status === 'choosing' ? 1 : journey.status === 'en_route' ? 2 : 3) ? 'current' : ''}><b>{i + 1}</b>{s}</span>)}</div>
    {error && <p className="error-banner" role="alert">{error}</p>}
    <div className="patient-layout">
      <section className="panel patient-controls">
        {!journey ? <form onSubmit={e => { e.preventDefault(); const origin = resolveLocation(location); if (!origin || !urgency) { setError('Choose a listed Toronto location or enter valid Toronto coordinates, and select urgency.'); return; } const ranked = journeyNetwork(origin, urgency).ranked; if (!ranked.length) { setError('No eligible hospitals are available in this demo.'); return; } setError(''); setJourney({ location: location.trim(), origin, urgency, status: 'choosing', selected: ranked[0].hospitalId, startedAt: null }); }}>
          <span className="eyebrow">A NEW JOURNEY</span><h2>Where are you starting?</h2><p>Find a destination for your simulated patient.</p>
          <label className="patient-label" htmlFor="patient-location">Current location</label><div className="patient-location"><MapPin size={18}/><input id="patient-location" list="patient-locations" placeholder="Search demo locations or enter lat, lng" value={location} onChange={e => setLocation(e.target.value)} required autoComplete="off"/></div>
          <datalist id="patient-locations">{LOCATIONS.map(p => <option key={p.name} value={p.name}/>)}</datalist>
          <div className="patient-places">{LOCATIONS.map(p => <button type="button" key={p.name} onClick={() => setLocation(p.name)}>{p.name}</button>)}</div>
          <p className="form-note">Choose a demo location above, or coordinates within Toronto (43.63–43.74, −79.49–−79.29). No live address lookup.</p>
          <fieldset className="patient-urgencies"><legend>How urgent is the condition?</legend>{(['low', 'moderate', 'critical'] as const).map((level, i) => <label key={level} className={urgency === level ? 'chosen' : ''}><input type="radio" name="urgency" value={level} checked={urgency === level} onChange={() => setUrgency(level)} required/><span><strong>{level[0].toUpperCase() + level.slice(1)}</strong><small>{['General care · low urgency', 'General care · moderate urgency', 'Specialist capability required in demo'][i]}</small></span><i className={`urgency-dot level-${i}`}/></label>)}</fieldset>
          <button className="button primary patient-submit" type="submit" disabled={!location.trim() || !urgency}>Find hospitals<ArrowRight size={17}/></button>
        </form> : <>
          <span className="eyebrow">{journey.status === 'choosing' ? 'YOUR HOSPITAL OPTIONS' : journey.status === 'en_route' ? 'JOURNEY IN PROGRESS' : 'JOURNEY COMPLETE'}</span>
          <h2 aria-live="polite">{journey.status === 'choosing' ? 'A clearer way forward.' : journey.status === 'en_route' ? 'On the way to hospital' : 'Trip complete'}</h2>
          <p><MapPin size={14}/> {journey.location} · {journey.urgency} urgency</p>
          {journey.status === 'choosing' ? <>
            <p>Eligible hospitals, ranked by predicted total time.</p><div className="patient-options" role="radiogroup" aria-label="Hospital destination">{network?.ranked.map((c, i) => <label className={`patient-option ${journey.selected === c.hospitalId ? 'chosen' : ''}`} key={c.hospitalId}><input type="radio" name="hospital" checked={journey.selected === c.hospitalId} onChange={() => setJourney({ ...journey, selected: c.hospitalId })}/><div>{i === 0 && <span className="patient-recommended">RECOMMENDED · FASTEST TOTAL</span>}<strong>{i + 1}. {c.name}</strong><small>{c.travel} min travel + {c.offload} min offload</small></div><b>{c.total}<small>min total</small></b></label>)}</div>
            <button className="button primary patient-submit" onClick={() => { const startedAt = Date.now(); setNow(startedAt); setJourney({ ...journey, status: 'en_route', startedAt }); }}><Navigation size={16}/>Start route to {selected?.name}</button><button className="text-button patient-back" onClick={() => setJourney(null)}>Edit patient details</button>
          </> : <>
            <div className="patient-destination"><span className="patient-complete-icon">{journey.status === 'arrived' ? <Check size={26}/> : <Navigation size={26}/>}</span><h3>{selected?.name}</h3><p>{hospital?.address}</p><div className="patient-total"><strong>{selected?.total}<small> min</small></strong><span>Predicted total at departure</span></div><p>{selected?.travel} min travel + {selected?.offload} min offload</p></div>
            {journey.status === 'en_route' ? <><div className="patient-progress"><div style={{ width: `${progress * 100}%` }}/></div><p role="status">{progress < 1 ? `${Math.ceil((selected?.travel ?? 0) * (1 - progress))} simulated min to arrival` : 'Destination reached in preview. Confirm your arrival below.'}</p><button className="button primary patient-submit" onClick={() => setJourney({ ...journey, status: 'arrived' })}><Check size={17}/>Arrived at hospital</button><p className="form-note">Accelerated preview: 1 second = 1 travel minute. You confirm when the trip ends.</p></> : <><p className="patient-success" role="status">Arrival confirmed. This trip is complete.</p><button className="button primary patient-submit" onClick={reset}><RotateCcw size={16}/>New patient journey</button></>}
          </>}
        </>}
      </section>
      <div className="patient-map-column"><section className="panel"><div className="panel-heading"><h2>{journey?.status === 'arrived' ? 'Your destination' : 'Your journey, at a glance'}</h2><span className="badge">Demo network</span></div><NetworkMap run={mapRun} selected="YOUR-AMBULANCE" onHospital={id => { if (journey?.status === 'choosing' && network?.ranked.some(c => c.hospitalId === id)) setJourney({ ...journey, selected: id }); }}/></section><div className="patient-explainer"><Clock3 size={23}/><div><h3>A shorter drive isn’t always a faster handover.</h3><p>Total time includes estimated travel, queue wait, and handover. These are synthetic forecasts, not live hospital availability or time to treatment. Low and moderate urgency share general-care eligibility; critical uses simulated specialist eligibility.</p></div></div></div>
    </div>
  </div>;
}
