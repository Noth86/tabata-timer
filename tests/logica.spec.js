// Test di funzionamento: ogni modalità, preset, cronometro, schermo sempre acceso.
const { test, expect } = require('@playwright/test');
const { openApp, advance, workoutStorage, runState, collectPhases } = require('./helpers');

const start = (page) => page.click('#tb-start');

test.describe('Tabata', () => {
  const cfg = { prep: 3, warmup: 0, work: 4, rest: 2, rounds: 2, sets: 2, recovery: 5, cooldown: 3 };

  test('durata totale e sequenza delle fasi', async ({ page }) => {
    await openApp(page, { storage: workoutStorage('tabata', cfg) });
    // 3 + 2 serie × (2×4 lavoro + 1×2 riposo) + 5 recupero + 3 defaticamento
    await expect(page.locator('#total-time')).toHaveText('0:31');
    await start(page);
    await advance(page, 500);
    expect(await collectPhases(page, 40)).toEqual([
      'prep:PREPARATI', 'work:LAVORO', 'rest:RIPOSO', 'work:LAVORO', 'recovery:RECUPERO',
      'work:LAVORO', 'rest:RIPOSO', 'work:LAVORO', 'cooldown:DEFATICAMENTO', 'done:FINITO!',
    ]);
  });

  test('round, serie e conto alla rovescia', async ({ page }) => {
    await openApp(page, { storage: workoutStorage('tabata', cfg) });
    await start(page);
    await advance(page, 500);
    let s = await runState(page);
    expect(s).toMatchObject({ phase: 'prep', time: '3', remaining: '0:31' });
    await advance(page, 3000);
    s = await runState(page);
    expect(s).toMatchObject({ phase: 'work', time: '4', info: 'Round 1/2 · Serie 1/2', next: 'Poi: Riposo · 2 s' });
    await advance(page, 1000);
    expect((await runState(page)).time).toBe('3');
  });

  test('riscaldamento in testa, una volta sola', async ({ page }) => {
    await openApp(page, { storage: workoutStorage('tabata', { ...cfg, prep: 0, warmup: 30, sets: 1, cooldown: 0 }) });
    await start(page);
    await advance(page, 500);
    expect(await collectPhases(page, 60)).toEqual(['warmup:RISCALDAMENTO', 'work:LAVORO', 'rest:RIPOSO', 'work:LAVORO', 'done:FINITO!']);
  });

  test('pausa ferma il tempo, riprendi lo fa ripartire', async ({ page }) => {
    await openApp(page, { storage: workoutStorage('tabata', cfg) });
    await start(page);
    await advance(page, 4500);
    await page.click('#tb-toggle');
    await expect(page.locator('#tb-toggle')).toHaveText('Riprendi');
    const before = await runState(page);
    await advance(page, 10000);
    expect(await runState(page)).toEqual(before);
    await page.click('#tb-toggle');
    await advance(page, 1000);
    expect((await runState(page)).time).not.toBe(before.time);
  });

  test('salta passa alla fase successiva', async ({ page }) => {
    await openApp(page, { storage: workoutStorage('tabata', cfg) });
    await start(page);
    await page.click('#tb-skip');
    await advance(page, 100);
    expect((await runState(page)).phase).toBe('work');
  });

  test('Ricomincia chiede conferma durante l\'allenamento', async ({ page }) => {
    await openApp(page, { storage: workoutStorage('tabata', cfg) });
    await start(page);
    await advance(page, 5500);
    page.once('dialog', (d) => d.dismiss());
    await page.click('#tb-restart');
    expect((await runState(page)).phase).toBe('work'); // annullato: si continua
    page.once('dialog', (d) => d.accept());
    await page.click('#tb-restart');
    await advance(page, 500);
    expect((await runState(page)).phase).toBe('prep'); // confermato: si riparte
  });

  test('Ricomincia chiede conferma anche in pausa', async ({ page }) => {
    await openApp(page, { storage: workoutStorage('tabata', cfg) });
    await start(page);
    await advance(page, 5500);
    await page.click('#tb-toggle');
    let asked = false;
    page.once('dialog', (d) => { asked = true; d.dismiss(); });
    await page.click('#tb-restart');
    expect(asked).toBe(true);
    expect((await runState(page)).phase).toBe('work');
  });

  test('chiudere con la X torna alle impostazioni', async ({ page }) => {
    await openApp(page, { storage: workoutStorage('tabata', cfg) });
    await start(page);
    page.once('dialog', (d) => d.accept());
    await page.click('#tb-close');
    await expect(page.locator('#tabata-run')).toBeHidden();
    await expect(page.locator('#tb-start')).toBeVisible();
  });
});

