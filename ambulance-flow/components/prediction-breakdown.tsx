import type { HospitalPrediction } from '@/lib/hospital-offload';
type Prediction = Omit<HospitalPrediction, 'queue' | 'inbound' | 'capacity' | 'estimateKind'> & {
  estimateKind: HospitalPrediction['estimateKind'] | 'simulation';
  queue?: number | null; inbound?: number | null; capacity?: number | null;
  queueAdjustment?: number; serviceFloorAdjustment?: number; projectedWait?: number;
};
export default function PredictionBreakdown({prediction:p}:{prediction:Prediction;travel?:number|null;total?:number|null}) {
  const r=p.liveReading;
  const timestamp=r?(r.timestampBasis==='publisher'?r.observedAt:r.collectedAt):null;
  const statusLabel=p.liveStatus!=='Historical Only'?p.liveStatus:p.liveDataReason==='loading'?'Loading ED…':p.liveDataReason==='feed_error'?'Feed offline':p.liveDataReason==='expired'?'Live data expired':'No live ED data';
  const simulated=p.estimateKind==='simulation';
  const observed=p.estimateKind==='observed-rolling-median';
  const external=p.publicModel;
  return <><div className="ed-status"><span className={`badge ${p.liveStatus==='Live'?'green':p.liveStatus==='Stale'?'amber':'neutral'}`}>ED: {statusLabel}</span>{r&&<span>ED wait {r.waitMinutes} min · context only</span>}</div>
    <details className="prediction-breakdown"><summary>Why {p.offload} min?</summary>
      <p><strong>{simulated?'Simulated queue estimate':observed?'Recent observed offload median':external?'Public-data model · experimental transfer':'Historical average · 2022–2023'}</strong></p>
      <dl>
        {!observed&&!external&&<div><dt>Historical offload{p.fallback?' (cross-hospital fallback)':''}</dt><dd>≈ {p.baseline} min</dd></div>}
        {external&&<><div><dt>Published anchor ({external.anchor.statistic==='p90'?'90th percentile':'mean'})</dt><dd>{external.anchor.minutes} min</dd></div><div><dt>Learned calendar factor</dt><dd>×{external.calendarFactor.toFixed(2)}</dd></div><div><dt>Toronto arrival time</dt><dd>{new Date(external.arrivalAt).toLocaleString('en-CA',{timeZone:'America/Toronto'})}</dd></div></>}
        {observed&&<><div><dt>Recent completed offloads used</dt><dd>{p.modelWindow}</dd></div><div><dt>Model updated</dt><dd>{p.modelAsOf}</dd></div></>}
        {p.queueAdjustment!==undefined&&<div><dt>Simulated queue wait</dt><dd>+{p.queueAdjustment} min</dd></div>}
        {!!p.serviceFloorAdjustment&&<div><dt>Simulated service minimum adjustment</dt><dd>+{p.serviceFloorAdjustment} min</dd></div>}
        <div><dt>Offload estimate</dt><dd>{p.offload} min{p.capped?' (simulation cap)':''}</dd></div>
      </dl>
      {external?<><p>Transferred typical range: {Math.floor(external.lower)}–{Math.ceil(external.upper)} min. This uses the source data’s central 80% residual range; Toronto coverage is unknown.</p>
        <p>Trained on {external.source.rows.toLocaleString()} public offloads from {external.source.hospitals} Sacramento hospitals. Later source test: {external.validation.testCount.toLocaleString()} records; mean absolute error {external.validation.model.maeMinutes.toFixed(1)} min versus {external.validation.hospitalMeanBaseline.maeMinutes.toFixed(1)} min for hospital averages. Average underprediction: {(-external.validation.model.biasMinutes).toFixed(1)} min.</p>
        <p>Time-of-day and weekday effects are learned from another region. Toronto hospital levels are anchored to published data; this transfer has not been validated locally.</p></>:p.interval&&p.validation?<><p>Historical residual range: {Math.floor(p.interval.lower)}–{Math.ceil(p.interval.upper)} min (nominal {p.interval.nominalCoverage*100}%).</p>
        <p>Later test period: {p.validation.testCount} offloads · mean absolute error {p.validation.mae.toFixed(1)} min · measured range coverage {(p.validation.intervalCoverage*100).toFixed(0)}%. Historical baseline error: {p.validation.historicalMae.toFixed(1)} min; recent-20 baseline: {p.validation.recent20Mae.toFixed(1)} min.</p>
        <p>Retrospective results only. Temporal dependence and changing hospital conditions can reduce future coverage.</p></>:<p>Prediction interval unavailable: {simulated?'simulated queues have not been calibrated against observed hospital operations.':'the source reports hospital averages, without individual offload times or variance.'}</p>}
      {!observed&&!simulated&&!external&&<p>{p.modelReason==='observed_model_stale'?'Recent-offload model expired; showing the historical average.':'No usable locally tested offload model. This is an approximate historical benchmark, not a current patient-specific forecast.'}</p>}
      <p>{p.queue==null?'Ambulance queue: Unavailable':`Queue ${p.queue} · Inbound ${p.inbound} · Slots ${p.capacity} (simulated)`}</p>
      <details className="prediction-source"><summary>Data sources</summary>
        {p.liveDataReason==='feed_error'&&<p>The ED feed request failed; offload estimates do not depend on this feed.</p>}
        {r&&<><p>{r.timestampBasis==='publisher'?'Observation':'Feed collected'}: <time dateTime={timestamp!}>{new Date(timestamp!).toLocaleString('en-CA',{timeZone:'America/Toronto'})}</time> ET · {p.liveAgeMinutes} min ago</p><p>ED reference: {r.referenceMinutes??'unavailable'} min · {r.referenceCount} readings</p><p><a href="https://ercompass.ca/" target="_blank" rel="noreferrer">ER Compass</a> · <a href="https://ercompass.ca/terms" target="_blank" rel="noreferrer">CC BY-NC 4.0</a></p></>}
        <p>ED waits are displayed separately. No ED-to-offload adjustment is applied without paired offload evidence.</p>
        {external&&<p><a href={external.source.repository} target="_blank" rel="noreferrer">Public offload research dataset</a> · {external.source.periodFrom} to {external.source.periodTo}. <a href={external.anchor.url} target="_blank" rel="noreferrer">Hospital anchor</a>: {external.anchor.period}. A published P90 is converted using the external distribution, never treated as a mean.</p>}
        <p>Historical baseline: <a href="https://www.toronto.ca/legdocs/mmis/2024/cc/bgrd/backgroundfile-247763.pdf" target="_blank" rel="noreferrer">Toronto 2022–2023 offload chart</a> (approximate). A missing hospital uses the median of 13 hospital means, not a patient-level median.</p>
      </details>
    </details></>;
}
