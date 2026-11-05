import { forecast,type Run } from './simulation.ts';
import { z } from 'zod';
import type { EdSnapshot } from './live-ed.ts';
import { hospitalPredictions } from './hospital-offload.ts';
import type { RoadTravel } from './road-travel.ts';
import type { Point } from './hospital-sites.ts';
export const LOCATIONS = [
  { name: 'Union Station', lat: 43.6453, lng: -79.3806 },
  { name: 'Nathan Phillips Square', lat: 43.6525, lng: -79.3839 },
  { name: 'Yonge & Bloor', lat: 43.6709, lng: -79.3867 },
  { name: 'High Park', lat: 43.6537, lng: -79.4669 },
  { name: 'Danforth & Pape', lat: 43.6796, lng: -79.3449 },
];
export const originSchema=z.object({lat:z.number().min(43.63).max(43.74),lng:z.number().min(-79.49).max(-79.29)});
export function resolveLocation(input:string):Point|null {
  const place=LOCATIONS.find(p=>p.name.toLowerCase()===input.trim().toLowerCase());
  if(place)return {lat:place.lat,lng:place.lng};
  const match=input.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if(!match)return null;
  const result=originSchema.safeParse({lat:Number(match[1]),lng:Number(match[2])});return result.success?result.data:null;
}
export function journeyNetwork(snapshot?:EdSnapshot,evaluatedAt?:string,roads?:RoadTravel,run?:Run|null) {
  const backgrounds=hospitalPredictions(snapshot,evaluatedAt);
  const sites=run?run.hospitals:backgrounds;
  const choices=sites.map(site=>{
    const siteTravel=roads?.minutes[site.id]??null;
    const simulationHospital=run?.hospitals.find(h=>h.id===site.id);
    const prediction=run&&simulationHospital?forecast({...run,liveEd:snapshot??run.liveEd,liveEdEvaluatedAt:evaluatedAt||run.liveEdEvaluatedAt},simulationHospital,siteTravel??0):backgrounds.find(h=>h.id===site.id)!;
    const h={...site,...prediction};
    const travel=roads?.minutes[h.id]??null;
    return {...h,hospitalId:h.id,travel,total:travel===null?null:Math.round((travel+h.offload)*10)/10};
  });
  const hasAllTravel=choices.every(h=>h.travel!==null);
  return {ranked:choices.sort((a,b)=>hasAllTravel?a.total!-b.total!:a.offload-b.offload),rankBy:hasAllTravel?'total' as const:'offload' as const};
}

/** Browser journey confirmation; independent of generated simulation outcomes. */
export const overviewTripSchema=z.object({
  destination:z.object({id:z.string().min(1).max(80),name:z.string().min(1).max(120),address:z.string().max(250),lat:z.number().min(-90).max(90),lng:z.number().min(-180).max(180)}),
  travel:z.number().finite().nonnegative().nullable(),offload:z.number().finite().nonnegative(),total:z.number().finite().nonnegative().nullable(),
  startedAt:z.number().finite().nonnegative(),arrivedAt:z.number().finite().nonnegative().nullable(),
}).refine(v=>v.arrivedAt===null||v.arrivedAt>=v.startedAt,'Arrival must follow departure.');
export type OverviewTrip=z.infer<typeof overviewTripSchema>;
