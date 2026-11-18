import { LIVE_ED_DEFAULTS } from './live-ed.ts';
import data from '../data/hospital-history.json' with { type: 'json' };

export const HISTORICAL_DATA = data;
export function hospitalHistory(id: string) {
  const record = data.hospitals[id as keyof typeof data.hospitals];
  return {
    baseline: record?.offloadMinutes ?? data.fallbackOffloadMinutes,
    fallback: !record,
    edRelativeCongestion: record?.edRelativeCongestion ?? 1,
    edMonth: record?.edMonth ?? null,
    approximate: true,
  };
}
// Demo assumptions, not fitted coefficients. Override per run via config.prediction.
export const DEFAULT_PREDICTION = {
  ...LIVE_ED_DEFAULTS,
  congestionWeight: 0.1,
  queueWeight: 1,
  maxMinutes: 180,
};
