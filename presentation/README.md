# Demo 1 presentation

Interactive deck for the Demo 1 (A4) live demo. Plain HTML, CSS and JS, no build step and no dependencies.

## Run it

1. Start the app from `ambulance-flow/` (see its README): `npm run build`, apply the migration once, then `npm start`. It runs on http://127.0.0.1:8787.
2. From the repo root: `node presentation/serve.mjs`
3. Open http://127.0.0.1:5190

`serve.mjs` serves the deck and forwards `GET /api/*` to the app, so the live API console works without CORS. It is read-only: it never forwards writes.

## Slides

1. Intro: team and an animated network on the real hospital coordinates
2. The decision: persona, goal, and a real ranked output showing nearest isn't always fastest
3. Live demo: the running app embedded, with what works and what doesn't work yet side by side
4. System topology: click through the 5 steps of the primary interaction, plus live API calls
5. Architectural defence: the contracts and schema that let us split tiers later, and our scope
6. Proof of concept: predicted vs actual offload for 88 cases, hover for details
7. Baseline CUJ: timeline of the 8 steps by time and friction, click for the screenshot
8. Go / No-Go: every success metric, technical GO and user viability NO-GO for now
9. What doesn't work yet, and what we fix before adding complexity
10. Thank you and the Q&A timer

Keys: ←/→ or PageUp/PageDown, 1 to 9 to jump (0 for the last slide), T starts or pauses the timer (10:00 talk, then 5:00 Q&A).

## Data

- `content.js`: slide text, CUJ steps and metrics, matching the Demo 1 release in [dcsil/Kinetic](https://github.com/dcsil/Kinetic/tree/master/demo1)
- `accuracy-data.js`: 100 dispatcher decisions driven through the real API (default scenario, seed 42)
- `assets/`: CUJ screenshots and team photos
