import { HOSPITAL_SITES } from './hospital-sites.ts';
import { hospitalHistory } from './historical-data.ts';
import { liveEdAdjustment, type EdSnapshot, LIVE_ED_DEFAULTS } from './live-ed.ts';

export const OFFLOAD_OPTIONS = { ...LIVE_ED_DEFAULTS, maxMinutes: 180 };
/** Historical offload + comparable live ED deviation. No operational state. */
export function predictHospital(hospitalId: string, snapshot?: EdSnapshot, evaluatedAt?: string, options: Partial<typeof OFFLOAD_OPTIONS> = {}) {
  const settings = { ...OFFLOAD_OPTIONS, ...options };
  const history = hospitalHistory(hospitalId);
  const live = liveEdAdjustment(snapshot, hospitalId, evaluatedAt, settings);
  const raw = history.baseline + live.liveAdjustment;
  return { hospitalId, baseline: history.baseline, fallback: history.fallback,
    offload: Math.round(Math.max(1,Math.min(settings.maxMinutes,raw))*10)/10,
    ...live, capped: raw > settings.maxMinutes, queue: null, inbound: null, capacity: null,
    actualMeanOffload: null, actualCompletions: null };
}
export function hospitalPredictions(snapshot?: EdSnapshot, evaluatedAt?: string) {
  return HOSPITAL_SITES.map(site=>({...site,...predictHospital(site.id,snapshot,evaluatedAt)}));
}
export type HospitalPrediction = ReturnType<typeof predictHospital>;
