const fs = require('fs');
const path = require('path');
const { expect } = require('@playwright/test');

/**
 * Apre l'app con una memoria (localStorage) preimpostata.
 * Con `clock: true` il tempo è simulato: avanza solo con advance(), così un AMRAP di 10 minuti dura millisecondi.
 */
/**
 * Audio muto: i test non devono fare rumore sul Mac (bip e voce). Sostituisce AudioContext e la sintesi vocale
 * con versioni finte che non suonano ma contano le richieste (window.__qa.beeps, window.__qa.spoken).
 */
async function mute(page) {
  await page.addInitScript(() => {
    window.__qa = { beeps: 0, spoken: [] };
    const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
    const node = () => ({ connect: (n) => n, disconnect() {}, start() {}, stop() {}, type: '', frequency: param(), gain: param() });
    class SilentAudioContext {
      constructor() { this.state = 'running'; this.currentTime = 0; this.destination = node(); }
      createOscillator() { window.__qa.beeps++; return node(); }
      createGain() { return node(); }
      resume() { return Promise.resolve(); }
      close() { return Promise.resolve(); }
    }
    window.AudioContext = SilentAudioContext;
    window.webkitAudioContext = SilentAudioContext;
    if ('speechSynthesis' in window) {
      speechSynthesis.speak = (u) => { window.__qa.spoken.push(u.text); };
      speechSynthesis.cancel = () => {};
    }
    // il video anti-oscuramento ha una traccia audio muta, ma per sicurezza niente audio dai video
    Object.defineProperty(HTMLMediaElement.prototype, 'muted', { configurable: true, get: () => true, set() {} });
  });
}

async function openApp(page, { storage = {}, clock = true } = {}) {
  await mute(page);
  // QA_FONT="Verdana" npx playwright test → simula un carattere più largo (come DejaVu Sans su Linux o
  // i font di certi Android), per vedere se l'impaginazione regge anche senza i font Apple
  if (process.env.QA_FONT) {
    await page.addInitScript((font) => {
      document.addEventListener('DOMContentLoaded', () => {
        const st = document.createElement('style');
        st.textContent = `* { font-family: ${font} !important; }`;
        document.head.appendChild(st);
      });
    }, process.env.QA_FONT);
  }
  await page.addInitScript((s) => {
    // solo al primo caricamento della scheda: le ricariche successive conservano la memoria, come sull'iPad
    if (sessionStorage.getItem('__qa_init')) return;
    localStorage.clear();
    localStorage.setItem('ui.installHint', 'true');
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v));
    sessionStorage.setItem('__qa_init', '1');
  }, storage);
  if (clock) await page.clock.install({ time: new Date('2026-01-05T09:00:00') });
  await page.goto('/');
  if (clock) await page.clock.pauseAt(new Date('2026-01-05T09:00:05'));
}

const advance = (page, ms) => page.clock.runFor(ms);

/** Memoria per aprire direttamente la scheda Allenamento in una modalità con una certa configurazione. */
function workoutStorage(mode, config) {
  return { 'ui.view': 'tabata', 'wo.mode': mode, 'wo.configs': { [mode]: config } };
}

/** Stato visibile della schermata di allenamento. */
async function runState(page) {
  return page.evaluate(() => {
    const t = (sel) => document.querySelector(sel).textContent.trim();
    return {
      phase: document.querySelector('#tabata-run').dataset.phase,
      label: t('#run-phase'),
      time: t('#run-seconds'),
      info: t('#run-round'),
      remaining: t('#run-remaining'),
      next: t('#run-next'),
      counter: t('#cnt-value'),
      session: t('#run-session'),
    };
  });
}

/** Avanza un secondo alla volta e raccoglie la sequenza di fasi (tipo + etichetta) fino alla fine. */
async function collectPhases(page, maxSeconds) {
  const seen = [];
  for (let i = 0; i <= maxSeconds; i++) {
    const s = await runState(page);
    const key = `${s.phase}:${s.label}`;
    if (seen[seen.length - 1] !== key) seen.push(key);
    if (s.phase === 'done') break;
    await advance(page, 1000);
  }
  return seen;
}

/**
 * Controllo grafico generico di una schermata: per ogni elemento visibile verifica che
 * - abbia una dimensione reale (non schiacciato a zero),
 * - stia dentro lo schermo in orizzontale (e in verticale, se fa parte di un overlay fisso),
 * - sia davvero "colpibile" al centro: se un contenitore lo taglia o un altro elemento lo copre, il test fallisce,
 * - (pulsanti) sia abbastanza grande da toccare e il testo non sia tagliato.
 * È il controllo che avrebbe trovato la barra delle modalità schiacciata con l'iPad in orizzontale.
 */
