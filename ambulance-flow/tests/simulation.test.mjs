import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, createRun, advance, injectEmergency, incidentSchedule, choices, decide, forecast, inbound, metrics, patientTransports, observed, setCapacity, compare } from '../lib/simulation.ts';

test('identical seeds generate identical external demand across policies', () => {
  const a = incidentSchedule({ ...DEFAULT_CONFIG, policy: 'nearest' });
  const b = incidentSchedule({ ...DEFAULT_CONFIG, policy: 'coordinated' });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, incidentSchedule({ ...DEFAULT_CONFIG, seed: 43 }));
});
test('incremental stepping and an uninterrupted run have identical outcomes', () => {
  const a = createRun(DEFAULT_CONFIG, 'a'); const b = createRun(DEFAULT_CONFIG, 'b');
  advance(a, 240); for (let i = 0; i < 48; i++) advance(b, 5);
  assert.deepEqual(metrics(a), metrics(b)); assert.deepEqual(a.incidents, b.incidents); assert.deepEqual(a.events, b.events);
  assert.equal(a.status, 'completed'); const sequence = a.sequence; advance(a, 5); assert.equal(a.sequence, sequence);
});
test('ambulance conservation, finite metrics, and queue membership hold every minute', () => {
  const r = createRun({ ...DEFAULT_CONFIG, preset: 'surge', callsPerHour: 60 }, 'conservation');
  for (let t = 0; t < 240; t++) {
    advance(r, 1); const queued = r.hospitals.flatMap(h => h.queue); const active = r.hospitals.flatMap(h => h.active);
    assert.equal(new Set([...queued, ...active]).size, queued.length + active.length);
    assert.equal(r.ambulances.length, 20);
    for (const a of r.ambulances) { assert.equal(queued.includes(a.id), a.status === 'WAITING_TO_OFFLOAD'); assert.equal(active.includes(a.id), a.status === 'HANDOVER'); }
    for (const h of r.hospitals) assert.equal(inbound(r, h), r.ambulances.filter(a => a.status === 'EN_ROUTE' && a.destination === h.id).length);
    const m = metrics(r); assert.equal(m.completed + m.unfinished, m.pickedUp); assert(m.availability >= 0 && m.availability <= 100);
    for (const value of Object.values(m)) assert(Number.isFinite(value));
  }
  assert(metrics(r).completed > 0); assert(r.surgeInjected);
});
test('manual approvals change inbound demand immediately but not the current queue', () => {
  const r = createRun({ ...DEFAULT_CONFIG, manual: true }, 'manual');
  while (!r.ambulances.some(a => a.status === 'AWAITING_DECISION')) advance(r, 1);
  const a = r.ambulances.find(a => a.status === 'AWAITING_DECISION'); const option = choices(r, a.id).find(c => c.eligible); const h = r.hospitals.find(h => h.id === option.hospitalId);
  const before = inbound(r, h); const queueBefore = h.queue.length; decide(r, a.id, h.id);
  assert.equal(inbound(r, h), before + 1); assert.equal(h.queue.length, queueBefore); assert.equal(a.status, 'EN_ROUTE');
  assert.throws(() => decide(r, a.id, h.id), /not awaiting/);
  advance(r, option.travel); assert(['HANDOVER', 'WAITING_TO_OFFLOAD'].includes(a.status));
});
test('eligibility excludes hospitals lacking synthetic case capabilities', () => {
  const r = createRun({ ...DEFAULT_CONFIG, manual: true }, 'eligibility'); advance(r, 25);
  const a = r.ambulances.find(a => a.status === 'AWAITING_DECISION'); assert(a);
  r.incidents.find(i => i.id === a.incidentId).care = 'specialist';
  const ineligible = choices(r, a.id).find(c => !c.eligible); assert(ineligible);
  assert.throws(() => decide(r, a.id, ineligible.hospitalId), /constraints/);
});
test('delayed reports do not leak current queue and capacity changes into predictions', () => {
  const r = createRun({ ...DEFAULT_CONFIG, informationDelay: 15 }, 'stale'); advance(r, 25);
  const h = r.hospitals[0]; const before = forecast(r, h); const report = observed(r, h); assert.equal(report.time, 10);
  setCapacity(r, h.id, 0); h.queue.push('synthetic-hidden-queue');
  assert.deepEqual(forecast(r, h), before); assert.equal(observed(r, h).capacity, DEFAULT_CONFIG.slots);
});
test('zero capacity prevents new handovers but allows active handovers to finish', () => {
  const r = createRun(DEFAULT_CONFIG, 'closure'); advance(r, 55); const h = r.hospitals.find(h => h.active.length); assert(h);
  const old = [...h.active]; setCapacity(r, h.id, 0); advance(r, 60);
  assert.equal(h.active.length, 0); assert(old.every(id => !h.active.includes(id)));
});
test('paused and stopped clocks do not advance', () => {
  const r = createRun(DEFAULT_CONFIG, 'paused'); r.status = 'paused'; advance(r, 30); assert.equal(r.time, 0);
  r.status = 'running'; advance(r, 30); r.status = 'stopped'; advance(r, 10); assert.equal(r.time, 30);
});
test('matched comparisons are reproducible, include censoring, and expose paired uncertainty', () => {
  const config = { ...DEFAULT_CONFIG, duration: 60 }; const first = compare(config, [1, 2, 3]); const second = compare(config, [1, 2, 3]);
  assert.deepEqual(first, second); assert.equal(first.rows.length, 6);
  for (const seed of first.seeds) { const rows = first.rows.filter(r => r.seed === seed); assert.equal(rows[0].metrics.generated, rows[1].metrics.generated); }
  for (const s of first.summary) { assert(s.ciLow <= s.delta); assert(s.delta <= s.ciHigh); }
  assert(first.rows.some(r => r.metrics.unfinished > 0));
});

