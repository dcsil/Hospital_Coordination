import { HOSPITAL_SITES,type Point } from './hospital-sites.ts';
/** Temporary estimates authorized for the demo; never labelled Google travel. */
export type RoadTravel={minutes:Record<string,number|null>;fetchedAt:string|null;source:'Estimated simulation travel';error:string|null};
export function estimatedTravel(a:Point,b:Point){const dy=(a.lat-b.lat)*111,dx=(a.lng-b.lng)*80.4;return Math.max(3,Math.ceil(Math.hypot(dx,dy)*1.35/.55));}
export function createRoadService(clock:()=>number=Date.now){return {async get(origin:Point):Promise<RoadTravel>{return {minutes:Object.fromEntries(HOSPITAL_SITES.map(h=>[h.id,estimatedTravel(origin,h)])),fetchedAt:new Date(clock()).toISOString(),source:'Estimated simulation travel',error:null};}};}
export const roadService=createRoadService();
