import fitted from '../data/public-offload-model.json' with { type: 'json' };
import anchors from '../data/public-offload-anchors.json' with { type: 'json' };
import { HOSPITAL_SITES } from './hospital-sites.ts';
/** Fitted calendar effects from public APOT records; Toronto application is unvalidated transfer. */
export const PUBLIC_OFFLOAD_MODEL = fitted;
const formatter = new Intl.DateTimeFormat('en-US', {timeZone:'America/Toronto',weekday:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const weekdays=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
export function torontoCalendar(at: string) {
  if (!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(at) || !Number.isFinite(Date.parse(at))) return null;
  const parts=Object.fromEntries(formatter.formatToParts(new Date(at)).map(p=>[p.type,p.value]));
  const hour=Number(parts.hour)+Number(parts.minute)/60+Number(parts.second)/3600;
  const day=weekdays.indexOf(parts.weekday), angle=2*Math.PI*hour/24;
  return {hour,day,features:[Math.sin(angle),Math.cos(angle),Math.sin(2*angle),Math.cos(2*angle),...Array.from({length:6},(_,i)=>Number(day===i+1))]};
}
export function publicOffloadPrediction(hospitalId:string,historicalMean:number,arrivalAt?:string,evaluatedAt=arrivalAt) {
  if(!arrivalAt || !evaluatedAt || !torontoCalendar(evaluatedAt) || Date.parse(evaluatedAt)<Date.parse(fitted.availableFrom) || !Number.isFinite(historicalMean) || historicalMean<0 || !HOSPITAL_SITES.some(h=>h.id===hospitalId))return null;
  const calendar=torontoCalendar(arrivalAt);if(!calendar)return null;
  const factor=Math.exp(calendar.features.reduce((sum,x,i)=>sum+x*fitted.calendarCoefficients[i],0))/fitted.calendarNormalizer;
  const published=anchors[hospitalId as keyof typeof anchors];
  const anchor=published?{statistic:'p90' as const,minutes:published.minutes,period:published.period,url:published.url}:
    {statistic:'mean' as const,minutes:historicalMean,period:'2022–2023 (approximate chart value)',url:'https://www.toronto.ca/legdocs/mmis/2024/cc/bgrd/backgroundfile-247763.pdf'};
  const scale=anchor.statistic==='p90'?(anchor.minutes+1)/fitted.unconditionalP90Ratio:anchor.minutes+1;
  const expected=Math.max(0,scale*factor-1);
  const quantile=(ratio:number)=>Math.max(0,scale*factor*ratio-1);
  return {expectedMinutes:expected,medianMinutes:quantile(fitted.residualRatios.p50),
    lower:quantile(fitted.residualRatios.p10),upper:quantile(fitted.residualRatios.p90),
    calendarFactor:factor,anchor,arrivalAt,localHour:calendar.hour,
    method:fitted.method,status:fitted.status,source:fitted.source,validation:fitted.validation,
    rangeMeaning:'Transferred central 80% source-residual range; Toronto coverage unknown.'};
}
