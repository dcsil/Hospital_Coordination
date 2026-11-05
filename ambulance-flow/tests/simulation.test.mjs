import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, createRun, advance, incidentSchedule, choices, decide, forecast, inbound, metrics, observed, setCapacity, compare } from '../lib/simulation.ts';

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
    const m = metrics(r); assert.equal(m.completed + m.unfinished, m.generated); assert(m.availability >= 0 && m.availability <= 100);
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
test('arrival-time queue accounts for ETA order, capacity and baseline waiting allowance', () => {
  const {r,h}=queueFixture();
  r.ambulances.push({id:'inbound',destination:h.id,status:'EN_ROUTE',until:5});
  const early=forecast(r,h,10);
  assert.equal(early.projectedWait,13);
  assert.equal(early.queueAdjustment,3); // baseline 28 includes 10 minutes ordinary waiting
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
  assert.equal(before.projectedWait,56);
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
  assert.equal(forecast(r,h,0).projectedWait,12);
  delete h.observations[0].releases;
  assert.equal(forecast(r,h,0).projectedWait,9);
  h.observations[0].queue=100;
  const p=forecast(r,h,0);assert.equal(p.offload,180);assert.equal(p.capped,true);
});