test('EMOM: un intervallo per round', async ({ page }) => {
  await openApp(page, { storage: workoutStorage('emom', { prep: 0, interval: 10, rounds: 3 }) });
  await expect(page.locator('#total-time')).toHaveText('0:30');
  await start(page);
  await advance(page, 500);
  const infos = [];
  for (let i = 0; i < 3; i++) { infos.push((await runState(page)).info); await advance(page, 10000); }
  expect(infos).toEqual(['Round 1/3', 'Round 2/3', 'Round 3/3']);
  await advance(page, 100);
  expect((await runState(page)).phase).toBe('done');
});

test('AMRAP: conta i round e li mostra alla fine', async ({ page }) => {
  await openApp(page, { storage: workoutStorage('amrap', { prep: 0, duration: 60 }) });
  await start(page);
  await expect(page.locator('#tb-count')).toBeVisible();
  await expect(page.locator('#tb-skip')).toBeHidden();
  for (let i = 0; i < 3; i++) await page.click('#tb-count');
  await page.click('#cnt-minus');
  await expect(page.locator('#run-next')).toHaveText('2 round completati');
  // una sola fase principale: niente tempo totale doppione in alto
  await expect(page.locator('#run-remaining')).toHaveText('');
  await advance(page, 61000);
  const s = await runState(page);
  expect(s.phase).toBe('done');
  expect(s.next).toContain('2 round');
  await expect(page.locator('#tb-count')).toBeHidden();
});

test('For Time senza limite: il tempo sale e "Fatto" lo ferma', async ({ page }) => {
  await openApp(page, { storage: workoutStorage('fortime', { prep: 0, cap: 0 }) });
  await expect(page.locator('#total-time')).toHaveText('senza limite');
  await start(page);
  await advance(page, 65500);
  expect((await runState(page)).time).toBe('1:05');
  await page.click('#tb-count');
  await page.click('#tb-done');
  const s = await runState(page);
  expect(s).toMatchObject({ phase: 'done', time: '1:05' });
  expect(s.next).toBe('1 round · 1:05');
});

test('For Time con limite: si ferma da solo', async ({ page }) => {
  await openApp(page, { storage: workoutStorage('fortime', { prep: 5, cap: 30 }) });
  await start(page);
  await advance(page, 500);
  expect((await runState(page)).remaining).toBe('Limite 0:30');
  await advance(page, 36000);
  expect(await runState(page)).toMatchObject({ phase: 'done', time: '0:30' });
});

test('Circuito: nomi degli esercizi, riposi e recupero tra round', async ({ page }) => {
  const exercises = [{ name: 'Squat', dur: 5 }, { name: 'Plank', dur: 5 }];
  await openApp(page, { storage: workoutStorage('circuit', { prep: 0, rest: 2, rounds: 2, roundRest: 4, exercises }) });
  await expect(page.locator('#total-time')).toHaveText('0:28');
  await start(page);
  await advance(page, 500);
  expect((await runState(page)).info).toBe('Round 1/2 · Esercizio 1/2');
  await advance(page, 5000);
  expect((await runState(page)).next).toBe('Poi: Plank · 5 s');
  expect(await collectPhases(page, 40)).toEqual([
    'rest:RIPOSO', 'work:PLANK', 'recovery:RECUPERO', 'work:SQUAT', 'rest:RIPOSO', 'work:PLANK', 'done:FINITO!',
  ]);
});

test('Circuito: modifica esercizi, durata totale e salvataggio', async ({ page }) => {
  const exercises = [{ name: 'Squat', dur: 30 }];
  await openApp(page, { storage: workoutStorage('circuit', { prep: 0, rest: 10, rounds: 1, roundRest: 0, exercises }) });
  await expect(page.locator('#total-time')).toHaveText('0:30');
  await page.click('.ex-add');
  await page.locator('.ex-name').nth(1).fill('Affondi');
  await expect(page.locator('#total-time')).toHaveText('1:10');
  await page.locator('.exercise-row').nth(1).locator('.stepper button').last().click();
  await expect(page.locator('.exercise-row').nth(1).locator('.value')).toHaveText('35 s');
  await page.reload();
  await expect(page.locator('.ex-name')).toHaveCount(2);
  await expect(page.locator('.ex-name').nth(1)).toHaveValue('Affondi');
  await page.locator('.ex-del').first().click();
  await expect(page.locator('.ex-name')).toHaveCount(1);
  await expect(page.locator('.ex-del')).toBeDisabled();
});

