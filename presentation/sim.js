// Bundled from ambulance-flow/lib/simulation.ts (esbuild). Same logic the app's API runs; regenerate, don't edit.
"use strict";
var Sim = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // lib/simulation.ts
  var simulation_exports = {};
  __export(simulation_exports, {
    DEFAULT_CONFIG: () => DEFAULT_CONFIG,
    HOSPITAL_SITES: () => HOSPITAL_SITES,
    advance: () => advance,
    choices: () => choices,
    compare: () => compare,
    createRun: () => createRun,
    decide: () => decide,
    distance: () => distance,
    forecast: () => forecast,
    inbound: () => inbound,
    incidentSchedule: () => incidentSchedule,
    metrics: () => metrics,
    observed: () => observed,
    record: () => record,
    rng: () => rng,
    round: () => round,
    setCapacity: () => setCapacity,
    travelTime: () => travelTime
  });
  var DEFAULT_CONFIG = { name: "Toronto \xB7 Morning shift", preset: "normal", fleet: 20, hospitals: 5, duration: 240, seed: 42, callsPerHour: 28, slots: 2, serviceMinutes: 18, informationDelay: 0, policy: "coordinated", manual: false };
  var HOSPITAL_SITES = [
    { id: "tgh", name: "Toronto General", short: "TGH", lat: 43.659, lng: -79.388, address: "200 Elizabeth Street", source: "https://www.uhn.ca/corporate/Directions/" },
    { id: "twh", name: "Toronto Western", short: "TWH", lat: 43.653, lng: -79.406, address: "399 Bathurst Street", source: "https://www.uhn.ca/corporate/Directions/" },
    { id: "mgh", name: "Michael Garron", short: "MGH", lat: 43.69, lng: -79.326, address: "825 Coxwell Avenue", source: "https://www.tehn.ca/" },
    { id: "sun", name: "Sunnybrook", short: "SUN", lat: 43.722, lng: -79.377, address: "2075 Bayview Avenue", source: "https://sunnybrook.ca/locations/" },
    { id: "sjh", name: "St. Joseph\u2019s", short: "SJH", lat: 43.64, lng: -79.45, address: "30 The Queensway", source: "https://www.ontario.ca/page/general-hospital-locations" },
    ...Array.from({ length: 5 }, (_, i) => ({ id: `virtual-${i}`, name: `Virtual site ${i + 6}`, short: `V${i + 6}`, lat: 43.67 + i % 3 * 0.023, lng: -79.47 + i * 0.035, address: "Synthetic location", source: "" }))
  ];
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s += 1831565813;
      let t = Math.imul(s ^ s >>> 15, 1 | s);
      t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var round = (n) => Math.round(n * 10) / 10;
  function distance(a, b) {
    const dy = (a.lat - b.lat) * 111;
    const dx = (a.lng - b.lng) * 80.4;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function travelTime(a, b) {
    return Math.max(3, Math.ceil(distance(a, b) * 1.35 / 0.55));
  }
  function incidentSchedule(config) {
    const random = rng(config.seed);
    const result = [];
    let time = 0;
    while (time < config.duration) {
      const surge = config.preset === "surge" && time >= config.duration / 4 && time < config.duration / 2;
      time += -Math.log(Math.max(1e-6, 1 - random())) * 60 / (config.callsPerHour * (surge ? 2.2 : 1));
      if (time >= config.duration) break;
      result.push({ id: `CASE-${String(result.length + 1).padStart(3, "0")}`, time: Math.ceil(time), lat: 43.645 + random() * 0.073, lng: -79.455 + random() * 0.135, care: random() < 0.18 ? "specialist" : "general", scene: 3 + Math.floor(random() * 6), serviceFactor: 0.65 + random() * 0.7 });
    }
    return result;
  }
  function record(run, type, message, ambulanceId, hospitalId) {
    run.events.push({ sequence: ++run.sequence, time: run.time, type, message, ambulanceId, hospitalId });
  }
  function createRun(config, id, scenarioId = "") {
    const random = rng(config.seed + 1e4);
    const hospitals = HOSPITAL_SITES.slice(0, config.hospitals).map((h, i) => ({ ...h, capacity: config.slots, service: config.serviceMinutes * (i === 0 ? 1.3 : i === 2 ? 0.85 : 1), capabilities: i % 2 === 0 ? ["general", "specialist"] : ["general"], queue: [], active: [], completions: [], observations: [{ time: 0, queue: 0, busy: 0, capacity: config.slots }] }));
    const ambulances = Array.from({ length: config.fleet }, (_, i) => {
      const point = { lat: 43.65 + random() * 0.065, lng: -79.45 + random() * 0.12 };
      return { id: `AMB-${101 + i}`, ...point, from: point, status: "AVAILABLE", until: 0, routeStart: 0 };
    });
    const run = { id, scenarioId, config: { ...config }, status: "running", time: 0, revision: 0, hospitals, ambulances, incidents: incidentSchedule(config), events: [], sequence: 0, history: [], availableMinutes: 0, surgeInjected: false, createdAt: (/* @__PURE__ */ new Date()).toISOString() };
    record(run, "started", `${config.name} started with ${config.fleet} ambulances.`);
    sample(run);
    return run;
  }
  function observed(run, h) {
    const delay = Math.max(run.config.informationDelay, run.config.preset === "stale" ? 15 : 0);
    const target = run.time - delay;
    return [...h.observations].reverse().find((o) => o.time <= target) ?? h.observations[0];
  }
  function inbound(run, h, horizon = Infinity, exclude) {
    return run.ambulances.filter((a) => a.id !== exclude && a.destination === h.id && a.status === "EN_ROUTE" && a.until <= run.time + horizon).length;
  }
  function forecast(run, h, horizon = 15, exclude) {
    const o = observed(run, h);
    const arrivals = inbound(run, h, horizon, exclude);
    const remaining = Math.max(0, (o.queue + o.busy) * h.service - o.capacity * horizon);
    const offload = o.capacity === 0 ? 180 : Math.min(180, h.service + (remaining + arrivals * h.service) / o.capacity);
    const uncertainty = h.service * 0.3 + (run.time - o.time) * 0.8 + arrivals * 1.5;
    return { offload: round(offload), lower: round(Math.max(h.service * 0.5, offload - uncertainty)), upper: round(offload + uncertainty), queue: o.queue, inbound: arrivals, age: run.time - o.time, capacity: o.capacity, projectedQueue: round(Math.max(0, o.queue + o.busy + arrivals - o.capacity * horizon / h.service)) };
  }
  function choices(run, ambulanceId) {
    const a = run.ambulances.find((v) => v.id === ambulanceId);
    if (!a) throw new Error("Ambulance not found.");
    const incident = run.incidents.find((i) => i.id === a.incidentId);
    return run.hospitals.map((h) => {
      const travel = travelTime(a, h);
      const p = forecast(run, h, travel, a.id);
      const eligible = !!incident && h.capabilities.includes(incident.care) && p.capacity > 0;
      return { hospitalId: h.id, name: h.name, eligible, reason: !incident ? "No active case" : !h.capabilities.includes(incident.care) ? "Required simulated capability unavailable" : p.capacity === 0 ? "Reported capacity unavailable" : `${p.inbound} inbound \xB7 report ${p.age}m old`, travel, ...p, total: round(travel + p.offload) };
    }).sort((a2, b) => Number(b.eligible) - Number(a2.eligible) || (run.config.policy === "nearest" ? a2.travel - b.travel : a2.total - b.total));
  }
  function decide(run, ambulanceId, hospitalId, approval = "dispatcher") {
    const a = run.ambulances.find((v) => v.id === ambulanceId);
    if (!a || a.status !== "AWAITING_DECISION") throw new Error("This ambulance is not awaiting a destination.");
    const option = choices(run, ambulanceId).find((c) => c.hospitalId === hospitalId);
    if (!option?.eligible) throw new Error("Destination does not satisfy the configured simulation constraints.");
    const incident = run.incidents.find((i) => i.id === a.incidentId);
    a.destination = hospitalId;
    a.status = "EN_ROUTE";
    a.from = { lat: a.lat, lng: a.lng };
    a.routeStart = run.time;
    a.until = run.time + option.travel;
    incident.travel = option.travel;
    incident.hospitalId = hospitalId;
    record(run, "destination", `${a.id} committed to ${option.name} (${approval}; ${option.travel}m travel).`, a.id, hospitalId);
  }
  function setCapacity(run, hospitalId, capacity) {
    const h = run.hospitals.find((h2) => h2.id === hospitalId);
    if (!h) throw new Error("Hospital not found.");
    h.capacity = capacity;
    h.observations.push({ time: run.time, queue: h.queue.length, busy: h.active.length, capacity });
    record(run, "capacity", `${h.name} capacity changed to ${capacity} simulated handover slots.`, void 0, h.id);
  }
  function metrics(run) {
    const completed = run.incidents.filter((i) => i.completedAt !== void 0);
    const offloads = completed.map((i) => i.offload).sort((a, b) => a - b);
    const mean = (v) => v.length ? round(v.reduce((a, b) => a + b, 0) / v.length) : 0;
    const arrived = run.incidents.filter((i) => i.time <= run.time);
    return { completed: completed.length, generated: arrived.length, unfinished: arrived.length - completed.length, pending: arrived.filter((i) => i.assignedAt === void 0).length, meanOffload: mean(offloads), p90Offload: offloads.length ? offloads[Math.ceil(offloads.length * 0.9) - 1] : 0, meanTravel: mean(completed.map((i) => i.travel)), meanWait: mean(completed.map((i) => i.wait)), meanResponse: mean(completed.map((i) => i.assignedAt - i.time)), availability: run.time ? round(run.availableMinutes / (run.time * run.config.fleet) * 100) : 100 };
  }
  function sample(run) {
    const m = metrics(run);
    run.history.push({ time: run.time, available: run.ambulances.filter((a) => a.status === "AVAILABLE").length, waiting: run.hospitals.reduce((n, h) => n + h.queue.length, 0), inbound: run.ambulances.filter((a) => a.status === "EN_ROUTE").length, completed: m.completed, meanOffload: m.meanOffload });
  }
  function advance(run, minutes) {
    if (run.status !== "running") return run;
    for (let step = 0; step < minutes && run.time < run.config.duration; step++) {
      run.availableMinutes += run.ambulances.filter((a) => a.status === "AVAILABLE").length;
      run.time++;
      if (run.config.preset === "surge" && !run.surgeInjected && run.time >= run.config.duration / 4) {
        setCapacity(run, run.hospitals[0].id, 1);
        run.surgeInjected = true;
        record(run, "surge", "Demand surge began; first hospital reduced to one handover slot.");
      }
      for (const a of run.ambulances) {
        const i = run.incidents.find((i2) => i2.id === a.incidentId);
        if (a.status === "HANDOVER" && a.until <= run.time && i) {
          const h = run.hospitals.find((h2) => h2.id === a.destination);
          h.active = h.active.filter((id) => id !== a.id);
          i.completedAt = run.time;
          i.offload = run.time - a.arrivalAt;
          h.completions.push(i.offload);
          record(run, "handover", `${a.id} handover completed at ${h.name}; ${i.offload}m offload.`, a.id, h.id);
          a.status = "AVAILABLE";
          a.incidentId = void 0;
          a.destination = void 0;
          a.arrivalAt = void 0;
        } else if (a.status === "ASSIGNED" && a.until <= run.time && i) {
          a.lat = i.lat;
          a.lng = i.lng;
          a.status = "ON_SCENE";
          a.until = run.time + i.scene;
          record(run, "on_scene", `${a.id} on scene for ${i.id}.`, a.id);
        } else if (a.status === "ON_SCENE" && a.until <= run.time) {
          a.status = "AWAITING_DECISION";
          record(run, "decision_needed", `${a.id} ready for destination selection.`, a.id);
        } else if (a.status === "EN_ROUTE") {
          const h = run.hospitals.find((h2) => h2.id === a.destination);
          const f = Math.min(1, (run.time - a.routeStart) / Math.max(1, a.until - a.routeStart));
          a.lat = a.from.lat + (h.lat - a.from.lat) * f;
          a.lng = a.from.lng + (h.lng - a.from.lng) * f;
          if (a.until <= run.time) {
            a.status = "WAITING_TO_OFFLOAD";
            a.arrivalAt = run.time;
            h.queue.push(a.id);
            record(run, "arrival", `${a.id} arrived at ${h.name}.`, a.id, h.id);
          }
        }
        if (a.status === "AWAITING_DECISION" && !run.config.manual) {
          const option = choices(run, a.id).find((c) => c.eligible);
          if (option) decide(run, a.id, option.hospitalId, `${run.config.policy} simulation policy`);
        }
      }
      for (const h of run.hospitals) {
        while (h.active.length < h.capacity && h.queue.length) {
          const nextId = h.queue.shift();
          const a = run.ambulances.find((a2) => a2.id === nextId);
          const i = run.incidents.find((i2) => i2.id === a.incidentId);
          a.status = "HANDOVER";
          a.until = run.time + Math.max(1, Math.round(h.service * i.serviceFactor));
          i.wait = run.time - a.arrivalAt;
          h.active.push(a.id);
          record(run, "handover_started", `${a.id} began handover at ${h.name}.`, a.id, h.id);
        }
        h.observations.push({ time: run.time, queue: h.queue.length, busy: h.active.length, capacity: h.capacity });
        if (h.observations.length > 125) h.observations.splice(1, h.observations.length - 125);
      }
      for (const i of run.incidents.filter((i2) => i2.time <= run.time && i2.assignedAt === void 0)) {
        const a = run.ambulances.filter((a2) => a2.status === "AVAILABLE").sort((a2, b) => distance(a2, i) - distance(b, i))[0];
        if (!a) break;
        i.assignedAt = run.time;
        i.ambulanceId = a.id;
        a.incidentId = i.id;
        a.status = "ASSIGNED";
        a.until = run.time + Math.max(1, Math.ceil(travelTime(a, i) / 2));
        record(run, "dispatch", `${a.id} assigned ${i.id} \xB7 ${i.care} care requirement.`, a.id);
      }
      sample(run);
    }
    if (run.time >= run.config.duration) {
      run.status = "completed";
      record(run, "completed", "Simulation horizon reached. Unfinished cases are reported separately.");
    }
    return run;
  }
  function compare(config, seeds) {
    const rows = [];
    for (const seed of seeds) for (const policy of ["nearest", "coordinated"]) {
      const r = createRun({ ...config, seed, policy, manual: false }, `${seed}-${policy}`);
      advance(r, config.duration);
      rows.push({ seed, policy, metrics: metrics(r) });
    }
    const keys = ["meanOffload", "p90Offload", "meanTravel", "availability", "completed", "unfinished"];
    const summary = keys.map((metric) => {
      const baseline = rows.filter((r) => r.policy === "nearest").map((r) => r.metrics[metric]);
      const coordinated = rows.filter((r) => r.policy === "coordinated").map((r) => r.metrics[metric]);
      const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
      const diffs = coordinated.map((v, i) => v - baseline[i]);
      const delta = mean(diffs);
      const variance = diffs.length > 1 ? diffs.reduce((s, v) => s + (v - delta) ** 2, 0) / (diffs.length - 1) : 0;
      const t = [0, 0, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262][seeds.length] ?? 2.093;
      const margin = t * Math.sqrt(variance / diffs.length);
      return { metric, baseline: round(mean(baseline)), coordinated: round(mean(coordinated)), delta: round(delta), ciLow: round(delta - margin), ciHigh: round(delta + margin) };
    });
    return { config, seeds, rows, summary };
  }
  return __toCommonJS(simulation_exports);
})();
