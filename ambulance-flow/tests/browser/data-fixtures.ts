import type { Page } from '@playwright/test';
export async function mockSources(page:Page,{roadsAvailable=true,live=true}:{roadsAvailable?:boolean;live?:boolean}={}){
 const now=new Date().toISOString();
 const reading=(id:string,age:number)=>({hospitalId:id,externalHospital:id,metric:'posted_wait_minutes',waitMinutes:180,collectedAt:new Date(Date.parse(now)-age*60000).toISOString(),observedAt:new Date(Date.parse(now)-age*60000).toISOString(),timestampBasis:'collection',publisherAsOf:null,referenceMinutes:90,referenceCount:30,referenceFrom:'2026-11-01T00:00:00Z',referenceTo:'2026-11-04T00:00:00Z'});
 await page.route('**/api/ed-data',route=>route.fulfill({json:{snapshot:{readings:live?{tgh:reading('tgh',5),twh:reading('twh',90)}:{},checkedAt:now,lastSuccessAt:now,error:null,source:'ER Compass'},evaluatedAt:now}}));
 await page.route('**/api/travel?*',route=>route.fulfill({json:{minutes:roadsAvailable?{tgh:5,twh:8,mgh:15,sun:20,sjh:17}:{},fetchedAt:roadsAvailable?now:null,source:'Estimated simulation travel',error:roadsAvailable?null:'Road travel unavailable. Ranking uses offload estimates only.'}}));
}
