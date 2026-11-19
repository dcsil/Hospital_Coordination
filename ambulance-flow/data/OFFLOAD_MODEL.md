# Optional local observed-offload protocol (v4)

**Current default:** a trained public-data calendar-transfer model now ships with
the app. See [PUBLIC_OFFLOAD_MODEL.md](PUBLIC_OFFLOAD_MODEL.md). The protocol below
describes the separate optional local observed-data path, not the public model.

## What the existing data supports

The shipped data has 13 approximately digitized hospital means for 2022–2023
and monthly ED statistics. There are **no individual observed offloads**. Those
monthly statistics are physician-assessment/length-of-stay outcomes, not labels
for ambulance offload. Their periods also do not match the offload chart.
Replicating an annual mean across monthly rows would manufacture training data.
We therefore ship an empty *local* observed-model artifact. The public model
uses actual external APOT outcomes; it does not invent local training labels.
When neither model can be used, source-only estimates remain hospital historical means
(58, 59, 36, 28, 60 minutes), explicitly labelled historical and approximate.
Unknown sites use the median of the 13 hospital means (43 minutes), not a pooled
patient mean/median. No variance or prediction interval can be recovered from
these means alone. The old 60-minute ED sensitivity and fake uncertainty bands
are removed. ED API readings remain separate visible context.

## Observation contract and fitting

Run with Node >=22.13 from `ambulance-flow`:

```sh
npm run model:fit -- /secure/path/offloads.json 2026-11-19T12:00:00Z
```

Input is an array with these fields (illustrative schema, not training data):

```json
{
  "id": "pseudonymous-encounter-id",
  "hospitalId": "sun",
  "source": "observed",
  "decisionAt": "2026-11-18T09:00:00Z",
  "arrivedAt": "2026-11-18T09:20:00Z",
  "transferredAt": "2026-11-18T09:49:00Z",
  "availableAt": "2026-11-18T09:51:00Z"
}
```

Use the five existing hospital IDs: tgh, twh, mgh, sun, sjh. `decisionAt` is the
pre-arrival destination-decision timestamp. `availableAt` is when the completed
outcome actually became available to the forecasting system, including reporting
latency. It must follow transfer of care. Target = transfer minus arrival, in
minutes; crew back-in-service is a different target. Timestamps require timezones.
Duplicate IDs, synthetic source labels, missing values and invalid chronology
fail the entire import. Genuine long and zero-duration observations are retained.
Only completed records available strictly before the requested as-of time are
eligible. Hospital records never pool into another hospital's recent model.

Keep raw records outside the repository and browser bundle. The CLI atomically
writes only aggregate model summaries to `data/offload-model.json` and prints a
per-hospital evaluation report. Rebuild/redeploy the app to load a new artifact;
this is an offline import, not a live clinical integration. A failed validation
leaves the prior file intact. Insufficient evidence creates an empty artifact,
removing any previous eligible model rather than silently keeping it current.

## Estimation and temporal evaluation

- Use a trailing 30-day history. Require at least 100 available outcomes per
  hospital. These are conservative implementation defaults, **not** a power
  calculation or proof of statistical adequacy.
- Forecast with the median of the last 5, 10, 20 or 50 outcomes available at the
  decision time. Medians target absolute-error loss and resist isolated long
  delays without deleting them. Until a window fills, use the historical mean.
- Sort by decision time. First half supplies warm-up; subsequent tuning ends at
  the calibration boundary. The last two blocks are calibration and test, each
  max(20, floor(15% of records)). Require at least 10 tuning and 19 calibration
  outcomes known before the following phase starts. Reporting delays cannot leak
  across those boundaries. Candidate windows are selected on tuning MAE only;
  ties prefer the larger window. Do not reselect on test results.
- Replay each phase chronologically. Earlier completed test outcomes may become
  predictors of later test cases, as in a deployed rolling estimator; no future
  outcomes enter a prediction. No feature scaling or fitted imputation is used.
- From the separate calibration block, take the ordered absolute residual at
  ceil((n+1)*0.8). Show estimate +/- this radius, bounded below by zero, as a
  **historical residual range**, not a confidence interval for a mean.
- On the untouched later block report MAE, signed bias, range coverage/width,
  test dates/count, and errors of both the historical mean and a fixed recent-20
  median. Accept a candidate only if its MAE is strictly below historical MAE
  and no worse than recent-20. This is a descriptive deployment gate; it does
  not establish significant superiority or independent prospective validation.
- Serve the latest rolling median only while both the artifact and newest
  outcome are at most 24 hours old. Reject future artifacts or missing evaluation
  timestamps. Otherwise fall back to the historical benchmark. No 180-minute
  clipping applies to real estimates or residual ranges.

The observed model is hospital-specific and predicts at decision time; it does
not yet condition on travel horizon, patient acuity, staffing, or current queues.
Those features require paired, time-aligned training observations. Do not add
coefficients simply because an API exposes a variable.

## Limits and required next validation

The test fixtures exercise algorithms, not clinical accuracy. The optional local model
has **no measured local MAE or coverage**. External public-model metrics are
reported separately and do not validate Toronto predictions. Temporal correlation/drift breaks
the exchangeability assumptions behind ordinary conformal guarantees; the finite
residual rank above does not establish 80% future coverage. UI shows measured
held-out coverage and explicitly labels the model retrospective-only. Small test
blocks cannot support precise subgroup claims or confidence intervals. Before
operational use, determine sample sizes from desired precision, use repeated
rolling-origin validation, assess uncertainty with day/week blocks, inspect
hospital/acuity/shift errors and undertake prospective evaluation.

This initial estimator accepts completed offloads only. An upstream extract must
account for missing timestamps and unfinished transports; selective completion
or omission can bias results. It is not a survival model and does not correct
informative censoring. Do not claim validation on all arrivals from a
completed-only convenience sample. Define a mature observation cohort and audit
missingness/censoring before interpreting its reported performance.

## Simulation separation

Simulator v4 retains its explicit queue/service mechanism for demonstrations.
Its background uses historical means only, even if a real-model artifact is
loaded. ED readings cannot alter generated outcomes. Queue and service-floor
components remain labelled simulated; no clinical predictive range is invented.
Simulated completions are never automatically fed into the observed model.
Saved v3 runs/evaluations are not mixed with v4 results. Policy comparisons within
the simulator establish neither real-world forecast accuracy nor routing benefit.

## Evidence

- [Toronto offload chart](https://www.toronto.ca/legdocs/mmis/2024/cc/bgrd/backgroundfile-247763.pdf): existing historical source.
- [Walker et al. (2021)](https://oulurepo.oulu.fi/handle/10024/30620): supports investigating recent actual offloads and simple baselines. Its triage-time results do not validate this pre-arrival implementation.
- [Ontario ED definitions](https://www.ontario.ca/page/time-spent-emergency-department): distinct physician-assessment and ED-stay outcomes.
- [TRIPOD-Cluster](https://www.bmj.com/content/380/bmj-2022-071058.full): transparent reporting and validation across clustered settings.
- [Sample-size guidance](https://www.bmj.com/content/368/bmj.m441.full): design-specific precision and complexity requirements.

The concrete windows, splits, 30-day lookback and 24-hour expiry are implementation
choices to be evaluated on local data, not values established by these papers.
