import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCurrent, addHistoricalReference, createEdService, ED_HOSPITALS, REFRESH_MS } from '../lib/live-ed-service.ts';
import { liveEdAdjustment } from '../lib/live-ed.ts';
import { createRun, DEFAULT_CONFIG, choices, forecast, advance } from '../lib/simulation.ts';
const NOW=Date.parse('2026-11-05T19:00:00Z');
const iso=t=>new Date(t).toISOString();
// Mock records follow the verified public current/history API schemas.
function current(overrides={}) {return {hospital:ED_HOSPITALS.tgh,city:'Toronto',province:'ON',kind:'er',open_now:true,wait_minutes:120,fetched_at:iso(NOW),as_of:null,...overrides};}
function history(name=ED_HOSPITALS.tgh,metric='posted_wait_minutes') {return {hospital:name,metric,points:Array.from({length:30},(_,i)=>({fetched_at:iso(NOW-(i+2)*3600000),value:90}))};}
function reading(id='tgh',wait=120) {return addHistoricalReference(parseCurrent({hospitals:[current({hospital:ED_HOSPITALS[id],wait_minutes:wait})]},NOW)[0],history(ED_HOSPITALS[id]));}
function snapshot(r=reading()) {return {readings:{[r.hospitalId]:r},checkedAt:iso(NOW),lastSuccessAt:iso(NOW),error:null,source:'ER Compass'};}
test('verified current schema maps Toronto facilities only and rejects invalid waits and timestamps',()=>{
  const rows=Object.entries(ED_HOSPITALS).map(([,name])=>current({hospital:name}));
  assert.deepEqual(parseCurrent({hospitals:rows},NOW).map(r=>r.hospitalId),Object.keys(ED_HOSPITALS));
  const invalid=[{city:'Hamilton'},{province:'BC'},{hospital:"St. Joseph's Healthcare - Charlton Campus"},{kind:'urgent'},
    {wait_minutes:null},{wait_minutes:'120'},{wait_minutes:-1},{wait_minutes:Infinity},{wait_minutes:1500},
    {fetched_at:'bad'},{fetched_at:iso(NOW+120000)},{open_now:false},{wait_caveat:{kind:'average'}},{wait_quality:'unreliable'}];
  for(const row of invalid)assert.equal(parseCurrent({hospitals:[current(row)]},NOW).length,0);
  assert.throws(()=>parseCurrent({data:[]},NOW),/schema/);
  assert.equal(parseCurrent({hospitals:[current({wait_minutes:0})]},NOW)[0].waitMinutes,0);
});
test('observation time uses an unambiguous publisher timestamp, otherwise explicitly collection time',()=>{
  const publisher=iso(NOW-600000);
  assert.equal(parseCurrent({hospitals:[current({as_of:publisher})]},NOW)[0].timestampBasis,'publisher');
  const r=parseCurrent({hospitals:[current({as_of:'As of November 5 at 1:45 p.m.'})]},NOW)[0];
  assert.equal(r.timestampBasis,'collection');assert.equal(r.observedAt,iso(NOW));assert(r.publisherAsOf);
  assert.equal(parseCurrent({hospitals:[current({wait_stale_hours:2})]},NOW)[0].observedAt,iso(NOW-7200000));
});
test('reference requires same hospital and metric, enough observations, and excludes current hour',()=>{
  const raw=parseCurrent({hospitals:[current()]},NOW)[0];
  const valid=addHistoricalReference(raw,history());assert.equal(valid.referenceMinutes,90);assert.equal(valid.referenceCount,30);
  assert.equal(addHistoricalReference(raw,history('Another Hospital')).referenceMinutes,null);
  assert.equal(addHistoricalReference(raw,history(ED_HOSPITALS.tgh,'occupancy_pct')).referenceMinutes,null);
  assert.equal(addHistoricalReference(raw,{...history(),points:history().points.slice(0,5)}).referenceMinutes,null);
  const h=history();h.points.push({fetched_at:iso(NOW),value:1000});assert.equal(addHistoricalReference(raw,h).referenceCount,30);
});
test('fresh live adjustment increases with congestion; missing references and stale readings fade to historical',()=>{
  const s=snapshot();const low=liveEdAdjustment(s,'tgh',iso(NOW));
  assert.equal(low.liveStatus,'Live');assert.equal(low.liveAdjustment,20);
  const high=liveEdAdjustment(snapshot(reading('tgh',180)),'tgh',iso(NOW));assert(high.liveAdjustment>low.liveAdjustment);
  const stale=liveEdAdjustment(s,'tgh',iso(NOW+90*60000));assert.equal(stale.liveStatus,'Stale');assert(stale.liveAdjustment>0 && stale.liveAdjustment<20);
  const expired=liveEdAdjustment(s,'tgh',iso(NOW+180*60000));assert.equal(expired.liveStatus,'Historical Only');assert.equal(expired.liveAdjustment,0);
  assert.equal(liveEdAdjustment(s,'mgh',iso(NOW)).liveAdjustment,0);
  s.readings.tgh.referenceMinutes=null;assert.equal(liveEdAdjustment(s,'tgh',iso(NOW)).liveComparable,false);
});
test('cache coalesces requests, refreshes after 15m, retains valid data on failure and respects Retry-After',async()=>{
  let now=NOW,calls=0,fail=false;
  const fetcher=async url=>{calls++;if(fail)return new Response('',{status:429,headers:{'Retry-After':'1800'}});return Response.json(url.includes('/current')?{hospitals:[current()]}:history());};
  const service=createEdService(fetcher,()=>now);
  const [first,second]=await Promise.all([service.get(),service.get()]);assert.deepEqual(first,second);assert.equal(calls,2);
  first.readings.tgh.waitMinutes=999;assert.equal((await service.get()).readings.tgh.waitMinutes,120);assert.equal(calls,2);
  now+=REFRESH_MS+1;fail=true;const failed=await service.get();assert(failed.error);assert.equal(failed.readings.tgh.waitMinutes,120);assert.equal(calls,3);
  now+=REFRESH_MS+1;await service.get();assert.equal(calls,3);
  assert.equal(liveEdAdjustment(failed,'tgh',iso(NOW+4*3600000)).liveAdjustment,0);
});
test('invalid provider response and absent history never break simulation',async()=>{
  const service=createEdService(async()=>{throw new Error('offline');},()=>NOW);
  const r=createRun(DEFAULT_CONFIG,'offline');r.liveEd=await service.get();r.liveEdEvaluatedAt=iso(NOW);
  assert.equal(forecast(r,r.hospitals[0]).liveStatus,'Historical Only');advance(r,60);assert(r.time===60);
  const malformed=createEdService(async()=>Response.json({unexpected:true}),()=>NOW);assert((await malformed.get()).error);
  const noHistory=createEdService(async url=>url.includes('/current')?Response.json({hospitals:[current()]}):new Response('',{status:404}),()=>NOW);
  assert.equal((await noHistory.get()).readings.tgh.referenceMinutes,null);
});
test('updated observations affect routing, preserve future queues, and avoid duplicate ED penalties',()=>{
  const r=createRun({...DEFAULT_CONFIG,manual:true},'live-ranking');
  const origin={lat:43.65,lng:-79.38};
  for(const h of r.hospitals){h.lat=origin.lat;h.lng=origin.lng;}
  r.incidents=[{id:'patient',time:0,...origin,care:'general',scene:0,serviceFactor:1}];
  r.ambulances=[{id:'candidate',...origin,from:origin,status:'AWAITING_DECISION',incidentId:'patient',until:0,routeStart:0}];
  assert.equal(choices(r,'candidate')[0].hospitalId,'sun');
  r.liveEd=snapshot(reading('sun',180));r.liveEdEvaluatedAt=iso(NOW);
  assert.equal(choices(r,'candidate')[0].hospitalId,'mgh');
  const h=r.hospitals[3];h.observations=[{time:0,queue:8,busy:2,capacity:2,releases:[10,12]}];
  const live=forecast(r,h,3);assert.equal(live.congestionAdjustment,0);assert.equal(live.liveAdjustment,60);assert(live.queueAdjustment>0);
  const projected=live.projectedWait;r.liveEdEvaluatedAt=iso(NOW+4*3600000);const expired=forecast(r,h,3);
  assert.equal(expired.congestionAdjustment,0);assert.equal(expired.liveAdjustment,0);assert.equal(expired.queue,live.queue);assert.equal(expired.capacity,live.capacity);
  delete r.liveEd;delete r.liveEdEvaluatedAt;assert.deepEqual(forecast(r,h,3),{...expired,liveReading:null,liveAgeMinutes:null,liveDataReason:'not_reported'});
});
test('transient provider failures retry after one minute rather than hiding live data for fifteen',async()=>{
 let now=NOW,calls=0,offline=true;
 const service=createEdService(async url=>{calls++;if(offline)throw new Error('temporary connection failure');return Response.json(url.includes('/current')?{hospitals:[current({fetched_at:iso(now)})]}:history());},()=>now);
 const failed=await service.get();assert.equal(failed.failureReason,'temporary connection failure');assert.equal(calls,1);
 now+=59000;await service.get();assert.equal(calls,1);
 offline=false;now+=1001;const recovered=await service.get();assert.equal(recovered.error,null);assert.equal(recovered.failureReason,null);assert(recovered.readings.tgh);assert.equal(calls,3);
});
test('missing hospital coverage, loading and provider failure have distinct reasons',()=>{
 assert.equal(liveEdAdjustment(undefined,'mgh',iso(NOW)).liveDataReason,'not_reported');
 const empty={readings:{},checkedAt:null,lastSuccessAt:null,error:null,source:'ER Compass'};
 assert.equal(liveEdAdjustment(empty,'tgh','').liveDataReason,'loading');
 assert.equal(liveEdAdjustment({...empty,error:'offline'},'tgh',iso(NOW)).liveDataReason,'feed_error');
 assert.equal(liveEdAdjustment(snapshot(),'tgh',iso(NOW+4*3600000)).liveDataReason,'expired');
 assert.equal(liveEdAdjustment(snapshot(),'tgh',iso(NOW)).liveDataReason,null);
});
