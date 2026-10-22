// Demo 1 deck: plain JS, no build step. Content lives in content.js and
// accuracy-data.js; this file renders slides and wires up interactions.
(() => {
  const D = window.DECK;
  const A = window.ACCURACY;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  // ---------- API (served through serve.mjs, which forwards /api to the app) ----------
  async function api(path) {
    const t0 = performance.now();
    const res = await fetch(path, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, ms: Math.round(performance.now() - t0), body };
  }
  let health = { state: "checking" };
  async function checkHealth() {
    try {
      const r = await api("/api/health");
      health = r.status === 200 ? { state: "up", ms: r.ms } : { state: "down" };
    } catch {
      health = { state: "down" };
    }
    $$("[data-health]").forEach(paintHealth);
    return health;
  }
  function paintHealth(el) {
    el.className = `health ${health.state === "up" ? "is-up" : health.state === "down" ? "is-down" : ""}`;
    el.textContent = health.state === "up" ? `App + API up · ${health.ms} ms` : health.state === "down" ? "App not running · retry" : "Checking app…";
  }
  const healthBadge = () => `<button type="button" class="health" data-health title="GET /api/health"></button>`;

  // ---------- Slides ----------
  function titleSlide() {
    return `
      <div class="title">
        <div class="title-copy">
          <h1 class="hero">${esc(D.team.product)}</h1>
          <p class="hero-sub">Team ${esc(D.team.name)} · Demo 1: Surface Product</p>
          <div class="members">
            ${D.team.members.map((m) => `
              <div class="member"><img src="${m.photo}" alt="" />
                <span><strong>${esc(m.name)}</strong></span></div>`).join("")}
          </div>
        </div>
        <div class="card map-card">${networkSvg()}<span class="map-caption">Toronto · 5 sites · synthetic fleet</span></div>
      </div>`;
  }

  // Subtle animated network: real hospital coordinates, ambulances drifting in.
  function networkSvg() {
    const sites = [
      ["TGH", 43.659, -79.388], ["TWH", 43.653, -79.406], ["MGH", 43.69, -79.326],
      ["SUN", 43.722, -79.377], ["SJH", 43.64, -79.45],
    ];
    const px = (lng) => 30 + ((lng + 79.47) / 0.16) * 340;
    const py = (lat) => 30 + ((43.735 - lat) / 0.11) * 220;
    const streets = Array.from({ length: 9 }, (_, i) => `<line x1="0" y1="${20 + i * 30}" x2="400" y2="${8 + i * 30}" />`).join("") +
      Array.from({ length: 11 }, (_, i) => `<line x1="${10 + i * 40}" y1="0" x2="${22 + i * 40}" y2="300" />`).join("");
    const starts = [[40, 60], [360, 40], [80, 250], [300, 230], [200, 30], [370, 150], [20, 170]];
    const amb = starts.map(([x, y], i) => {
      const [, lat, lng] = sites[i % sites.length];
      const d = `M${x},${y} Q${(x + px(lng)) / 2},${Math.min(y, py(lat)) - 30} ${px(lng)},${py(lat)}`;
      return `<path d="${d}" class="route" />
        <circle r="4" class="amb"><animateMotion dur="${7 + i * 1.3}s" begin="${i * 0.9}s" repeatCount="indefinite" path="${d}" keyPoints="0;1;1" keyTimes="0;0.75;1" calcMode="linear" /></circle>`;
    }).join("");
    const hospitals = sites.map(([s, lat, lng]) => `
      <g transform="translate(${px(lng)},${py(lat)})"><circle r="11" class="hosp-ring" /><circle r="6" class="hosp" />
      <text y="-15" text-anchor="middle">${s}</text></g>`).join("");
    return `<svg viewBox="0 0 400 300" aria-hidden="true">
      <style>
        .st line { stroke: oklch(100% 0 0); stroke-width: 6; }
        .route { fill: none; stroke: oklch(42% 0.085 160 / 0.18); stroke-width: 1.5; stroke-dasharray: 3 4; }
        .amb { fill: oklch(66% 0.14 70); }
        .hosp { fill: oklch(42% 0.085 160); }
        .hosp-ring { fill: oklch(42% 0.085 160 / 0.12); }
        text { font: 600 10px var(--sans); fill: oklch(35% 0.04 160); }
      </style>
      <rect x="0" y="262" width="400" height="38" fill="oklch(90% 0.03 220)" />
      <g class="st">${streets}</g>${amb}${hospitals}</svg>`;
  }

  function problemSlide() {
    const max = Math.max(...D.ranking.rows.map((r) => r.travel + r.offload));
    const best = Math.min(...D.ranking.rows.map((r) => r.travel + r.offload));
    return `
      <h2 class="chapter-title">The decision we're building for</h2>
      <div class="problem">
        <div class="stack">
          <div class="card">
            <div class="persona-head"><span class="persona-icon">${D.persona.name[0]}</span>
              <div><p class="kicker">Persona</p><h3>${esc(D.persona.name)}, ${esc(D.persona.role)}</h3></div></div>
            <p class="muted" style="margin:0">${esc(D.persona.context)}</p>
          </div>
          <div class="card card-accent"><p class="kicker">Goal</p><p class="goal">${esc(D.persona.goal)}</p></div>
        </div>
        <div class="card">
          <p class="kicker">Nearest isn't always fastest</p>
          ${D.ranking.rows.map((r, i) => {
            const total = Math.round((r.travel + r.offload) * 10) / 10;
            return `<div class="rank-row ${total === best ? "is-best" : ""}">
              <span class="rank-name">${esc(r.name)}</span>
              <span class="rank-bar"><span class="rank-travel" style="width:${(r.travel / max) * 100}%;animation-delay:${i * 80}ms"></span><span class="rank-offload" style="width:${(r.offload / max) * 100}%;animation-delay:${i * 80 + 150}ms"></span></span>
              <span class="rank-total">${total}m</span></div>`;
          }).join("")}
          <div class="legend"><span><i class="rank-travel"></i>Travel</span><span><i class="rank-offload"></i>Predicted offload</span></div>
          <p class="muted small" style="margin:0.7rem 0 0">${esc(D.ranking.caption)}</p>
        </div>
      </div>`;
  }

  function demoSlide() {
    return `
      <h2 class="chapter-title">Live demo</h2>
      <div class="demo">
        <div class="stack">
          <div class="card"><p class="kicker">Primary interaction</p>
            <ol class="steps">
              <li><b>1</b><span>Turn on <strong>dispatcher approval</strong></span></li>
              <li><b>2</b><span><strong>Review next</strong></span></li>
              <li><b>3</b><span><strong>Confirm</strong> the best hospital</span></li>
            </ol></div>
          <div class="card"><p class="kicker">Works</p>
            <ul class="checks">${D.working.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>
          <div class="card card-broken"><p class="kicker">Doesn't work yet</p>
            <ul class="crosses">${D.broken.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>
        </div>
        <div class="frame-wrap" id="frame-wrap">
          <div class="frame-bar"><span class="frame-dots"><i></i><i></i><i></i></span>
            <span class="frame-url">${esc(D.appUrl.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</span>
            <button type="button" class="chip-btn" id="frame-reload">↻ Reload</button>
            <button type="button" class="chip-btn" id="frame-full">⛶ Full screen</button>
          </div>
          <div class="frame-empty" id="frame-empty">Checking the app…</div>
        </div>
      </div>`;
  }
  function mountDemo() {
    const wrap = $("#frame-wrap");
    const empty = $("#frame-empty");
    const show = () => {
      if (health.state === "up") {
        if (!$("iframe", wrap)) {
          empty.remove();
          wrap.insertAdjacentHTML("beforeend", `<iframe src="${D.appUrl}" title="Kinetic Ambulance Flow" allow="fullscreen"></iframe>`);
        }
      } else {
        empty.innerHTML = `<div><p><strong>The app isn't running.</strong> Start it from <code>ambulance-flow/</code>:</p>
          <pre>npm run build\nnpm start</pre><button type="button" class="btn" id="frame-retry">Retry</button></div>`;
        $("#frame-retry", empty)?.addEventListener("click", () => checkHealth().then(show));
      }
    };
    checkHealth().then(show);
    $("#frame-reload").addEventListener("click", () => { const f = $("iframe", wrap); if (f) f.src = f.src; });
    $("#frame-full").addEventListener("click", () => (document.fullscreenElement ? document.exitFullscreen() : wrap.requestFullscreen?.()));
  }

  let traceStep = 0;
  function topologySlide() {
    return `
      <h2 class="chapter-title">System topology</h2>
      <div class="topo">
        <div class="tiers ${traceStep ? "is-tracing" : ""}" id="tiers">
          <span class="boundary">Cloudflare Worker · one deployment</span>
          ${D.tiers.map((t) => `
            <button type="button" class="tier ${t.id === "data" ? "tier-data" : ""} ${t.steps.includes(traceStep) ? "is-lit" : ""}" data-tier="${t.id}">
              <h3>${esc(t.name)}</h3><span class="tech">${esc(t.tech)}</span>
              <ul>${t.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
            </button>`).join("")}
        </div>
        <div class="stack">
          <div><p class="kicker">Trace the primary interaction</p>
            <div class="trace">${D.trace.map((s) => `
              <button type="button" class="trace-btn ${traceStep === s.n ? "is-active" : ""}" data-step="${s.n}"><b>${s.n}</b><span>${esc(s.text)}</span></button>`).join("")}</div>
          </div>
          <div class="console">
            <div class="console-head"><p class="kicker" style="margin:0">Live API</p>${healthBadge()}</div>
            <div class="endpoints">
              <button type="button" class="endpoint" data-call="runs"><b>GET</b> /api/runs</button>
              <button type="button" class="endpoint" data-call="state"><b>GET</b> …/state</button>
              <button type="button" class="endpoint" data-call="choices"><b>GET</b> …/choices</button>
            </div>
            <pre class="json" id="json">Click an endpoint to call the running app →</pre>
          </div>
        </div>
      </div>`;
  }
  function mountTopology() {
    checkHealth();
    $$("[data-step]").forEach((b) => b.addEventListener("click", () => {
      const n = Number(b.dataset.step);
      traceStep = traceStep === n ? 0 : n;
      render();
    }));
    $$("[data-call]").forEach((b) => b.addEventListener("click", () => callEndpoint(b.dataset.call)));
  }
  async function latestRun() {
    const r = await api("/api/runs");
    const list = Array.isArray(r.body) ? r.body : r.body.runs || [];
    return { r, run: list[0] };
  }
  async function callEndpoint(kind) {
    const out = $("#json");
    out.textContent = "…";
    try {
      let label, res;
      if (kind === "runs") {
        res = (await latestRun()).r;
        label = "GET /api/runs";
        const list = Array.isArray(res.body) ? res.body : res.body.runs || [];
        res.body = list.slice(0, 3).map(({ id, name, status, revision, updatedAt }) => ({ id, name, status, revision, updatedAt }));
      } else {
        const { run } = await latestRun();
        if (!run) { out.textContent = "No runs yet. Start one in the demo first."; return; }
        res = await api(`/api/runs/${run.id}/state`);
        const s = res.body.run || res.body;
        if (kind === "state") {
          label = `GET /api/runs/${run.id.slice(0, 8)}…/state`;
          res.body = { status: s.status, minute: s.time, revision: s.revision,
            waitingForDecision: s.ambulances.filter((a) => a.status === "AWAITING_DECISION").map((a) => a.id),
            hospitals: s.hospitals.map((h) => ({ name: h.name, queue: h.queue.length, active: h.active.length, capacity: h.capacity })) };
        } else {
          const waiting = s.ambulances.find((a) => a.status === "AWAITING_DECISION");
          if (!waiting) { out.textContent = "No ambulance is waiting for a destination right now. Advance the run in the demo."; return; }
          res = await api(`/api/runs/${run.id}/choices?ambulanceId=${waiting.id}`);
          label = `GET …/choices?ambulanceId=${waiting.id}`;
          const list = Array.isArray(res.body) ? res.body : res.body.choices || [];
          res.body = list.map(({ name, eligible, travel, offload, lower, upper, total }) => ({ name, eligible, travel, offload, range: [lower, upper], total }));
        }
      }
      out.textContent = `${label}  →  ${res.status} · ${res.ms} ms\n${JSON.stringify(res.body, null, 1).slice(0, 1800)}`;
    } catch {
      out.textContent = "Couldn't reach the app. Start it and run the deck with: node presentation/serve.mjs";
    }
  }

  function defenceSlide() {
    return `
      <h2 class="chapter-title">Architectural defence</h2>
      <div class="contracts">${D.contracts.map((c) => `
        <div class="card contract"><p class="kicker">${esc(c.title)}</p><pre>${esc(c.code)}</pre><p class="muted">${esc(c.why)}</p></div>`).join("")}</div>
      <div class="scope">
        <div class="card card-accent"><p class="kicker">Enforced now</p><ul class="checks">${D.scopeNow.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></div>
        <div class="card"><p class="kicker" style="color:var(--muted)">Deferred on purpose</p><ul class="items-plain">${D.scopeLater.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></div>
      </div>`;
  }

  function evidenceSlide() {
    const pct = Math.round((A.inside / A.completed) * 100);
    return `
      <h2 class="chapter-title">Proof of concept: real logic, real data flow</h2>
      <div class="kpis">
        <div class="card kpi"><div class="kpi-num">${A.decisions}/${A.decisions}</div><div class="kpi-label">decisions saved (state + event)</div></div>
        <div class="card kpi"><div class="kpi-num">${A.travelExact}/${A.completed}</div><div class="kpi-label">travel predictions exact</div></div>
        <div class="card kpi"><div class="kpi-num">${A.meanAbsError}m</div><div class="kpi-label">mean offload error</div></div>
        <div class="card kpi"><div class="kpi-num is-warn">${pct}%</div><div class="kpi-label">offloads inside range (target 80%)</div></div>
      </div>
      <div class="evidence">
        <div class="card chart" id="chart">${scatterSvg()}<div class="tip" id="tip"></div></div>
        <div class="card walk"><p class="kicker">One case, end to end</p>
          <p><strong>Minute 42:</strong> AMB-101 confirmed to Toronto Western, 6 min travel predicted.</p>
          <p><strong>Minute 48:</strong> arrived, exactly on the prediction.</p>
          <p><strong>Minute 67:</strong> handover done. 19 min offload vs 18 predicted (range 12.6 to 23.4).</p>
          <p class="muted small" style="margin-top:0.8rem">Chart: 100 decisions driven through the real API (seed 42), ${A.completed} completed. Bars are the range shown to the dispatcher.</p>
        </div>
      </div>`;
  }
  function scatterSvg() {
    const W = 640, H = 330, L = 46, B = 34, T = 10, R = 10;
    const max = Math.ceil(Math.max(...A.cases.flatMap((c) => [c.actual, c.hi])) / 10) * 10;
    const x = (v) => L + (v / max) * (W - L - R);
    const y = (v) => H - B - (v / max) * (H - B - T);
    const ticks = Array.from({ length: max / 10 + 1 }, (_, i) => i * 10);
    const grid = ticks.map((t) => `<line x1="${x(0)}" y1="${y(t)}" x2="${x(max)}" y2="${y(t)}" class="g" /><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${t}</text><text x="${x(t)}" y="${H - B + 18}" text-anchor="middle">${t}</text>`).join("");
    const pts = A.cases.map((c, i) => {
      const inside = c.actual >= c.lo && c.actual <= c.hi;
      return `<line x1="${x(c.pred)}" y1="${y(c.lo)}" x2="${x(c.pred)}" y2="${y(c.hi)}" class="rng" />
        <circle class="dot" cx="${x(c.pred)}" cy="${y(c.actual)}" r="4" fill="${inside ? "oklch(55% 0.13 150)" : "oklch(60% 0.18 27)"}" data-i="${i}" style="animation-delay:${i * 8}ms" />`;
    }).join("");
    return `<svg viewBox="0 0 ${W} ${H}">
      <style>
        text { font: 11px var(--sans); fill: oklch(48% 0.025 165); }
        .g { stroke: oklch(25% 0.03 160 / 0.08); }
        .rng { stroke: oklch(42% 0.085 160 / 0.14); stroke-width: 3; stroke-linecap: round; }
        .diag { stroke: oklch(42% 0.085 160 / 0.5); stroke-dasharray: 5 5; }
        .dot { animation: pop 0.4s both; }
        @keyframes pop { from { opacity: 0; transform-box: fill-box; transform-origin: center; transform: scale(0); } }
      </style>
      ${grid}
      <line x1="${x(0)}" y1="${y(0)}" x2="${x(max)}" y2="${y(max)}" class="diag" />
      ${pts}
      <text x="${(W + L) / 2}" y="${H - 2}" text-anchor="middle">Predicted offload (min)</text>
      <text transform="translate(12 ${(H - B) / 2}) rotate(-90)" text-anchor="middle">Actual offload (min)</text>
      <circle cx="${W - 210}" cy="16" r="4" fill="oklch(55% 0.13 150)" /><text x="${W - 200}" y="20">inside range</text>
      <circle cx="${W - 120}" cy="16" r="4" fill="oklch(60% 0.18 27)" /><text x="${W - 110}" y="20">outside</text>
    </svg>`;
  }
  function mountEvidence() {
    const chart = $("#chart"), tip = $("#tip");
    $$(".dot", chart).forEach((d) => {
      d.addEventListener("mouseenter", () => {
        const c = A.cases[Number(d.dataset.i)];
        tip.innerHTML = `<strong>${esc(c.id)}</strong> → ${esc(c.hospital)}<br>predicted ${c.pred}m (${c.lo} to ${c.hi})<br>actual ${c.actual}m · travel ${c.travel}m`;
        const box = chart.getBoundingClientRect(), r = d.getBoundingClientRect();
        tip.style.left = `${r.left - box.left + 12}px`;
        tip.style.top = `${r.top - box.top - 10}px`;
        tip.style.opacity = 1;
      });
      d.addEventListener("mouseleave", () => (tip.style.opacity = 0));
    });
  }

  let cujStep = 5;
  function cujSlide() {
    const total = D.cuj.reduce((s, c) => s + c.time, 0);
    const s = D.cuj.find((c) => c.n === cujStep);
    const toConfirm = D.cuj.filter((c) => c.n <= 7).reduce((a, c) => a + c.time, 0);
    return `
      <h2 class="chapter-title">Baseline CUJ: version 0 benchmark</h2>
      <div class="timeline">${D.cuj.map((c) => `
        <button type="button" class="seg ${c.friction} ${c.n === cujStep ? "is-active" : ""}" style="flex:${c.time}" data-cuj="${c.n}" title="${esc(c.action)}">
          <b>${c.n}</b><span>${c.time}s</span></button>`).join("")}</div>
      <div class="time-axis"><span>0 s</span><span>open app → confirmed: ${toConfirm} s</span><span>${total} s</span></div>
      <div class="cuj">
        <div class="card">
          <p class="kicker">Step ${s.n} · ${s.time} s</p>
          <h3 style="font-size:1.3rem">${esc(s.action)}</h3>
          <p style="margin:0.5rem 0"><span class="pill sev-${s.friction}">${s.friction === "none" ? "great" : s.friction}</span></p>
          <p class="muted" style="margin:0">${esc(s.note)}</p>
          <div class="totals">
            <div class="total"><strong>23 s</strong><span class="muted small">Review next → confirmed</span></div>
            <div class="total"><strong>2</strong><span class="muted small">context switches per decision</span></div>
            <div class="total"><strong>1 severe</strong><span class="muted small">4 moderate · 3 great</span></div>
            <div class="total"><strong>${total} s</strong><span class="muted small">whole journey incl. check</span></div>
          </div>
        </div>
        <img class="cuj-shot" src="assets/${s.shot}" alt="Step ${s.n} screenshot" />
      </div>`;
  }
  function mountCuj() {
    $$("[data-cuj]").forEach((b) => b.addEventListener("click", () => { cujStep = Number(b.dataset.cuj); render(); }));
  }

  function gateSlide() {
    return `
      <h2 class="chapter-title">Go / No-Go</h2>
      <div class="gate">${D.metrics.map((m) => `
        <div class="metric ${m.pass ? "" : "is-fail"}">
          <span class="metric-name">${esc(m.name)}<small>target ${esc(m.threshold)}</small></span>
          <span class="metric-val">${esc(m.baseline)}</span>
          <span class="pill ${m.pass ? "pill-pass" : "pill-fail"}">${m.pass ? "Pass" : "Fail"}</span>
        </div>`).join("")}</div>
      <div class="verdict">
        <div class="card card-accent"><p class="kicker">Technical feasibility</p><strong>GO</strong>
          <span class="muted">Ranking, API contract and persistence work end to end.</span></div>
        <div class="card card-broken"><p class="kicker">User viability</p><strong>NO-GO for now</strong>
          <span class="muted">Severe friction on the core path. We fix it before adding any new layer.</span></div>
      </div>`;
  }

  function nextSlide() {
    return `
      <h2 class="chapter-title">What doesn't work yet</h2>
      <div class="limits">
        <div class="card card-broken"><p class="kicker">Known limitations</p>
          <ul class="items">${D.limits.map(([k, v]) => `<li><strong>${esc(k)}</strong><span>${esc(v)}</span></li>`).join("")}</ul></div>
        <div class="card card-accent"><p class="kicker">Fix before adding complexity</p>
          <ul class="items">${D.next.map(([k, v], i) => `<li><strong>${i + 1}. ${esc(k)}</strong><span>${esc(v)}</span></li>`).join("")}</ul></div>
      </div>`;
  }

  function thanksSlide() {
    return `
      <div class="thanks">
        <h1 class="hero">Thank you :)</h1>
        <div class="thanks-actions">
          <button type="button" class="btn btn-primary" id="start-qa">Start Q&amp;A timer</button>
          <a class="btn" href="${D.appUrl}" target="_blank" rel="noreferrer">Open the app ↗</a>
        </div>
        <p class="hero-sub">Questions?</p>
      </div>`;
  }

  const SLIDES = {
    title: [titleSlide],
    problem: [problemSlide],
    demo: [demoSlide, mountDemo],
    topology: [topologySlide, mountTopology],
    defence: [defenceSlide],
    evidence: [evidenceSlide, mountEvidence],
    cuj: [cujSlide, mountCuj],
    gate: [gateSlide],
    next: [nextSlide],
    thanks: [thanksSlide, () => $("#start-qa").addEventListener("click", startQA)],
  };

  // ---------- Shell: navigation ----------
  const chapters = D.chapters;
  const readHash = () => Math.max(0, chapters.findIndex((c) => c.id === location.hash.slice(1)));
  let index = readHash();

  function render() {
    const c = chapters[index];
    const [view, mount] = SLIDES[c.id];
    $("#chapter").innerHTML = view();
    mount?.();
    $("#chapters").innerHTML = chapters.map((ch, i) => `
      <button type="button" class="chapter-btn ${i === index ? "is-active" : ""} ${i < index ? "is-past" : ""}" data-go="${i}" title="${i + 1}. ${esc(ch.label)}">
        <span class="chapter-num">${i + 1}</span><span class="chapter-label">${esc(ch.label)}</span></button>`).join("");
    $$("[data-go]").forEach((b) => b.addEventListener("click", () => go(Number(b.dataset.go))));
    $("#progress").style.width = `${((index + 1) / chapters.length) * 100}%`;
    $("#speaker").textContent = c.speaker;
    $("#count").textContent = `${index + 1} / ${chapters.length}`;
    $("#prev").disabled = index === 0;
    $("#next").disabled = index === chapters.length - 1;
    $$("[data-health]").forEach(paintHealth);
    $$("[data-health]").forEach((b) => b.addEventListener("click", checkHealth));
  }
  function go(i) {
    const next = Math.max(0, Math.min(chapters.length - 1, i));
    if (next === index && $("#chapter").innerHTML) return;
    index = next;
    history.replaceState(null, "", `#${chapters[index].id}`);
    render();
  }
  $("#prev").addEventListener("click", () => go(index - 1));
  $("#next").addEventListener("click", () => go(index + 1));
  window.addEventListener("hashchange", () => { index = readHash(); render(); });
  window.addEventListener("keydown", (e) => {
    if (document.fullscreenElement) return; // keys belong to the embedded app
    if (e.target.closest?.("input, textarea, select")) return;
    if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); go(index + 1); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(index - 1); }
    else if (e.key === "t" || e.key === "T") toggleTimer();
    else if (/^[0-9]$/.test(e.key)) go(e.key === "0" ? chapters.length - 1 : Number(e.key) - 1);
  });

  // ---------- Presenter timer: 10:00 talk, then 5:00 Q&A ----------
  const TALK = 10 * 60, QA = 5 * 60, WARN = 2 * 60;
  let phase = "talk", left = TALK, timerId = null;
  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  function paintTimer() {
    $("#timer-time").textContent = fmt(left);
    $("#timer-phase").textContent = phase === "talk" ? "Talk" : "Q&A";
    $("#timer-dot").classList.toggle("is-on", !!timerId);
    $("#timer").classList.toggle("is-warn", phase === "talk" && left <= WARN && left > 0);
    $("#timer").classList.toggle("is-done", left === 0);
    $("#timer-qa").style.display = phase === "talk" ? "" : "none";
  }
  function toggleTimer() {
    if (timerId) { clearInterval(timerId); timerId = null; }
    else timerId = setInterval(() => { left = Math.max(0, left - 1); paintTimer(); }, 1000);
    paintTimer();
  }
  function startQA() { phase = "qa"; left = QA; if (!timerId) toggleTimer(); paintTimer(); }
  $("#timer-main").addEventListener("click", toggleTimer);
  $("#timer-qa").addEventListener("click", startQA);
  $("#timer-reset").addEventListener("click", () => { clearInterval(timerId); timerId = null; phase = "talk"; left = TALK; paintTimer(); });

  paintTimer();
  render();
})();
