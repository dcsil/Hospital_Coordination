// Offline versions of the app's Scenario builder, Live operations and Evaluation pages.
// All numbers come from sim.js (the app's lib/simulation.ts), run in the browser.
(() => {
  const W = 1400, H = 560;
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clock = (min) => { const t = 8 * 60 + Math.floor(min); return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };

  // Fixed-size canvas scaled to the frame, so nothing scrolls.
  function canvas(host) {
    host.innerHTML = `<div class="sv" style="width:${W}px;height:${H}px"></div>`;
    const el = host.firstChild;
    const fit = () => { const k = Math.min(host.clientWidth / W, host.clientHeight / H) || 1; el.style.transform = `translate(${(host.clientWidth - W * k) / 2}px,${(host.clientHeight - H * k) / 2}px) scale(${k})`; };
    const ro = new ResizeObserver(fit); ro.observe(host); fit();
    return { el, ro };
  }

  // ---------- Simulator: setup + live operations ----------
  const PRESETS = [['normal', 'Normal operations', 'A typical shift across the network.'], ['surge', 'Emergency demand surge', 'Demand doubles; one hospital loses a slot.'], ['stale', 'Incomplete information', 'Hospital reports arrive 15 min late.']];
  const SLIDERS = [['fleet', 'Ambulance fleet', 5, 50, 'vehicles'], ['hospitals', 'Hospital network', 2, 10, 'sites'], ['callsPerHour', 'Arrival rate', 1, 90, 'calls / hour'], ['slots', 'Handover capacity per site', 1, 6, 'slots']];
  const STATUS = { AVAILABLE: ['#4b8767', 'Available'], ASSIGNED: ['#7aa2c4', 'To scene'], ON_SCENE: ['#7aa2c4', 'On scene'], AWAITING_DECISION: ['#c98a2b', 'Awaiting decision'], EN_ROUTE: ['#2f6f9f', 'En route'], WAITING_TO_OFFLOAD: ['#a5472f', 'Waiting to offload'], HANDOVER: ['#8a6db0', 'In handover'] };

  window.mountSimulator = (host, onView) => {
    const { el, ro } = canvas(host);
    let config = { ...Sim.DEFAULT_CONFIG, manual: true };
    let run = null, view = 'scenarios', timer = 0, speed = 2, reviewing = null;

    function setView(v) { view = v; onView?.(v); draw(); }
    function stopClock() { clearInterval(timer); timer = 0; }
    function play() { if (!run || run.status === 'completed') return; stopClock(); run.status = 'running'; timer = setInterval(() => { Sim.advance(run, 1); if (run.status === 'completed') stopClock(); draw(); }, 1000 / speed); draw(); }
    function pause() { stopClock(); if (run && run.status === 'running') run.status = 'paused'; draw(); }
    function start() { stopClock(); run = Sim.createRun(config, 'deck'); run.status = 'paused'; reviewing = null; setView('operations'); play(); }

    function setup() {
      el.innerHTML = `<div class="sv-setup"><section class="sv-card"><div class="sv-step"><span>01</span>Define your experiment</div>
        <label class="sv-k">Scenario name</label><input class="sv-input" id="sv-name" value="${esc(config.name)}">
        <div class="sv-k">Starting conditions</div><div class="sv-presets">${PRESETS.map(([id, t, d]) => `<button data-preset="${id}" class="${config.preset === id ? 'on' : ''}"><b>${t}</b><small>${d}</small></button>`).join('')}</div>
        <div class="sv-step"><span>02</span>Configure the network</div>
        <div class="sv-sliders">${SLIDERS.map(([k, l, lo, hi, u]) => `<label><span>${l}<b id="sv-v-${k}">${config[k]}</b><small>${u}</small></span><input type="range" min="${lo}" max="${hi}" value="${config[k]}" data-k="${k}"></label>`).join('')}</div>
        <div class="sv-row"><div><div class="sv-k">Destination policy</div><div class="sv-seg">${[['coordinated', 'Coordinated'], ['nearest', 'Nearest eligible']].map(([p, l]) => `<button data-policy="${p}" class="${config.policy === p ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <div><div class="sv-k">Random seed</div><input class="sv-input sv-seed" id="sv-seed" type="number" value="${config.seed}"></div>
        <label class="sv-check"><input type="checkbox" id="sv-manual" ${config.manual ? 'checked' : ''}> Require dispatcher approval</label></div></section>
        <aside class="sv-card sv-summary"><span class="sv-pill">EXPERIMENT SUMMARY</span><h3>${esc(config.name)}</h3><p>${PRESETS.find(p => p[0] === config.preset)[2]}</p>
        <dl>${[['Network', `${config.hospitals} hospitals`], ['Fleet', `${config.fleet} ambulances`], ['Duration', `${config.duration / 60} hours`], ['Random seed', config.seed], ['Policy', config.policy === 'nearest' ? 'Nearest eligible' : 'Coordinated'], ['Decisions', config.manual ? 'Dispatcher approves' : 'Automatic']].map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl>
        <button class="sv-primary" id="sv-start">▶ Start simulation</button><small>Each seed gives a reproducible incident schedule. Synthetic data only.</small></aside></div>`;
      el.querySelector('#sv-name').oninput = (e) => { config.name = e.target.value; el.querySelector('.sv-summary h3').textContent = config.name; };
      el.querySelector('#sv-seed').onchange = (e) => { config.seed = Math.max(1, Number(e.target.value) || 1); draw(); };
      el.querySelector('#sv-manual').onchange = (e) => { config.manual = e.target.checked; draw(); };
      el.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => { config.preset = b.dataset.preset; draw(); });
      el.querySelectorAll('[data-policy]').forEach(b => b.onclick = () => { config.policy = b.dataset.policy; draw(); });
      el.querySelectorAll('[data-k]').forEach(r => { r.oninput = () => { config[r.dataset.k] = Number(r.value); el.querySelector(`#sv-v-${r.dataset.k}`).textContent = r.value; }; r.onchange = draw; });
      el.querySelector('#sv-start').onclick = start;
    }

    const X = (lng) => (lng + 79.48) / 0.19 * 560, Y = (lat) => (43.735 - lat) / 0.1 * 330;
    function operations() {
      if (!run) { start(); return; }
      const m = Sim.metrics(run), A = run.ambulances;
      const count = (s) => A.filter(a => a.status === s).length;
      const waiting = A.filter(a => a.status === 'AWAITING_DECISION');
      if (reviewing && !waiting.some(a => a.id === reviewing)) reviewing = null;
      const kpis = [['Available fleet', `${count('AVAILABLE')}<small> / ${config.fleet}</small>`, `${m.pending} calls awaiting assignment`], ['En route', count('EN_ROUTE'), 'Confirmed hospital commitments'], ['Waiting to offload', count('WAITING_TO_OFFLOAD'), `${count('HANDOVER')} handovers in progress`], ['Completed handovers', m.completed, `${m.meanOffload}m mean offload`]];
      const side = reviewing ? decisionPanel(reviewing) : `<div class="sv-head"><h4>Hospital network</h4><small>pred. offload</small></div>${run.hospitals.map(h => { const f = Sim.forecast(run, h); return `<div class="sv-hosp"><div><b>${esc(h.name)}</b><small>${h.queue.length} waiting · ${f.inbound} inbound · ${h.active.length}/${h.capacity} slots</small></div><strong>${f.offload}<small>m</small></strong></div>`; }).join('')}`;
      el.innerHTML = `<div class="sv-ops">
        <div class="sv-bar"><span class="sv-state ${run.status}">${run.status}</span><b>${esc(run.config.name)}</b><small>Seed ${run.config.seed} · ${run.config.policy === 'nearest' ? 'Nearest eligible' : 'Coordinated'}</small>
          <div class="sv-clock">${clock(run.time)}<small> / ${clock(run.config.duration)}</small></div>
          <select id="sv-speed">${[1, 2, 5, 10].map(s => `<option value="${s}" ${s === speed ? 'selected' : ''}>${s} min / sec</option>`).join('')}</select>
          <button class="sv-primary sv-small" id="sv-play">${run.status === 'running' ? '❚❚ Pause' : '▶ Play'}</button><button class="sv-ghost" id="sv-stepbtn" title="Advance 1 minute">›</button><button class="sv-ghost" id="sv-setupbtn">Edit scenario</button>
          <div class="sv-progress"><div style="width:${run.time / run.config.duration * 100}%"></div></div></div>
        <div class="sv-kpis">${kpis.map(([a, b, c]) => `<div><span>${a}</span><b>${b}</b><small>${c}</small></div>`).join('')}</div>
        ${waiting.length ? `<div class="sv-alert"><b>⚠ ${waiting.length} destination decision${waiting.length > 1 ? 's' : ''} waiting.</b> ${run.status === 'running' ? 'The clock keeps running while you decide (known friction).' : 'Select an ambulance to review eligible hospitals.'}<button id="sv-review">Review next →</button></div>` : `<div class="sv-alert calm">${run.config.manual ? 'No decisions waiting. New cases appear as crews finish on scene.' : `Destinations are chosen automatically by the ${run.config.policy} policy.`}</div>`}
        <div class="sv-main"><section class="sv-map"><div class="sv-head"><h4>Regional operations</h4><small>Synthetic network</small></div><svg viewBox="0 0 560 330">${mapLayer(run)}</svg>
          <div class="sv-legend">${Object.entries(STATUS).filter(([k]) => k !== 'ON_SCENE').map(([, [c, l]]) => `<span><i style="background:${c}"></i>${l}</span>`).join('')}</div></section>
          <section class="sv-side">${side}</section>
          <section class="sv-events"><div class="sv-head"><h4>Event stream</h4></div>${run.events.slice(-9).reverse().map(e => `<p><time>${clock(e.time)}</time>${esc(e.message)}</p>`).join('')}</section></div></div>`;
      el.querySelector('#sv-play').onclick = () => run.status === 'running' ? pause() : play();
      el.querySelector('#sv-stepbtn').onclick = () => { if (run.status === 'completed') return; const was = run.status; run.status = 'running'; Sim.advance(run, 1); if (run.status !== 'completed') run.status = was === 'running' ? 'running' : 'paused'; draw(); };
      el.querySelector('#sv-setupbtn').onclick = () => { stopClock(); setView('scenarios'); };
      el.querySelector('#sv-speed').onchange = (e) => { speed = Number(e.target.value); if (run.status === 'running') play(); };
      el.querySelector('#sv-review')?.addEventListener('click', () => { reviewing = waiting[0].id; draw(); });
      el.querySelectorAll('[data-amb]').forEach(c => c.addEventListener('click', () => { reviewing = c.dataset.amb; draw(); }));
      el.querySelectorAll('[data-confirm]').forEach(b => b.onclick = () => { Sim.decide(run, reviewing, b.dataset.confirm); reviewing = null; draw(); });
      el.querySelector('#sv-close')?.addEventListener('click', () => { reviewing = null; draw(); });
    }
    function mapLayer(r) {
      const grid = Array.from({ length: 12 }, (_, i) => `<line x1="${i * 50}" y1="0" x2="${i * 50 - 60}" y2="330"/><line x1="0" y1="${i * 30}" x2="560" y2="${i * 30 - 20}"/>`).join('');
      const hs = r.hospitals.map(h => `<g transform="translate(${X(h.lng)},${Y(h.lat)})"><rect x="-11" y="-11" width="22" height="22" rx="6" fill="white" stroke="#235d48" stroke-width="1.6"/><path d="M-5 0h10M0-5v10" stroke="#235d48" stroke-width="2.2"/><text x="15" y="4">${esc(h.short)}${h.queue.length ? ` · ${h.queue.length} waiting` : ''}</text></g>`).join('');
      const as = r.ambulances.map(a => { const [c] = STATUS[a.status]; const d = a.status === 'AWAITING_DECISION'; return `<circle ${d ? `data-amb="${a.id}" class="sv-pulse"` : ''} cx="${X(a.lng).toFixed(1)}" cy="${Y(a.lat).toFixed(1)}" r="${d ? 7 : 4.5}" fill="${c}" stroke="white" stroke-width="1.5"/>`; }).join('');
      return `<g class="sv-grid">${grid}</g><path class="sv-river" d="M380 0 C 360 90, 420 150, 395 330"/>${hs}${as}`;
    }
    function decisionPanel(id) {
      const a = run.ambulances.find(v => v.id === id), inc = run.incidents.find(i => i.id === a.incidentId);
      const cs = Sim.choices(run, id);
      return `<div class="sv-head"><h4>${a.id} · choose destination</h4><button class="sv-ghost" id="sv-close">✕</button></div><small class="sv-sub">${inc.id} · ${inc.care} care · ranked by travel + predicted offload</small>
        ${cs.map((c, i) => `<div class="sv-choice ${c.eligible ? '' : 'off'}"><div><b>${i === 0 && c.eligible ? '<em>BEST</em> ' : ''}${esc(c.name)}</b><small>${c.eligible ? `${c.travel}m travel + ${c.offload}m offload (${c.lower}–${c.upper})` : esc(c.reason)}</small></div>${c.eligible ? `<strong>${c.total}<small>m</small></strong><button data-confirm="${c.hospitalId}">Confirm</button>` : ''}</div>`).join('')}`;
    }
    function draw() { if (view === 'scenarios') setup(); else operations(); }
    draw();
    return { setView, reset() { stopClock(); run = null; config = { ...Sim.DEFAULT_CONFIG, manual: true }; setView('scenarios'); }, destroy() { stopClock(); ro.disconnect(); } };
  };

  // ---------- Evaluation: nearest vs coordinated on matched seeds ----------
  const METRICS = { meanOffload: ['Mean offload', 'min', -1], meanTravel: ['Mean travel', 'min', -1], completed: ['Completed handovers', '', 1], unfinished: ['Unfinished cases', '', -1] };
  window.mountEvaluation = (host) => {
    const { el, ro } = canvas(host);
    let cfg = { preset: 'normal', seeds: 5 }, result = null, traces = null;
    function runIt() {
      const config = { ...Sim.DEFAULT_CONFIG, preset: cfg.preset };
      const seeds = Array.from({ length: cfg.seeds }, (_, i) => i + 1);
      result = Sim.compare(config, seeds);
      traces = ['nearest', 'coordinated'].map(policy => { const r = Sim.createRun({ ...config, seed: 1, policy, manual: false }, policy); Sim.advance(r, config.duration); return r.history.map(h => h.waiting); });
      draw();
    }
    function draw() {
      const s = result.summary, rows = result.rows;
      const maxQ = Math.max(1, ...traces.flat());
      const line = (t) => t.map((v, i) => `${(i / (t.length - 1) * 400).toFixed(1)},${(150 - v / maxQ * 140).toFixed(1)}`).join(' ');
      el.innerHTML = `<div class="ev">
        <div class="ev-controls"><div><span class="sv-k">Scenario</span><div class="sv-seg">${PRESETS.map(([id, t]) => `<button data-preset="${id}" class="${cfg.preset === id ? 'on' : ''}">${t}</button>`).join('')}</div></div>
          <p>5 matched seeds. Only the destination policy changes.</p></div>
        <div class="ev-grid"><section class="sv-card ev-table"><h4>Nearest vs coordinated <small>95% CI in brackets</small></h4>
          <table><thead><tr><th></th><th>Nearest</th><th>Coordinated</th><th>Difference</th></tr></thead><tbody>${s.filter(r => METRICS[r.metric]).map(r => { const [l, u, dir] = METRICS[r.metric]; const good = r.delta * dir > 0, sure = r.ciLow * r.ciHigh > 0; return `<tr><td>${l}${u ? ` <small>(${u})</small>` : ''}</td><td>${r.baseline}</td><td><b>${r.coordinated}</b></td><td class="${sure ? good ? 'good' : 'bad' : 'flat'}">${r.delta > 0 ? '+' : ''}${r.delta}<small> [${r.ciLow}, ${r.ciHigh}]</small></td></tr>`; }).join('')}</tbody></table>
          <p class="ev-note">Synthetic runs. The go/no-go gate metric is not measured here.</p></section>
          <section class="sv-card"><h4>Ambulances waiting to offload <small>seed 1</small></h4><svg viewBox="0 0 400 155" preserveAspectRatio="none" class="ev-line"><polyline points="${line(traces[0])}" class="n"/><polyline points="${line(traces[1])}" class="c"/></svg><div class="sv-legend"><span><i style="background:#b9a88f"></i>Nearest</span><span><i style="background:#235d48"></i>Coordinated</span><span style="margin-left:auto">08:00 → 12:00</span></div></section></div></div>`;
      el.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => { cfg.preset = b.dataset.preset; runIt(); });
          }
    runIt();
    return { reset() { cfg = { preset: 'normal', seeds: 5 }; runIt(); }, destroy() { ro.disconnect(); } };
  };
})();
