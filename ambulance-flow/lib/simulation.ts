import { hospitalHistory, DEFAULT_PREDICTION } from './historical-data.ts';
/** Deterministic, minute-step research simulator. No real clinical routing. */
export type Policy = 'nearest' | 'coordinated';
export type Preset = 'normal' | 'surge' | 'stale';
export type Status = 'AVAILABLE' | 'ASSIGNED' | 'ON_SCENE' | 'AWAITING_DECISION' | 'EN_ROUTE' | 'WAITING_TO_OFFLOAD' | 'HANDOVER';
export type Point = { lat: number; lng: number };
export type Config = { name: string; preset: Preset; fleet: number; hospitals: number; duration: number; seed: number; callsPerHour: number; slots: number; serviceMinutes: number; informationDelay: number; policy: Policy; manual: boolean; prediction?: Partial<typeof DEFAULT_PREDICTION> };
export const DEFAULT_CONFIG: Config = { name: 'Toronto · Morning shift', preset: 'normal', fleet: 20, hospitals: 5, duration: 240, seed: 42, callsPerHour: 28, slots: 2, serviceMinutes: 18, informationDelay: 0, policy: 'coordinated', manual: false };
export const HOSPITAL_SITES = [
  { id: 'tgh', name: 'Toronto General', short: 'TGH', lat: 43.659, lng: -79.388, address: '200 Elizabeth Street', source: 'https://www.uhn.ca/corporate/Directions/' },
  { id: 'twh', name: 'Toronto Western', short: 'TWH', lat: 43.653, lng: -79.406, address: '399 Bathurst Street', source: 'https://www.uhn.ca/corporate/Directions/' },
  { id: 'mgh', name: 'Michael Garron', short: 'MGH', lat: 43.690, lng: -79.326, address: '825 Coxwell Avenue', source: 'https://www.tehn.ca/' },
  { id: 'sun', name: 'Sunnybrook', short: 'SUN', lat: 43.722, lng: -79.377, address: '2075 Bayview Avenue', source: 'https://sunnybrook.ca/locations/' },
  { id: 'sjh', name: 'St. Joseph’s', short: 'SJH', lat: 43.640, lng: -79.450, address: '30 The Queensway', source: 'https://www.ontario.ca/page/general-hospital-locations' },
  ...Array.from({ length: 5 }, (_, i) => ({ id: `virtual-${i}`, name: `Virtual site ${i + 6}`, short: `V${i + 6}`, lat: 43.67 + (i % 3) * .023, lng: -79.47 + i * .035, address: 'Synthetic location', source: '' })),
];
export type Hospital = typeof HOSPITAL_SITES[number] & { capacity: number; service: number; capabilities: string[]; queue: string[]; active: string[]; completions: number[]; observations: { time: number; queue: number; busy: number; capacity: number; releases?: number[] }[] };
export type Incident = Point & { id: string; time: number; care: string; scene: number; serviceFactor: number; assignedAt?: number; completedAt?: number; ambulanceId?: string; travel?: number; offload?: number; wait?: number; hospitalId?: string };
export type Ambulance = Point & { id: string; status: Status; incidentId?: string; destination?: string; until: number; from: Point; routeStart: number; arrivalAt?: number };
export type SimEvent = { sequence: number; time: number; type: string; message: string; ambulanceId?: string; hospitalId?: string };
export type Sample = { time: number; available: number; waiting: number; inbound: number; completed: number; meanOffload: number };
export type Run = { id: string; scenarioId: string; config: Config; status: 'running' | 'paused' | 'completed' | 'stopped'; time: number; revision: number; hospitals: Hospital[]; ambulances: Ambulance[]; incidents: Incident[]; events: SimEvent[]; sequence: number; history: Sample[]; availableMinutes: number; surgeInjected: boolean; createdAt: string };
export type Choice = { hospitalId: string; name: string; eligible: boolean; reason: string; travel: number; offload: number; lower: number; upper: number; total: number; queue: number; inbound: number; age: number; capacity: number; baseline: number; congestionAdjustment: number; queueAdjustment: number; projectedQueue: number; oldOffload: number; fallback: boolean; projectedWait: number; edRelativeCongestion: number };
export function rng(seed: number) { let s = seed >>> 0; return () => { s += 0x6D2B79F5; let t = Math.imul(s ^ s >>> 15, 1 | s); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const round = (n: number) => Math.round(n * 10) / 10;
export function distance(a: Point, b: Point) { const dy = (a.lat - b.lat) * 111; const dx = (a.lng - b.lng) * 80.4; return Math.sqrt(dx * dx + dy * dy); }
export function travelTime(a: Point, b: Point) { return Math.max(3, Math.ceil(distance(a, b) * 1.35 / .55)); }
export function incidentSchedule(config: Config): Incident[] {
  const random = rng(config.seed); const result: Incident[] = []; let time = 0;
  while (time < config.duration) {
    const surge = config.preset === 'surge' && time >= config.duration / 4 && time < config.duration / 2;
    time += -Math.log(Math.max(.000001, 1 - random())) * 60 / (config.callsPerHour * (surge ? 2.2 : 1));
    if (time >= config.duration) break;
    result.push({ id: `CASE-${String(result.length + 1).padStart(3, '0')}`, time: Math.ceil(time), lat: 43.645 + random() * .073, lng: -79.455 + random() * .135, care: random() < .18 ? 'specialist' : 'general', scene: 3 + Math.floor(random() * 6), serviceFactor: .65 + random() * .7 });
  }
  return result;
}
export function record(run: Run, type: string, message: string, ambulanceId?: string, hospitalId?: string) { run.events.push({ sequence: ++run.sequence, time: run.time, type, message, ambulanceId, hospitalId }); }
export function createRun(config: Config, id: string, scenarioId = ''): Run {
  const random = rng(config.seed + 10000);
  const hospitals = HOSPITAL_SITES.slice(0, config.hospitals).map((h, i): Hospital => ({ ...h, capacity: config.slots, service: config.serviceMinutes * (i === 0 ? 1.3 : i === 2 ? .85 : 1), capabilities: i % 2 === 0 ? ['general', 'specialist'] : ['general'], queue: [], active: [], completions: [], observations: [{ time: 0, queue: 0, busy: 0, capacity: config.slots }] }));
  const ambulances = Array.from({ length: config.fleet }, (_, i): Ambulance => { const point = { lat: 43.65 + random() * .065, lng: -79.45 + random() * .12 }; return { id: `AMB-${101 + i}`, ...point, from: point, status: 'AVAILABLE', until: 0, routeStart: 0 }; });
  const run: Run = { id, scenarioId, config: { ...config }, status: 'running', time: 0, revision: 0, hospitals, ambulances, incidents: incidentSchedule(config), events: [], sequence: 0, history: [], availableMinutes: 0, surgeInjected: false, createdAt: new Date().toISOString() };
  record(run, 'started', `${config.name} started with ${config.fleet} ambulances.`); sample(run); return run;
}
export function observed(run: Run, h: Hospital) {
  const delay = Math.max(run.config.informationDelay, run.config.preset === 'stale' ? 15 : 0);
  const target = run.time - delay;
  return [...h.observations].reverse().find(o => o.time <= target) ?? h.observations[0];
}
export function inbound(run: Run, h: Hospital, horizon = Infinity, exclude?: string) { return run.ambulances.filter(a => a.id !== exclude && a.destination === h.id && a.status === 'EN_ROUTE' && a.until <= run.time + horizon).length; }
export function legacyForecast(run: Run, h: Hospital, horizon = 15, exclude?: string) {
  const o = observed(run, h); const arrivals = inbound(run, h, horizon, exclude);
  // Workload estimate uses delayed reports plus known commitments, never hidden truth.
  const remaining = Math.max(0, (o.queue + o.busy) * h.service - o.capacity * horizon);
  const offload = o.capacity === 0 ? 180 : Math.min(180, h.service + (remaining + arrivals * h.service) / o.capacity);
  const uncertainty = h.service * .3 + (run.time - o.time) * .8 + arrivals * 1.5;
  return { offload: round(offload), lower: round(Math.max(h.service * .5, offload - uncertainty)), upper: round(offload + uncertainty), queue: o.queue, inbound: arrivals, age: run.time - o.time, capacity: o.capacity, projectedQueue: round(Math.max(0, o.queue + o.busy + arrivals - o.capacity * horizon / h.service)) };
}
/** Project FIFO work on reported handover lanes to the candidate's arrival time.
 * Snapshots contain reported release times; old saved snapshots use half-service
 * residuals. No future incidents or hidden current hospital queue are read.
 */
export function forecast(run: Run, h: Hospital, horizon = 15, exclude?: string) {
  const o = observed(run, h);
  const history = hospitalHistory(h.id);
  const tuning = { ...DEFAULT_PREDICTION, ...run.config.prediction };
  const target = run.time + Math.max(0, horizon);
  const arrivals = run.ambulances.filter(a => a.id !== exclude && a.destination === h.id && a.status === 'EN_ROUTE' && a.until <= target).sort((a,b) => a.until - b.until || a.id.localeCompare(b.id));
  const baseline = history.baseline;
  const closed = o.capacity <= 0;
  const releases = (o.releases ?? Array.from({length:o.busy}, () => o.time + h.service / 2)).slice().sort((a,b) => a-b);
  // If capacity shrank below the active count, new jobs wait until enough finish.
  const lanes = closed ? [] : Array.from({length:o.capacity}, (_,i) => releases[Math.max(0, releases.length-o.capacity)+i] ?? o.time);
  const starts: number[] = [];
  function enqueue(at: number) {
    const lane = lanes.indexOf(Math.min(...lanes));
    const start = Math.max(at, lanes[lane]);
    lanes[lane] = start + h.service;
    starts.push(start);
  }
  if (!closed) {
    for (let i=0; i<o.queue; i++) enqueue(o.time);
    for (const a of arrivals) enqueue(Math.max(o.time, a.until));
  }
  const projectedWait = closed ? tuning.maxMinutes : Math.max(0, Math.min(...lanes) - target);
  const projectedQueue = closed ? o.queue + arrivals.length : starts.filter(t => t > target).length;
  const utilization = closed ? 1 : lanes.filter(t => t > target).length / o.capacity;
  // Historical offload already includes ordinary waiting. Only add queue delay
  // beyond baseline minus handover time, avoiding adding that waiting twice.
  const embeddedWait = Math.max(0, baseline - h.service);
  const congestionAdjustment = round(baseline * tuning.congestionWeight * (history.edRelativeCongestion - 1) * utilization);
  const queueAdjustment = round(Math.max(0, projectedWait - embeddedWait) * tuning.queueWeight);
  const uncapped = baseline + congestionAdjustment + queueAdjustment;
  const offload = closed ? tuning.maxMinutes : Math.min(tuning.maxMinutes, Math.max(1, uncapped));
  const uncertainty = baseline * .3 + (run.time-o.time) * .8 + arrivals.length * 1.5;
  return { offload: round(offload), lower: round(Math.max(1,offload-uncertainty)), upper: round(offload+uncertainty),
    baseline, congestionAdjustment, queueAdjustment, projectedWait: round(projectedWait), projectedQueue,
    queue: o.queue, inbound: arrivals.length, age: run.time-o.time, capacity: o.capacity,
    oldOffload: legacyForecast(run,h,horizon,exclude).offload, fallback: history.fallback,
    edRelativeCongestion: history.edRelativeCongestion, capped: !closed && uncapped > tuning.maxMinutes, closed };
}
export function choices(run: Run, ambulanceId: string): Choice[] {
  const a = run.ambulances.find(v => v.id === ambulanceId); if (!a) throw new Error('Ambulance not found.');
  const incident = run.incidents.find(i => i.id === a.incidentId);
  return run.hospitals.map(h => { const travel = travelTime(a, h); const p = forecast(run, h, travel, a.id); const eligible = !!incident && h.capabilities.includes(incident.care) && p.capacity > 0; return { hospitalId: h.id, name: h.name, eligible, reason: !incident ? 'No active case' : !h.capabilities.includes(incident.care) ? 'Required simulated capability unavailable' : p.capacity === 0 ? 'Reported capacity unavailable' : `${p.inbound} inbound · report ${p.age}m old`, travel, ...p, total: round(travel + p.offload) }; }).sort((a, b) => Number(b.eligible) - Number(a.eligible) || (run.config.policy === 'nearest' ? a.travel - b.travel : a.total - b.total));
}
export function decide(run: Run, ambulanceId: string, hospitalId: string, approval = 'dispatcher') {
  const a = run.ambulances.find(v => v.id === ambulanceId);
  if (!a || a.status !== 'AWAITING_DECISION') throw new Error('This ambulance is not awaiting a destination.');
  const option = choices(run, ambulanceId).find(c => c.hospitalId === hospitalId);
  if (!option?.eligible) throw new Error('Destination does not satisfy the configured simulation constraints.');
  const incident = run.incidents.find(i => i.id === a.incidentId)!;
  a.destination = hospitalId; a.status = 'EN_ROUTE'; a.from = { lat: a.lat, lng: a.lng }; a.routeStart = run.time; a.until = run.time + option.travel;
  incident.travel = option.travel; incident.hospitalId = hospitalId;
  record(run, 'destination', `${a.id} committed to ${option.name} (${approval}; ${option.travel}m travel).`, a.id, hospitalId);
}
export function setCapacity(run: Run, hospitalId: string, capacity: number) {
  const h = run.hospitals.find(h => h.id === hospitalId); if (!h) throw new Error('Hospital not found.');
  h.capacity = capacity; h.observations.push({ time: run.time, queue: h.queue.length, busy: h.active.length, capacity, releases: h.active.map(id => run.ambulances.find(a => a.id === id)!.until) });
  record(run, 'capacity', `${h.name} capacity changed to ${capacity} simulated handover slots.`, undefined, h.id);
}
export function metrics(run: Run) {
  const completed = run.incidents.filter(i => i.completedAt !== undefined); const offloads = completed.map(i => i.offload!).sort((a, b) => a - b);
  const mean = (v: number[]) => v.length ? round(v.reduce((a, b) => a + b, 0) / v.length) : 0;
  const arrived = run.incidents.filter(i => i.time <= run.time);
  return { completed: completed.length, generated: arrived.length, unfinished: arrived.length - completed.length, pending: arrived.filter(i => i.assignedAt === undefined).length, meanOffload: mean(offloads), p90Offload: offloads.length ? offloads[Math.ceil(offloads.length * .9) - 1] : 0, meanTravel: mean(completed.map(i => i.travel!)), meanWait: mean(completed.map(i => i.wait!)), meanResponse: mean(completed.map(i => i.assignedAt! - i.time)), availability: run.time ? round(run.availableMinutes / (run.time * run.config.fleet) * 100) : 100 };
}
function sample(run: Run) { const m = metrics(run); run.history.push({ time: run.time, available: run.ambulances.filter(a => a.status === 'AVAILABLE').length, waiting: run.hospitals.reduce((n, h) => n + h.queue.length, 0), inbound: run.ambulances.filter(a => a.status === 'EN_ROUTE').length, completed: m.completed, meanOffload: m.meanOffload }); }
export function advance(run: Run, minutes: number): Run {
  if (run.status !== 'running') return run;
  for (let step = 0; step < minutes && run.time < run.config.duration; step++) {
    run.availableMinutes += run.ambulances.filter(a => a.status === 'AVAILABLE').length;
    run.time++;
    if (run.config.preset === 'surge' && !run.surgeInjected && run.time >= run.config.duration / 4) { setCapacity(run, run.hospitals[0].id, 1); run.surgeInjected = true; record(run, 'surge', 'Demand surge began; first hospital reduced to one handover slot.'); }
    for (const a of run.ambulances) {
      const i = run.incidents.find(i => i.id === a.incidentId);
      if (a.status === 'HANDOVER' && a.until <= run.time && i) {
        const h = run.hospitals.find(h => h.id === a.destination)!;
        h.active = h.active.filter(id => id !== a.id); i.completedAt = run.time; i.offload = run.time - a.arrivalAt!; h.completions.push(i.offload);
        record(run, 'handover', `${a.id} handover completed at ${h.name}; ${i.offload}m offload.`, a.id, h.id);
        a.status = 'AVAILABLE'; a.incidentId = undefined; a.destination = undefined; a.arrivalAt = undefined;
      } else if (a.status === 'ASSIGNED' && a.until <= run.time && i) { a.lat = i.lat; a.lng = i.lng; a.status = 'ON_SCENE'; a.until = run.time + i.scene; record(run, 'on_scene', `${a.id} on scene for ${i.id}.`, a.id); }
      else if (a.status === 'ON_SCENE' && a.until <= run.time) { a.status = 'AWAITING_DECISION'; record(run, 'decision_needed', `${a.id} ready for destination selection.`, a.id); }
      else if (a.status === 'EN_ROUTE') {
        const h = run.hospitals.find(h => h.id === a.destination)!; const f = Math.min(1, (run.time - a.routeStart) / Math.max(1, a.until - a.routeStart)); a.lat = a.from.lat + (h.lat - a.from.lat) * f; a.lng = a.from.lng + (h.lng - a.from.lng) * f;
        if (a.until <= run.time) { a.status = 'WAITING_TO_OFFLOAD'; a.arrivalAt = run.time; h.queue.push(a.id); record(run, 'arrival', `${a.id} arrived at ${h.name}.`, a.id, h.id); }
      }
      if (a.status === 'AWAITING_DECISION' && !run.config.manual) { const option = choices(run, a.id).find(c => c.eligible); if (option) decide(run, a.id, option.hospitalId, `${run.config.policy} simulation policy`); }
    }
    for (const h of run.hospitals) {
      while (h.active.length < h.capacity && h.queue.length) {
        const nextId = h.queue.shift();
        const a = run.ambulances.find(a => a.id === nextId)!; const i = run.incidents.find(i => i.id === a.incidentId)!;
        a.status = 'HANDOVER'; a.until = run.time + Math.max(1, Math.round(h.service * i.serviceFactor)); i.wait = run.time - a.arrivalAt!; h.active.push(a.id);
        record(run, 'handover_started', `${a.id} began handover at ${h.name}.`, a.id, h.id);
      }
      h.observations.push({ time: run.time, queue: h.queue.length, busy: h.active.length, capacity: h.capacity, releases: h.active.map(id => run.ambulances.find(a => a.id === id)!.until) });
      // Keep t=0 plus enough history for every supported information delay.
      if (h.observations.length > 125) h.observations.splice(1, h.observations.length - 125);
    }
    for (const i of run.incidents.filter(i => i.time <= run.time && i.assignedAt === undefined)) {
      const a = run.ambulances.filter(a => a.status === 'AVAILABLE').sort((a, b) => distance(a, i) - distance(b, i))[0]; if (!a) break;
      i.assignedAt = run.time; i.ambulanceId = a.id; a.incidentId = i.id; a.status = 'ASSIGNED'; a.until = run.time + Math.max(1, Math.ceil(travelTime(a, i) / 2));
      record(run, 'dispatch', `${a.id} assigned ${i.id} · ${i.care} care requirement.`, a.id);
    }
    sample(run);
  }
  if (run.time >= run.config.duration) { run.status = 'completed'; record(run, 'completed', 'Simulation horizon reached. Unfinished cases are reported separately.'); }
  return run;
}
export type Comparison = { id?: string; createdAt?: string; config: Config; seeds: number[]; rows: { seed: number; policy: Policy; metrics: ReturnType<typeof metrics> }[]; summary: { metric: string; baseline: number; coordinated: number; delta: number; ciLow: number; ciHigh: number }[] };
export function compare(config: Config, seeds: number[]): Comparison {
  const rows: Comparison['rows'] = [];
  for (const seed of seeds) for (const policy of ['nearest', 'coordinated'] as Policy[]) { const r = createRun({ ...config, seed, policy, manual: false }, `${seed}-${policy}`); advance(r, config.duration); rows.push({ seed, policy, metrics: metrics(r) }); }
  const keys = ['meanOffload', 'p90Offload', 'meanTravel', 'availability', 'completed', 'unfinished'] as const;
  const summary = keys.map(metric => {
    const baseline = rows.filter(r => r.policy === 'nearest').map(r => r.metrics[metric]); const coordinated = rows.filter(r => r.policy === 'coordinated').map(r => r.metrics[metric]);
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length; const diffs = coordinated.map((v, i) => v - baseline[i]); const delta = mean(diffs);
    const variance = diffs.length > 1 ? diffs.reduce((s, v) => s + (v - delta) ** 2, 0) / (diffs.length - 1) : 0;
    const t = [0, 0, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262][seeds.length] ?? 2.093;
    const margin = t * Math.sqrt(variance / diffs.length);
    return { metric, baseline: round(mean(baseline)), coordinated: round(mean(coordinated)), delta: round(delta), ciLow: round(delta - margin), ciHigh: round(delta + margin) };
  });
  return { config, seeds, rows, summary };
}