test.describe('Preset', () => {
  test('scegliere un preset predefinito cambia i valori', async ({ page }) => {
    await openApp(page, { storage: { 'ui.view': 'tabata', 'wo.mode': 'tabata' } });
    await page.selectOption('#preset-select', { label: '40/20 × 10' });
    await expect(page.locator('.field', { hasText: 'Lavoro' }).locator('.value')).toHaveText('40 s');
    await expect(page.locator('.field', { hasText: 'Round' }).locator('.value')).toHaveText('10');
  });

  test('salvare, ritrovare dopo la ricarica ed eliminare un preset', async ({ page }) => {
    await openApp(page, { storage: { 'ui.view': 'tabata', 'wo.mode': 'emom' } });
    await page.locator('.field', { hasText: 'Round' }).locator('.stepper button').last().click();
    page.once('dialog', (d) => d.accept('Mio EMOM'));
    await page.click('#preset-save');
    await page.reload();
    await expect(page.locator('#preset-select option:checked')).toHaveText('Mio EMOM');
    // il preset appartiene a EMOM, non compare nelle altre modalità
    await page.click('#mode-tabs [data-mode=amrap]');
    await expect(page.locator('#preset-select option', { hasText: 'Mio EMOM' })).toHaveCount(0);
    await page.click('#mode-tabs [data-mode=emom]');
    page.once('dialog', (d) => d.accept());
    await page.click('#preset-delete');
    await expect(page.locator('#preset-select option', { hasText: 'Mio EMOM' })).toHaveCount(0);
  });

  test('una copia personale di un preset predefinito resta selezionata e si può eliminare', async ({ page }) => {
    await openApp(page, { storage: { 'ui.view': 'tabata', 'wo.mode': 'tabata' } });
    await page.selectOption('#preset-select', { label: 'Tabata classico (8×20/10)' });
    page.once('dialog', (d) => d.accept('Mio'));
    await page.click('#preset-save');
    await expect(page.locator('#preset-select option:checked')).toHaveText('Mio');
    await page.selectOption('#preset-select', { label: 'Tabata classico (8×20/10)' });
    await page.selectOption('#preset-select', { label: 'Mio' });
    await expect(page.locator('#preset-select option:checked')).toHaveText('Mio');
    await page.reload();
    await expect(page.locator('#preset-select option:checked')).toHaveText('Mio'); // ricordato anche dopo la ricarica
    page.once('dialog', (d) => d.accept());
    await page.click('#preset-delete');
    await expect(page.locator('#preset-select option', { hasText: 'Mio' })).toHaveCount(0);
    await expect(page.locator('#toast')).toHaveText('Preset "Mio" eliminato');
  });

  test('i preset predefiniti non si eliminano', async ({ page }) => {
    await openApp(page, { storage: { 'ui.view': 'tabata', 'wo.mode': 'tabata' } });
    await page.selectOption('#preset-select', { label: 'Tabata 4 serie' });
    await page.click('#preset-delete');
    await expect(page.locator('#toast')).toHaveText(/non si possono eliminare/);
    await expect(page.locator('#preset-select option', { hasText: 'Tabata 4 serie' })).toHaveCount(1);
  });

  test('impostazioni e preset della prima versione vengono conservati', async ({ page }) => {
    await openApp(page, {
      storage: {
        'ui.view': 'tabata',
        'tb.config': { prep: 5, work: 45, rest: 15, rounds: 6, sets: 2, recovery: 90 },
        'tb.presets': [{ name: 'Mio 45/15', prep: 5, work: 45, rest: 15, rounds: 6, sets: 2, recovery: 90 }],
      },
    });
    await expect(page.locator('#preset-select option:checked')).toHaveText('Mio 45/15');
    await expect(page.locator('#total-time')).toHaveText('13:05');
  });
});

test.describe('Cronometro', () => {
  test('avvia, giro, pausa, azzera', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('#sw-reset')).toBeDisabled();
    await page.click('#sw-toggle');
    await advance(page, 65430);
    await expect(page.locator('#sw-main')).toHaveText('01:05');
    await page.click('#sw-lap');
    await expect(page.locator('#sw-laps li')).toHaveCount(1);
    await expect(page.locator('#sw-reset')).toBeDisabled();
    await page.click('#sw-toggle');
    await expect(page.locator('#sw-toggle')).toHaveText('Riprendi');
    await page.click('#sw-reset');
    await expect(page.locator('#sw-main')).toHaveText('00:00');
    await expect(page.locator('#sw-laps li')).toHaveCount(0);
  });

  test('sopravvive alla ricarica della pagina', async ({ page }) => {
    await openApp(page, { clock: false });
    await page.click('#sw-toggle');
    await page.waitForTimeout(1200);
    await page.reload();
    await expect(page.locator('#sw-toggle')).toHaveText('Pausa');
    await expect(page.locator('#sw-main')).not.toHaveText('00:00');
  });

  test('la barra spaziatrice avvia e ferma', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('Space');
    await expect(page.locator('#sw-toggle')).toHaveText('Pausa');
    await advance(page, 1000);
    await page.keyboard.press('Space');
    await expect(page.locator('#sw-toggle')).toHaveText('Riprendi');
  });

  test('la barra spaziatrice funziona anche dopo aver cliccato un pulsante (Mac)', async ({ page }) => {
    await openApp(page);
    await page.click('#sw-toggle'); // il pulsante resta "selezionato"
    await advance(page, 1000);
    await page.keyboard.press('Space');
    await expect(page.locator('#sw-toggle')).toHaveText('Riprendi');
  });
});

