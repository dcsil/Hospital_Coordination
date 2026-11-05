'use client';
import PredictionBreakdown from './prediction-breakdown';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, MapPin, Navigation, RotateCcw } from 'lucide-react';
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
  function reset() { setJourney(null); setLocation(''); setUrgency(''); setError(''); }
  if (!ready) return <p role="status">Loading patient journey…</p>;
  return <div className="patient-overview">
    {error && <p className="error-banner" role="alert">{error}</p>}
    <div className="patient-layout">
      <section className="panel patient-controls">
        {!journey ? <form onSubmit={e => { e.preventDefault(); const origin = resolveLocation(location); if (!origin || !urgency) { setError('Choose a listed Toronto location or enter valid Toronto coordinates, and select urgency.'); return; } const ranked = journeyNetwork(origin, urgency).ranked; if (!ranked.length) { setError('No eligible hospitals are available in this demo.'); return; } setError(''); setJourney({ location: location.trim(), origin, urgency, status: 'choosing', selected: ranked[0].hospitalId, startedAt: null }); }}>

          <label className="patient-label" htmlFor="patient-location">Current location</label><div className="patient-location"><MapPin size={18}/><input id="patient-location" list="patient-locations" placeholder="Search demo locations or enter lat, lng" value={location} onChange={e => setLocation(e.target.value)} required autoComplete="off"/></div>
          <datalist id="patient-locations">{LOCATIONS.map(p => <option key={p.name} value={p.name}/>)}</datalist>
          <div className="patient-places">{LOCATIONS.map(p => <button type="button" key={p.name} onClick={() => setLocation(p.name)}>{p.name}</button>)}</div>
          <p className="form-note">Demo locations or Toronto coordinates (43.63–43.74, −79.49–−79.29).</p>
          <fieldset className="patient-urgencies"><legend>Patient urgency</legend>{(['low', 'moderate', 'critical'] as const).map((level, i) => <label key={level} className={urgency === level ? 'chosen' : ''}><input type="radio" name="urgency" value={level} checked={urgency === level} onChange={() => setUrgency(level)} required/><span><strong>{level[0].toUpperCase() + level.slice(1)}</strong></span><i className={`urgency-dot level-${i}`}/></label>)}</fieldset>
          <button className="button primary patient-submit" type="submit" disabled={!location.trim() || !urgency}>Find hospitals<ArrowRight size={17}/></button>
        </form> : <>
          <h2 aria-live="polite">{journey.status === 'choosing' ? 'Choose a hospital' : journey.status === 'en_route' ? 'On the way to hospital' : 'Trip complete'}</h2>
          <p><MapPin size={14}/> {journey.location} · {journey.urgency} urgency</p>
          {journey.status === 'choosing' ? <>
            <p>Ranked by travel + offload time.</p><div className="patient-options" role="radiogroup" aria-label="Hospital destination">{network?.ranked.map((c, i) => <div key={c.hospitalId}><label className={`patient-option ${journey.selected === c.hospitalId ? 'chosen' : ''}`}><input type="radio" name="hospital" checked={journey.selected === c.hospitalId} onChange={() => setJourney({ ...journey, selected: c.hospitalId })}/><div>{i === 0 && <span className="patient-recommended">RECOMMENDED</span>}<strong>{i + 1}. {c.name}</strong><small>{c.travel} min travel + {c.offload} min offload</small></div><b>{c.total}<small>min total</small></b></label><PredictionBreakdown prediction={c} travel={c.travel} total={c.total}/></div>)}</div>
            <button className="button primary patient-submit" onClick={() => { const startedAt = Date.now(); setNow(startedAt); setJourney({ ...journey, status: 'en_route', startedAt }); }}><Navigation size={16}/>Start route to {selected?.name}</button><button className="text-button patient-back" onClick={() => setJourney(null)}>Edit patient details</button>
          </> : <>
            <div className="patient-destination"><span className="patient-complete-icon">{journey.status === 'arrived' ? <Check size={26}/> : <Navigation size={26}/>}</span><h3>{selected?.name}</h3><p>{hospital?.address}</p><div className="patient-total"><strong>{selected?.total}<small> min</small></strong><span>Predicted total at departure</span></div><p>{selected?.travel} min travel + {selected?.offload} min offload</p></div>
            {journey.status === 'en_route' ? <><div className="patient-progress"><div style={{ width: `${progress * 100}%` }}/></div><p role="status">{progress < 1 ? `${Math.ceil((selected?.travel ?? 0) * (1 - progress))} simulated min to arrival` : 'Destination reached in preview. Confirm your arrival below.'}</p><button className="button primary patient-submit" onClick={() => setJourney({ ...journey, status: 'arrived' })}><Check size={17}/>Arrived at hospital</button><p className="form-note">Demo speed: 1 second = 1 travel minute.</p></> : <><p className="patient-success" role="status">Arrival confirmed. This trip is complete.</p><button className="button primary patient-submit" onClick={reset}><RotateCcw size={16}/>New patient journey</button></>}
          </>}
        </>}
      </section>
    </div>
  </div>;
}
