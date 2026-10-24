// Test automatici con WebKit, lo stesso motore di Safari su iPad.
// Uso: npm test            (tutti)
//      npx playwright test --project=ipad-orizzontale   (una sola misura)
const { defineConfig, devices } = require('@playwright/test');

const PORT = 4173;
// questi test non dipendono dalla misura (o la cambiano da soli): girano una volta sola, sull'iPad verticale
const LOGIC = /logica|offline|larghezze/;

module.exports = defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0, // niente secondi tentativi: un test che passa solo a volte deve farsi notare
  // su GitHub anche 'github': ogni errore compare come annotazione leggibile nella pagina della pubblicazione
  reporter: process.env.CI ? [['list'], ['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `python3 -m http.server ${PORT} --directory app`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'ipad', use: { ...devices['iPad Pro 11'] } },
    { name: 'ipad-orizzontale', use: { ...devices['iPad Pro 11 landscape'] }, testIgnore: LOGIC },
    { name: 'ipad-mini', use: { ...devices['iPad Mini'] }, testIgnore: LOGIC },
    { name: 'ipad-mini-orizzontale', use: { ...devices['iPad Mini landscape'] }, testIgnore: LOGIC },
    { name: 'mac', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } }, testIgnore: LOGIC },
    { name: 'iphone', use: { ...devices['iPhone 15'] }, testIgnore: LOGIC },
  ],
});
