import {test,expect} from '@playwright/test';
import {createRun,DEFAULT_CONFIG,advance} from '../../lib/simulation';
import {mockSources} from './data-fixtures';
test('Overview clock advances queue forecasts while transport views hide idle and pre-pickup cases',async({page})=>{
 await mockSources(page,{live:false});const run=createRun({...DEFAULT_CONFIG,slots:1,manual:true},'overview-dynamic');run.status='paused';const h=run.hospitals[3];
 run.incidents=[{id:'active',time:0,pickedUpAt:0,assignedAt:0,lat:h.lat,lng:h.lng,care:'general',scene:0,serviceFactor:1}];
 const a=run.ambulances[0];Object.assign(a,{status:'HANDOVER',incidentId:'active',destination:h.id,until:40,arrivalAt:0,lat:h.lat,lng:h.lng});h.active=[a.id];h.observations=[{time:0,queue:0,busy:1,capacity:1,releases:[40],readyAt:[]}];
 await page.addInitScript(()=>localStorage.setItem('kinetic-run','overview-dynamic'));
 await page.route('**/api/runs/overview-dynamic/state',route=>route.fulfill({json:run}));
 await page.route('**/api/runs/overview-dynamic/control',route=>{const body=route.request().postDataJSON();expect(body.action).toBe('step');run.status='running';advance(run,body.minutes);if(run.status==='running')run.status='paused';run.revision++;return route.fulfill({json:run});});
 await page.goto('/');await page.getByRole('button',{name:'Union Station',exact:true}).click();await page.getByRole('button',{name:'Find hospitals'}).click();
 const sun=page.locator('.patient-options>div').filter({has:page.locator('.patient-option strong',{hasText:'Sunnybrook'})});
 await expect(sun).toContainText('38 min estimated offload');await expect(page.getByTestId('overview-forecast-clock')).toContainText('Simulation minute 0');
 await page.getByRole('button',{name:'Advance five minutes',exact:true}).click();await expect(sun).toContainText('33 min estimated offload');await expect(page.getByTestId('overview-forecast-clock')).toContainText('Simulation minute 5');
 await page.getByRole('button',{name:'Live operations',exact:true}).click();await expect(page.locator('.fleet-table tbody tr')).toHaveCount(1);
 await expect(page.getByText('Available fleet',{exact:true})).toHaveCount(0);await expect(page.getByRole('option',{name:'Available',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:/Inspect AMB-/})).toHaveCount(1);await expect(page.locator('[aria-label^="Emergency "]')).toHaveCount(0);
});
