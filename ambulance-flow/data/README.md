# Historical offload prediction

The hybrid predictor replaces the original fluid estimate in `lib/simulation.ts`.
The simulator's event engine and synthetic handover durations are unchanged.
Historical baselines calibrate recommendations, not the synthetic outcome generator.

## Sources and cleaning

- [Toronto Auditor General supplementary report, July 16, 2024, page 3](https://www.toronto.ca/legdocs/mmis/2024/cc/bgrd/backgroundfile-247763.pdf): average ambulance offload time for 13 hospitals over **2022–2023**. The chart has no numeric labels. `toronto-offload.json` contains **approximate whole-minute digitizations**, not exact published means. The PDF is retained locally. Blue vector bar endpoints were measured against the 0 and 60 minute gridlines (227.9956 and 522.185 PDF points). Coordinates and conversion are in the cleaning script.
- [Ontario ED CSV](https://raw.githubusercontent.com/Nshipyard/ontario-er-waits/main/public/data/er_waits_ranked.csv), from [Nshipyard/ontario-er-waits](https://github.com/Nshipyard/ontario-er-waits): local snapshot contains August 2025–August 2026 monthly data. `ontario-ed-source.csv` preserves the download, `ontario-ed-clean.csv` converts mean and P90 hours to minutes and keeps case counts. Rows with invalid, missing or negative numbers are excluded; counts and source SHA256 digests are in `hospital-history.json`. This is a third-party dataset; it is not a live hospital feed.

`hospital-history.json` is a compact import used in both browser and server, with
no runtime network or database changes. Stable ED source IDs match Toronto General
1359, Toronto Western 1364, Michael Garron 4935, Sunnybrook 4931 and St. Joseph's
Toronto 4800 (not St. Joseph's Hamilton or London).

Approximate offload baselines are respectively **58, 59, 36, 28 and 60 minutes**.
Missing offload records, including virtual sites, use the **43 minute median of
all 13 digitized hospitals** and are marked as fallback. Missing ED records use a
neutral congestion index of 1. ED first assessment, low/high urgency length of
stay and admitted length of stay remain distinct indicators, never offload labels.

Rebuild the cleaned files from retained source snapshots:

```sh
python3 scripts/data/clean-history.py
```

To refresh, download the two source URLs to the corresponding `*-source` files,
inspect any PDF chart changes and update the coordinates before rebuilding.
Do not silently treat a changed chart as the old one.

## Formula and queue projection

```text
raw offload = historical baseline + congestion adjustment + additional queue delay
congestion adjustment = baseline × congestionWeight × (ED relative index − 1)
                        × projected handover utilization
embedded ordinary waiting = max(0, baseline − configured hospital handover duration)
additional queue delay = queueWeight × max(0, projected wait − embedded ordinary waiting)
```

Defaults: `congestionWeight=0.1`, `queueWeight=1`, `maxMinutes=180`. Configure
these through optional `config.prediction` in scenario JSON/API or change
`DEFAULT_PREDICTION` in `lib/historical-data.ts`. Schema validation bounds them.
Old saved scenarios omit the field and continue using defaults.

ED relative index is the hospital's latest common-month first-assessment mean
in minutes divided by the Ontario peer median for that month, bounded to
0.5–1.5. All latest-month ED indicators and counts are retained for inspection.
**This index is a demo congestion proxy, not a validated correlation or fitted
coefficient:** the ED and offload periods differ. Set `congestionWeight=0` to
disable it. At zero projected utilization there is no ED congestion adjustment.

Queue projection schedules FIFO work on the reported number of concurrent
handover slots. It starts with the delayed snapshot's active handover release
times, drains the reported waiting queue and inserts currently known inbound
commitments in ETA order. It evaluates the candidate at its travel-time ETA,
excluding that ambulance from inbound work. Later inbound arrivals do not affect
its prediction; arrivals at the same minute conservatively go first. Slot
service times use configured hospital means; unknown future incidents are omitted.
When capacity drops below the active count, existing handovers finish before
new work can use the reduced lanes.

Release times are stored in the same delayed reports as queue and capacity;
current hidden hospital queues are not read. Old saved snapshots without release
times use a half-service residual assumption. Report age increases the displayed
sensitivity band. Stale reports can miss arrivals already no longer inbound;
the model deliberately does not reconstruct them from hidden current state.

Subtracting the baseline's estimated ordinary waiting allowance prevents simply
adding all synthetic queue waiting to a historical measure that already includes
waiting. That allowance is a demo assumption, not a measured decomposition.
The raw estimate is bounded to 1–`maxMinutes`; rounding uses tenths of a minute.
Closed sites return the cap sentinel and stay ineligible. Components show the
uncapped arithmetic, so the cap may prevent them from summing to the displayed
prediction. Ranges are heuristic sensitivity bands, not confidence intervals.

Hospital summaries use a 15 minute horizon; ambulance comparisons and the Overview
journey use hospital-specific travel times. The Overview remains the reproducible
minute-60 default snapshot. Forecasts are computed on each refreshed simulation
state, so dispatches, arrivals, completions and reported capacity changes feed
routing without a separate cache. General/specialist eligibility and both routing
policies remain unchanged.

## Comparison and validation

Expand “Why … min offload?” in hospital details, ambulance destination comparisons
or Overview options for baseline, congestion, additional queue delay, reported and
projected queues, travel/total where an origin exists, and the **previous model's
prediction on the same state** (`legacyForecast`). Hospital summaries have no
ambulance origin; select an ambulance to inspect travel and total time.

`npm test` covers historical matches/fallback, ETA ordering, incoming commitments,
capacity, residual handovers, report isolation, completed simulation events,
configurable adjustments and hybrid ranking, alongside existing simulation
invariants. `npm run test:e2e` covers the scenario/dispatch and patient journeys.

The old/new numbers illustrate changed predictions. Existing matched policy
comparisons measure **simulated routing behavior**, not independent accuracy.
There are no linked patient-level arrival/offload outcomes in these sources, so
we cannot claim MAE/RMSE improvements or calibrated coverage. Historical predictions
may exceed actual synthetic handover durations because the outcome generator is
unchanged. Validation of real accuracy requires matched held-out outcomes.
