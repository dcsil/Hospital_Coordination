# Near-real-time ED congestion

The active model uses historical hospital offload baselines plus optional ER Compass posted ED waits. This helper supplies background conditions for the restored emergency simulator. Case-specific queues, slots, ambulance movement and completions are simulated, not observed hospital operations. See the application README for the full queue and outcome model. This remains a university research demo.

## Verified source and schema

Checked November 5, 2026:

- [ER Compass API documentation](https://ercompass.ca/#api) describes keyless,
  read-only `/api/current?province=ON` and `/api/hospital/{name}/history`.
  Bulk exports require a key; this integration does not use exports or credentials.
- Current response is `{ count, hospitals: [...] }`; relevant fields are
  `hospital`, `province`, `city`, `kind`, `open_now`, `wait_minutes`, `fetched_at`,
  `as_of`, `wait_stale_hours`, `wait_caveat`, `wait_quality`.
- History response is `{ hospital, metric: "posted_wait_minutes", points: [...] }`;
  points contain `fetched_at`, `value`, `value_text`, `as_of`.
  The history URL uses the **exact hospital name**, URL encoded, not a guessed
  short display name. Wrong names can return 404.
- Exact names match Toronto General, Toronto Western, Sunnybrook, Michael Garron
  and St. Joseph's Health Centre. Province ON, city Toronto and ER type are also
  required. St. Joseph's Hamilton, London, Sudbury and Elliot Lake never match.
  On verification, General, Western and Sunnybrook had posted readings; Garron
  had a record without a wait; St. Joseph's Toronto had no matching reading.
  Coverage can change. We do not invent observations for missing hospitals.
- Only the documented JSON endpoints are used. UHN/ERstat HTML is not scraped.

[ER Compass terms](https://ercompass.ca/terms) license its compilation under
CC BY-NC 4.0, with upstream licences retained. Attribution is displayed beside
live data. This integration is for the non-commercial university demo. No
provider endorsement or clinical accuracy is implied.

## Fetching, timestamps and fallback

`lib/live-ed-service.ts` is imported only by the server API. It uses a shared
in-memory cache with single-flight refresh and a **15 minute** provider refresh
interval. Requests between refreshes reuse the cache. Successful refreshes stay cached for 15 minutes. Failed current-feed requests retry after one minute (or a longer provider Retry-After), rather than caching an outage for the full refresh interval. A diagnostic failure reason is exposed by `/api/ed-data`. Provider calls have a four
second timeout each; current fetch is followed by concurrent history calls only
for matched, valid current readings. HTTP `Retry-After` can extend the interval.
No tighter numeric provider limit was found in the public documentation; the
conservative interval and backoff avoid aggressive polling.

The cache is per running server/Worker isolate, not durable or globally shared.
Restarting it clears readings. Separate deployed isolates can refresh separately;
this demo does not add distributed cache infrastructure. Active runs store simulation state; compatible model-version snapshots can be reopened.

`GET /api/ed-data` returns `{ snapshot, evaluatedAt }` without requiring a run.
The browser polls this local endpoint once a minute to refresh labels/ages; that
does not bypass the provider cache. Active tabs and run API requests drive
refresh; there is no unattended scheduler when the app is unused. Requests that
need a refresh may wait up to roughly eight seconds before falling back.

Invalid/negative/non-numeric waits, malformed/future timestamps, non-ER/closed
records and provider caveat/quality flags are rejected. Failed fetches, changed
schemas or missing records preserve prior valid readings, which continue aging.
Without usable cached data, estimates equal the historical offload baseline. A reading
with no usable history may be shown, but contributes **zero live adjustment**.
History failure can reuse a cached reference for at most seven days.

Publisher `as_of` is used as the observation timestamp only when it is an
unambiguous ISO date with timezone. Otherwise `fetched_at` is explicitly labelled
**Feed collected**, and raw publisher text is retained for inspection.
`wait_stale_hours`, when supplied, backdates freshness conservatively. Collection
time does not establish when the hospital measured the wait; missing publisher
timestamps remain a limitation. “Live” means a recently collected valid feed
reading, not guaranteed current clinical conditions.

Freshness uses real UTC time. The dashboard displays America/Toronto timestamps. API snapshots carry their evaluation timestamp; source-only prediction functions do not fetch or call a simulation clock. Evaluation freezes one live snapshot and evaluation timestamp for both policies and every seed.

## Comparable reference and formula

The current posted wait is compared with the **same hospital's same ER Compass
`posted_wait_minutes` history**. It is not compared with Ontario monthly mean
first-assessment times or an ED length-of-stay indicator. Source definitions can
differ between hospitals, so no cross-hospital ED wait baseline is used here.

Reference = median of valid distinct history timestamps in the preceding seven
days, excluding the current hour. At least 24 readings spanning a full day and
a positive median are required. History must explicitly match hospital and metric.
The provider currently returns a bounded history, so actual coverage may be less
than seven days. Reference median, count and period are retained in the snapshot.

```text
deviation = clamp((posted ED wait − same-feed historical median) / median, −1, +1)
freshness weight = 1 through 30 minutes; linear decay to 0 at 180 minutes
live adjustment = deviation × liveCoefficientMinutes × freshness weight

predicted offload = historical hospital offload baseline + live adjustment
```

The source-only helper adds no static ED congestion proxy. The simulation adds its own projected case queue delay to this sourced baseline. This avoids double counting an unobserved queue against the historical offload baseline. Missing or expired live data gives zero adjustment. Output is bounded to 1–180 minutes by default. No confidence interval is presented without calibrated outcomes.

Defaults are in `LIVE_ED_DEFAULTS` (`lib/live-ed.ts`) and can be overridden in
`OFFLOAD_OPTIONS` in `lib/hospital-offload.ts` or explicit predictor options:

```json
{
  "liveCoefficientMinutes": 60,
  "liveFreshMinutes": 30,
  "liveExpireMinutes": 180,
  "liveMaxDeviation": 1
}
```

The coefficient is a **demo sensitivity assumption**, not a trained or validated
ED-to-offload relationship. A +33.3% ED deviation gives +20 minutes at the default
coefficient while fresh. ED waits remain different measurements from ambulance
offload time. Missing live data uses the previous model with no modification.

## Dashboard and integration

Hospital details and destination options show Live / Stale / No live ED data, with separate Loading ED, Feed offline and Live data expired labels. The API retains Historical Only for the fallback prediction status. They show
latest reported ED wait and expandable components, timestamps, reference and
attribution. A recent wait without comparable history is labelled Live but its
explanation explicitly says that the adjustment was skipped.

Browser polls refresh visible ED inputs. Overview uses active-run queues, capacity and cases at the travel-time arrival horizon, just like the transport forecast. Without a run it explicitly shows background estimates only. Tracking begins at pickup. Scenario controls, ambulance movement and policy evaluation are restored. Real ambulance measurements remain unavailable; simulated queues are labelled as such.

## Verification

```sh
npm test
npm run typecheck
npm run build
# Start npm run dev in one terminal; in a second:
npm run test:e2e
```

Unit tests use mocked current/history schemas and cover mapping, invalid data,
reference comparability, stale decay, cached failures, refresh/backoff, source-based ranking
changes. Browser tests mock `/api/ed-data` to verify
status labels and estimate explanations. No live connection is required for
those assertions; the dashboard remains usable with historical baselines
if the provider is offline. For a manual integration check, inspect
`http://127.0.0.1:5173/api/ed-data` and expand a hospital prediction.

An actual source smoke check succeeded on November 5, 2026, with current waits
and several hundred comparable history observations for General, Western and
Sunnybrook. This verifies integration availability at that time, not offload
prediction accuracy or a guarantee of ongoing coverage.
