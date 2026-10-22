// Slide content for the Demo 1 deck. Numbers come from the Demo 1 release
// (dcsil/Kinetic demo1/) and from accuracy-data.js.

window.DECK = {
  team: {
    name: "Kinetic",
    product: "Ambulance Flow",
    members: [
      { name: "Azaria Kelman", photo: "assets/azaria.jpg" },
      { name: "Richard Xu", photo: "assets/richard.jpg" },
    ],
  },

  appUrl: "http://127.0.0.1:8787/",

  // Slide order and who presents each one.
  chapters: [
    { id: "title", label: "Intro", speaker: "Azaria & Richard" },
    { id: "problem", label: "The decision", speaker: "Azaria" },
    { id: "demo", label: "Live demo", speaker: "Richard" },
    { id: "topology", label: "System topology", speaker: "Richard" },
    { id: "defence", label: "Architectural defence", speaker: "Richard" },
    { id: "evidence", label: "Proof of concept", speaker: "Richard" },
    { id: "cuj", label: "Baseline CUJ", speaker: "Azaria" },
    { id: "gate", label: "Go / No-Go", speaker: "Azaria" },
    { id: "next", label: "What doesn't work yet", speaker: "Azaria & Richard" },
    { id: "thanks", label: "Thank you", speaker: "Azaria & Richard" },
  ],

  persona: {
    name: "Maya",
    role: "EMS flow lead, Toronto paramedic service",
    context:
      "Watches the fleet during a shift and decides which emergency department each crew heads to once a patient is ready to move. Several crews are often waiting on her at once.",
    goal: "Send a waiting ambulance to the hospital with the shortest travel + offload, and have it saved, in under 30 seconds without leaving the app.",
  },

  // Real ranked output for AMB-110 / CASE-002 (seed 42) from the walkthrough.
  ranking: {
    caption: "Real output for AMB-110 (seed 42). Toronto General is closer than Toronto Western but ranks lower because of its predicted offload.",
    rows: [
      { name: "Michael Garron", travel: 3, offload: 15.3 },
      { name: "Sunnybrook", travel: 12, offload: 18 },
      { name: "Toronto Western", travel: 17, offload: 18 },
      { name: "Toronto General", travel: 14, offload: 23.4 },
      { name: "St. Joseph's", travel: 27, offload: 18 },
    ],
  },

  working: ["Ranking computed live, not hardcoded", "Confirm saved through the real API", "Ambulance travels, queues, hands over"],

  // Shown next to the live demo so we don't hide friction.
  broken: ["Clock runs while you decide (severe)", "Pause can be ignored mid-request", "Offload range misses 37% of cases", "Inputs are synthetic, logic is real"],

  // Topology tiers. `step` lists which trace steps light the tier up.
  tiers: [
    { id: "ui", name: "UI tier", tech: "React 19 + Vinext", steps: [1, 4],
      points: ["6 views share one run snapshot", "Review next and Confirm live in Live operations", "No business rules in components", "Only talks to the backend through /api"] },
    { id: "api", name: "API tier", tech: "app/api/[...path]/route.ts", steps: [2, 4, 5],
      points: ["GET /api/runs/:id/choices", "POST /api/runs/:id/decisions", "Zod schema checks every write", "Stale revision returns HTTP 409", "Blocks cross-origin writes"] },
    { id: "logic", name: "Logic tier", tech: "lib/simulation.ts", steps: [3, 5],
      points: ["choices(): rank by travel + offload", "forecast(): delayed reports + commitments", "decide(): eligibility, then commit", "Pure functions, no I/O, 9 unit tests"] },
    { id: "data", name: "Data tier", tech: "Cloudflare D1 + Drizzle", steps: [5],
      points: ["scenarios (config JSON)", "simulation_runs (state JSON, revision)", "simulation_events (journal)", "evaluations (results)"] },
  ],

  trace: [
    { n: 1, text: "Maya clicks Review next on a waiting ambulance" },
    { n: 2, text: "UI calls GET /api/runs/:id/choices for that ambulance" },
    { n: 3, text: "choices() ranks eligible hospitals by travel + predicted offload" },
    { n: 4, text: "Maya clicks Confirm: POST /api/runs/:id/decisions with the run revision" },
    { n: 5, text: "decide() commits; the API saves run state and the event to D1 atomically (409 if stale)" },
  ],

  // Baseline CUJ (demo1/baseline-cuj.md). friction: none | moderate | severe
  cuj: [
    { n: 1, action: "Open the workspace", time: 5, friction: "none", shot: "01-overview.jpg", note: "Page load 0.2 s measured." },
    { n: 2, action: "Read Scenario builder defaults", time: 20, friction: "moderate", shot: "02-scenario-builder.jpg", note: "12 sliders and presets before anything happens." },
    { n: 3, action: "Turn on dispatcher approval, Start", time: 12, friction: "moderate", shot: "03-dispatcher-approval.jpg", note: "The setting the task needs is off by default and last on the page." },
    { n: 4, action: "Wait for the first case", time: 9, friction: "none", shot: "04-decisions-piling-up.jpg", note: "8.6 s measured until a decision is waiting." },
    { n: 5, action: "Pause the clock", time: 10, friction: "severe", shot: "04-decisions-piling-up.jpg", note: "Clock keeps running: 2 to 17 waiting decisions in about 30 s. One Pause click was dropped." },
    { n: 6, action: "Compare 5 ranked hospitals", time: 20, friction: "moderate", shot: "05-ranked-destinations.jpg", note: "Ranking is clear, but terms like 'offload range' need explaining." },
    { n: 7, action: "Confirm the top choice", time: 3, friction: "none", shot: "06-destination-confirmed.jpg", note: "One click, 0.8 s measured." },
    { n: 8, action: "Check the outcome", time: 20, friction: "moderate", shot: "07-hospital-network.jpg", note: "No follow-up card: switch views and find the ambulance." },
  ],

  metrics: [
    { name: "Review next → confirmed", threshold: "≤ 30 s", baseline: "23 s", pass: true },
    { name: "Open app → confirmed", threshold: "≤ 90 s", baseline: "79 s", pass: true },
    { name: "Severe friction on core path", threshold: "0", baseline: "1", pass: false },
    { name: "Context switches per decision", threshold: "≤ 2", baseline: "2", pass: true },
    { name: "Decisions saved (state + event)", threshold: "100%", baseline: "100 / 100", pass: true },
    { name: "Travel prediction exact", threshold: "100%", baseline: "88 / 88", pass: true },
    { name: "Actual offload inside range", threshold: "≥ 80%", baseline: "63%", pass: false },
    { name: "API p95 latency (local)", threshold: "≤ 200 ms", baseline: "< 100 ms", pass: true },
  ],

  // Formal contracts that let each tier change without rewriting the others.
  contracts: [
    { title: "REST + Zod contract", code: "POST /api/runs/:id/decisions\n{ revision, ambulanceId, hospitalId }\n200 run | 400 invalid | 409 stale",
      why: "UI only knows these JSON shapes, so logic can move to its own service." },
    { title: "Pure logic tier", code: "choices(run, ambulanceId)\ndecide(run, ambulanceId, hospitalId)",
      why: "No I/O. A trained model can replace the forecast behind the same signature." },
    { title: "Schema + migration", code: "simulation_runs(state, revision)\nsimulation_events(run_id, sequence)",
      why: "Drizzle schema in code, so D1 to Postgres is a driver change." },
    { title: "Revision + journal", code: "UPDATE ... WHERE revision = ?\n+ events in the same batch",
      why: "Safe concurrent writes, ready for async workers later." },
  ],

  scopeNow: ["One primary interaction, end to end", "Four tiers with formal contracts", "Persistence with optimistic locking", "One Worker deployment"],
  scopeLater: ["Real CAD and hospital feeds", "Trained forecast model", "Accounts, multi-tenant data", "Background worker, push updates", "Tiers as separate services"],

  limits: [
    ["Inputs are synthetic", "No real CAD or ED data yet. The logic is real; the inputs are generated from a seed."],
    ["Clock runs during decisions", "Waiting decisions pile up faster than one person can handle."],
    ["Dropped Pause click", "A click during an in-flight advance can be skipped."],
    ["Uncalibrated range", "Only 63% of offloads fell inside it. Labelled as a heuristic."],
    ["Request-driven clock", "Time only moves while a tab has Play on."],
    ["Private host", "The Sites deploy is owner-only, so we demo locally."],
  ],

  next: [
    ["Auto-pause on pending decisions", "Fixes the severe point. Resume after Confirm."],
    ["Never drop Pause", "Cancel auto-play before sending pause."],
    ["Calibrate the range", "Widen using measured errors until ≥ 80% coverage."],
    ["Approval-first setup", "Dispatch drill preset, toggle next to Start."],
  ],
};
