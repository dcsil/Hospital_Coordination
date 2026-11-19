import test from 'node:test';
import assert from 'node:assert/strict';
import { fitOffloadModels, parseObservations, selectOffloadModel, MODEL_MAX_AGE_MS } from '../lib/offload-model.ts';
import { predictHospital } from '../lib/hospital-offload.ts';
const start=Date.parse('2026-10-30T00:00:00Z');
const iso=t=>new Date(t).toISOString();
function records(n=200, minutes=12) {
 return Array.from({length:n},(_,i)=>{const t=start+i*2*3600000;return {id:`event-${i}`,hospitalId:'sun',source:'observed',decisionAt:iso(t),arrivedAt:iso(t+60000),transferredAt:iso(t+(minutes+1)*60000),availableAt:iso(t+(minutes+2)*60000)};});
}
const asOf=iso(start+200*2*3600000);
test('empty/aggregate-only data produces no trained model and no invented interval',()=>{
 const result=fitOffloadModels([],{sun:28},asOf);assert.deepEqual(result.artifact.hospitals,{});
 assert.equal(result.reports.sun.status,'insufficient_observed_offloads');
 const p=predictHospital('sun',undefined,asOf,{},result.artifact);
 assert.equal(p.offload,28);assert.equal(p.estimateKind,'historical-average');assert.equal(p.interval,null);assert.equal(p.lower,null);
});
test('chronological candidate beats historical baseline, reports independent later metrics, and ships no encounters',()=>{
 const result=fitOffloadModels(records(),{sun:28},asOf);const m=result.artifact.hospitals.sun;assert(m);
 assert.equal(m.estimateMinutes,12);assert.equal(m.validation.mae,0);assert.equal(m.validation.historicalMae,16);
 assert.equal(m.validation.testCount,30);assert.equal(m.validation.calibrationCount,30);assert.equal(m.validation.intervalCoverage,1);
 assert.equal(m.validation.testFrom,records()[170].decisionAt);assert(!JSON.stringify(result.artifact).includes('event-'));
 const p=predictHospital('sun',undefined,asOf,{},result.artifact);assert.equal(p.offload,12);assert.equal(p.estimateKind,'observed-rolling-median');assert.equal(p.actualCompletions,200);
});
test('future or delayed-entry outcomes cannot change an as-of model',()=>{
 const base=records();const original=fitOffloadModels(base,{sun:28},asOf);
 const future={...base[0],id:'future',decisionAt:iso(start+401*3600000),arrivedAt:iso(start+402*3600000),transferredAt:iso(start+410*3600000),availableAt:iso(start+411*3600000)};
 const delayed={...base[1],id:'delayed',availableAt:iso(start+500*3600000)};
 assert.deepEqual(fitOffloadModels([...base,future,delayed],{sun:28},asOf),original);
 assert.deepEqual(fitOffloadModels([...base].reverse(),{sun:28},asOf),original);
});
test('no improvement on the untouched test block keeps historical fallback',()=>{
 const result=fitOffloadModels(records(),{sun:12},asOf);assert.equal(result.reports.sun.status,'did_not_beat_baselines');assert.deepEqual(result.artifact.hospitals,{});
});
test('held-out deterioration is reported and rejected, not used to retune',()=>{
 const data=records();for(let i=170;i<200;i++){const t=Date.parse(data[i].arrivedAt);data[i].transferredAt=iso(t+28*60000);data[i].availableAt=iso(t+29*60000);}
 const result=fitOffloadModels(data,{sun:28},asOf);assert.equal(result.reports.sun.status,'did_not_beat_baselines');assert(result.reports.sun.validation.mae>0);
});
test('observed long delays are preserved rather than clipped to a simulation cap',()=>{
 const result=fitOffloadModels(records(200,240),{sun:28},iso(start+404*3600000));
 const m=result.artifact.hospitals.sun;assert(m);assert.equal(m.estimateMinutes,240);
 assert.equal(predictHospital('sun',undefined,result.artifact.asOf,{},result.artifact).offload,240);
});
test('model expires, cannot be used before fitting, and cannot cross hospitals',()=>{
 const {artifact}=fitOffloadModels(records(),{sun:28},asOf);
 assert.equal(selectOffloadModel(artifact,'sun',iso(Date.parse(asOf)+MODEL_MAX_AGE_MS+1)).reason,'observed_model_stale');
 assert.equal(selectOffloadModel(artifact,'sun',iso(Date.parse(asOf)-1)).reason,'invalid_model_time');
 assert.equal(selectOffloadModel(artifact,'tgh',asOf).model,null);
 assert.equal(selectOffloadModel(artifact,'sun').model,null);
});
test('reject simulated outcomes, missing/invalid timestamps, duplicate IDs and impossible chronology',()=>{
 const r=records(1)[0];
 for(const modified of [{source:'simulated'},{arrivedAt:null},{availableAt:'2026-01-01'},{transferredAt:r.decisionAt},{decisionAt:r.availableAt}])assert.throws(()=>parseObservations([{...r,...modified}]));
 assert.throws(()=>parseObservations([r,r]),/duplicate/);assert.throws(()=>parseObservations({meanMinutes:28}));
 assert.throws(()=>fitOffloadModels([],{sun:28},'bad'));
});
test('ED measurements and old coefficient overrides cannot affect the offload estimate',()=>{
 const s={readings:{sun:{observedAt:asOf,waitMinutes:500,referenceMinutes:90,referenceCount:30}},checkedAt:asOf,lastSuccessAt:asOf,error:null,source:'ER Compass'};
 const p=predictHospital('sun',s,asOf,{liveCoefficientMinutes:60});assert.equal(p.offload,28);assert.equal(p.liveAdjustment,0);assert.equal(p.edUsedForOffload,false);assert.equal(p.liveStatus,'Live');
});

test('corrupt model summaries fail closed and prototype names cannot select a model',()=>{
 const {artifact}=fitOffloadModels(records(),{sun:28},asOf);
 assert.equal(selectOffloadModel(artifact,'constructor',asOf).reason,'no_observed_model');
 artifact.hospitals.sun.latestAvailableAt='bad';assert.equal(selectOffloadModel(artifact,'sun',asOf).reason,'invalid_model');
});
