import type { HospitalPrediction } from '@/lib/hospital-offload';
export default function PredictionBreakdown({prediction:p}:{prediction:Omit<HospitalPrediction,'queue'|'inbound'|'capacity'> & {queue?:number|null;inbound?:number|null;capacity?:number|null;queueAdjustment?:number;serviceFloorAdjustment?:number;projectedWait?:number};travel?:number|null;total?:number|null}) {
  const signed=(n:number)=>`${n>=0?'+':''}${n}`;
  const r=p.liveReading;
  const timestamp=r?(r.timestampBasis==='publisher'?r.observedAt:r.collectedAt):null;
  const statusLabel=p.liveStatus!=='Historical Only'?p.liveStatus:p.liveDataReason==='loading'?'Loading ED…':p.liveDataReason==='feed_error'?'Feed offline':p.liveDataReason==='expired'?'Live data expired':'No live ED data';
  return <><div className="ed-status"><span className={`badge ${p.liveStatus==='Live'?'green':p.liveStatus==='Stale'?'amber':'neutral'}`}>{statusLabel}</span>{r&&<span>ED wait {r.waitMinutes} min</span>}</div>
    <details className="prediction-breakdown"><summary>Why {p.offload} min?</summary><dl>
      <div><dt>Historical offload{p.fallback?' (fallback)':''}</dt><dd>{p.baseline} min</dd></div>
      <div><dt>Live ED adjustment</dt><dd>{signed(p.liveAdjustment)} min</dd></div>
      {p.queueAdjustment!==undefined&&<div><dt>Simulated queue</dt><dd>{signed(p.queueAdjustment)} min</dd></div>}
      {!!p.serviceFloorAdjustment&&<div><dt>Service minimum</dt><dd>{signed(p.serviceFloorAdjustment)} min</dd></div>}
      <div><dt>Offload estimate</dt><dd>{p.offload} min{p.capped?' (capped)':''}</dd></div>
    </dl><p>{p.queue==null?'Ambulance queue: Unavailable':`Queue ${p.queue} · Inbound ${p.inbound} · Slots ${p.capacity} (simulated)`}</p>
    <details className="prediction-source"><summary>Data sources</summary>{!r&&<p>{p.liveDataReason==='feed_error'?'The ED feed request failed; historical baseline is in use.':p.liveDataReason==='loading'?'Fetching ED readings…':'No current ED wait is reported for this hospital.'}</p>}
      {r&&<><p>{r.timestampBasis==='publisher'?'Observation':'Feed collected'}: <time dateTime={timestamp!}>{new Date(timestamp!).toLocaleString('en-CA',{timeZone:'America/Toronto'})}</time> ET · {p.liveAgeMinutes} min ago</p><p>ED reference: {r.referenceMinutes??'unavailable'} min · {r.referenceCount} readings</p>{!p.liveComparable&&<p>No comparable fresh data; adjustment skipped.</p>}<p><a href="https://ercompass.ca/" target="_blank" rel="noreferrer">ER Compass</a> · <a href="https://ercompass.ca/terms" target="_blank" rel="noreferrer">CC BY-NC 4.0</a></p></>}
      <p>Baseline: Toronto 2022–2023 offload chart (approximate). ED adjustment is a heuristic; ED wait is not ambulance offload.</p>
    </details></details></>;
}
