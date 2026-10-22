# Kinetic presentation

A minimal 10-slide deck (including 4.5 and 7.5). No dependencies or build step.

## Open

Terminal 1:

```sh
cd ambulance-flow
npm run dev
```

Terminal 2, from the repository root:

```sh
node presentation/serve.mjs
```

Open **http://127.0.0.1:5190**. The app is on **http://127.0.0.1:5173**.
The server now supplies the same app URL to both the embedded pages and the read-only API proxy. For another app port, set it once:

```sh
APP_URL=http://127.0.0.1:8787 node presentation/serve.mjs
```

Restart the presentation server after changing `serve.mjs`. Refresh the browser after editing slide content.

## Controls

- Left/right arrows or PageUp/PageDown: previous/next slide.
- Number keys 1–8: jump to that numbered main slide. Use the bottom buttons or arrows for 4.5 and 7.5.
- T: start/pause the 10-minute timer. ↺ resets it.
- Simulator: switch between Setup and Live operations; use the embedded app normally.
- Evaluation: run a matched comparison in the embedded app.
- Open app / Full screen: expand the live demonstration.
- Click outside the embedded app to return keyboard control to the deck.

The live app controls change local simulation data when used. The presentation server's API proxy remains GET-only. Navigating away removes the iframe; saved app state remains in the app's browser storage/database. Pause an active simulation before leaving its slide.

## Add the three media assets

Place your files in `presentation/assets/`, then edit `media` in `content.js`:

```js
media: {
  openingVideo: 'assets/opening.mp4',
  productVideo: 'assets/product-demo.mp4',
  productScreenshot: 'assets/product-screenshot.png',
},
```

Both videos are now in `assets/`: `opening.mp4` (66 s, AI narration and generated sound over motion graphics, incident facts from Shared Health Manitoba and CBC) and `product-demo.mp4` (30 s, cut from a real screen recording of the patient Overview). A video shows `<name>-poster.jpg` before it plays. The product slide has a **Demo video / Try it live** toggle that swaps the video for the real Overview page. Empty paths show placeholders. Videos use native playback controls and never autoplay. Leaving the slide stops playback. The screenshot fits without cropping.

## Order and timing

| Slide | Content | Time |
| --- | --- | ---: |
| 1 | Opening AI video placeholder | 1:00 |
| 2 | Baseline timeline; offload bottleneck | 1:00 |
| 3 | Current vs target journey | 0:45 |
| 4 | Product video placeholder | 0:30 |
| 4.5 | Actual app screenshot placeholder | 0:30 |
| 5 | Live simulator (setup + operations) | 2:00 |
| 6 | Architecture and decision | 1:30 |
| 7 | Live evaluation | 0:30 |
| 7.5 | Quantitative validation gate | 0:30 |
| 8 | Proof boundaries | 0:30 |
| | Core total | **8:45** |
| | Transition/demo buffer | **1:15** |
| | Total | **10:00** |

## Presenter notes (kept off the slides)

**2 — Baseline:** Patient condition determines suitable hospitals. Paramedics/dispatch use PDS, protocols, distance, experience, and sometimes direct confirmation. Transport ends at arrival, but the crew remains unavailable until handover. Interview connection supplied for this presentation: Kelly described PDS as useful but sometimes inaccurate/outdated, with unexpected simultaneous ambulance arrivals. The target is offload time and lost ambulance availability.

**3 — Concept:** Emergency Transport Coordinator compares clinically appropriate hospitals using travel time and expected offload, with the final destination decision kept with the user. “Handover sooner” is the target outcome, not a measured effectiveness claim.

**5 — Simulator:** Configure a scenario, start it, inspect changing hospital queues/inbound ambulances, and demonstrate a destination decision. Inputs, capabilities, capacities and routing times are synthetic.

**6 — Defence:** Context → constraint → options → decision → tradeoff. Next.js / FastAPI / PostgreSQL (or Supabase) is the requested **proposed** architecture. The actual prototype uses React/Vinext, TypeScript route handlers and simulation functions, and Cloudflare D1. Its research workflows use server APIs; the simplified patient Overview runs a synthetic snapshot in the browser. A future real feed needs an adapter and validation; current code does not have a completed plug-in replacement for real EMS data.

**7 / 7.5 — Gate:** Set the threshold before running the experiment: at least 15% less average ambulance unavailable time and zero eligibility violations. Use matched scenarios/seeds and define the metric's start/end and treatment of unfinished cases. The current evaluation page reports travel, offload, fleet availability and unfinished cases; it does **not** directly report mean full-call unavailable time or an eligibility-violation count. Do not substitute offload reduction or availability percentage points for this gate.

**8 — Limitations:** “Our POC validates the technical approach under controlled conditions. The next validation step would require access to real operational data and EMS partners.” Technical workflow evidence is distinct from improved clinical outcomes.

## Add a measured gate result

Slide 7.5 starts at **NOT TESTED**. The percentages in the presentation brief were examples, not results; they are not displayed as evidence. The old `accuracy-data.js` dataset is retained on disk but is no longer loaded or used to claim routing improvement.

After measuring the declared metric and auditing eligibility, set `validation` in `content.js` to an object with:

- `baselineMinutes`: positive mean unavailable time for nearest routing.
- `coordinatedMinutes`: nonnegative mean for coordinated routing.
- `eligibilityViolations`: nonnegative integer from the audit (do not assume zero).
- `metric`: exact metric definition, including the time window/population.
- `source`: experiment/report identifier and matched seeds.

The deck computes `(baselineMinutes - coordinatedMinutes) / baselineMinutes * 100`. It shows GO only for at least 15% reduction and zero violations; otherwise NO-GO. Invalid/incomplete inputs remain NOT TESTED. No example result is prefilled.
