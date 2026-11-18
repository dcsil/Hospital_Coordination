import test from 'node:test';
import assert from 'node:assert/strict';
import { predictHospital,hospitalPredictions } from '../lib/hospital-offload.ts';
import { journeyNetwork,resolveLocation } from '../lib/patient-journey.ts';
import { createRoadService,estimatedTravel } from '../lib/road-travel.ts';
const now='2026-11-05T19:00:00Z';
function snapshot(age=0) {return {source:'ER Compass',checkedAt:now,lastSuccessAt:now,error:null,readings:{sun:{hospitalId:'sun',externalHospital:'Sunnybrook Health Sciences Centre',metric:'posted_wait_minutes',waitMinutes:180,collectedAt:now,observedAt:new Date(Date.parse(now)-age*60000).toISOString(),timestampBasis:'collection',publisherAsOf:null,referenceMinutes:90,referenceCount:30,referenceFrom:'2026-11-03T00:00:00Z',referenceTo:'2026-11-05T17:00:00Z'}}};}
test('historical-only estimates use actual matched baselines and never manufacture operational values',()=>{
 const predictions=hospitalPredictions();assert.equal(predictions.length,5);assert.deepEqual(predictions.map(p=>p.offload),[58,59,36,28,60]);
 for(const p of predictions){assert.equal(p.queue,null);assert.equal(p.inbound,null);assert.equal(p.capacity,null);assert.equal(p.actualMeanOffload,null);assert.equal(p.actualCompletions,null);assert.equal(p.liveAdjustment,0);assert.equal(p.liveStatus,'Historical Only');assert(!('queueAdjustment' in p));assert(!('capabilities' in p));}
});
test('real-source prediction is baseline plus live adjustment, stale fades and expired falls back exactly',()=>{
 assert.equal(predictHospital('sun',snapshot(),now).offload,88);
 const stale=predictHospital('sun',snapshot(90),now);assert(stale.offload>28&&stale.offload<88);assert.equal(stale.liveStatus,'Stale');
 assert.equal(predictHospital('sun',snapshot(180),now).offload,28);
 const missingReference=snapshot();missingReference.readings.sun.referenceMinutes=null;assert.equal(predictHospital('sun',missingReference,now).offload,28);
 assert.equal(predictHospital('unknown').baseline,43);assert.equal(predictHospital('unknown').fallback,true);
});
test('hospital recommendation changes on real readings without incidents, capacity or synthetic eligibility',()=>{
 assert.equal(journeyNetwork().ranked[0].id,'sun');
 const live=journeyNetwork(snapshot(),now);assert.equal(live.ranked[0].id,'mgh');assert.equal(live.ranked.length,5);
 for(const h of live.ranked){assert.equal(h.travel,null);assert.equal(h.total,null);}assert.equal(live.rankBy,'offload');assert(!('run' in live));
});
test('only supplied travel contributes to totals; partial travel never becomes a zero-minute assumption',()=>{
 const roads={minutes:{tgh:1,twh:2,mgh:40,sun:40,sjh:1},source:'Estimated simulation travel',fetchedAt:now,error:null};
 const network=journeyNetwork(undefined,undefined,roads);assert.equal(network.rankBy,'total');assert.equal(network.ranked[0].id,'tgh');
 for(const h of network.ranked)assert.equal(h.total,Math.round((h.travel+h.offload)*10)/10);
 roads.minutes.sun=null;const partial=journeyNetwork(undefined,undefined,roads);assert.equal(partial.rankBy,'offload');assert.equal(partial.ranked[0].total,null);
});
test('temporary travel is explicitly estimated and matches simulator travel',async()=>{
 const origin=resolveLocation('Union Station');const result=await createRoadService(()=>Date.parse(now)).get(origin);
 assert.equal(result.source,'Estimated simulation travel');assert.equal(result.error,null);
 for(const minutes of Object.values(result.minutes))assert(Number.isFinite(minutes)&&minutes>=3);
 assert.equal(estimatedTravel(origin,origin),3);
});
test('location parsing accepts supplied Toronto origins and rejects unknown locations',()=>{
 assert.deepEqual(resolveLocation('43.65, -79.38'),{lat:43.65,lng:-79.38});assert(resolveLocation('Union Station'));assert.equal(resolveLocation('0,0'),null);assert.equal(resolveLocation('invented address'),null);
});
test('Overview forecasts use active simulation queues and update as handover releases approach',async()=>{
 const {createRun,DEFAULT_CONFIG,advance}=await import('../lib/simulation.ts');
 const run=createRun({...DEFAULT_CONFIG,slots:1},'overview');const h=run.hospitals[3];
 run.incidents=[{id:'active',time:0,pickedUpAt:0,assignedAt:0,lat:h.lat,lng:h.lng,care:'general',scene:0,serviceFactor:1}];
 const a=run.ambulances[0];Object.assign(a,{status:'HANDOVER',incidentId:'active',destination:h.id,until:40,arrivalAt:0,lat:h.lat,lng:h.lng});h.active=[a.id];h.observations=[{time:0,queue:0,busy:1,capacity:1,releases:[40],readyAt:[]}];
 const roads={minutes:{tgh:5,twh:8,mgh:15,sun:20,sjh:17},source:'Estimated simulation travel',fetchedAt:now,error:null};
 const before=journeyNetwork(undefined,undefined,roads,run).ranked.find(h=>h.id==='sun');assert.equal(before.offload,38);assert.equal(before.queueAdjustment,10);
 advance(run,5);const after=journeyNetwork(undefined,undefined,roads,run).ranked.find(h=>h.id==='sun');assert.equal(after.offload,33);assert.equal(after.queueAdjustment,5);assert.equal(after.total,53);
});
test('arrival confirmation storage validates destinations, times and nullable estimates',async()=>{
 const {overviewTripSchema}=await import('../lib/patient-journey.ts');
 const trip={destination:{id:'sun',name:'Sunnybrook',address:'2075 Bayview Avenue',lat:43.722,lng:-79.377},travel:null,offload:28,total:null,startedAt:100,arrivedAt:null};
 assert(overviewTripSchema.safeParse(trip).success);assert(overviewTripSchema.safeParse({...trip,arrivedAt:150}).success);
 assert(!overviewTripSchema.safeParse({...trip,arrivedAt:50}).success);assert(!overviewTripSchema.safeParse({...trip,offload:-1}).success);assert(!overviewTripSchema.safeParse({...trip,destination:{...trip.destination,lat:200}}).success);
});
