// Controlli grafici su ogni misura di schermo (iPad verticale/orizzontale, iPad mini, Mac, iPhone).
// Per ogni schermata verifica che niente sia schiacciato, coperto, tagliato o fuori schermo,
// e salva una foto in qa-screenshots/ per la revisione dell'agente QA.
const { test } = require('@playwright/test');
const { openApp, advance, workoutStorage, assertUsable, shot } = require('./helpers');

const MODES = {
  tabata: { prep: 10, warmup: 60, work: 20, rest: 10, rounds: 8, sets: 2, recovery: 60, cooldown: 60 },
  emom: { prep: 10, interval: 60, rounds: 10 },
  amrap: { prep: 10, duration: 720 },
  fortime: { prep: 10, cap: 900 },
  circuit: {
    prep: 10, rest: 20, rounds: 3, roundRest: 60,
    exercises: [
      { name: 'Jumping jack', dur: 40 }, { name: 'Mountain climber esplosivo', dur: 45 },
      { name: 'Squat', dur: 40 }, { name: 'Piegamenti', dur: 40 }, { name: 'Burpee', dur: 40 },
    ],
  },
};

test('cronometro', async ({ page }, testInfo) => {
  await openApp(page);
  await assertUsable(page, 'body');
  await page.click('#sw-toggle');
  await page.clock.fastForward(3_725_000); // più di un'ora: compaiono le ore
  for (let i = 0; i < 4; i++) { await page.click('#sw-lap'); await page.clock.fastForward(30_000); }
  await assertUsable(page, 'body');
  await shot(page, testInfo, 'cronometro');
});

test('istruzioni di installazione', async ({ page }, testInfo) => {
  await openApp(page);
  await page.click('#install-btn');
  await assertUsable(page, '#install-dialog');
  await shot(page, testInfo, 'installa');
});

for (const [mode, config] of Object.entries(MODES)) {
  test(`impostazioni ${mode}`, async ({ page }, testInfo) => {
    await openApp(page, { storage: workoutStorage(mode, config) });
    await assertUsable(page, 'body');
    await page.evaluate(() => { document.querySelector('.setup').scrollTop = 0; });
    await shot(page, testInfo, `impostazioni-${mode}`);
  });

  test(`allenamento in corso ${mode}`, async ({ page }, testInfo) => {
    await openApp(page, { storage: workoutStorage(mode, config) });
    await page.click('#tb-start');
    await assertUsable(page, '#tabata-run');
    await advance(page, 11_000); // fine preparazione, prima fase di lavoro
    if (mode === 'amrap' || mode === 'fortime') {
      for (let i = 0; i < 12; i++) await page.click('#tb-count');
    }
    await assertUsable(page, '#tabata-run');
    await shot(page, testInfo, `in-corso-${mode}`);
    if (mode === 'circuit') {
      // riposo, poi l'esercizio con il nome lungo (salto di tempo: simularlo un passo alla volta è lento)
      await page.clock.fastForward(60_000);
      await advance(page, 100);
      await assertUsable(page, '#tabata-run');
      await shot(page, testInfo, 'in-corso-circuit-nome-lungo');
    }
    await page.click('#tb-toggle'); // pausa
    await assertUsable(page, '#tabata-run');
  });
}

test('fine allenamento', async ({ page }, testInfo) => {
  await openApp(page, { storage: workoutStorage('amrap', { prep: 0, duration: 60 }) });
  await page.click('#tb-start');
  for (let i = 0; i < 7; i++) await page.click('#tb-count');
  await advance(page, 61_000);
  await assertUsable(page, '#tabata-run');
  await shot(page, testInfo, 'fine');
});
