'use strict';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage non disponibile */ }
  },
};

// sostituita automaticamente con l'hash del commit durante la pubblicazione (vedi .github/workflows/pages.yml)
const APP_VERSION = '__VERSION__';
const versionLabel = () => (APP_VERSION.startsWith('__') ? 'sviluppo' : APP_VERSION);

const pad = (n, len = 2) => String(n).padStart(len, '0');

function fmtClock(totalSec) {
  totalSec = Math.max(0, Math.round(totalSec));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function toast(msg, ms = 3500) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.add('hidden'), ms);
}

/* ================= Schermo sempre acceso ================= */

const wake = {
  lock: null,
  supported: 'wakeLock' in navigator,
  enabled: store.get('wake.enabled', true),

  async acquire() {
    if (!this.supported || !this.enabled || this.lock || document.visibilityState !== 'visible') return;
    try {
      this.lock = await navigator.wakeLock.request('screen');
      this.lock.addEventListener('release', () => { this.lock = null; this.render(); });
    } catch (err) {
      this.lock = null;
    }
    this.render();
  },

  render() {
    const el = $('#wake-indicator');
    const on = this.supported && this.enabled;
    el.classList.toggle('enabled', on);
    el.classList.toggle('pending', on && !this.lock);
    el.classList.toggle('unsupported', !this.supported);
    el.setAttribute('aria-checked', String(on));
    $('#wake-label').textContent = this.supported ? 'Schermo sempre acceso' : 'Standby non bloccabile';
  },

  async toggle() {
    if (!this.supported) {
      toast('Questo browser non può impedire lo standby. Su iPad: Impostazioni → Schermo e luminosità → Blocco automatico → Mai.', 7000);
      return;
    }
    this.enabled = !this.enabled;
    store.set('wake.enabled', this.enabled);
    if (this.enabled) {
      await this.acquire();
      toast('Schermo sempre acceso: attivo finché l\'app è aperta.');
    } else {
      const lock = this.lock;
      this.lock = null;
      if (lock) await lock.release();
      this.render();
      toast('Schermo sempre acceso: disattivato. L\'iPad andrà in standby come al solito.');
    }
  },
};

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') wake.acquire();
});
// Alcuni browser concedono il blocco solo dopo un'interazione: riproviamo a ogni tocco finché non è attivo.
// (il tocco sull'interruttore stesso è escluso, altrimenti lo riattiverebbe mentre lo si spegne)
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('#wake-indicator')) wake.acquire();
}, { capture: true });
$('#wake-indicator').addEventListener('click', () => wake.toggle());

/* ================= Schermo intero ================= */

// true quando l'app è aperta dall'icona installata (non dentro il browser)
const isStandalone = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;

(function setupFullscreen() {
  const btn = $('#fullscreen-btn');
  const root = document.documentElement;
  const request = root.requestFullscreen || root.webkitRequestFullscreen;
  if (!request || isStandalone) { btn.classList.add('hidden'); return; }
  btn.addEventListener('click', () => {
    const current = document.fullscreenElement || document.webkitFullscreenElement;
    if (current) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else request.call(root);
  });
})();

/* ================= Installazione come app ================= */

const SHARE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M8 7l4-4 4 4"/><path d="M7 11H5v10h14V11h-2"/></svg>';

const install = {
  deferredPrompt: null, // Chrome / Edge / Android: finestra di installazione nativa

  platform() {
    const ua = navigator.userAgent;
    // iPadOS si presenta come Mac: lo riconosciamo dal touch
    const iOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    if (iOS) return /CriOS|FxiOS|EdgiOS/.test(ua) ? 'ios-other' : 'ios';
    if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua)) return 'mac-safari';
    return 'other';
  },

  steps() {
    switch (this.platform()) {
      case 'ios':
        return `<ol>
          <li>Tocca <strong>Condividi</strong> ${SHARE_ICON} nella barra di Safari (se non lo vedi, è nel menu <strong>···</strong>).</li>
          <li>Scegli <strong>Aggiungi alla schermata Home</strong>.</li>
          <li>Tocca <strong>Aggiungi</strong>, poi apri l'app dall'icona sulla Home.</li>
        </ol>`;
      case 'ios-other':
        return `<p class="note">Per il risultato migliore apri questa pagina in <strong>Safari</strong>.</p>
        <ol>
          <li>Tocca <strong>Condividi</strong> ${SHARE_ICON}.</li>
          <li>Scegli <strong>Aggiungi alla schermata Home</strong>.</li>
        </ol>`;
      case 'mac-safari':
        return `<ol>
          <li>Nel menu <strong>File</strong> di Safari scegli <strong>Aggiungi al Dock…</strong></li>
          <li>Apri l'app dal Dock o da Launchpad.</li>
        </ol>`;
      default:
        return `<ol>
          <li>Apri il menu del browser (<strong>⋮</strong> o <strong>···</strong>).</li>
          <li>Scegli <strong>Installa app</strong> o <strong>Aggiungi alla schermata Home</strong>.</li>
        </ol>`;
    }
  },

  async open() {
    if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      const { outcome } = await this.deferredPrompt.userChoice;
      this.deferredPrompt = null;
      if (outcome === 'accepted') $('#install-btn').classList.add('hidden');
      return;
    }
    $('#install-steps').innerHTML = this.steps();
    $('#install-dialog').showModal();
  },

  init() {
    if (isStandalone) return;
    const btn = $('#install-btn');
    btn.classList.remove('hidden');
    btn.addEventListener('click', () => this.open());
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); this.deferredPrompt = e; });
    window.addEventListener('appinstalled', () => btn.classList.add('hidden'));
    // chiude il foglio toccando fuori
    $('#install-dialog').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
    if (!store.get('ui.installHint', false)) {
      store.set('ui.installHint', true);
      setTimeout(() => toast('Suggerimento: puoi installarla come app con il pulsante "Installa app" in alto.', 6000), 1500);
    }
  },
};

