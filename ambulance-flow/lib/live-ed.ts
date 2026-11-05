/** Shared, pure live-data types and prediction logic. No network in the predictor. */
export type EdReading = {
  hospitalId: string; externalHospital: string; metric: 'posted_wait_minutes';
  waitMinutes: number; collectedAt: string; observedAt: string; timestampBasis: 'publisher' | 'collection';
  publisherAsOf: string | null; referenceMinutes: number | null; referenceCount: number;
  referenceFrom: string | null; referenceTo: string | null;
};
export type EdSnapshot = {
  readings: Record<string, EdReading>; checkedAt: string | null; lastSuccessAt: string | null;
  error: string | null; failureReason?:string|null; source: 'ER Compass';
};
export const EMPTY_ED: EdSnapshot = { readings: {}, checkedAt: null, lastSuccessAt: null, error: null, source: 'ER Compass' };
export const LIVE_ED_DEFAULTS = { liveCoefficientMinutes: 60, liveFreshMinutes: 30, liveExpireMinutes: 180, liveMaxDeviation: 1 };
export function liveEdAdjustment(snapshot: EdSnapshot | undefined, hospitalId: string, evaluatedAt: string | undefined, options: Partial<typeof LIVE_ED_DEFAULTS> = {}) {
  const config = { ...LIVE_ED_DEFAULTS, ...options };
  const reading = snapshot?.readings[hospitalId];
  const now = evaluatedAt ? Date.parse(evaluatedAt) : NaN;
  const age = reading ? (now-Date.parse(reading.observedAt))/60000 : NaN;
  const valid = reading && Number.isFinite(age) && age >= -1 && age < config.liveExpireMinutes;
  const status = valid ? age <= config.liveFreshMinutes ? 'Live' : 'Stale' : 'Historical Only';
  const liveDataReason=valid?null:!reading?(snapshot?.error?'feed_error':snapshot&&!snapshot.checkedAt?'loading':'not_reported'):!Number.isFinite(age)?'invalid_time':'expired';
  const comparable = !!valid && reading.referenceMinutes !== null && reading.referenceMinutes > 0 && reading.referenceCount >= 24;
  const fade = !valid ? 0 : age <= config.liveFreshMinutes ? 1 : Math.max(0,(config.liveExpireMinutes-age)/Math.max(1,config.liveExpireMinutes-config.liveFreshMinutes));
  const deviation = comparable ? Math.max(-config.liveMaxDeviation,Math.min(config.liveMaxDeviation,(reading.waitMinutes-reading.referenceMinutes!)/reading.referenceMinutes!)) : 0;
  return { liveAdjustment: Math.round(deviation*config.liveCoefficientMinutes*fade*10)/10, liveStatus: status as 'Live' | 'Stale' | 'Historical Only',
    liveReading: reading ?? null, liveAgeMinutes: Number.isFinite(age) ? Math.max(0,Math.round(age)) : null,
    liveComparable: comparable, liveWeight: fade, liveDataReason };
}
