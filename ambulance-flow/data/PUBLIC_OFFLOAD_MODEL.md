# Public-data offload model

This model is already trained and bundled in `public-offload-model.json`. No
private feed, user-provided records, Python service, or runtime training is needed.
It is the source-only application's default when a valid current timestamp is
available. A fresh locally observed model, if one is later supplied, takes
precedence. Simulated forecasts continue using their separate historical queue
mechanism; they do not train or validate this model.

## Data actually used

- [Public research repository](https://github.com/Myorignl/Final_Project7), commit
  `4d004c2bf9bca7855d0bf901bb6b772d1c7af597`, `CSV_file/Random_sample_50000.csv`:
  50,000 APOT records from 11 Sacramento County hospitals, January 2017–October
  2022. The repository authors attribute the records to county EMS. This is a
  third-party sample, not a verified direct county feed. The source cleaning
  notebook drops missing rows and duplicates; the effect of that selection is
  unknown. Our pass rejects invalid/negative durations and duplicate record IDs;
  it excludes no valid long delays and retains zeros. Source SHA256 is recorded
  in the artifact and enforced when rebuilding. No explicit repository license
  was found; raw records stay in ignored `work/` and are not redistributed.
- [Toronto offload chart](https://www.toronto.ca/legdocs/mmis/2024/cc/bgrd/backgroundfile-247763.pdf):
  existing approximate hospital mean offloads for 2022–2023 anchor Toronto
  General, Toronto Western, Michael Garron and St. Joseph's.
- [Sunnybrook 2026/27 QIP, page 23](https://sunnybrook.ca/wp-content/uploads/2026/04/Quality-Improvement-Plan.pdf):
  current-performance P90 = 58 minutes, labelled Q3 2025. Verified against the
  original PDF; URL, statistic, period, page and file checksum are retained in
  `public-offload-anchors.json`. The 30-minute target is not used as an observation.
- [ER Compass](https://ercompass.ca/): existing live posted ED feed remains visible
  with freshness and history. It has no paired ambulance-offload target in these
  records, so no ED-to-offload coefficient is invented. Ontario monthly ED
  measures likewise remain distinct from APOT outcomes.

Other discovered data, such as [San Francisco monthly APOT](https://data.sf.gov/d/6x9q-izga),
contains useful count bins and P90s but was not silently combined with individual
Sacramento records or Toronto means. Its monthly P90 is not an individual wait.

## Statistical model

Fit a fixed-effects log-duration regression:

```
log(1 + APOT_minutes) = hospital_intercept + calendar_features × beta + residual
```

Calendar features are sin/cos of hour-of-day (first and second harmonics), plus
six weekday indicators (Monday reference). Harmonics avoid a discontinuity at
midnight. Hospital intercepts control for between-hospital levels while fitting
calendar effects; only calendar coefficients transfer to Toronto. This is a
predictive association, not a causal staffing effect.

Choose a ridge penalty from 0, 1, 10, 100, 1000 using later tuning RMSE in minutes.
The selected penalty is **0**, so the shipped fit is ordinary least squares on
log1p durations with hospital fixed effects. Calling it a heavily regularized
model would be inaccurate. It uses 21 coefficients including hospital effects.

After fitting, normalize the exponential calendar effect by its training-set
average. In source evaluation, each known hospital uses its own arrival-time
mix. Toronto has no observed arrival-time mix, so it uses the pooled source
normalizer, an explicit transfer assumption.

```
factor = exp(calendar_features × beta) / source_calendar_normalizer
mean-anchored forecast = max(0, (published_mean + 1) × factor - 1)
```

This is a mean-anchored multiplicative transfer estimate, not simply exponentiating
log predictions and calling them unbiased means. The log fit targets transformed
outcomes; exact conditional-mean validity would require stable multiplicative
residual structure. Published mean anchoring does not prove that assumption.

For Sunnybrook, use the calibrated source ratio between individual durations
and earlier hospital means to convert its published P90 to a scale. If `r90` is
the unconditional 90th percentile of `(APOT + 1)/(hospital_training_mean + 1)`:

```
scale = (published_P90 + 1) / r90
forecast = max(0, scale × factor - 1)
```

Thus 58 minutes is never relabelled as an average. This conversion assumes the
source normalized distribution transfers; it is not an observed Sunnybrook mean.

Each destination uses its expected arrival timestamp (decision time + available
travel estimate), converted to America/Toronto including DST. With no travel,
arrival is assumed now. Hospital-only previews use the evaluation timestamp.
Missing/invalid timestamps, unknown sites or requests before the model's
2026-11-19 availability date fall back to historical averages. Legacy scenarios
can explicitly disable public transfer via `publicModel: false`.

## Chronological evaluation and measured limitations

- Training: 31,505 outcomes completed before 2021.
- Tuning: 5,269 outcomes from the first half of 2021. Select penalty here.
- Refit coefficients and mean anchors using training+tuning only.
- Calibration: 5,423 outcomes from the second half of 2021.
- Test: 7,802 outcomes from January–October 2022. Neither fit nor tune on these.
- One source record spanning a split boundary is excluded from the phase splits.
  This avoids using a transfer that completed after a phase's cutoff.

Later-test results (Sacramento, **not Toronto**):

| Measure | Model | Historical hospital mean |
|---|---:|---:|
| Mean absolute error | 18.43 min | 18.72 min |
| Root mean squared error | 36.31 min | 36.65 min |
| Mean signed error | -9.29 min | -9.33 min |

The improvement is modest. Both methods substantially underpredict in the later
period. A fixed hospital-median baseline has MAE 19.11 minutes. Resampling 40
calendar-week blocks 1,000 times gives a 95% percentile interval of 0.20–0.36
minutes for the MAE improvement over hospital means. This interval describes
uncertainty within the source sample, not transportability to Ontario; it also
assumes weekly blocks adequately capture dependence. Per-hospital leave-one-site-
out fits (with penalties selected without that hospital) are reported, using
only each excluded hospital's earlier mean to
anchor its forecasts. Improvement is not uniform across sites.

A separate calibration block supplies the 10th and 90th percentiles of the
multiplicative residual `(actual+1)/(predicted+1)`. Applied to test forecasts,
the resulting central-80% range covers 81.0% of later source outcomes, with mean
width 59.3 minutes. UI calls Toronto ranges **transferred typical ranges** and
states local coverage is unknown. They are neither confidence intervals on a
mean nor guaranteed conformal intervals. Geographic differences, staffing,
patient mix, selective sampling, source age and temporal drift remain unresolved.
The dataset has no reporting-availability timestamp or paired posted ED wait;
calendar-only features avoid needing those unobserved predictors.

## Rebuild, if wanted

```sh
python3 -m venv work/public-model-venv
work/public-model-venv/bin/pip install -r scripts/data/public-model-requirements.txt
work/public-model-venv/bin/python scripts/data/train-public-offload.py
npm run build
```

The script downloads the pinned source if absent, verifies its checksum, fits,
backtests, computes weekly bootstrap and excluded-site metrics, and writes the
aggregate artifact. Raw identifiers, diagnoses, postcodes and ambulance details
never enter the runtime artifact. Rebuilding the same pinned snapshot is not a
freshness update. New outcomes/anchors require explicit source review and new
validation; running this script again does not make old observations current.

See [the local observed-data protocol](OFFLOAD_MODEL.md) for the optional future
hospital-specific rolling-median path. It is not required for this public model.