test.describe('Schermo sempre acceso', () => {
  // finto Wake Lock: il browser dei test non concede quello vero
  const mockWakeLock = () => {
    window.__wake = { requests: 0, releases: 0 };
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: async () => {
          window.__wake.requests++;
          const s = new EventTarget();
          s.release = async () => { window.__wake.releases++; s.dispatchEvent(new Event('release')); };
          return s;
        },
      },
    });
    // finta riproduzione video (WebKit dei test su Linux non ha il codec H.264)
    window.__video = { plays: 0, pauses: 0 };
    HTMLMediaElement.prototype.play = function () {
      window.__video.plays++;
      Object.defineProperty(this, 'paused', { configurable: true, get: () => false });
      this.dispatchEvent(new Event('playing'));
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () {
      window.__video.pauses++;
      Object.defineProperty(this, 'paused', { configurable: true, get: () => true });
      this.dispatchEvent(new Event('pause'));
    };
  };

  test('si attiva da solo, si spegne e si riaccende con l\'interruttore', async ({ page }) => {
    await page.addInitScript(mockWakeLock);
    await openApp(page);
    const sw = page.locator('#wake-indicator');
    await expect(sw).toHaveClass(/enabled/);
    await page.click('#sw-main'); // su iPad il video parte solo dopo un tocco
    await expect(sw).not.toHaveClass(/pending/);
    await sw.click();
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    expect(await page.evaluate(() => window.__wake.releases)).toBe(1);
    // un tocco altrove non deve riaccenderlo
    await page.click('#sw-main');
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    await sw.click();
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    await page.reload();
    await expect(sw).toHaveAttribute('aria-checked', 'true');
  });

  test('iPad: il video anti-oscuramento parte al primo tocco e si ferma con l\'interruttore', async ({ page }) => {
    await page.addInitScript(mockWakeLock);
    await openApp(page);
    const sw = page.locator('#wake-indicator');
    await expect(page.locator('video.nosleep')).toHaveCount(1);
    // prima di un tocco l'iPad non fa partire il video: interruttore arancione
    await expect(sw).toHaveClass(/pending/);
    await page.click('#sw-main');
    await expect(sw).not.toHaveClass(/pending/);
    expect(await page.evaluate(() => window.__video.plays)).toBe(1);
    await sw.click();
    expect(await page.evaluate(() => window.__video.pauses)).toBe(1);
    await page.click('#sw-main'); // spento: un tocco non lo fa ripartire
    expect(await page.evaluate(() => window.__video.plays)).toBe(1);
    await sw.click();
    await expect(sw).not.toHaveClass(/pending/);
    expect(await page.evaluate(() => window.__video.plays)).toBe(2);
  });

  test('Mac: niente video, basta il blocco dello standby', async ({ browser }) => {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      viewport: { width: 1440, height: 900 },
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    await page.addInitScript(mockWakeLock);
    await openApp(page);
    await expect(page.locator('video.nosleep')).toHaveCount(0);
    await expect(page.locator('#wake-indicator')).not.toHaveClass(/pending/);
    await context.close();
  });

  test('senza supporto del browser lo dice chiaramente', async ({ browser }) => {
    // su iPad c'è sempre il video, quindi questo caso esiste solo fuori da iOS
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15', serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.addInitScript(() => { delete Navigator.prototype.wakeLock; });
    await openApp(page);
    await expect(page.locator('#wake-label')).toHaveText('Standby non bloccabile');
    await context.close();
  });
});

test('il pulsante Installa app apre le istruzioni', async ({ page }) => {
  await openApp(page);
  await page.click('#install-btn');
  await expect(page.locator('#install-dialog')).toBeVisible();
  await expect(page.locator('#install-steps li').first()).toBeVisible();
  await page.click('#install-dialog .btn');
  await expect(page.locator('#install-dialog')).toBeHidden();
});