async function assertUsable(page, scope, where = '') {
  const problems = await page.evaluate((scopeSel) => {
    const out = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (document.documentElement.scrollWidth > vw + 1) {
      out.push(`la pagina è più larga dello schermo (${document.documentElement.scrollWidth}px > ${vw}px)`);
    }
    const describe = (el) => {
      const id = el.id ? `#${el.id}` : '';
      const cls = el.classList.length ? `.${[...el.classList].join('.')}` : '';
      const text = (el.textContent || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 30);
      return `${el.tagName.toLowerCase()}${id}${cls} "${text}"`;
    };
    const isShown = (el) => {
      for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      }
      return true;
    };
    const root = document.querySelector(scopeSel);
    const items = [...root.querySelectorAll('button, select, input, .value, .label, .run-phase, .run-seconds, .run-next, .run-info > span, .run-time-label, .run-time-value, #sw-main, .mode-desc, .total')]
      .filter(isShown)
      .filter((el) => (el.textContent || el.value || el.tagName === 'INPUT' || el.querySelector('svg')));
    // nessun contenitore deve scorrere di lato: un contenuto più largo vuol dire pulsanti tagliati o nascosti
    for (const a of root.querySelectorAll('*')) {
      if (!isShown(a)) continue;
      const cs = getComputedStyle(a);
      if (cs.overflowX !== 'visible' && a.scrollWidth > a.clientWidth + 1) {
        out.push(`${describe(a)}: il contenuto è più largo del contenitore (${a.scrollWidth}px su ${a.clientWidth}px), una parte resta nascosta di lato`);
      }
    }
    for (const el of items) {
      const inFixed = !!el.closest('#tabata-run, dialog');
      if (!inFixed) {
        el.scrollIntoView({ block: 'center' });
        // scrollIntoView sposterebbe anche di lato, "nascondendo" il problema: si torna sempre a sinistra
        for (let a = el.parentElement; a; a = a.parentElement) a.scrollLeft = 0;
      }
      const r = el.getBoundingClientRect();
      const name = describe(el);
      if (r.width < 1 || r.height < 1) { out.push(`${name}: dimensione zero`); continue; }
      if (r.left < -1 || r.right > vw + 1) out.push(`${name}: esce dallo schermo in orizzontale (${Math.round(r.left)}–${Math.round(r.right)} su ${vw}px)`);
      if (inFixed && (r.top < -1 || r.bottom > vh + 1)) out.push(`${name}: esce dallo schermo in verticale (${Math.round(r.top)}–${Math.round(r.bottom)} su ${vh}px)`);
      // tagliato da un contenitore con overflow (es. barra schiacciata a pochi pixel)
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
        const ar = a.getBoundingClientRect();
        if (r.top < ar.top - 1 || r.bottom > ar.bottom + 1 || r.left < ar.left - 1 || r.right > ar.right + 1) {
          out.push(`${name}: tagliato dal contenitore ${describe(a)} (alto ${Math.round(ar.height)}px)`);
          break;
        }
      }
      // coperto da un altro elemento: conta solo per ciò che si tocca
      // (i testi giganti hanno un'area "vuota" sopra le cifre che si sovrappone all'etichetta senza vedersi)
      if (['BUTTON', 'SELECT', 'INPUT'].includes(el.tagName)) {
        const cx = Math.min(vw - 1, Math.max(0, r.left + r.width / 2));
        const cy = Math.min(vh - 1, Math.max(0, r.top + r.height / 2));
        const hit = document.elementFromPoint(cx, cy);
        if (!hit || !(hit === el || el.contains(hit))) out.push(`${name}: coperto (al centro c'è ${hit ? describe(hit) : 'niente'})`);
      }
      if (el.tagName === 'BUTTON' && !el.classList.contains('app-version')) {
        if (r.height < 36 || r.width < 36) out.push(`${name}: troppo piccolo da toccare (${Math.round(r.width)}×${Math.round(r.height)})`);
      }
      if ((el.tagName === 'BUTTON' || el.classList.contains('label')) && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) {
        out.push(`${name}: testo tagliato`);
      }
    }
    // schermata di allenamento: i blocchi in verticale non devono toccarsi (almeno 4 px di aria) (barra in alto, nome, "Poi:", barra di avanzamento)
    if (scopeSel === '#tabata-run') {
      const box = (sel) => { const e = document.querySelector(sel); return e && isShown(e) && e.textContent.trim() !== '' ? e.getBoundingClientRect() : null; };
      const top = box('.run-top');
      const phase = box('#run-phase');
      const next = box('#run-next');
      const progress = document.querySelector('.progress').getBoundingClientRect();
      if (top && phase && phase.top - top.bottom < 4) out.push(`il nome della fase tocca la barra in alto (distanza ${Math.round(phase.top - top.bottom)}px)`);
      if (next && progress.top - next.bottom < 4) out.push(`"${document.querySelector('#run-next').textContent.trim()}" tocca la barra di avanzamento (distanza ${Math.round(progress.top - next.bottom)}px)`);
    }
    return [...new Set(out)];
  }, scope);
  expect(problems, `Problemi grafici in ${scope}${where ? ` a ${where}` : ''}:\n${problems.join('\n')}`).toEqual([]);
}

/** Salva una foto della schermata per la revisione dell'agente QA (cartella qa-screenshots/, non versionata). */
async function shot(page, testInfo, name) {
  const dir = path.join(__dirname, '..', 'qa-screenshots', testInfo.project.name);
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`), animations: 'disabled' });
}

module.exports = { mute, openApp, advance, workoutStorage, runState, collectPhases, assertUsable, shot };