install.init();

/* ================= Audio e voce ================= */

const sound = {
  ctx: null,

  unlock() {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* non supportato */ }
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    // iOS sblocca la sintesi vocale solo se la prima frase parte da un tocco
    if ('speechSynthesis' in window && !this.voiceUnlocked) {
      speechSynthesis.speak(new SpeechSynthesisUtterance(''));
      this.voiceUnlocked = true;
    }
  },

  beep(freq = 880, dur = 0.15, vol = 0.35) {
    if (!workout.opts.sound || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  },

  say(text) {
    if (!workout.opts.voice || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'it-IT';
    u.rate = 1.05;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  },
};

/* ================= Cronometro ================= */

const stopwatch = {
  // Tempi in ms da Date.now(): così il cronometro sopravvive anche a una ricarica della pagina.
  state: store.get('sw.state', { acc: 0, startedAt: null, laps: [] }),

  elapsed() {
    const s = this.state;
    return s.acc + (s.startedAt ? Date.now() - s.startedAt : 0);
  },

  running() { return this.state.startedAt !== null; },

  toggle() {
    const s = this.state;
    if (this.running()) { s.acc += Date.now() - s.startedAt; s.startedAt = null; }
    else s.startedAt = Date.now();
    this.save();
    this.renderControls();
  },

  reset() {
    this.state = { acc: 0, startedAt: null, laps: [] };
    this.save();
    this.renderControls();
    this.renderLaps();
    this.renderTime();
  },

  lap() {
    if (!this.running()) return;
    this.state.laps.push(this.elapsed());
    this.save();
    this.renderLaps();
  },

  save() { store.set('sw.state', this.state); },

  format(ms) {
    const cs = Math.floor(ms / 10) % 100;
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return { main: h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`, cs: `.${pad(cs)}`, hours: h > 0 };
  },

  renderTime() {
    const f = this.format(this.elapsed());
    $('#sw-main').textContent = f.main;
    $('#sw-cs').textContent = f.cs;
    $('.sw-display').classList.toggle('hours', f.hours);
  },

  renderControls() {
    const running = this.running();
    const btn = $('#sw-toggle');
    btn.textContent = running ? 'Pausa' : (this.elapsed() > 0 ? 'Riprendi' : 'Avvia');
    btn.classList.toggle('running', running);
    $('#sw-lap').disabled = !running;
    $('#sw-reset').disabled = running || this.elapsed() === 0;
  },

  renderLaps() {
    const laps = this.state.laps;
    const list = $('#sw-laps');
    list.innerHTML = '';
    for (let i = laps.length - 1; i >= 0; i--) {
      const lapMs = laps[i] - (i ? laps[i - 1] : 0);
      const li = document.createElement('li');
      const lapF = this.format(lapMs);
      const totF = this.format(laps[i]);
      li.innerHTML = `<span>Giro ${i + 1}</span><span>${lapF.main}${lapF.cs}</span><span>${totF.main}${totF.cs}</span>`;
      list.appendChild(li);
    }
  },

  init() {
    $('#sw-toggle').addEventListener('click', () => this.toggle());
    $('#sw-reset').addEventListener('click', () => this.reset());
    $('#sw-lap').addEventListener('click', () => this.lap());
    this.renderControls();
    this.renderLaps();
    this.renderTime();
  },
};

/* ================= Allenamento (Tabata, EMOM, AMRAP, For Time, Circuito) ================= */

// Campi delle impostazioni: T = durata in secondi, N = numero
const T = (key, label, min, max, step, zeroLabel) => ({ key, label, min, max, step, time: true, zeroLabel });
const N = (key, label, min, max) => ({ key, label, min, max, step: 1 });
const PREP = T('prep', 'Preparazione', 0, 600, 5);

const PHASE_NAME = { prep: 'Preparati', warmup: 'Riscaldamento', work: 'Lavoro', rest: 'Riposo', recovery: 'Recupero', cooldown: 'Defaticamento' };
const PHASE_VOICE = { prep: 'Preparati', warmup: 'Riscaldamento', work: 'Via!', rest: 'Riposo', recovery: 'Recupero', cooldown: 'Defaticamento' };

const fmtDur = (s) => (s < 60 ? `${s} s` : fmtClock(s));

const MODES = {
  tabata: {
    name: 'Tabata',
    desc: 'Lavoro e riposo alternati, per round e serie.',
    fields: [PREP, T('warmup', 'Riscaldamento', 0, 1800, 30, 'No'), T('work', 'Lavoro', 5, 3600, 5), T('rest', 'Riposo', 0, 3600, 5),
      N('rounds', 'Round', 1, 99), N('sets', 'Serie', 1, 20), T('recovery', 'Recupero tra serie', 0, 3600, 15), T('cooldown', 'Defaticamento', 0, 1800, 30, 'No')],
    presets: [
      { name: 'Tabata classico (8×20/10)', prep: 10, warmup: 0, work: 20, rest: 10, rounds: 8, sets: 1, recovery: 60, cooldown: 0 },
      { name: 'Tabata 4 serie', prep: 10, warmup: 0, work: 20, rest: 10, rounds: 8, sets: 4, recovery: 60, cooldown: 0 },
      { name: '40/20 × 10', prep: 10, warmup: 0, work: 40, rest: 20, rounds: 10, sets: 1, recovery: 0, cooldown: 0 },
      { name: '30/30 × 10', prep: 10, warmup: 0, work: 30, rest: 30, rounds: 10, sets: 1, recovery: 0, cooldown: 0 },
    ],
    build(c) {
      const p = [];
      if (c.warmup > 0) p.push({ type: 'warmup', dur: c.warmup });
      for (let s = 1; s <= c.sets; s++) {
        for (let r = 1; r <= c.rounds; r++) {
          const last = r === c.rounds && s === c.sets;
          const info = `Round ${r}/${c.rounds}${c.sets > 1 ? ` · Serie ${s}/${c.sets}` : ''}`;
          p.push({ type: 'work', dur: c.work, info, voice: last && c.rounds > 1 ? 'Ultimo round, via!' : undefined });
          if (r < c.rounds && c.rest > 0) p.push({ type: 'rest', dur: c.rest, info });
        }
        if (s < c.sets) {
          const info = `Serie ${s}/${c.sets} completata`;
          if (c.recovery > 0) p.push({ type: 'recovery', dur: c.recovery, info });
          else if (c.rest > 0) p.push({ type: 'rest', dur: c.rest, info });
        }
      }
      if (c.cooldown > 0) p.push({ type: 'cooldown', dur: c.cooldown });
      return p;
    },
  },

  emom: {
    name: 'EMOM',
    desc: 'All\'inizio di ogni intervallo fai le ripetizioni previste: il tempo che avanza è riposo.',
    fields: [PREP, T('interval', 'Ogni', 10, 600, 5), N('rounds', 'Round', 1, 99)],
    presets: [
      { name: 'EMOM 10 minuti', prep: 10, interval: 60, rounds: 10 },
      { name: 'EMOM 20 minuti', prep: 10, interval: 60, rounds: 20 },
      { name: 'Ogni 2 minuti × 6', prep: 10, interval: 120, rounds: 6 },
      { name: 'Ogni 30 s × 20', prep: 10, interval: 30, rounds: 20 },
    ],
    build(c) {
      const p = [];
      for (let r = 1; r <= c.rounds; r++) {
        p.push({ type: 'work', name: 'EMOM', dur: c.interval, info: `Round ${r}/${c.rounds}`,
          voice: r === c.rounds && r > 1 ? 'Ultimo round' : `Round ${r}` });
      }
      return p;
    },
  },

  amrap: {
    name: 'AMRAP',
    desc: 'Più round possibili nel tempo dato. Tocca "+1 Round" a ogni giro completato.',
    fields: [PREP, T('duration', 'Durata', 60, 7200, 30)],
    counter: true,
    presets: [
      { name: 'AMRAP 10 minuti', prep: 10, duration: 600 },
      { name: 'AMRAP 12 minuti', prep: 10, duration: 720 },
      { name: 'AMRAP 15 minuti', prep: 10, duration: 900 },
      { name: 'AMRAP 20 minuti', prep: 10, duration: 1200 },
    ],
    build(c) { return [{ type: 'work', name: 'AMRAP', dur: c.duration }]; },
  },

  fortime: {
    name: 'For Time',
    desc: 'Finisci il lavoro il prima possibile: il tempo sale. Tocca "Fatto" quando hai finito.',
    fields: [PREP, T('cap', 'Tempo limite', 0, 7200, 60, 'Nessuno')],
    counter: true,
    countUp: true,
    presets: [
      { name: 'For Time, limite 10 minuti', prep: 10, cap: 600 },
      { name: 'For Time, limite 15 minuti', prep: 10, cap: 900 },
      { name: 'For Time, limite 20 minuti', prep: 10, cap: 1200 },
      { name: 'For Time, senza limite', prep: 10, cap: 0 },
    ],
    build(c) {
      // senza limite: una fase lunghissima che si chiude con "Fatto"
      return [{ type: 'work', name: 'For Time', dur: c.cap || 24 * 3600, countUp: true, uncapped: !c.cap }];
    },
  },

  circuit: {
    name: 'Circuito',
    desc: 'Una sequenza di esercizi, ognuno con nome e durata, ripetuta per più round.',
    fields: [PREP, T('rest', 'Riposo tra esercizi', 0, 600, 5), N('rounds', 'Round', 1, 50), T('roundRest', 'Riposo tra round', 0, 1800, 15)],
    exercises: true,
    presets: [
      { name: 'Corpo libero (5 esercizi × 3)', prep: 10, rest: 20, rounds: 3, roundRest: 60,
        exercises: [{ name: 'Jumping jack', dur: 40 }, { name: 'Squat', dur: 40 }, { name: 'Piegamenti', dur: 40 }, { name: 'Plank', dur: 40 }, { name: 'Burpee', dur: 40 }] },
      { name: 'Piramide 20-30-40-30-20', prep: 10, rest: 15, rounds: 1, roundRest: 0,
        exercises: [{ name: 'Burpee', dur: 20 }, { name: 'Burpee', dur: 30 }, { name: 'Burpee', dur: 40 }, { name: 'Burpee', dur: 30 }, { name: 'Burpee', dur: 20 }] },
      { name: 'Core (4 esercizi × 2)', prep: 10, rest: 15, rounds: 2, roundRest: 45,
        exercises: [{ name: 'Crunch', dur: 45 }, { name: 'Plank', dur: 45 }, { name: 'Mountain climber', dur: 45 }, { name: 'Russian twist', dur: 45 }] },
    ],
    build(c) {
      const p = [];
      const ex = c.exercises;
      for (let r = 1; r <= c.rounds; r++) {
        ex.forEach((e, i) => {
          const name = e.name.trim() || `Esercizio ${i + 1}`;
          const info = `Round ${r}/${c.rounds} · Esercizio ${i + 1}/${ex.length}`;
          const lastRound = r === c.rounds && c.rounds > 1 && i === 0;
          p.push({ type: 'work', name, dur: e.dur, info, voice: lastRound ? `Ultimo round. ${name}` : name });
          if (i < ex.length - 1 && c.rest > 0) p.push({ type: 'rest', dur: c.rest, info });
        });
        if (r < c.rounds) {
          const info = `Round ${r}/${c.rounds} completato`;
          if (c.roundRest > 0) p.push({ type: 'recovery', dur: c.roundRest, info });
          else if (c.rest > 0) p.push({ type: 'rest', dur: c.rest, info });
        }
      }
      return p;
    },
  },
};

// Tutte le modalità hanno la preparazione in testa
function buildPhases(modeId, c) {
  const phases = MODES[modeId].build(c);
  if (c.prep > 0) phases.unshift({ type: 'prep', dur: c.prep });
  return phases.map((ph) => ({ ...ph, name: ph.name || PHASE_NAME[ph.type], info: ph.info || '' }));
}

const presetValues = (modeId, p) => {
  const mode = MODES[modeId];
  const v = {};
  mode.fields.forEach((f) => { v[f.key] = p[f.key]; });
  if (mode.exercises) v.exercises = p.exercises.map((e) => ({ name: e.name, dur: e.dur }));
  return v;
};

// Prima versione: un solo tipo (Tabata) con chiavi 'tb.config' e 'tb.presets'
function loadConfigs() {
  const saved = store.get('wo.configs', null);
  const configs = {};
  for (const [id, mode] of Object.entries(MODES)) {
    const defaults = presetValues(id, mode.presets[0]);
    const old = id === 'tabata' && !saved ? store.get('tb.config', {}) : {};
    configs[id] = { ...defaults, ...old, ...(saved && saved[id]) };
  }
  return configs;
}
function loadPresets() {
  const saved = store.get('wo.presets', null);
  if (saved) return saved;
  return store.get('tb.presets', []).map((p) => ({ mode: 'tabata', warmup: 0, cooldown: 0, ...p }));
}

const workout = {
  modeId: MODES[store.get('wo.mode', 'tabata')] ? store.get('wo.mode', 'tabata') : 'tabata',
  configs: loadConfigs(),
  customPresets: loadPresets(),
  opts: store.get('tb.opts', { sound: true, voice: false }),

  get mode() { return MODES[this.modeId]; },
  get config() { return this.configs[this.modeId]; },

  // stato dell'esecuzione
  phases: [],
  starts: [],     // secondo di inizio di ogni fase
  total: 0,
  acc: 0,         // ms accumulati prima dell'ultima ripresa
  startedAt: null,
  lastIdx: -1,
  lastSec: null,
  finished: false,
  count: 0,       // round contati a mano (AMRAP / For Time)
  runMode: null,  // modalità dell'allenamento in corso

  /* ---------- impostazioni ---------- */

  formatValue(field, v) {
    if (!field.time) return String(v);
    if (v === 0 && field.zeroLabel) return field.zeroLabel;
    return fmtDur(v);
  },

  stepFor(field, value, dir) {
    if (!field.time) return field.step;
    // passi più grandi man mano che il valore cresce
    const above = (limit) => (dir > 0 ? value >= limit : value > limit);
    if (above(600)) return Math.max(field.step, 60);
    if (above(60)) return Math.max(field.step, 15);
    return field.step;
  },

  clamp(field, v) { return Math.min(field.max, Math.max(field.min, v)); },

  editNumber(title, isTime, current) {
    const answer = prompt(`${title}${isTime ? ' (secondi)' : ''}`, current);
    if (answer === null) return null;
    const n = Math.round(Number(answer.replace(',', '.')));
    return Number.isFinite(n) ? n : null;
  },

  makeStepper(field, get, set) {
    const stepper = document.createElement('div');
    stepper.className = 'stepper';
    stepper.innerHTML = '<button type="button" aria-label="meno">−</button><span class="value"></span><button type="button" aria-label="più">+</button>';
    const [minus, plus] = stepper.querySelectorAll('button');
    const value = stepper.querySelector('.value');
    const render = () => { value.textContent = this.formatValue(field, get()); };
    const change = (dir) => { set(this.clamp(field, get() + dir * this.stepFor(field, get(), dir))); render(); this.saveConfig(); };
    holdToRepeat(minus, () => change(-1));
    holdToRepeat(plus, () => change(+1));
    value.addEventListener('click', () => {
      const n = this.editNumber(field.label, field.time, get());
      if (n === null) return;
      set(this.clamp(field, n));
      render();
      this.saveConfig();
    });
    render();
    return stepper;
  },

  renderModeTabs() {
    $$('#mode-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.mode === this.modeId));
    $('#mode-desc').textContent = this.mode.desc;
  },

  renderFields() {
    const box = $('#fields');
    box.innerHTML = '';
    for (const field of this.mode.fields) {
      const row = document.createElement('div');
      row.className = 'field';
      row.innerHTML = `<span class="label">${field.label}</span>`;
      row.appendChild(this.makeStepper(field, () => this.config[field.key], (v) => { this.config[field.key] = v; }));
      box.appendChild(row);
    }
    this.renderExercises();
  },

  renderExercises() {
    const box = $('#exercises');
    box.classList.toggle('hidden', !this.mode.exercises);
    if (!this.mode.exercises) return;
    const list = this.config.exercises;
    box.innerHTML = '<h3>Esercizi</h3>';
    const durField = T('dur', 'Durata', 5, 3600, 5);
    list.forEach((ex, i) => {
      const row = document.createElement('div');
      row.className = 'exercise-row';
      row.innerHTML = `<span class="ex-num">${i + 1}</span>`;
      const input = document.createElement('input');
      input.className = 'ex-name';
      input.value = ex.name;
      input.placeholder = `Esercizio ${i + 1}`;
      input.maxLength = 40;
      input.addEventListener('input', () => { ex.name = input.value; this.saveConfig(false); });
      input.addEventListener('change', () => this.renderValues());
      row.appendChild(input);
      row.appendChild(this.makeStepper(durField, () => ex.dur, (v) => { ex.dur = v; }));
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'ex-del';
      del.setAttribute('aria-label', 'Elimina esercizio');
      del.textContent = '✕';
      del.disabled = list.length === 1;
      del.addEventListener('click', () => { list.splice(i, 1); this.saveConfig(); this.renderExercises(); });
      row.appendChild(del);
      box.appendChild(row);
    });
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn secondary ex-add';
    add.textContent = '+ Aggiungi esercizio';
    add.disabled = list.length >= 30;
    add.addEventListener('click', () => {
      const lastDur = list.length ? list[list.length - 1].dur : 40;
      list.push({ name: '', dur: lastDur });
      this.saveConfig();
      this.renderExercises();
      box.querySelectorAll('.ex-name')[list.length - 1].focus();
    });
    box.appendChild(add);
  },

  saveConfig(rerender = true) {
    store.set('wo.configs', this.configs);
    if (rerender) this.renderValues();
  },

  presetsForMode() {
    return [...this.mode.presets.map((p) => ({ ...p, builtin: true })), ...this.customPresets.filter((p) => p.mode === this.modeId)];
  },

  matchingPresetIndex() {
    const current = JSON.stringify(presetValues(this.modeId, this.config));
    return this.presetsForMode().findIndex((p) => JSON.stringify(presetValues(this.modeId, p)) === current);
  },

  renderPresets() {
    const sel = $('#preset-select');
    sel.innerHTML = '<option value="-1">— Preset —</option>';
    this.presetsForMode().forEach((p, i) => {
      const o = document.createElement('option');
      o.value = i;
      o.textContent = p.name;
      sel.appendChild(o);
    });
  },

  totalLabel() {
    if (this.mode.countUp) {
      const cap = this.config.cap;
      return cap ? `max ${fmtClock(cap + this.config.prep)}` : 'senza limite';
    }
    return fmtClock(buildPhases(this.modeId, this.config).reduce((sum, ph) => sum + ph.dur, 0));
  },

  renderValues() {
    $('#total-time').textContent = this.totalLabel();
    $('#preset-select').value = String(this.matchingPresetIndex());
    $('#opt-sound').checked = this.opts.sound;
    $('#opt-voice').checked = this.opts.voice;
  },

  renderSetup() {
    this.renderModeTabs();
    this.renderPresets();
    this.renderFields();
    this.renderValues();
  },

  setMode(id) {
    this.modeId = id;
    store.set('wo.mode', id);
    this.renderSetup();
  },

  initSetup() {
    const tabs = $('#mode-tabs');
    for (const [id, mode] of Object.entries(MODES)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.mode = id;
      b.textContent = mode.name;
      b.addEventListener('click', () => this.setMode(id));
      tabs.appendChild(b);
    }

    $('#preset-select').addEventListener('change', (e) => {
      const p = this.presetsForMode()[Number(e.target.value)];
      if (!p) return;
      this.configs[this.modeId] = presetValues(this.modeId, p);
      this.saveConfig();
      this.renderFields();
    });

    $('#preset-save').addEventListener('click', () => {
      const name = prompt('Nome del preset');
      if (!name || !name.trim()) return;
      const preset = { name: name.trim(), mode: this.modeId, ...presetValues(this.modeId, this.config) };
      const existing = this.customPresets.findIndex((p) => p.mode === this.modeId && p.name === preset.name);
      if (existing >= 0) this.customPresets[existing] = preset;
      else this.customPresets.push(preset);
      store.set('wo.presets', this.customPresets);
      this.renderPresets();
      this.renderValues();
      toast(`Preset "${preset.name}" salvato`);
    });

    $('#preset-delete').addEventListener('click', () => {
      const p = this.presetsForMode()[Number($('#preset-select').value)];
      if (!p) return toast('Scegli prima un preset');
      if (p.builtin) return toast('I preset predefiniti non si possono eliminare');
      if (!confirm(`Eliminare "${p.name}"?`)) return;
      this.customPresets = this.customPresets.filter((c) => !(c.mode === p.mode && c.name === p.name));
      store.set('wo.presets', this.customPresets);
      this.renderPresets();
      this.renderValues();
    });

    $('#opt-sound').addEventListener('change', (e) => { this.opts.sound = e.target.checked; store.set('tb.opts', this.opts); });
    $('#opt-voice').addEventListener('change', (e) => { this.opts.voice = e.target.checked; store.set('tb.opts', this.opts); });

    this.renderSetup();
  },

  /* ---------- esecuzione ---------- */

  elapsed() { return this.acc + (this.startedAt !== null ? performance.now() - this.startedAt : 0); },
  running() { return this.startedAt !== null; },

  start() {
    sound.unlock();
    this.runMode = this.mode;
    this.phases = buildPhases(this.modeId, this.config);
    this.starts = [];
    let t = 0;
    for (const ph of this.phases) { this.starts.push(t); t += ph.dur; }
    this.total = t;
    this.prepDur = this.phases[0].type === 'prep' ? this.phases[0].dur : 0;
    const main = this.phases[this.phases.length - 1];
    this.capLabel = main.countUp && !main.uncapped ? `Limite ${fmtClock(main.dur)}` : '';
    // con una sola fase principale (AMRAP) il tempo totale in alto sarebbe un doppione
    this.showTotal = this.phases.filter((ph) => ph.type !== 'prep').length > 1;
    this.acc = 0;
    this.count = 0;
    this.lastIdx = -1;
    this.lastSec = null;
    this.finished = false;
    this.startedAt = performance.now();

    const m = this.runMode;
    $('#tb-restart').classList.toggle('hidden', !!m.countUp);
    $('#tb-done').classList.toggle('hidden', !m.countUp);
    $('#tb-skip').classList.toggle('hidden', !!m.counter);
    $('#tb-count').classList.toggle('hidden', !m.counter);
    $('#run-counter').classList.toggle('hidden', !m.counter);
    $('#cnt-minus').classList.remove('hidden');
    // nelle modalità con contatore il pulsante principale è "+1 Round"
    $('#tb-toggle').classList.toggle('primary', !m.counter);
    $('#tb-toggle').classList.toggle('secondary', !!m.counter);
    $('#tb-count').classList.toggle('primary', !!m.counter);
    this.renderCount();
    $('#tabata-run').classList.remove('hidden');
    this.renderToggle();
    this.tick();
  },

  toggle() {
    if (this.finished) return this.start();
    sound.unlock();
    if (this.running()) { this.acc = this.elapsed(); this.startedAt = null; }
    else this.startedAt = performance.now();
    this.renderToggle();
    this.tick();
  },

  skip() {
    if (this.finished) return;
    const idx = this.currentIndex(this.elapsed());
    if (this.phases[idx].countUp) return;
    this.acc = (this.starts[idx] + this.phases[idx].dur) * 1000;
    if (this.running()) this.startedAt = performance.now();
    this.tick();
  },

  addCount(delta) {
    if (this.finished || !this.runMode.counter) return;
    this.count = Math.max(0, this.count + delta);
    if (delta > 0) sound.beep(1568, 0.08);
    this.renderCount();
  },

  renderCount() {
    $('#cnt-value').textContent = `${this.count} round`;
    if (this.runMode && this.runMode.counter && !this.finished) {
      $('#run-next').textContent = `${this.count} ${this.count === 1 ? 'round completato' : 'round completati'}`;
    }
  },

  close() {
    if (this.running() && !confirm('Interrompere l\'allenamento?')) return;
    this.startedAt = null;
    $('#tabata-run').classList.add('hidden');
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  },

  currentIndex(ms) {
    const sec = ms / 1000;
    let idx = 0;
    while (idx + 1 < this.phases.length && sec >= this.starts[idx + 1]) idx++;
    return idx;
  },

  finish() {
    if (this.finished) return;
    const ms = Math.min(this.elapsed(), this.total * 1000);
    this.finished = true;
    this.startedAt = null;
    this.acc = ms;
    const workTime = Math.floor(ms / 1000) - this.prepDur;
    const run = $('#tabata-run');
    run.dataset.phase = 'done';
    run.classList.remove('paused');
    $('#run-phase').textContent = 'FINITO!';
    $('#run-seconds').textContent = this.runMode.countUp ? fmtClock(Math.max(0, workTime)) : '✓';
    $('#run-seconds').classList.toggle('long', !!this.runMode.countUp);
    $('#run-next').textContent = this.runMode.counter
      ? `${this.count} round · ${fmtClock(Math.max(0, workTime))}`
      : `Tempo totale ${fmtClock(this.total)}`;
    $('#run-remaining').textContent = '';
    $('#run-round').textContent = '';
    $('#run-progress').style.width = '100%';
    $('#tb-toggle').textContent = 'Ancora';
    $('#tb-done').classList.add('hidden');
    $('#tb-count').classList.add('hidden');
    $('#cnt-minus').classList.add('hidden');
    $('#tb-restart').classList.add('hidden');
    $('#tb-skip').classList.add('hidden');
    sound.beep(1046, 0.25); setTimeout(() => sound.beep(1046, 0.25), 300); setTimeout(() => sound.beep(1318, 0.6), 600);
    sound.say(this.runMode.counter ? `Finito! ${this.count} round.` : 'Finito, ottimo lavoro!');
  },

  tick() {
    if ($('#tabata-run').classList.contains('hidden') || this.finished) return;
    const ms = this.elapsed();
    if (ms >= this.total * 1000) return this.finish();

    const idx = this.currentIndex(ms);
    const ph = this.phases[idx];
    const phaseMs = ms - this.starts[idx] * 1000;
    const remainingMs = ph.dur * 1000 - phaseMs;
    const sec = Math.ceil(remainingMs / 1000);

    if (idx !== this.lastIdx) {
      this.renderPhase(idx);
      sound.beep(ph.type === 'work' ? 1318 : 660, 0.45);
      sound.say(ph.voice || PHASE_VOICE[ph.type]);
    } else if (sec !== this.lastSec && sec <= 3 && sec > 0 && this.running() && !ph.uncapped) {
      sound.beep(880, 0.12);
    }
    this.lastIdx = idx;
    this.lastSec = sec;

    const long = ph.countUp || ph.dur >= 60;
    const shown = ph.countUp ? Math.floor(phaseMs / 1000) : sec;
    const secEl = $('#run-seconds');
    secEl.textContent = long ? fmtClock(shown) : String(shown);
    secEl.classList.toggle('long', long);
    $('#run-remaining').textContent = this.runMode.countUp ? this.capLabel
      : this.showTotal ? fmtClock(Math.ceil(this.total - ms / 1000)) : '';
    $('#run-progress').style.width = ph.uncapped ? '0%' : `${(phaseMs / (ph.dur * 1000)) * 100}%`;
  },

  renderPhase(idx) {
    const ph = this.phases[idx];
    const next = this.phases[idx + 1];
    $('#tabata-run').dataset.phase = ph.type;
    const phaseEl = $('#run-phase');
    phaseEl.textContent = ph.name.toUpperCase();
    phaseEl.classList.toggle('small', ph.name.length > 12);
    $('#run-round').textContent = ph.info;
    let nextText = '';
    if (next) nextText = `Poi: ${next.name.toLowerCase()} · ${fmtDur(next.dur)}`;
    else if (!ph.countUp && !this.runMode.counter) nextText = 'Ultimo sforzo!';
    $('#run-next').textContent = nextText;
    $('#run-next').classList.toggle('counter-big', !!this.runMode.counter && ph.type === 'work');
    if (this.runMode.counter && ph.type === 'work') this.renderCount();
  },

  renderToggle() {
    const running = this.running();
    $('#tb-toggle').textContent = running ? 'Pausa' : 'Riprendi';
    $('#tabata-run').classList.toggle('paused', !running && !this.finished);
  },

  initRun() {
    $('#tb-start').addEventListener('click', () => this.start());
    $('#tb-toggle').addEventListener('click', () => this.toggle());
    $('#tb-skip').addEventListener('click', () => this.skip());
    $('#tb-restart').addEventListener('click', () => this.start());
    $('#tb-count').addEventListener('click', () => this.addCount(+1));
    $('#cnt-minus').addEventListener('click', () => this.addCount(-1));
    $('#tb-done').addEventListener('click', () => this.finish());
    $('#tb-close').addEventListener('click', () => this.close());
    // tocco sui numeri grandi = pausa / riprendi
    $('#run-center').addEventListener('click', () => this.toggle());
  },
};

function holdToRepeat(btn, action) {
  let timer = null;
  const stop = () => { clearTimeout(timer); timer = null; };
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    action();
    let delay = 400;
    const repeat = () => { action(); delay = Math.max(60, delay * 0.8); timer = setTimeout(repeat, delay); };
    timer = setTimeout(repeat, delay);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, stop));
}

/* ================= Navigazione e tastiera ================= */

function showView(name) {
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  store.set('ui.view', name);
}
$$('.tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  const runVisible = !$('#tabata-run').classList.contains('hidden');
  const swVisible = $('#view-stopwatch').classList.contains('active');
  const key = e.key.toLowerCase();
  if (key === ' ') {
    e.preventDefault();
    if (runVisible) workout.toggle();
    else if (swVisible) stopwatch.toggle();
  } else if (key === 'l' && swVisible && !runVisible) stopwatch.lap();
  else if (key === 'r' && swVisible && !runVisible && !stopwatch.running()) stopwatch.reset();
  else if (key === 'n' && runVisible) workout.skip();
  else if ((key === 'c' || key === 'enter') && runVisible) { e.preventDefault(); workout.addCount(+1); }
  else if (key === 'escape' && runVisible) workout.close();
  else if (key === 'f') $('#fullscreen-btn').click();
});

/* ================= Avvio ================= */

stopwatch.init();
workout.initSetup();
workout.initRun();
showView(store.get('ui.view', 'stopwatch'));
wake.render();
wake.acquire();

setInterval(() => {
  if (stopwatch.running()) stopwatch.renderTime();
  if (workout.running()) workout.tick();
}, 33);

/* ================= Aggiornamenti ================= */

const updates = {
  reg: null,
  pendingReload: false,

  // non ricarichiamo mai durante un allenamento Tabata (il cronometro invece sopravvive alla ricarica)
  safeToReload() { return $('#tabata-run').classList.contains('hidden'); },

  async check() {
    if (!this.reg) return;
    try { await this.reg.update(); } catch { /* offline */ }
  },

  async manualCheck() {
    if (!this.reg) return toast('Aggiornamenti non disponibili in questa modalità');
    toast('Controllo aggiornamenti…');
    await this.check();
    if (!this.reg.installing && !this.reg.waiting) toast(`Sei già all'ultima versione (${versionLabel()})`);
  },

  init() {
    $('#app-version').textContent = `Versione ${versionLabel()} · tocca per controllare aggiornamenti`;
    $('#app-version').addEventListener('click', () => this.manualCheck());
    if (!('serviceWorker' in navigator) || !(location.protocol === 'https:' || location.hostname === 'localhost')) return;

    // se c'era già una versione attiva, il cambio di service worker significa "aggiornamento arrivato"
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) return;
      if (this.safeToReload()) location.reload();
      else {
        this.pendingReload = true;
        toast('Aggiornamento pronto: verrà applicato alla fine dell\'allenamento.');
      }
    });

    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .then((reg) => { this.reg = reg; })
      .catch(() => {});

    // l'app installata su iPad resta "viva" a lungo: controlliamo quando torna in primo piano e ogni 30 minuti
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.check(); });
    setInterval(() => this.check(), 30 * 60 * 1000);
    setInterval(() => { if (this.pendingReload && this.safeToReload()) location.reload(); }, 1000);
  },
};

updates.init();
