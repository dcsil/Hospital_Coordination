'use client';
import type { Run } from '@/lib/simulation';
import { useEffect,useMemo,useState } from 'react';
import { ArrowRight,Check,MapPin,Navigation,RotateCcw } from 'lucide-react';
import type { EdSnapshot } from '@/lib/live-ed';
import type { Point } from '@/lib/hospital-sites';
import type { RoadTravel } from '@/lib/road-travel';
import { journeyNetwork,LOCATIONS,resolveLocation,overviewTripSchema,type OverviewTrip } from '@/lib/patient-journey';
import PredictionBreakdown from './prediction-breakdown';
const KEY='kinetic-hospital-search-v2';
export default function PatientOverview({live,onEmergency,busy=false,run}:{live:{snapshot:EdSnapshot;evaluatedAt:string};onEmergency?:(point:Point)=>void;busy?:boolean;run?:Run|null}) {
  const [location,setLocation]=useState('');const [origin,setOrigin]=useState<Point|null>(null);
  const [roads,setRoads]=useState<RoadTravel|undefined>();const [selected,setSelected]=useState('');
  const [trip,setTrip]=useState<OverviewTrip|null>(null);
  const [error,setError]=useState('');const [loading,setLoading]=useState(false);const [ready,setReady]=useState(false);
  useEffect(()=>{
    // A saved search prefills Step 1; an active trip resumes at confirmation.
    try {
      const raw=localStorage.getItem(KEY);
      if(raw){const value=JSON.parse(raw);if(typeof value.location==='string'){
        const point=resolveLocation(value.location);
        if(point){setLocation(value.location);const saved=overviewTripSchema.safeParse(value.trip);if(saved.success){setOrigin(point);setTrip(saved.data);setSelected(saved.data.destination.id);}}
      }}
    }catch{/* Search works without storage. */}
    setReady(true);
  },[]);
  useEffect(()=>{
    if(!origin)return;
    let active=true;const abort=new AbortController();setLoading(true);setRoads(undefined);
    fetch(`/api/travel?lat=${origin.lat}&lng=${origin.lng}`,{signal:abort.signal,cache:'no-store'}).then(async response=>{
      if(!response.ok)throw new Error();const result=await response.json() as RoadTravel;if(active)setRoads(result);
    }).catch(()=>{if(active)setRoads({minutes:{},source:'Estimated simulation travel',fetchedAt:null,error:'Road travel unavailable. Ranking uses offload estimates only.'});}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;abort.abort();};
  },[origin]);
  const network=useMemo(()=>journeyNetwork(live.snapshot,live.evaluatedAt,roads,run),[live,roads,run]);
  const best=network.ranked[0];const chosen=network.ranked.find(h=>h.id===selected)??best;
  const shortest=network.rankBy==='total'?[...network.ranked].sort((a,b)=>a.travel!-b.travel!)[0]:null;
  function reset(){setOrigin(null);setRoads(undefined);setSelected('');setTrip(null);setError('');try{localStorage.removeItem(KEY);}catch{/* Optional storage. */}}
  function saveTrip(value:OverviewTrip){setTrip(value);try{localStorage.setItem(KEY,JSON.stringify({location,trip:value}));}catch{setError('Browser storage is unavailable. Keep this page open to retain arrival confirmation.');}}
  function startDirections(){if(!chosen)return;saveTrip({destination:{id:chosen.id,name:chosen.name,address:chosen.address,lat:chosen.lat,lng:chosen.lng},travel:chosen.travel,offload:chosen.offload,total:chosen.total,startedAt:Date.now(),arrivedAt:null});}
  const destination=trip?.destination??chosen;
  const directions=origin&&destination?`https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&travelmode=driving`:null;
  const step=!origin?1:trip?3:2;
  if(!ready)return <p role="status">Loading hospital search…</p>;
  return <div className="patient-overview"><div className="patient-layout"><section className="panel patient-controls">
    <ol className="journey-steps" aria-label="Journey steps"><li aria-current={step===1?'step':undefined}>1. Location</li><li aria-current={step===2?'step':undefined}>2. Destination</li><li aria-current={step===3?'step':undefined}>3. Arrival</li></ol>
    {error&&<p className="error-banner" role="alert">{error}</p>}
    {!origin?<form onSubmit={event=>{event.preventDefault();const point=resolveLocation(location);if(!point){setError('Choose a listed Toronto location or enter valid Toronto coordinates.');return;}setError('');setSelected('');setOrigin(point);try{localStorage.setItem(KEY,JSON.stringify({location}));}catch{/* Optional storage. */}}}>
      <h2>1. Select pickup location</h2>
      <label className="patient-label" htmlFor="patient-location">Current location</label><div className="patient-location"><MapPin size={18}/><input id="patient-location" list="patient-locations" placeholder="Choose a landmark or enter lat, lng" value={location} onChange={e=>setLocation(e.target.value)} required autoComplete="off"/></div>
      <datalist id="patient-locations">{LOCATIONS.map(p=><option key={p.name} value={p.name}/>)}</datalist>
      <div className="patient-places">{LOCATIONS.map(p=><button type="button" key={p.name} onClick={()=>setLocation(p.name)}>{p.name}</button>)}</div>
      <p className="form-note">Choose a Toronto landmark or enter coordinates.</p>
      <button className="button primary patient-submit" type="submit" disabled={!location.trim()}>Find hospitals<ArrowRight size={17}/></button>
    </form>:trip?<>
      <h2>{trip.arrivedAt===null?'3. Confirm arrival':'Arrival confirmed'}</h2>
      <p><MapPin size={14}/> Pickup: {location}</p>
      <div className="patient-destination"><span className="patient-complete-icon">{trip.arrivedAt===null?<Navigation size={26}/>:<Check size={26}/>}</span><h3>{trip.destination.name}</h3><p>{trip.destination.address}</p>
        <div className="patient-total"><strong className={trip.total===null?'unavailable-total':undefined}>{trip.total===null?'Unavailable':trip.total}{trip.total!==null&&<small> min</small>}</strong><span>Estimate at departure</span></div>
        <p>{trip.travel===null?'Travel unavailable':`${trip.travel} min travel`} · {trip.offload} min offload</p>
      </div>
      {trip.arrivedAt===null?<>
        <p role="status">Have you arrived?</p>
        <button className="button primary patient-submit" onClick={()=>saveTrip({...trip,arrivedAt:Date.now()})}><Check size={18}/>Arrived at hospital</button>
        {directions&&<a className="button full" href={directions} target="_blank" rel="noreferrer">Continue in Google Maps</a>}
        <button className="text-button patient-back" onClick={reset}>Cancel trip</button>
      </>:<>
        <button className="button primary patient-submit" onClick={()=>{reset();setLocation('');}}><RotateCcw size={18}/>New journey</button>
      </>}
    </>:<>
      <h2>2. Select destination</h2><div className="pickup-selection"><p><MapPin size={14}/> Pickup: {location}</p><button className="text-button" onClick={reset}>Change pickup location</button></div>
      <p>{network.rankBy==='total'?'Lowest travel + offload first.':'Ranked by offload · travel unavailable.'}</p>
      <p className="form-note" data-testid="overview-forecast-clock">{run?`Simulation minute ${run.time} · ${run.status}${network.rankBy==='total'?'':' · arrival assumed now'}`:'No active simulation · historical + live ED estimates'}</p>
      {loading&&<p role="status">Updating travel…</p>}
      {roads?.error&&<p className="alert-banner neutral">{roads.error}</p>}
      {shortest&&<div className="estimate-comparison"><p><strong>Shortest travel:</strong> {shortest.name} · {shortest.total} min total</p><p><strong>Best total:</strong> {best.name} · {best.total} min total</p></div>}
      <div className="patient-options" role="radiogroup" aria-label="Hospital destination">{network.ranked.map((h,i)=><div key={h.id}><label className={`patient-option ${chosen?.id===h.id?'chosen':''}`}><input type="radio" name="hospital" checked={chosen?.id===h.id} onChange={()=>setSelected(h.id)}/><div>{i===0&&<span className="patient-recommended">BEST ESTIMATE</span>}<strong>{i+1}. {h.name}</strong><small>{h.travel===null?'Travel unavailable':`${h.travel} min road travel`} · {h.offload} min estimated offload</small></div><b>{network.rankBy==='total'?h.total:h.offload}<small>min {network.rankBy==='total'?'total':'offload'}</small></b></label><PredictionBreakdown prediction={h} travel={h.travel} total={h.total}/></div>)}</div>
      {onEmergency&&<button className="button primary patient-submit" disabled={busy} onClick={()=>onEmergency(origin)}>Simulate pickup at this location</button>}
      {chosen&&directions&&<a className="button primary patient-submit" href={directions} onClick={startDirections} target="_blank" rel="noreferrer"><Navigation size={16}/>Open directions to {chosen.name}</a>}
      {roads?.fetchedAt&&<p className="form-note">Travel times are simulated estimates.</p>}
    </>}
  </section></div></div>;
}
