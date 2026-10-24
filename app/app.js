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

  async acquire() {
    if (!this.supported || this.lock || document.visibilityState !== 'visible') return;
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
    el.classList.toggle('on', !!this.lock);
    el.classList.toggle('unsupported', !this.supported);
    $('#wake-label').textContent = !this.supported ? 'Standby non bloccabile'
      : this.lock ? 'Schermo sempre acceso' : 'Lo schermo può spegnersi';
  },

  explain() {
    if (!this.supported) {
      toast('Questo browser non può impedire lo standby. Su iPad: Impostazioni → Schermo e luminosità → Blocco automatico → Mai.', 7000);
    } else if (this.lock) {
      toast('Lo schermo resta acceso finché l\'app è aperta in primo piano.');
    } else {
      toast('Blocco dello standby non ancora attivo: tocca un punto qualsiasi dello schermo.');
      this.acquire();
    }
  },
};

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') wake.acquire();
});
// Alcuni browser concedono il blocco solo dopo un'interazione: riproviamo a ogni tocco finché non è attivo.
document.addEventListener('pointerdown', () => wake.acquire(), { capture: true });
$('#wake-indicator').addEventListener('click', () => wake.explain());

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
    if (!tabata.opts.sound || !this.ctx) return;
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
    if (!tabata.opts.voice || !('speechSynthesis' in window)) return;
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

/* ================= Tabata ================= */

const BUILTIN_PRESETS = [
  { name: 'Tabata classico (8×20/10)', prep: 10, work: 20, rest: 10, rounds: 8, sets: 1, recovery: 60 },
  { name: 'Tabata 4 serie', prep: 10, work: 20, rest: 10, rounds: 8, sets: 4, recovery: 60 },
  { name: '40/20 × 10', prep: 10, work: 40, rest: 20, rounds: 10, sets: 1, recovery: 0 },
  { name: '30/30 × 10', prep: 10, work: 30, rest: 30, rounds: 10, sets: 1, recovery: 0 },
];
const KEYS = ['prep', 'work', 'rest', 'rounds', 'sets', 'recovery'];

const PHASE_LABEL = { prep: 'PREPARATI', work: 'LAVORO', rest: 'RIPOSO', recovery: 'RECUPERO', done: 'FINITO!' };
const PHASE_VOICE = { prep: 'Preparati', work: 'Via!', rest: 'Riposo', recovery: 'Recupero', done: 'Finito, ottimo lavoro!' };

