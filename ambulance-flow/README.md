# Kinetic · Ambulance Flow

A complete research simulation workspace for ambulance offload coordination. Built for Team Kinetic's CSC491 project from the shared AI Ambulance Flow Platform design.

## Run locally

Requires Node.js 22.13+ and npm. No API keys, hospital feeds, or external database accounts are required for local use.

```sh
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_aspiring_jasper_sitwell.sql
npm run dev -- --hostname 127.0.0.1
```

Open http://127.0.0.1:5173. Apply the initial migration **once** for a new local database. Data survives server restarts in the ignored `.wrangler/state/` directory. Hosting uses its own separately provisioned D1 database; local demo/test records are never uploaded.

## What works

- **Overview:** geographic network schematic, measured KPIs, scenario presets, recent runs.
- **Scenario builder:** saved configurations, 5–50 ambulances, 2–10 hospitals, 1–12 hour horizons, configurable arrivals, capacity, handover duration, reporting lag, seeds, policies, and dispatcher approval.
- **Live operations:** play/pause/stop, speed control, persisted clock, selectable map markers, estimated routes, fleet filtering, event history, and manual destination confirmation.
- **Hospital network:** queues, inbound commitments, active handovers, P90 offload, completion history, and capacity changes including closure to new handovers.
- **AI intelligence:** explainable V1 queue-workload predictions, 15/30/60-minute projections, report freshness, sensitivity ranges, and congestion flags.
- **Evaluation:** matched baseline/coordinated experiments over 3–10 distinct seeds, paired uncertainty intervals, per-seed outcomes, saved results, CSV and full JSON export.

Try the normal scenario, enable dispatcher approval, approve a destination, reduce Toronto General's slots, inspect forecasts, and run a three-seed comparison. The surge preset increases arrivals and reduces the first hospital to one slot at one quarter of the horizon.

## Architecture

The design's recommended Python/Supabase stack was adapted to a self-contained TypeScript implementation for local and private Sites hosting:

- React 19 / TypeScript, Next-compatible Vinext, responsive CSS, Lucide icons.
- Server-side API routes in `app/api/[...path]/route.ts` on Cloudflare Workers.
- Pure deterministic simulation and policy logic in `lib/simulation.ts`.
- D1 SQLite storage with Drizzle schema/migrations for scenarios, runs, event journals, and evaluations.
- Optimistic revision checks and transactional snapshot/event writes prevent lost updates and journal divergence.
- The browser requests clock advancement while Play is enabled. Closing the tab stops advancement; opening a saved run starts with Play disabled. All six views share one run snapshot. This is request-driven simulation, not an unattended background worker or push subscription service.

Hospital state and ambulance positions are embedded in the run snapshot for atomic updates; the event journal is stored separately. This avoids a distributed synchronization layer in the first release. Hosted access is owner-private through Sites. This version is one research workspace, not a multi-tenant hospital system; changing its audience would share that workspace's saved simulations.

## Simulation and evaluation assumptions

- One-minute discrete time steps; seeded exponentially distributed call arrivals. Demand is generated before a run, independently of destination policy.
- Lifecycle: AVAILABLE → ASSIGNED → ON_SCENE → AWAITING_DECISION → EN_ROUTE → WAITING_TO_OFFLOAD → HANDOVER → AVAILABLE.
- A confirmed destination immediately adds inbound demand. Only arrivals enter the hospital queue. Queues use FIFO handover slots; reducing capacity does not cancel handovers already underway.
- Synthetic general/specialist capability rules filter eligibility. They do not describe real hospital clinical services.
- The predictor sees delayed queue/capacity observations and known commitments, never future incidents or the hidden current queue. It projects a fluid workload using configured mean service time; service times vary by case.
- V1 is an explainable analytic predictor. A trained XGBoost model and LLM assistant were future versions in the source design and are not represented as implemented or validated here.
- Displayed forecast ranges are heuristic sensitivity bands, **not calibrated confidence intervals**. Forecasts omit unknown future arrivals and are capped at 180 minutes for offload estimates.
- Travel is distance × 1.35 at an assumed 33 km/h, with a 3-minute minimum. Map roads and route lines are schematic, not navigable road geometry. Coordinates are approximate.
- Offload = queue wait + handover. Destination travel excludes the initial response leg. Availability is available fleet-minutes / total fleet-minutes.
- Offload and travel summaries include completed cases only. Every result includes unfinished and completed counts to expose censoring. An empty completed-case sample yields 0 in exported metrics; interpret it as no observations, not zero delay.
- Comparisons use common incident schedules and per-case service factors for each policy. They ignore interactive manual edits and rerun the saved scenario with automated policy decisions. Results show paired Student-t 95% intervals on coordinated-minus-baseline differences. These small-sample synthetic intervals do not establish real-world benefit.
- Initial queues are empty; no warmup period is discarded. The simulation stops at the horizon and reports all unfinished cases rather than silently draining them.

## API

All paths begin with `/api`. JSON writes validate bounds with Zod; browser cross-origin writes are rejected.

| Method | Path | Purpose |
| --- | --- | --- |
| GET / POST | `/scenarios` | List or save a scenario configuration |
| GET | `/scenarios/:id` | Read a saved scenario |
| GET / POST | `/runs` | List runs or create one using `{scenarioId}` |
| GET | `/runs/:id/state` | Current persisted snapshot and revision |
| POST | `/runs/:id/control` | `{revision, action}`; advance, pause, resume, stop, policy, manual, capacity |
| POST | `/runs/:id/decisions` | `{revision, ambulanceId, hospitalId}`; confirm an eligible destination |
| GET | `/runs/:id/choices?ambulanceId=...` | Ranked destination estimates |
| GET | `/runs/:id/predictions` | Hospital forecasts at three horizons |
| GET | `/runs/:id/events` | Complete ordered event journal |
| GET | `/runs/:id/metrics` | Current measurements |
| GET | `/runs/:id/export` | Snapshot, complete history, metrics, methodology |
| POST | `/runs/compare` | `{config, seeds}`; persist a matched policy comparison |
| GET | `/evaluations` | Saved comparison results |
| GET | `/health` | Service configuration check |

Example advance: `{ "revision": 0, "action": "advance", "minutes": 15 }`. Concurrent stale writes return HTTP 409; fetch state before retrying. Ended runs are immutable. Start another run from the same scenario to repeat an experiment.

## Verification

```sh
npm test
npm run typecheck
npm run build
# With the local server running and Google Chrome installed:
npm run test:e2e
```

Unit tests cover determinism, conservation, lifecycle transitions, eligibility, stale observations, closures, pause/stop behavior, and matched evaluation. Browser/API acceptance tests cover configuration, manual decisions, capacity edits, forecasts, comparison/export, persistence, mobile layout, input validation, cross-origin rejection, revision races, and event completeness. Screenshots and traces are ignored under `outputs/`.

## Data provenance

Only public names/addresses inform the base geography: [UHN directions](https://www.uhn.ca/corporate/Directions/), [Michael Garron](https://www.tehn.ca/), [Sunnybrook locations](https://sunnybrook.ca/locations/), and [Ontario hospital locations](https://www.ontario.ca/page/general-hospital-locations). Sites 6–10 are entirely virtual. All operational data is generated, and no identifiable patient data is collected.

This is a planning and research demonstration, not an operational dispatch or clinical decision system. Real deployment would require validated models, authentic integrations, clinical/operational governance, and security review.
