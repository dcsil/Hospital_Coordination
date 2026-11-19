import { publicOffloadPrediction } from './public-offload.ts';
import { HOSPITAL_SITES } from './hospital-sites.ts';
import { hospitalHistory } from './historical-data.ts';
import { liveEdAdjustment, type EdSnapshot, LIVE_ED_DEFAULTS } from './live-ed.ts';
import { selectOffloadModel, type OffloadArtifact } from './offload-model.ts';
import artifact from '../data/offload-model.json' with { type: 'json' };

export const OFFLOAD_OPTIONS = { ...LIVE_ED_DEFAULTS, maxMinutes: 180, publicModel: true, arrivalAt: undefined as string | undefined };
/** Actual offload models and ED context are separate. No assumed ED-to-offload coefficient. */
export function predictHospital(hospitalId: string, snapshot?: EdSnapshot, evaluatedAt?: string, options: Partial<typeof OFFLOAD_OPTIONS> = {}, modelArtifact: OffloadArtifact = artifact as OffloadArtifact) {
  const history = hospitalHistory(hospitalId);
  const live = liveEdAdjustment(snapshot, hospitalId, evaluatedAt, options);
  const selected = selectOffloadModel(modelArtifact, hospitalId, evaluatedAt);
  const model = selected.model;
  const external = !model && options.publicModel !== false ? publicOffloadPrediction(hospitalId,history.baseline,options.arrivalAt??evaluatedAt,evaluatedAt) : null;
  // Do not clip genuine observed long delays to a simulation's 180-minute sentinel.
  return { hospitalId, baseline: history.baseline, fallback: history.fallback,
    offload: Math.round((model?.estimateMinutes ?? external?.expectedMinutes ?? history.baseline) * 10) / 10,
    ...live, capped: false, queue: null, inbound: null, capacity: null,
    actualMeanOffload: null, actualCompletions: model?.sampleCount ?? null,
    estimateKind: model ? 'observed-rolling-median' as const : external ? 'public-transfer' as const : 'historical-average' as const,
    modelVersion: 'offload-v4', modelReason: selected.reason, modelWindow: model?.window ?? null,
    sourcePeriod: external?.anchor.period ?? '2022–2023', approximate: !model,
    publicModel: external,
    lower: model?.interval.lower ?? external?.lower ?? null, upper: model?.interval.upper ?? external?.upper ?? null,
    interval: model?.interval ?? null, validation: model?.validation ?? null,
    modelAsOf: model ? modelArtifact.asOf : null,
  };
}
export function hospitalPredictions(snapshot?: EdSnapshot, evaluatedAt?: string) {
  return HOSPITAL_SITES.map(site=>({...site,...predictHospital(site.id,snapshot,evaluatedAt)}));
}
export type HospitalPrediction = ReturnType<typeof predictHospital>;
