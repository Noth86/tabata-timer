// Prova tutte le larghezze di schermo, da un telefono piccolo a un Mac, a passi di 16 px.
// Le sei misure fisse di grafica.spec.js lasciavano scoperte delle fasce (es. 641–784 px: telefoni in
// orizzontale, iPad in Split View) dove la barra in alto usciva dallo schermo.
const { test, expect } = require('@playwright/test');
const { openApp, workoutStorage, assertUsable, shot } = require('./helpers');

const WIDTHS = [];
for (let w = 320; w <= 1440; w += 16) WIDTHS.push(w);
const HEIGHT = 900;

const tabata = { prep: 10, warmup: 60, work: 20, rest: 10, rounds: 8, sets: 2, recovery: 60, cooldown: 3600 };
const circuit = {
  prep: 10, rest: 20, rounds: 3, roundRest: 60,
  exercises: [{ name: 'Mountain climber esplosivo', dur: 45 }, { name: 'Squat', dur: 3600 }],
};

test('cronometro a tutte le larghezze', async ({ page }) => {
  await openApp(page);
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: HEIGHT });
    await assertUsable(page, 'body', `${w}px`);
  }
});

const others = { amrap: { prep: 10, duration: 720 }, fortime: { prep: 10, cap: 900 }, emom: { prep: 10, interval: 60, rounds: 10 } };

for (const [mode, config] of [['tabata', tabata], ['circuit', circuit], ...Object.entries(others)]) {
  test(`impostazioni ${mode} a tutte le larghezze`, async ({ page }) => {
    await openApp(page, { storage: workoutStorage(mode, config) });
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: HEIGHT });
      await assertUsable(page, 'body', `${w}px`);
    }
  });

  test(`allenamento ${mode} a tutte le larghezze`, async ({ page }) => {
    await openApp(page, { storage: workoutStorage(mode, config) });
    await page.click('#tb-start');
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: HEIGHT });
      await assertUsable(page, '#tabata-run', `${w}px`);
    }
  });
}

// telefoni in orizzontale: poca altezza
const PHONES_LANDSCAPE = [[568, 320], [667, 375], [844, 390], [932, 430]];

test('telefoni in orizzontale', async ({ page }, testInfo) => {
  await openApp(page, { storage: workoutStorage('fortime', others.fortime) });
  for (const [width, height] of PHONES_LANDSCAPE) {
    await page.setViewportSize({ width, height });
    await assertUsable(page, 'body', `${width}×${height}`);
  }
  await page.click('#tb-start');
  for (const [width, height] of PHONES_LANDSCAPE) {
    await page.setViewportSize({ width, height });
    await assertUsable(page, '#tabata-run', `${width}×${height}`);
    await shot(page, testInfo, `telefono-orizzontale-${width}x${height}`);
  }
});

test('la barra in alto resta su una riga da 568 px in su', async ({ page }) => {
  // misura una scelta estetica che dipende dalla larghezza dei font Apple: su Linux (GitHub) o con QA_FONT
  // la barra può andare su due righe, ed è corretto (gli altri test verificano che non esca mai dallo schermo)
  test.skip(!!process.env.CI || !!process.env.QA_FONT, 'dipende dai font Apple, presenti solo sul Mac');
  await openApp(page);
  for (let w = 568; w <= 1440; w += 16) {
    await page.setViewportSize({ width: w, height: HEIGHT });
    const h = await page.locator('.topbar').evaluate((el) => el.getBoundingClientRect().height);
    expect(h, `barra in alto a ${w}px`).toBeLessThan(90);
  }
});
