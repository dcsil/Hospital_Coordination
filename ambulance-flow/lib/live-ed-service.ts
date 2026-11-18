/** Server-only ER Compass adapter. Public, read-only API; no credentials needed. */
import { EMPTY_ED, type EdReading, type EdSnapshot } from './live-ed.ts';
const BASE = 'https://ercompass.ca';
export const REFRESH_MS = 15*60*1000;
// Exact Ontario/Toronto aliases only: never fuzzy-match St Joseph's in other cities.
export const ED_HOSPITALS: Record<string,string> = {
  tgh: 'University Health Network - Toronto General Hospital',
  twh: 'University Health Network - Toronto Western Hospital',
  sun: 'Sunnybrook Health Sciences Centre',
  mgh: 'Michael Garron Hospital',
  sjh: "St. Joseph's Health Centre",
};
type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue | null => value && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : null;
const minutes = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 24*60;
function timestamp(value: unknown) {
  // Offset-free and natural-language dates are ambiguous: preserve as text only.
  return typeof value === 'string' && /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}
export function parseCurrent(payload: unknown, now: number): EdReading[] {
  const root = object(payload);
  if (!root || !Array.isArray(root.hospitals)) throw new Error('Unexpected ER Compass current schema');
  const result: EdReading[]=[];
  for (const item of root.hospitals) {
    const row=object(item);if(!row || row.province!=='ON' || row.city!=='Toronto' || row.kind!=='er' || row.open_now===false || row.wait_caveat || row.wait_quality) continue;
    const id=Object.keys(ED_HOSPITALS).find(id=>ED_HOSPITALS[id]===row.hospital);
    if(!id || !minutes(row.wait_minutes)) continue;
    const collected=timestamp(row.fetched_at);if(!collected || Date.parse(collected)>now+60000) continue;
    const publisher=timestamp(row.as_of);
    const staleHours=typeof row.wait_stale_hours==='number' && Number.isFinite(row.wait_stale_hours) && row.wait_stale_hours>=0 ? row.wait_stale_hours : 0;
    const observedAt = publisher ?? new Date(Date.parse(collected)-staleHours*3600000).toISOString();
    if(Date.parse(observedAt)>now+60000 || Date.parse(observedAt)>Date.parse(collected)+60000) continue;
    result.push({hospitalId:id,externalHospital:ED_HOSPITALS[id],metric:'posted_wait_minutes',waitMinutes:row.wait_minutes,
      collectedAt:collected,observedAt,timestampBasis:publisher?'publisher':'collection',publisherAsOf:typeof row.as_of==='string'?row.as_of:null,
      referenceMinutes:null,referenceCount:0,referenceFrom:null,referenceTo:null});
  }
  return result;
}
export function addHistoricalReference(reading: EdReading, payload: unknown): EdReading {
  const root=object(payload);
  if(!root || root.hospital!==reading.externalHospital || root.metric!==reading.metric || !Array.isArray(root.points)) return reading;
  const cutoff=Date.parse(reading.collectedAt)-3600000; // exclude current hour from its own baseline
  const earliest=cutoff-7*24*3600000;
  const points=new Map<string,number>();
  for(const item of root.points) {
    const p=object(item);if(!p || !minutes(p.value)) continue;
    const date=timestamp(p.fetched_at);if(!date)continue;
    const t=Date.parse(date);if(t>=earliest && t<cutoff)points.set(date,p.value);
  }
  // At least one day and 24 distinct observations, same hospital/posted metric.
  const dates=[...points.keys()].sort();
  if(dates.length<24 || Date.parse(dates.at(-1)!)-Date.parse(dates[0])<24*3600000) return reading;
  const values=[...points.values()].sort((a,b)=>a-b);const mid=Math.floor(values.length/2);
  const median=values.length%2?values[mid]:(values[mid-1]+values[mid])/2;
  if(median<=0) return reading;
  return {...reading,referenceMinutes:Math.round(median*10)/10,referenceCount:dates.length,referenceFrom:dates[0],referenceTo:dates.at(-1)!};
}
export function createEdService(fetcher: typeof fetch = fetch, clock: ()=>number = Date.now) {
  let cache: EdSnapshot=structuredClone(EMPTY_ED);let nextRefresh=0;let retryUntil=0;let pending:Promise<EdSnapshot>|null=null;
  async function getJson(path: string) {
    const response=await fetcher(`${BASE}${path}`,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(4000)});
    if(!response.ok) {
      const retry=response.headers.get('Retry-After');
      if(retry) { const seconds=Number(retry);const until=Number.isFinite(seconds)?clock()+seconds*1000:Date.parse(retry);if(Number.isFinite(until))retryUntil=Math.max(retryUntil,until); }
      throw new Error(`ER Compass HTTP ${response.status}`);
    }
    return response.json() as Promise<unknown>;
  }
  async function refresh(): Promise<EdSnapshot> {
    const checkedAt=new Date(clock()).toISOString();nextRefresh=clock()+REFRESH_MS;
    try {
      const current=parseCurrent(await getJson('/api/current?province=ON'),clock());
      const results=await Promise.all(current.map(async reading=> {
        try {return addHistoricalReference(reading,await getJson(`/api/hospital/${encodeURIComponent(reading.externalHospital)}/history`));}
        catch { const old=cache.readings[reading.hospitalId];return old?.referenceMinutes && old.referenceTo && clock()-Date.parse(old.referenceTo)<7*24*3600000 ? {...reading,referenceMinutes:old.referenceMinutes,referenceCount:old.referenceCount,referenceFrom:old.referenceFrom,referenceTo:old.referenceTo}:reading; }
      }));
      const readings={...cache.readings};
      for(const reading of results) {
        const old=readings[reading.hospitalId];
        if(!old || Date.parse(reading.collectedAt)>=Date.parse(old.collectedAt)) readings[reading.hospitalId]=reading;
      }
      cache={...cache,readings,checkedAt,lastSuccessAt:checkedAt,error:null,failureReason:null};
    } catch(error) {nextRefresh=Math.max(clock()+60000,retryUntil);cache={...cache,checkedAt,error:'Live ED feed unavailable. Retrying shortly.',failureReason:error instanceof Error?error.message:'Unknown provider failure'}; }
    return structuredClone(cache);
  }
  return {
    async get():Promise<EdSnapshot> {
      if(pending)return structuredClone(await pending);
      if(clock()<Math.max(nextRefresh,retryUntil))return structuredClone(cache);
      pending=refresh();try{return structuredClone(await pending);}finally{pending=null;}
    },
  };
}
export const edService=createEdService();
