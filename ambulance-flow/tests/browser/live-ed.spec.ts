import {test,expect} from '@playwright/test';
import {mockSources} from './data-fixtures';
test('dashboard distinguishes ED context from historical offload estimates',async({page})=>{
 await mockSources(page);await page.goto('/');await page.getByRole('button',{name:'Union Station',exact:true}).click();await page.getByRole('button',{name:'Find hospitals',exact:true}).click();
 await expect(page.locator('.ed-status').getByText('ED: Live',{exact:true})).toHaveCount(1);await expect(page.locator('.ed-status').getByText('ED: Stale',{exact:true})).toHaveCount(1);await expect(page.locator('.ed-status').getByText('ED: No live ED data',{exact:true})).toHaveCount(3);
 const tgh=page.locator('.patient-options>div').filter({has:page.locator('.patient-option strong',{hasText:'Toronto General'})});await tgh.locator('.prediction-breakdown>summary').click();await tgh.locator('.prediction-source>summary').click();await expect(tgh).toContainText('Transferred typical range');await expect(tgh).toContainText('Public-data model');await expect(tgh).toContainText('No ED-to-offload adjustment');await expect(tgh).toContainText('Feed collected:');await expect(tgh).toContainText('ER Compass');await expect(tgh).toContainText('58 min');await expect(tgh).toContainText('Learned calendar factor');
});
test('feed failure is labelled offline rather than indistinguishable historical coverage',async({page})=>{
 await mockSources(page,{live:false});
 await page.route('**/api/ed-data',route=>route.fulfill({json:{snapshot:{readings:{},checkedAt:new Date().toISOString(),lastSuccessAt:null,error:'Live ED feed unavailable. Retrying shortly.',failureReason:'temporary connection failure',source:'ER Compass'},evaluatedAt:new Date().toISOString()}}));
 await page.goto('/');await page.getByRole('button',{name:'Union Station',exact:true}).click();await page.getByRole('button',{name:'Find hospitals'}).click();
 await expect(page.locator('.ed-status').getByText('ED: Feed offline',{exact:true})).toHaveCount(5);
 const detail=page.locator('.prediction-breakdown').first();await detail.locator(':scope>summary').click();await detail.locator('.prediction-source>summary').click();
 await expect(detail).toContainText('The ED feed request failed');
});
