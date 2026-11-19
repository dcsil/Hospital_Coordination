import test from 'node:test';
import assert from 'node:assert/strict';
import {PUBLIC_OFFLOAD_MODEL,publicOffloadPrediction,torontoCalendar} from '../lib/public-offload.ts';
import {predictHospital} from '../lib/hospital-offload.ts';
import {journeyNetwork} from '../lib/patient-journey.ts';
import {createRun,forecast,DEFAULT_CONFIG} from '../lib/simulation.ts';
const now='2026-11-19T19:00:00Z';
test('shipped public model was fitted to real source outcomes and reports external held-out accuracy',()=>{
 const m=PUBLIC_OFFLOAD_MODEL;assert.equal(m.source.rows,50000);assert.equal(m.source.hospitals,11);assert.equal(m.validation.testCount,7802);
 assert(m.validation.model.maeMinutes<m.validation.hospitalMeanBaseline.maeMinutes);
 assert.equal(m.validation.torontoValidated,false);assert(m.validation.model.biasMinutes < -9);
 assert.equal(m.calendarCoefficients.length,10);assert(m.training.calibrationCount>1000);
 assert(m.validation.central80Coverage>.75&&m.validation.central80Coverage<.85);
});
test('calendar transfer changes time-dependent forecasts without adding an ED penalty',()=>{
 const a=predictHospital('tgh',undefined,now);const b=predictHospital('tgh',undefined,'2026-11-19T09:00:00Z');
 assert.equal(a.estimateKind,'public-transfer');assert.notEqual(a.offload,b.offload);assert.equal(a.actualCompletions,null);
 const live={readings:{tgh:{observedAt:now,waitMinutes:600,referenceMinutes:90,referenceCount:30}},source:'ER Compass'};
 assert.equal(predictHospital('tgh',live,now).offload,a.offload);assert.equal(a.liveAdjustment,0);
 assert(a.publicModel.lower<a.offload&&a.publicModel.upper>a.offload);
});
test('published P90 is a distribution anchor and never substituted as the mean',()=>{
 const p=publicOffloadPrediction('sun',28,now);assert.equal(p.anchor.statistic,'p90');assert.equal(p.anchor.minutes,58);
 const expected=(59/PUBLIC_OFFLOAD_MODEL.unconditionalP90Ratio)*p.calendarFactor-1;
 assert(Math.abs(p.expectedMinutes-expected)<1e-10);assert.notEqual(p.expectedMinutes,58);
 assert.equal(publicOffloadPrediction('tgh',58,now).anchor.statistic,'mean');
});
test('Toronto local calendar handles offsets and DST, and rejects invalid times and unknown sites',()=>{
 assert.deepEqual(torontoCalendar(now),torontoCalendar('2026-11-19T14:00:00-05:00'));
 assert.equal(torontoCalendar('2026-07-01T16:00:00Z').hour,12);
 assert.equal(torontoCalendar('2026-12-01T17:00:00Z').hour,12);
 assert.equal(publicOffloadPrediction('unknown',43,now),null);assert.equal(publicOffloadPrediction('sun',28),null);
 assert.equal(publicOffloadPrediction('sun',28,'bad'),null);
 assert.equal(publicOffloadPrediction('sun',28,'2025-01-01T00:00:00Z'),null);
 assert.equal(publicOffloadPrediction('sun',28,now,'2025-01-01T00:00:00Z'),null);
});
test('journey evaluates the calendar at each hospital arrival horizon',()=>{
 const roads={minutes:{tgh:30,twh:30,mgh:30,sun:30,sjh:30}};
 const network=journeyNetwork(undefined,now,roads);
 for(const p of network.ranked){assert.equal(p.publicModel.arrivalAt,'2026-11-19T19:30:00.000Z');assert.equal(p.total,Math.round((30+p.offload)*10)/10);}
});
test('public transfer can be disabled; it never trains or modifies synthetic outcomes',()=>{
 assert.equal(predictHospital('sun',undefined,now,{publicModel:false}).offload,28);
 const r=createRun(DEFAULT_CONFIG,'separation');r.liveEdEvaluatedAt=now;
 const p=forecast(r,r.hospitals[3]);assert.equal(p.publicModel,null);assert.equal(p.offload,28);assert.equal(p.estimateKind,'simulation');
});
