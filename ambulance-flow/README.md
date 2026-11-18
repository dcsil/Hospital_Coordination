# Kinetic · Ambulance emergency simulation

Simulate patient pickup, hospital transport and handover, then compare
**nearest eligible hospital** with **coordinated travel + offload** routing.
Historical hospital offload baselines and available live ED readings describe
hospital background conditions; simulated cases determine extra queue delay.

## Run and test

```sh
cd ambulance-flow
npm run dev
# http://127.0.0.1:5173
```

Use the repository installation workflow (`npm run install:ci`) if dependencies
are missing. Existing local D1 tables are used for saved scenarios, runs, events
and evaluations; no schema changes are introduced by this update.

```sh
npm test
npm run typecheck
npm run build
# With npm run dev running in a separate terminal:
npm run test:e2e
```

## Demo workflow

1. Choose a location in Overview and click **Simulate pickup at this location** to start patient transport there, or open **Scenario builder**, choose pickup demand, maximum concurrent transports, hospital slots, handover
   duration, reporting delay and seed, then Start simulation.
2. **Live operations** shows only ambulances carrying patients, from pickup through handover. Idle vehicles and pre-pickup cases are excluded from the map, activity table and event stream. New cases begin at pickup; there is no response or scene-time stage. Play, pause, step or change speed.
3. Use **Add pickup** to schedule an additional picked-up patient for the next simulation
   minute. Seeded pickup opportunities continue at the configured rate. The internal transport-capacity pool is not displayed; an opportunity that cannot yet be assigned is not counted as a picked-up patient.
4. Enable dispatcher approval to inspect estimated travel, hospital offload
   components and total time, then confirm a destination. Otherwise the configured
   policy decides automatically.
5. **Hospital network** shows simulated queues, slots, completions and source-based
   offload components. Capacity edits change the simulated hospital.
6. **Evaluation** reruns both policies over identical emergencies for each selected
   seed and one frozen ED snapshot. It reports mean offload, P90, travel + offload,
   travel, picked-up, completed and unfinished transport counts, with paired intervals.
   Interactive emergency injections and capacity edits are not replayed: evaluation
   reruns the saved configuration, as explicitly labelled in the dashboard.

Overview uses the **active run’s dynamic queue model** at each hospital’s travel-time arrival horizon, combined with historical/live inputs. Play, pause, speed and step controls appear on Overview too. As the simulation clock advances, inbound patients arrive and handovers finish, queue adjustments and rankings are recomputed. Paused runs can advance five minutes with Step. If travel is unavailable, queue projection explicitly assumes immediate arrival.

Without an active run, Overview clearly labels its estimates as historical/live background only. Select a location and **Simulate pickup at this location** to start or join a run. Overview is a hypothetical new patient forecast; destination inspection in Live operations also applies the selected case’s synthetic capability constraints.

Overview navigation is explicit: **1. Select pickup location → 2. Select destination → 3. Confirm arrival**. Location selection is the first main panel. A saved search prefills the location field without automatically skipping Step 1. Opening the selected destination in Google Maps (a separate tab) saves the destination and departure estimates, then leaves **Arrived at hospital** confirmation in the app. This state and manual arrival confirmation persist across reloads. **New journey** returns to location selection. The confirmation is browser journey state and does not mark a simulated handover complete.

## Travel, as currently authorized

Travel uses **estimated simulation times**, not Google Maps results:

```text
minutes = max(3, ceil(straight-line km × 1.35 / 0.55))
```

The same estimator drives pickup-to-hospital recommendations, ambulance movement timing and both evaluation policies. Pre-pickup travel and scene time are not part of the tracked simulation. Travel source is included in run/evaluation metadata and the
UI. Coordinates and schematic paths are approximate; there is no live traffic or
ambulance-priority routing. The previous OSRM integration has been removed.

The user approved estimated travel for now. Google Routes remains a future
integration, requiring a server-side key, billing-enabled project and Routes API.
No key is required or exposed by this version. Do not describe these estimates
as Google travel.

## Offload model and simulated outcomes

```text
source baseline = historical offload + comparable live ED adjustment
expected base   = max(configured mean slot service, source baseline)
background     = expected base − configured mean slot service

predicted offload = expected base + simulated projected queue delay
actual simulated offload = background + realized queue delay + case slot service
```

