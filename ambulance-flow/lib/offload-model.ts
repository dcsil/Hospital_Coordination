/** Offline, chronological offload modelling. Never train on simulator outcomes or ED waits. */
export type OffloadObservation = {
  id: string; hospitalId: string; source: 'observed';
  decisionAt: string; arrivedAt: string; transferredAt: string; availableAt: string;
};
type Event = OffloadObservation & { decision: number; available: number; minutes: number };
export type OffloadModel = {
  method: 'rolling-median'; window: number; estimateMinutes: number;
  interval: { lower: number; upper: number; nominalCoverage: number; method: 'chronological-residuals' };
  sampleCount: number; latestAvailableAt: string;
  validation: { status: 'retrospective-only'; testCount: number; mae: number; historicalMae: number;
    recent20Mae: number; bias: number; intervalCoverage: number; intervalMeanWidth: number;
    testFrom: string; testTo: string; calibrationCount: number };
};
export type OffloadArtifact = { version: 1; asOf: string | null; hospitals: Record<string, OffloadModel> };
export const MODEL_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const WINDOWS = [5, 10, 20, 50];
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
function time(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value)) return NaN;
  return Date.parse(value);
}
/** Reject an invalid file rather than silently excluding difficult/long cases. */
export function parseObservations(input: unknown): OffloadObservation[] {
  if (!Array.isArray(input)) throw new Error('Expected an array of observed offload records.');
  const ids = new Set<string>();
  return input.map((value, index) => {
    if (!value || typeof value !== 'object') throw new Error(`Invalid record ${index}.`);
    const r = value as OffloadObservation;
    if (typeof r.id !== 'string' || !r.id.trim() || ids.has(r.id)) throw new Error(`Missing/duplicate ID at record ${index}.`);
    ids.add(r.id);
    if (r.source !== 'observed' || typeof r.hospitalId !== 'string' || !r.hospitalId.trim()) throw new Error(`Record ${index} must identify an observed hospital offload.`);
    const [decision, arrival, transfer, available] = [r.decisionAt, r.arrivedAt, r.transferredAt, r.availableAt].map(time);
    if (![decision, arrival, transfer, available].every(Number.isFinite) || decision > arrival || arrival > transfer || transfer > available) {
      throw new Error(`Invalid timestamps at record ${index}; require decision <= arrival <= transfer <= availability, with timezone.`);
    }
    return { id: r.id, hospitalId: r.hospitalId, source: r.source, decisionAt: r.decisionAt,
      arrivedAt: r.arrivedAt, transferredAt: r.transferredAt, availableAt: r.availableAt };
  });
}
function recent(events: Event[], at: number, window: number): number | null {
  // Strictly prior availability avoids ambiguous equal-timestamp ordering and delayed-entry leakage.
  const history = events.filter(e => e.available < at && e.available >= at - 30 * DAY)
    .sort((a, b) => b.available - a.available || a.id.localeCompare(b.id)).slice(0, window);
  return history.length === window ? median(history.map(e => e.minutes)) : null;
}
function predictions(events: Event[], targets: Event[], window: number, baseline: number) {
  return targets.map(e => ({ event: e, predicted: recent(events, e.decision, window) ?? baseline }));
}
const mae = (rows: ReturnType<typeof predictions>) => mean(rows.map(r => Math.abs(r.predicted - r.event.minutes)));
/** Tune windows, calibrate residuals, then evaluate on an untouched later block.
 * Counts are operational minimums, NOT a sample-size/power calculation.
 * Serial dependence means nominal residual coverage is not a statistical guarantee.
 */
