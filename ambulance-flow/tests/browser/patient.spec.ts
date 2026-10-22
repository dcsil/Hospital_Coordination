import { test, expect } from '@playwright/test';
import { journeyNetwork, resolveLocation } from '../../lib/patient-journey';

test('location bounds, ranking, and critical eligibility', () => {
  expect(resolveLocation('unknown address')).toBeNull();
  expect(resolveLocation('0, 0')).toBeNull();
  expect(resolveLocation('43.65, -79.38')).toEqual({ lat: 43.65, lng: -79.38 });
  const origin = resolveLocation('Union Station')!;
  for (const urgency of ['low', 'moderate', 'critical'] as const) {
    const { ranked, run } = journeyNetwork(origin, urgency);
    expect(ranked.length).toBeGreaterThan(1);
    expect(ranked.map(c => c.total)).toEqual(ranked.map(c => c.total).sort((a, b) => a - b));
    for (const c of ranked) {
      expect(c.total).toBeCloseTo(c.travel + c.offload, 1);
      if (urgency === 'critical') expect(run.hospitals.find(h => h.id === c.hospitalId)?.capabilities).toContain('specialist');
    }
  }
});

test('patient can choose an alternative, reload route, arrive, and begin again', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Find hospitals' })).toBeDisabled();
  await page.getByLabel('Current location').fill('Unknown location');
  await page.getByRole('radio', { name: /Moderate/ }).check();
  await page.getByRole('button', { name: 'Find hospitals' }).click();
  await expect(page.getByRole('alert')).toContainText('Choose a listed Toronto location');
  await page.getByRole('button', { name: 'Union Station', exact: true }).click();
  await page.getByRole('button', { name: 'Find hospitals' }).click();
  await expect(page.locator('.patient-option')).toHaveCount(5);
  await page.locator('.patient-option').nth(1).getByRole('radio').check();
  const destination = await page.locator('.patient-option').nth(1).locator('strong').innerText();
  await page.screenshot({ path: 'outputs/patient-choices-desktop.png', fullPage: true });
  await page.getByRole('button', { name: /Start route to/ }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'On the way to hospital' })).toBeVisible();
  await expect(page.locator('.patient-destination h3')).toHaveText(destination.replace(/^\d+\. /, ''));
  await page.getByRole('button', { name: 'Arrived at hospital' }).click();
  await expect(page.getByRole('heading', { name: 'Trip complete' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Trip complete' })).toBeVisible();
  await page.getByRole('button', { name: 'New patient journey' }).click();
  await expect(page.getByLabel('Current location')).toHaveValue('');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Union Station', exact: true }).click();
  await page.getByRole('radio', { name: /Critical/ }).check();
  await page.getByRole('button', { name: 'Find hospitals' }).click();
  await expect(page.locator('.patient-option')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'outputs/patient-choices-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});