const tabata = {
  config: store.get('tb.config', { ...BUILTIN_PRESETS[0] }),
  opts: store.get('tb.opts', { sound: true, voice: false }),
  customPresets: store.get('tb.presets', []),

  // stato dell'esecuzione
  phases: [],
  starts: [],     // secondo di inizio di ogni fase
  total: 0,
  acc: 0,         // ms accumulati prima dell'ultima ripresa
  startedAt: null,
  lastIdx: -1,
  lastSec: null,
  finished: false,

  buildPhases(c) {
    const p = [];
    if (c.prep > 0) p.push({ type: 'prep', dur: c.prep, round: 1, set: 1 });
    for (let s = 1; s <= c.sets; s++) {
      for (let r = 1; r <= c.rounds; r++) {
        p.push({ type: 'work', dur: c.work, round: r, set: s });
        if (r < c.rounds && c.rest > 0) p.push({ type: 'rest', dur: c.rest, round: r, set: s });
      }
      if (s < c.sets) {
        if (c.recovery > 0) p.push({ type: 'recovery', dur: c.recovery, round: c.rounds, set: s });
        else if (c.rest > 0) p.push({ type: 'rest', dur: c.rest, round: c.rounds, set: s });
      }
    }
    return p;
  },

  totalSeconds(c) { return this.buildPhases(c).reduce((sum, ph) => sum + ph.dur, 0); },

  /* ---------- impostazioni ---------- */

  formatValue(key, v) {
    if (key === 'rounds' || key === 'sets') return String(v);
    return v < 60 ? `${v} s` : fmtClock(v);
  },

  stepFor(field, value, dir) {
    const base = Number(field.dataset.step);
    if (!('time' in field.dataset)) return base;
    // sopra il minuto si va a passi di 15 s
    return (dir > 0 ? value >= 60 : value > 60) ? Math.max(base, 15) : base;
  },

  change(field, dir) {
    const key = field.dataset.key;
    const min = Number(field.dataset.min);
    const max = Number(field.dataset.max);
    const v = this.config[key];
    this.config[key] = Math.min(max, Math.max(min, v + dir * this.stepFor(field, v, dir)));
    this.saveConfig();
  },

  editDirect(field) {
    const key = field.dataset.key;
    const isTime = 'time' in field.dataset;
    const answer = prompt(`${field.querySelector('.label').textContent}${isTime ? ' (secondi)' : ''}`, this.config[key]);
    if (answer === null) return;
    const n = Math.round(Number(answer.replace(',', '.')));
    if (!Number.isFinite(n)) return;
    this.config[key] = Math.min(Number(field.dataset.max), Math.max(Number(field.dataset.min), n));
    this.saveConfig();
  },

  saveConfig() {
    store.set('tb.config', this.config);
    this.renderSetup();
  },

  allPresets() { return [...BUILTIN_PRESETS, ...this.customPresets]; },

  matchingPresetIndex() {
    return this.allPresets().findIndex((p) => KEYS.every((k) => p[k] === this.config[k]));
  },

  renderPresets() {
    const sel = $('#preset-select');
    sel.innerHTML = '<option value="-1">— Preset —</option>';
    this.allPresets().forEach((p, i) => {
      const o = document.createElement('option');
      o.value = i;
      o.textContent = p.name;
      sel.appendChild(o);
    });
  },

  renderSetup() {
    for (const field of $$('.field')) {
      field.querySelector('.value').textContent = this.formatValue(field.dataset.key, this.config[field.dataset.key]);
    }
    $('#total-time').textContent = fmtClock(this.totalSeconds(this.config));
    $('#preset-select').value = String(this.matchingPresetIndex());
    $('#opt-sound').checked = this.opts.sound;
    $('#opt-voice').checked = this.opts.voice;
  },

  initSetup() {
    for (const field of $$('.field')) {
      const stepper = document.createElement('div');
      stepper.className = 'stepper';
      stepper.innerHTML = '<button type="button" aria-label="meno">−</button><span class="value"></span><button type="button" aria-label="più">+</button>';
      field.appendChild(stepper);
      const [minus, plus] = stepper.querySelectorAll('button');
      holdToRepeat(minus, () => this.change(field, -1));
      holdToRepeat(plus, () => this.change(field, +1));
      stepper.querySelector('.value').addEventListener('click', () => this.editDirect(field));
    }

    $('#preset-select').addEventListener('change', (e) => {
      const p = this.allPresets()[Number(e.target.value)];
      if (!p) return;
      KEYS.forEach((k) => { this.config[k] = p[k]; });
      this.saveConfig();
    });

    $('#preset-save').addEventListener('click', () => {
      const name = prompt('Nome del preset');
      if (!name || !name.trim()) return;
      const preset = { name: name.trim() };
      KEYS.forEach((k) => { preset[k] = this.config[k]; });
      const existing = this.customPresets.findIndex((p) => p.name === preset.name);
      if (existing >= 0) this.customPresets[existing] = preset;
      else this.customPresets.push(preset);
      store.set('tb.presets', this.customPresets);
      this.renderPresets();
      this.renderSetup();
      toast(`Preset "${preset.name}" salvato`);
    });

    $('#preset-delete').addEventListener('click', () => {
      const i = Number($('#preset-select').value);
      if (i < 0) return toast('Scegli prima un preset');
      if (i < BUILTIN_PRESETS.length) return toast('I preset predefiniti non si possono eliminare');
      const p = this.customPresets[i - BUILTIN_PRESETS.length];
      if (!confirm(`Eliminare "${p.name}"?`)) return;
      this.customPresets.splice(i - BUILTIN_PRESETS.length, 1);
      store.set('tb.presets', this.customPresets);
      this.renderPresets();
      this.renderSetup();
    });

    $('#opt-sound').addEventListener('change', (e) => { this.opts.sound = e.target.checked; store.set('tb.opts', this.opts); });
    $('#opt-voice').addEventListener('change', (e) => { this.opts.voice = e.target.checked; store.set('tb.opts', this.opts); });

    this.renderPresets();
    this.renderSetup();
  },

  /* ---------- esecuzione ---------- */

  elapsed() { return this.acc + (this.startedAt !== null ? performance.now() - this.startedAt : 0); },
  running() { return this.startedAt !== null; },

  start() {
    sound.unlock();
    this.phases = this.buildPhases(this.config);
    this.starts = [];
    let t = 0;
    for (const ph of this.phases) { this.starts.push(t); t += ph.dur; }
    this.total = t;
    this.acc = 0;
    this.lastIdx = -1;
    this.lastSec = null;
    this.finished = false;
    this.startedAt = performance.now();
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
    this.acc = (this.starts[idx] + this.phases[idx].dur) * 1000;
    if (this.running()) this.startedAt = performance.now();
    this.tick();
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
    this.finished = true;
    this.startedAt = null;
    this.acc = this.total * 1000;
    const run = $('#tabata-run');
    run.dataset.phase = 'done';
    run.classList.remove('paused');
    $('#run-phase').textContent = PHASE_LABEL.done;
    $('#run-seconds').textContent = '✓';
    $('#run-seconds').classList.remove('long');
    $('#run-next').textContent = `Tempo totale ${fmtClock(this.total)}`;
    $('#run-remaining').textContent = '0:00';
    $('#run-progress').style.width = '100%';
    $('#tb-toggle').textContent = 'Ancora';
    sound.beep(1046, 0.25); setTimeout(() => sound.beep(1046, 0.25), 300); setTimeout(() => sound.beep(1318, 0.6), 600);
    sound.say(PHASE_VOICE.done);
  },

  tick() {
    if ($('#tabata-run').classList.contains('hidden') || this.finished) return;
    const ms = this.elapsed();
    if (ms >= this.total * 1000) return this.finish();

    const idx = this.currentIndex(ms);
    const ph = this.phases[idx];
    const remainingMs = (this.starts[idx] + ph.dur) * 1000 - ms;
    const sec = Math.ceil(remainingMs / 1000);

    if (idx !== this.lastIdx) {
      this.renderPhase(idx);
      sound.beep(ph.type === 'work' ? 1318 : 660, 0.45);
      sound.say(PHASE_VOICE[ph.type]);
    } else if (sec !== this.lastSec && sec <= 3 && sec > 0 && this.running()) {
      sound.beep(880, 0.12);
    }
    this.lastIdx = idx;
    this.lastSec = sec;

    const secEl = $('#run-seconds');
    secEl.textContent = ph.dur >= 60 ? fmtClock(sec) : String(sec);
    secEl.classList.toggle('long', ph.dur >= 60);
    $('#run-remaining').textContent = fmtClock(Math.ceil(this.total - ms / 1000));
    $('#run-progress').style.width = `${(1 - remainingMs / (ph.dur * 1000)) * 100}%`;
  },

  renderPhase(idx) {
    const ph = this.phases[idx];
    const next = this.phases[idx + 1];
    const run = $('#tabata-run');
    run.dataset.phase = ph.type;
    $('#run-phase').textContent = PHASE_LABEL[ph.type];
    $('#run-round').textContent = `Round ${ph.round}/${this.config.rounds}`;
    $('#run-set').textContent = `Serie ${ph.set}/${this.config.sets}`;
    $('#run-set').classList.toggle('hidden', this.config.sets === 1);
    $('#run-next').textContent = next ? `Poi: ${PHASE_LABEL[next.type].toLowerCase()} ${this.formatValue('work', next.dur)}` : 'Ultimo sforzo!';
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
    if (runVisible) tabata.toggle();
    else if (swVisible) stopwatch.toggle();
  } else if (key === 'l' && swVisible && !runVisible) stopwatch.lap();
  else if (key === 'r' && swVisible && !runVisible && !stopwatch.running()) stopwatch.reset();
  else if (key === 'n' && runVisible) tabata.skip();
  else if (key === 'escape' && runVisible) tabata.close();
  else if (key === 'f') $('#fullscreen-btn').click();
});

/* ================= Avvio ================= */

stopwatch.init();
tabata.initSetup();
tabata.initRun();
showView(store.get('ui.view', 'stopwatch'));
wake.render();
wake.acquire();

setInterval(() => {
  if (stopwatch.running()) stopwatch.renderTime();
  if (tabata.running()) tabata.tick();
}, 33);

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
