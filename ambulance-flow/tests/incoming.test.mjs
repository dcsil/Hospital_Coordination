import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, createRun, advance, inbound, forecast } from '../lib/simulation.ts';
import { incomingAmbulances, simulationClock, arrivalIntervals } from '../lib/incoming.ts';

test('incoming list matches en-route ambulances and per-hospital inbound counts', () => {
  const run = createRun({ ...DEFAULT_CONFIG, callsPerHour: 40 }, 'incoming');
  for (let t = 0; t < 120; t++) {
    advance(run, 1);
    const all = incomingAmbulances(run);
    const enRoute = run.ambulances.filter(a => a.status === 'EN_ROUTE').map(a => a.id).sort();
    assert.deepEqual(all.map(r => r.ambulanceId).sort(), enRoute);
    for (const h of run.hospitals) {
      const rows = incomingAmbulances(run, h.id);
      assert.equal(rows.length, inbound(run, h));
      assert.ok(rows.every(r => r.hospitalId === h.id));
    }
  }
});

test('incoming rows are sorted by expected arrival and never report negative ETAs', () => {
  const run = createRun({ ...DEFAULT_CONFIG, callsPerHour: 60 }, 'sorted');
  for (let t = 0; t < 180; t++) {
    advance(run, 1);
    const rows = incomingAmbulances(run);
    for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].etaMinute <= rows[i].etaMinute);
    for (const r of rows) {
      assert.ok(r.etaMinutes >= 0);
      assert.equal(r.etaMinutes, Math.max(0, r.etaMinute - run.time));
    }
  }
});

test('incoming rows carry a valid care level and pickup time from the simulated case', () => {
  const run = createRun({ ...DEFAULT_CONFIG, callsPerHour: 60 }, 'care');
  advance(run, 180);
  for (const r of incomingAmbulances(run)) {
    assert.ok(['specialist', 'general'].includes(r.careLevel));
    const incident = run.incidents.find(i => i.id === r.incidentId);
    assert.ok(incident);
    assert.equal(r.pickedUpAt, incident.pickedUpAt);
  }
});

test('incoming view leaves the simulation and forecasts unchanged', () => {
  const a = createRun(DEFAULT_CONFIG, 'a');
  const b = createRun(DEFAULT_CONFIG, 'b');
  advance(a, 60);
  advance(b, 60);
  incomingAmbulances(a);
  for (const h of a.hospitals) incomingAmbulances(a, h.id);
  assert.deepEqual(a.events, b.events);
  assert.deepEqual(a.hospitals.map(h => forecast(a, h).offload), b.hospitals.map(h => forecast(b, h).offload));
});

test('simulation clock formats minutes from 08:00', () => {
  assert.equal(simulationClock(0), '08:00');
  assert.equal(simulationClock(75), '09:15');
});

test('arrival intervals partition every incoming ambulance exactly once, with no gaps', () => {
  const run = createRun({ ...DEFAULT_CONFIG, callsPerHour: 60 }, 'intervals');
  for (let t = 0; t < 150; t++) {
    advance(run, 1);
    const rows = incomingAmbulances(run);
    const buckets = arrivalIntervals(rows, 15);
    assert.equal(buckets.reduce((n, b) => n + b.ambulances.length, 0), rows.length);
    buckets.forEach((b, i) => {
      assert.equal(b.start, i * 15);
      assert.equal(b.end, b.start + 15);
      for (const r of b.ambulances) assert.ok(r.etaMinutes >= b.start && r.etaMinutes < b.end);
    });
  }
});

test('arrival intervals include the last arrival and handle an empty list', () => {
  const row = (eta) => ({ ambulanceId: `AMB-${eta}`, incidentId: 'C', hospitalId: 'h', hospitalName: 'H', careLevel: 'general', etaMinute: eta, etaMinutes: eta });
  const buckets = arrivalIntervals([row(0), row(30)], 15);
  assert.deepEqual(buckets.map(b => b.ambulances.length), [1, 0, 1]);
  assert.equal(arrivalIntervals([], 15).length, 1);
  assert.throws(() => arrivalIntervals([], 0));
});