export function fitOffloadModels(input: unknown, baselines: Record<string, number>, asOf: string) {
  const cutoff = time(asOf);
  if (!Number.isFinite(cutoff)) throw new Error('asOf must be an ISO timestamp with timezone.');
  const events: Event[] = parseObservations(input).map(r => ({ ...r, decision: time(r.decisionAt),
    available: time(r.availableAt), minutes: (time(r.transferredAt) - time(r.arrivedAt)) / 60000 }))
    .filter(e => e.available < cutoff && e.decision >= cutoff - 30 * DAY)
    .sort((a, b) => a.decision - b.decision || a.id.localeCompare(b.id));
  const artifact: OffloadArtifact = { version: 1, asOf, hospitals: {} };
  const reports: Record<string, { status: string; sampleCount: number; validation?: OffloadModel['validation'] }> = {};
  for (const [hospital, baseline] of Object.entries(baselines)) {
    if (!Number.isFinite(baseline) || baseline < 0) throw new Error('Invalid historical baseline.');
    const rows = events.filter(e => e.hospitalId === hospital);
    const reject = (status: string) => { reports[hospital] = { status, sampleCount: rows.length }; };
    if (rows.length < 100) { reject('insufficient_observed_offloads'); continue; }
    const latest = Math.max(...rows.map(e => e.available));
    if (cutoff - latest > MODEL_MAX_AGE_MS) { reject('observations_stale'); continue; }
    // First half is warm-up; last two blocks are calibration/test; the remainder tunes.
    const block = Math.max(20, Math.floor(rows.length * .15));
    const calibrationStart = rows.length - 2 * block, testStart = rows.length - block;
    const tuningStart = Math.floor(rows.length * .5);
    const tuning = rows.slice(tuningStart, calibrationStart);
    const calibration = rows.slice(calibrationStart, testStart), test = rows.slice(testStart);
    // Labels used to choose/calibrate a model must be known before the next phase starts.
    const tuneKnown = tuning.filter(e => e.available < calibration[0].decision);
    const calibrationKnown = calibration.filter(e => e.available < test[0].decision);
    if (tuneKnown.length < 10 || calibrationKnown.length < 19) { reject('insufficient_separated_outcomes'); continue; }
    const scores = WINDOWS.map(window => ({ window, error: mae(predictions(rows, tuneKnown, window, baseline)) }));
    scores.sort((a, b) => a.error - b.error || b.window - a.window);
    const window = scores[0].window;
    const residuals = predictions(rows, calibrationKnown, window, baseline)
      .map(r => Math.abs(r.predicted - r.event.minutes)).sort((a, b) => a - b);
    const nominalCoverage = .8;
    const rank = Math.ceil((residuals.length + 1) * nominalCoverage);
    const radius = residuals[rank - 1];
    const heldout = predictions(rows, test, window, baseline);
    const error = mae(heldout), historicalMae = mean(test.map(e => Math.abs(baseline - e.minutes)));
    const recent20Mae = mae(predictions(rows, test, 20, baseline));
    const validation: OffloadModel['validation'] = { status: 'retrospective-only', testCount: test.length,
      mae: error, historicalMae, recent20Mae, bias: mean(heldout.map(r => r.predicted - r.event.minutes)),
      intervalCoverage: mean(heldout.map(r => Number(r.event.minutes >= Math.max(0, r.predicted - radius) && r.event.minutes <= r.predicted + radius))),
      intervalMeanWidth: mean(heldout.map(r => r.predicted + radius - Math.max(0, r.predicted - radius))),
      testFrom: test[0].decisionAt, testTo: test.at(-1)!.decisionAt, calibrationCount: residuals.length };
    const estimate = recent(rows, cutoff, window);
    // Descriptive deployment gate; not evidence of statistically significant superiority.
    // Never re-select another candidate using the test block.
    if (estimate === null || error >= historicalMae || error > recent20Mae) {
      reports[hospital] = { status: 'did_not_beat_baselines', sampleCount: rows.length, validation }; continue;
    }
    artifact.hospitals[hospital] = { method: 'rolling-median', window, estimateMinutes: estimate,
      interval: { lower: Math.max(0, estimate - radius), upper: estimate + radius, nominalCoverage, method: 'chronological-residuals' },
      sampleCount: rows.length, latestAvailableAt: new Date(latest).toISOString(), validation };
    reports[hospital] = { status: 'retrospective_candidate', sampleCount: rows.length, validation };
  }
  return { artifact, reports };
}
export function selectOffloadModel(artifact: OffloadArtifact, hospitalId: string, evaluatedAt?: string) {
  const now = time(evaluatedAt), trained = time(artifact.asOf);
  const model = Object.hasOwn(artifact.hospitals, hospitalId) ? artifact.hospitals[hospitalId] : undefined;
  if (!model) return { model: null, reason: 'no_observed_model' } as const;
  if (!Number.isFinite(now) || !Number.isFinite(trained) || trained > now) return { model: null, reason: 'invalid_model_time' } as const;
  const latest = time(model.latestAvailableAt);
  if (artifact.version !== 1 || !Number.isFinite(latest) || latest > trained ||
      !Number.isFinite(model.estimateMinutes) || model.estimateMinutes < 0 ||
      !Number.isFinite(model.interval.lower) || !Number.isFinite(model.interval.upper) ||
      model.interval.lower < 0 || model.interval.lower > model.estimateMinutes || model.interval.upper < model.estimateMinutes) {
    return { model: null, reason: 'invalid_model' } as const;
  }
  if (now - trained > MODEL_MAX_AGE_MS || now - time(model.latestAvailableAt) > MODEL_MAX_AGE_MS) return { model: null, reason: 'observed_model_stale' } as const;
  return { model, reason: null } as const;
}
