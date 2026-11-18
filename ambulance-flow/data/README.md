# Historical data provenance

The source-only baseline helper is `lib/hospital-offload.ts`: historical offload baseline + comparable live ED adjustment. The active simulator in `lib/simulation.ts` adds case-dependent queue delay and uses the same baseline as its background offload conditions. See [live ED documentation](LIVE_ED.md).

## Sources and cleaning

- [Toronto Auditor General supplementary report, July 16, 2024, page 3](https://www.toronto.ca/legdocs/mmis/2024/cc/bgrd/backgroundfile-247763.pdf): average ambulance offload time for 13 hospitals over **2022–2023**. The chart has no numeric labels. `toronto-offload.json` contains **approximate whole-minute digitizations**, not exact published means. The PDF is retained locally. Blue vector bar endpoints were measured against the 0 and 60 minute gridlines (227.9956 and 522.185 PDF points). Coordinates and conversion are in the cleaning script.
- [Ontario ED CSV](https://raw.githubusercontent.com/Nshipyard/ontario-er-waits/main/public/data/er_waits_ranked.csv), from [Nshipyard/ontario-er-waits](https://github.com/Nshipyard/ontario-er-waits): local snapshot contains August 2025–August 2026 monthly data. `ontario-ed-source.csv` preserves the download, `ontario-ed-clean.csv` converts mean and P90 hours to minutes and keeps case counts. Rows with invalid, missing or negative numbers are excluded; counts and source SHA256 digests are in `hospital-history.json`. This is a third-party dataset; it is not a live hospital feed.

`hospital-history.json` is a compact import used in both browser and server, with
no runtime network or database changes. Stable ED source IDs match Toronto General
1359, Toronto Western 1364, Michael Garron 4935, Sunnybrook 4931 and St. Joseph's
Toronto 4800 (not St. Joseph's Hamilton or London).

Approximate offload baselines are respectively **58, 59, 36, 28 and 60 minutes**.
Missing offload records use the **43 minute median of
all 13 digitized hospitals** and are marked as fallback. Missing ED records use a
neutral historical congestion index in the archived engine only. The active predictor does not use that index. ED first assessment, low/high urgency length of
stay and admitted length of stay remain distinct indicators, never offload labels.

Rebuild the cleaned files from retained source snapshots:

```sh
python3 scripts/data/clean-history.py
```

To refresh, download the two source URLs to the corresponding `*-source` files,
inspect any PDF chart changes and update the coordinates before rebuilding.
Do not silently treat a changed chart as the old one.


## Current use

The source-only preview lists the five matched real hospital sites; simulated scenarios can also include explicitly named virtual sites using the historical median fallback. The historical-only estimate equals the offload baseline. ED indicators are retained as separate context, never treated as ambulance queue, capacity or offload measurements. The source-only hospital preview has no simulated queue; ambulance forecasts add the selected run’s queue conditions.

The restored simulator projects each case’s queue at handover readiness. See the application README for the background/slot decomposition, prediction formula and paired evaluation assumptions. Actual forecast accuracy cannot be measured without matched observed ambulance offload outcomes.
