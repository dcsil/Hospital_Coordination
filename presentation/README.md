# Kinetic presentation

An 11-slide deck (including 3.5 and 8.5). No dependencies or build step. It runs fully offline: only the **Try it live** tab on slide 5 needs the app.

## Open

From the repository root:

```sh
node presentation/serve.mjs
```

Open **http://127.0.0.1:5190**. To use **Try it live** on slide 5, also run the app (`cd ambulance-flow && npm run dev`, on **http://127.0.0.1:5173**). For another app port:

```sh
APP_URL=http://127.0.0.1:8787 node presentation/serve.mjs
```

Restart the presentation server after changing `serve.mjs`. Refresh the browser after editing slide content.

## Controls

- Left/right arrows or PageUp/PageDown: previous/next slide.
- Number keys 1–9: jump to that numbered main slide. Use the bottom buttons or arrows for 3.5 and 8.5.
- T: start/pause the 10-minute timer. ↺ resets it.
- Simulator (6): Setup builds a scenario, Live operations plays it. With dispatcher approval on, click a pulsing ambulance or **Review next**, then **Confirm** a hospital. Reset starts over.
- Evaluation (8): pick a scenario and number of matched seeds; the comparison reruns instantly.
- Full screen: expands the demo frame.

## How the simulator and evaluation work offline

`sim.js` is `ambulance-flow/lib/simulation.ts` bundled for the browser, so slides 6 and 8 run the same simulation and ranking logic as the app's API, just client-side with no database. `sim-views.js` draws the Scenario builder, Live operations and Evaluation views on top of it. Nothing is saved. To rebuild after the simulation changes:

```sh
cd ambulance-flow
npx esbuild lib/simulation.ts --bundle --format=iife --global-name=Sim --target=es2020 --outfile=../presentation/sim.js
```

## Media and the product demo

Place your files in `presentation/assets/`, then edit `media` in `content.js`:

```js
media: {
  openingVideo: 'assets/opening.mp4',
},
```

`assets/opening.mp4` is the opening video (66 s, AI narration and generated sound over motion graphics, incident facts from Shared Health Manitoba and CBC). It shows `opening-poster.jpg` before it plays, uses native controls and never autoplays.

The product slide is not a video. `product-mock.js` is a small HTML/CSS/JS copy of the app's patient Overview that you can click through. **Play demo** moves a cursor through one journey (Yonge & Bloor, critical, compare, start route, arrive) with captions, about 22 s. The rankings come from `journeys.js`, which was generated from the app's real `lib/simulation.ts` (default scenario, 60 min in) for the 5 demo locations and 3 urgencies, so the numbers match the app. **Try it live** swaps in the real Overview page. The mock scales to fit the frame, so it never scrolls.

## Order and timing

| Slide | Content | Time |
| --- | --- | ---: |
| 1 | Opening AI video | 1:00 |
| 2 | Title: Kinetic, product, team | 0:15 |
| 3 | Baseline timeline; offload bottleneck | 0:45 |
| 3.5 | Baseline CUJ: persona, goal, step times, friction, metrics, go/no-go | 0:45 |
| 4 | Current vs target journey | 0:45 |
| 5 | Product demo (clickable copy + autoplay, or live app) | 0:30 |
| 6 | Simulator (setup + live operations, offline) | 2:00 |
| 7 | Architecture, decision and API contract | 1:30 |
| 8 | Evaluation (matched seeds, offline) | 0:45 |
| 8.5 | Quantitative validation gate | 0:30 |
| 9 | Proof boundaries | 0:30 |
| | Core total | **9:45** |
| | Transition/demo buffer | **0:15** |
| | Total | **10:00** |

## Presenter notes (kept off the slides)

**3 — Baseline:** Patient condition determines suitable hospitals. Paramedics/dispatch use PDS, protocols, distance, experience, and sometimes direct confirmation. Transport ends at arrival, but the crew remains unavailable until handover. Interview connection supplied for this presentation: Kelly described PDS as useful but sometimes inaccurate/outdated, with unexpected simultaneous ambulance arrivals. The target is offload time and lost ambulance availability.

**4 — Concept:** Emergency Transport Coordinator compares clinically appropriate hospitals using travel time and expected offload, with the final destination decision kept with the user. “Handover sooner” is the target outcome, not a measured effectiveness claim.

**6 — Simulator:** Configure a scenario, start it, inspect changing hospital queues/inbound ambulances, and demonstrate a destination decision. Inputs, capabilities, capacities and routing times are synthetic.

**7 — Defence:** Context → constraint → options → decision → tradeoff. Next.js / FastAPI / PostgreSQL (or Supabase) is the requested **proposed** architecture. The actual prototype uses React/Vinext, TypeScript route handlers and simulation functions, and Cloudflare D1. Its research workflows use server APIs; the simplified patient Overview runs a synthetic snapshot in the browser. A future real feed needs an adapter and validation; current code does not have a completed plug-in replacement for real EMS data.

**8 / 8.5 — Gate:** Set the threshold before running the experiment: at least 15% less average ambulance unavailable time and zero eligibility violations. Use matched scenarios/seeds and define the metric's start/end and treatment of unfinished cases. The current evaluation page reports travel, offload, fleet availability and unfinished cases; it does **not** directly report mean full-call unavailable time or an eligibility-violation count. Do not substitute offload reduction or availability percentage points for this gate.

**9 — Limitations:** “Our POC validates the technical approach under controlled conditions. The next validation step would require access to real operational data and EMS partners.” Technical workflow evidence is distinct from improved clinical outcomes.

## Add a measured gate result

Slide 7.5 starts at **NOT TESTED**. The percentages in the presentation brief were examples, not results; they are not displayed as evidence. The old `accuracy-data.js` dataset is retained on disk but is no longer loaded or used to claim routing improvement.

After measuring the declared metric and auditing eligibility, set `validation` in `content.js` to an object with:

- `baselineMinutes`: positive mean unavailable time for nearest routing.
- `coordinatedMinutes`: nonnegative mean for coordinated routing.
- `eligibilityViolations`: nonnegative integer from the audit (do not assume zero).
- `metric`: exact metric definition, including the time window/population.
- `source`: experiment/report identifier and matched seeds.

The deck computes `(baselineMinutes - coordinatedMinutes) / baselineMinutes * 100`. It shows GO only for at least 15% reduction and zero violations; otherwise NO-GO. Invalid/incomplete inputs remain NOT TESTED. No example result is prefilled.
