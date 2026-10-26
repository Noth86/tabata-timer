// L'app deve funzionare senza internet dopo il primo caricamento (service worker).
const { test, expect } = require('@playwright/test');
const { mute } = require('./helpers');

test.use({ serviceWorkers: 'allow' });

test('funziona offline dopo il primo caricamento', async ({ page, context }) => {
  await mute(page);
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // ora la pagina è controllata dal service worker
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#sw-toggle')).toBeVisible();
  await page.click('.tab[data-view=tabata]');
  await expect(page.locator('#mode-tabs button')).toHaveCount(5);
});