The historical baseline already includes normal offload waiting. Rather than
adding an independent historical queue allowance, we explicitly represent its
non-slot portion as a background preparation delay. A case joins the hospital's
waiting list on arrival and becomes ready for a handover slot after that delay.
Among ready cases, FIFO uses readiness and arrival order. Active handovers occupy
configured concurrent slots. Case slot service is the hospital mean multiplied
by the seeded per-case factor (0.65–1.35), rounded to whole simulation minutes.

The predictor schedules reported handover releases, waiting cases' readiness
and committed inbound ETAs on the same slot model. It evaluates the candidate
at arrival plus background readiness, using mean service, and excludes the
candidate from its own inbound count. Additional queue delay is added in full
(default `queueWeight=1`). It no longer hides congestion behind the earlier
`baseline − service` subtraction. A service-floor component is displayed if the
configured handover mean exceeds the sourced baseline.

**This decomposition is a demo assumption, not a validated clinical process.**
It makes the predictor and generated outcomes consistent, addressing the earlier
mismatch where routing used 28–60 minute historical baselines while outcomes
were generated solely from 15–23 minute handovers. This does not ensure that
coordinated routing wins every metric or establish real-world forecast accuracy.

Zero reported capacity makes a destination ineligible and uses a capped sentinel;
active handovers still finish. Queue/capacity/readiness/release observations obey
the scenario's reporting delay; the predictor does not read hidden current queues
or future unannounced cases. Forecast sensitivity ranges are heuristic, not
calibrated confidence intervals. Output cap defaults to 180 minutes.

## Historical/live inputs and fair evaluation

- Approximate whole-minute Toronto 2022–2023 offload baselines are stored locally.
  Missing sites use the documented 13-hospital median, labelled fallback.
- ER Compass posted ED waits are compared only with the same hospital's same
  metric history. Default live sensitivity is 60 minutes per unit relative
  deviation, bounded to ±100%. Freshness is full through 30 real minutes, then
  fades to zero at 180. Missing/invalid data gives no live adjustment.
- The server cache refreshes every 15 real minutes while used. API failures retain
  valid cached readings or fall back to history. Live freshness uses wall time;
  simulated emergency timing uses the scenario clock.
- The old static monthly ED congestion multiplier is not added. Monthly Ontario
  ED metrics remain separate historical context and never become ambulance queues.
- Active runs attach the latest cached ED snapshot on state/control requests.
  Evaluation captures a snapshot once and applies the same observation and
  evaluation time to every policy and seed; it is included in exported inputs.
- Clinical capabilities, demand, slots, queues, movements and completion outcomes
  are simulated. Synthetic capability rules do not describe real hospitals.
- Completed-case averages exclude unfinished transports. Unfinished now means picked up but not yet handed over; patients awaiting pickup are excluded. Fleet availability and response-stage metrics are not displayed or compared. Inspect censoring counts;
  short horizons can bias apparent performance. Simulated benefit is not
  independently verified prediction accuracy.

Source detail: [historical cleaning](data/README.md), [live feed](data/LIVE_ED.md).
Model parameters are in `DEFAULT_PREDICTION` and scenario `config.prediction`.
New runs/evaluations use `modelVersion: 3`; incompatible old runs/evaluations
remain in the database but are not mixed into this model's results.

## API

- `/api/scenarios`, `/api/runs`, `/api/runs/:id/state`, `/control`, `/decisions`,
  `/predictions`, `/choices`, `/events`, `/export`, `/api/runs/compare` and
  `/api/evaluations` are restored.
- POST `/api/runs/:id/control` accepts `action: emergency` (schedule a pickup) with the current revision, optionally with both `lat` and `lng` for a supplied Toronto location.
- POST control `action: step` advances the clock even while paused and preserves the paused state.
- `/api/ed-data` exposes a public-data snapshot with no credentials.
- `/api/hospitals` returns source-only hospital estimates without simulated queues.
- `/api/travel?lat=...&lng=...` returns labelled temporary travel estimates.
- `/api/health` reports simulation mode and the estimated travel source.

Revision checks and transactional event writes remain in place. Real operational
hospital queues or ambulance offload observations are not connected.
