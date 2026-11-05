import type { forecast } from '@/lib/simulation';

type Prediction = Pick<ReturnType<typeof forecast>, 'baseline' | 'congestionAdjustment' | 'queueAdjustment' | 'offload' | 'queue' | 'projectedQueue' | 'oldOffload' | 'fallback'>;
export default function PredictionBreakdown({ prediction: p, travel, total }: { prediction: Prediction; travel?: number; total?: number }) {
  const signed = (n: number) => `${n >= 0 ? '+' : ''}${n}`;
  return <details className="prediction-breakdown"><summary>Why {p.offload} min offload?</summary><dl>
    <div><dt>Historical offload{p.fallback ? ' (fallback)' : ' (approx.)'}</dt><dd>{p.baseline} min</dd></div>
    <div><dt>Congestion adjustment</dt><dd>{signed(p.congestionAdjustment)} min</dd></div>
    <div><dt>Additional queue delay</dt><dd>{signed(p.queueAdjustment)} min</dd></div>
    <div><dt>Predicted offload</dt><dd>{p.offload} min</dd></div>
    {travel !== undefined && <div><dt>Travel time</dt><dd>{travel} min</dd></div>}
    {total !== undefined && <div><dt>Total expected time</dt><dd>{total} min</dd></div>}
    <div><dt>Reported queue → queue at arrival</dt><dd>{p.queue} → {p.projectedQueue}</dd></div>
    <div><dt>Previous model offload</dt><dd>{p.oldOffload} min</dd></div>
  </dl><p>2022–2023 chart baseline; ED congestion is an unvalidated demo modifier. Default cap: 180 min. Closed sites are unavailable.</p></details>;
}