test('historical chart baselines match Toronto sites; virtual sites use median fallback', () => {
  const r = createRun({ ...DEFAULT_CONFIG, hospitals: 6 }, 'history');
  assert.deepEqual(r.hospitals.slice(0,5).map(h => forecast(r,h).baseline), [58,59,36,28,60]);
  assert.equal(forecast(r,r.hospitals[5]).baseline, 43);
  assert.equal(forecast(r,r.hospitals[5]).fallback,true);
});
function queueFixture() {
  const r=createRun({...DEFAULT_CONFIG,manual:true,slots:1,serviceMinutes:18},'queue');
  r.incidents=[];r.ambulances=[];
  const h=r.hospitals[3];
  h.observations=[{time:0,queue:0,busy:0,capacity:1,releases:[]}];
  return {r,h};
}
test('arrival-time queue accounts for ETA order and background readiness', () => {
  const {r,h}=queueFixture();
  r.ambulances.push({id:'inbound',destination:h.id,status:'EN_ROUTE',until:5});
  const early=forecast(r,h,10);
  assert.equal(early.projectedWait,13);
  assert.equal(early.queueAdjustment,13); // Background delay shifts both arrivals to handover readiness.
  assert.equal(forecast(r,h,1).inbound,0);
  assert.equal(forecast(r,h,30).queueAdjustment,0);
  r.ambulances.push({id:'second',destination:h.id,status:'EN_ROUTE',until:6});
  const busy=forecast(r,h,10);
  assert(busy.offload>early.offload);
  assert.equal(busy.projectedQueue,1);
  assert(forecast(r,h,10,'second').offload<busy.offload);
  setCapacity(r,h.id,2);
  assert(forecast(r,h,10).offload<busy.offload);
});
test('reported residual handovers and completion events update forecasts', () => {
  const {r,h}=queueFixture();
  h.observations=[{time:0,queue:3,busy:1,capacity:1,releases:[2]}];
  const before=forecast(r,h,0);
  assert.equal(before.projectedWait,46); // Candidate spends 10 minutes in background preparation.
  h.observations.push({time:1,queue:0,busy:0,capacity:1,releases:[]});r.time=1;
  assert(forecast(r,h,0).offload<before.offload);
  const live=createRun(DEFAULT_CONFIG,'completion');
  advance(live,80);
  assert(live.events.some(e=>e.type==='handover'));
  for(const site of live.hospitals) assert.equal(observed(live,site).releases.length,site.active.length);
});
test('congestion coefficients are configurable and zero capacity remains ineligible', () => {
  const {r,h}=queueFixture();
  h.observations=[{time:0,queue:0,busy:1,capacity:1,releases:[20]}];
  const normal=forecast(r,h,0);
  r.config.prediction={congestionWeight:0,queueWeight:0};
  const disabled=forecast(r,h,0);
  assert.equal(disabled.congestionAdjustment,0);assert.equal(disabled.queueAdjustment,0);
  assert.notEqual(normal.offload,disabled.offload);
  setCapacity(r,h.id,0);assert.equal(forecast(r,h).offload,180);
});
test('hospital recommendations rank with hybrid travel plus offload and expose old comparison', () => {
  const r=createRun({...DEFAULT_CONFIG,manual:true},'ranking');advance(r,30);
  const a=r.ambulances.find(a=>a.status==='AWAITING_DECISION');assert(a);
  const ranked=choices(r,a.id).filter(c=>c.eligible);
  for(let i=0;i<ranked.length;i++) {
    const c=ranked[i];assert.equal(c.total,Math.round((c.travel+c.offload)*10)/10);
    assert(Number.isFinite(c.oldOffload));assert(c.baseline>=28);
    if(i) assert(ranked[i-1].total<=c.total);
  }
});
test('actual handover completion drains projected waiting work without rebuilding a run', () => {
  const {r,h}=queueFixture();
  for(let i=0;i<4;i++) {
    const id=`controlled-${i}`;
    r.incidents.push({id:`case-${i}`,time:0,lat:h.lat,lng:h.lng,care:'general',scene:0,serviceFactor:1,assignedAt:0});
    r.ambulances.push({id,lat:h.lat,lng:h.lng,from:h,routeStart:0,incidentId:`case-${i}`,destination:h.id,status:i===0?'HANDOVER':'WAITING_TO_OFFLOAD',until:i===0?2:0,arrivalAt:0});
  }
  h.active=['controlled-0'];h.queue=['controlled-1','controlled-2','controlled-3'];
  h.observations=[{time:0,queue:3,busy:1,capacity:1,releases:[2]}];
  const before=forecast(r,h,0);
  advance(r,2);
  assert(r.events.some(e=>e.type==='handover'));
  assert.equal(h.queue.length,2);
  assert(forecast(r,h,0).offload<before.offload);
});
test('old snapshots, reduced capacity and caps produce finite interpretable estimates', () => {
  const {r,h}=queueFixture();
  h.observations=[{time:0,queue:0,busy:2,capacity:1,releases:[4,12]}];
  assert.equal(forecast(r,h,0).projectedWait,2);
  delete h.observations[0].releases;
  assert.equal(forecast(r,h,0).projectedWait,0);
  h.observations[0].queue=100;
  const p=forecast(r,h,0);assert.equal(p.offload,180);assert.equal(p.capped,true);
});
test('historical/live baseline drives simulated outcomes and known inbound queue predictions',()=>{
 const r=createRun({...DEFAULT_CONFIG,manual:true,slots:1},'consistent');const h=r.hospitals[3];
 r.incidents=[{id:'first',time:0,lat:h.lat,lng:h.lng,care:'general',scene:0,serviceFactor:1,assignedAt:0},{id:'candidate',time:0,lat:h.lat,lng:h.lng,care:'general',scene:0,serviceFactor:1,assignedAt:0}];
 r.ambulances=[{id:'first',lat:h.lat,lng:h.lng,from:h,incidentId:'first',destination:h.id,status:'EN_ROUTE',until:1,routeStart:0},{id:'candidate',lat:h.lat,lng:h.lng,from:h,incidentId:'candidate',status:'AWAITING_DECISION',until:0,routeStart:0}];
 const option=choices(r,'candidate').find(c=>c.hospitalId===h.id);assert.equal(option.offload,44);assert.equal(option.queueAdjustment,16);
 decide(r,'candidate',h.id);advance(r,55);
 assert.equal(r.incidents[0].offload,28);assert.equal(r.incidents[1].offload,option.offload);assert.equal(r.incidents[1].wait,16);
});
test('a newly injected case starts at pickup and moves directly toward hospital',()=>{
 const r=createRun({...DEFAULT_CONFIG,manual:false,callsPerHour:1},'injected');r.incidents=[];
 const incident=injectEmergency(r,{lat:43.718,lng:-79.32});advance(r,1);assert.equal(incident.assignedAt,1);assert.equal(incident.pickedUpAt,1);
 const a=r.ambulances.find(a=>a.incidentId===incident.id);assert(a);const before={lat:a.lat,lng:a.lng};advance(r,1);
 assert(a.lat!==before.lat||a.lng!==before.lng);advance(r,180);assert(incident.completedAt);assert(incident.offload>0);assert(r.events.some(e=>e.type==='handover'));
});
test('matched evaluations share frozen ED observations and report travel plus offload',()=>{
 const evaluatedAt='2026-11-05T19:00:00Z';const liveEd={source:'ER Compass',readings:{},error:null,lastSuccessAt:evaluatedAt,checkedAt:evaluatedAt};
 const result=compare({...DEFAULT_CONFIG,duration:60},[1,2,3],{liveEd,liveEdEvaluatedAt:evaluatedAt});
 assert.deepEqual(result.inputs.liveEd,liveEd);assert.equal(result.inputs.liveEdEvaluatedAt,evaluatedAt);assert(result.summary.some(s=>s.metric==='meanTravelOffload'));
 for(const seed of result.seeds){const rows=result.rows.filter(r=>r.seed===seed);assert.equal(rows[0].metrics.generated,rows[1].metrics.generated);}
});
test('live ED input changes generated background offload as well as predictions',()=>{
 const r=createRun({...DEFAULT_CONFIG,manual:true,slots:1},'live-outcome');const h=r.hospitals[3];
 const date='2026-11-05T19:00:00Z';r.liveEdEvaluatedAt=date;r.liveEd={source:'ER Compass',checkedAt:date,lastSuccessAt:date,error:null,readings:{sun:{hospitalId:'sun',externalHospital:h.name,metric:'posted_wait_minutes',waitMinutes:180,referenceMinutes:90,referenceCount:30,referenceFrom:'2026-11-01T00:00:00Z',referenceTo:'2026-11-04T00:00:00Z',collectedAt:date,observedAt:date,timestampBasis:'collection',publisherAsOf:null}}};
 r.incidents=[{id:'live-case',time:0,lat:h.lat,lng:h.lng,care:'general',scene:0,serviceFactor:1,assignedAt:0}];r.ambulances=[{id:'unit',lat:h.lat,lng:h.lng,from:h,incidentId:'live-case',status:'AWAITING_DECISION',until:0,routeStart:0}];
 const option=choices(r,'unit').find(c=>c.hospitalId===h.id);assert.equal(option.offload,88);decide(r,'unit',h.id);advance(r,100);assert.equal(r.incidents[0].offload,88);assert.equal(r.incidents[0].wait,0);
});
test('pickup-only cases skip dispatch and scene stages; transport views exclude idle vehicles',()=>{
 const r=createRun({...DEFAULT_CONFIG,manual:true},'pickup-only');advance(r,15);
 const picked=r.incidents.filter(i=>i.pickedUpAt!==undefined);assert(picked.length>0);
 for(const i of picked){assert.equal(i.assignedAt,i.pickedUpAt);const a=r.ambulances.find(a=>a.incidentId===i.id);assert.equal(a.status,'AWAITING_DECISION');assert.equal(a.lat,i.lat);assert.equal(a.lng,i.lng);}
 assert(!r.events.some(e=>['dispatch','on_scene'].includes(e.type)));assert.equal(patientTransports(r).length,picked.length);
 assert(!patientTransports(r).some(a=>['AVAILABLE','ASSIGNED','ON_SCENE'].includes(a.status)));
});
test('unfinished transport counts exclude cases not yet picked up',()=>{
 const r=createRun({...DEFAULT_CONFIG,fleet:5,manual:true,callsPerHour:90},'cohort');advance(r,30);
 const m=metrics(r);assert(m.generated>m.pickedUp);assert.equal(m.pickedUp,5);assert.equal(m.unfinished,5);assert.equal(m.completed,0);
});
