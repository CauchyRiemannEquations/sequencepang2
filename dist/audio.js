// Original SequencePang2 music and effects. No audio starts before an input.
export const audioKey = 'sequencepang2-audio-v1';
export const music = {
  menu: { file: '01_mango_garden_menu', duration: 38.4 },
  play: { file: '02_constellation_path_play', duration: 76.8 },
};
const jingles = { clear: '03_stage_clear', retry: '04_gentle_retry', complete: '05_all_stars_complete' };
const effects = ['ui_tap', 'invalid_soft', 'sequence_pop', 'star_collect', 'mango_hint', ...[1,2,3,4,5].map(n => `select_${n}`)];
const clamp = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
export function readAudioPreferences(storage) {
  let legacy = false, saved;
  try {
    legacy = (storage?.getItem('sequencepang2-sound') ?? storage?.getItem('sequenstar-sound')) === 'on';
    saved = JSON.parse(storage?.getItem(audioKey) || 'null');
  } catch {}
  const defaults = { master: true, bgm: false, sfx: legacy, bgmVolume: .65, sfxVolume: .8 };
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return defaults;
  for (const key of ['master', 'bgm', 'sfx']) if (typeof saved[key] === 'boolean') defaults[key] = saved[key];
  defaults.bgmVolume = clamp(saved.bgmVolume, defaults.bgmVolume);
  defaults.sfxVolume = clamp(saved.sfxVolume, defaults.sfxVolume);
  return defaults;
}

export class GameAudio {
  constructor({ storage, createContext = () => new (globalThis.AudioContext || globalThis.webkitAudioContext)(), fetcher = globalThis.fetch?.bind(globalThis), now = () => performance.now(), onChange = () => {} } = {}) {
    this.storage = storage;
    this.preferences = readAudioPreferences(storage);
    this.createContext = createContext; this.fetcher = fetcher; this.now = now; this.onChange = onChange;
    this.buffers = new Map(); this.pending = new Map(); this.voices = new Set(); this.loops = new Set();
    this.scene = 'menu'; this.hidden = false; this.unlocked = false; this.revision = 0; this.eventRevision = 0;
    this.lastSelect = -Infinity; this.modal = false; this.disposed = false;
  }
  get audible() { const p = this.preferences; return p.master && ((p.bgm && p.bgmVolume > 0) || (p.sfx && p.sfxVolume > 0)); }
  get ready() { return !this.disposed && !this.hidden && this.unlocked && this.context?.state === 'running' && this.preferences.master; }
  init() {
    if (this.context || this.disposed) return;
    this.context = this.createContext();
    this.masterGain = this.context.createGain();
    this.musicGain = this.context.createGain(); this.effectsGain = this.context.createGain();
    this.musicGain.connect(this.masterGain); this.effectsGain.connect(this.masterGain); this.masterGain.connect(this.context.destination);
    this.updateGains(0);
  }
  // Call directly inside pointer/keyboard/click handlers for mobile autoplay rules.
  unlock() {
    if (this.hidden || this.disposed || !this.audible) return Promise.resolve(false);
    try {
      this.init(); this.unlocked = true;
      const resumed = this.context.resume();
      return Promise.resolve(resumed).then(() => {
        if (this.hidden || !this.audible || this.disposed) { this.context.suspend().catch(() => {}); return false; }
        this.updateGains(); this.syncMusic(); this.preload(); return this.context.state === 'running';
      }).catch(() => false);
    } catch { return Promise.resolve(false); }
  }
  async load(id) {
    if (this.buffers.has(id)) return this.buffers.get(id);
    if (this.pending.has(id)) return this.pending.get(id);
    if (!this.context) return null;
    const paths = music[id] ? [`music/${music[id].file}.ogg`, `music/${music[id].file}.wav`] :
      jingles[id] ? [`jingles/${jingles[id]}.wav`] : effects.includes(id) ? [`sfx/${id}.wav`] : [];
    const promise = (async () => {
      for (const path of paths) {
        try {
          const response = await this.fetcher(new URL(`./audio/${path}`, import.meta.url));
          if (!response.ok) continue;
          const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
          if (this.disposed) return null;
          this.buffers.set(id, buffer); return buffer;
        } catch { /* Old Safari cannot decode Ogg: use the sample-exact WAV. */ }
      }
      return null; // Unavailable audio must never block a move or navigation.
    })().finally(() => this.pending.delete(id));
    this.pending.set(id, promise); return promise;
  }
  preload() {
    if (!this.ready || !this.preferences.sfx || this.preloaded) return;
    this.preloaded = true;
    // Load short effects first. Music remains demand-loaded per screen.
    for (const id of [...effects, ...Object.keys(jingles)]) void this.load(id);
  }
  ramp(param, value, duration = .12) {
    const time = this.context.currentTime;
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(time);
    else { param.cancelScheduledValues(time); param.setValueAtTime(param.value, time); }
    if (duration) param.linearRampToValueAtTime(value, time + duration);
    else param.setValueAtTime(value, time);
  }
  updateGains(duration = .12) {
    if (!this.context) return;
    const p = this.preferences;
    this.ramp(this.masterGain.gain, p.master ? .8 : 0, duration);
    this.ramp(this.effectsGain.gain, p.sfx ? p.sfxVolume : 0, duration);
    this.ramp(this.musicGain.gain, p.bgm ? p.bgmVolume * (this.jingle ? .2 : this.modal ? .55 : 1) : 0, duration);
  }
  setPreferences(patch) {
    this.preferences = { ...this.preferences, ...patch };
    for (const key of ['bgmVolume', 'sfxVolume']) this.preferences[key] = clamp(this.preferences[key], .7);
    try { this.storage?.setItem(audioKey, JSON.stringify(this.preferences)); this.storage?.setItem('sequencepang2-sound', this.preferences.sfx ? 'on' : 'off'); } catch {}
    this.revision++;
    if (!this.preferences.master || !this.preferences.sfx || !this.preferences.sfxVolume) this.stopTransient();
    if (!this.preferences.bgm || !this.preferences.master || !this.preferences.bgmVolume) this.stopMusic();
    this.updateGains();
    if (!this.audible) { this.context?.suspend().catch(() => {}); }
    else void this.unlock();
    this.onChange(this.preferences);
  }
  setScene(scene) {
    if (!music[scene]) return;
    this.stopTransient();
    if (scene !== this.scene) { this.scene = scene; this.revision++; }
    void this.syncMusic();
  }
  setModal(open) { this.modal = open; this.updateGains(); }
  async syncMusic() {
    const p = this.preferences;
    if (!this.ready || !p.bgm || !p.bgmVolume) return;
    const scene = this.scene, revision = this.revision;
    if (this.currentLoop?.scene === scene) return;
    const buffer = await this.load(scene);
    if (!buffer || revision !== this.revision || !this.ready || !this.preferences.bgm || this.currentLoop?.scene === scene) return;
    const time = this.context.currentTime;
    this.musicEpoch ??= time;
    const offset = (time - this.musicEpoch) % music[scene].duration;
    const source = this.context.createBufferSource(), gain = this.context.createGain();
    source.buffer = buffer; source.loop = true; source.loopStart = 0; source.loopEnd = music[scene].duration;
    source.connect(gain); gain.connect(this.musicGain); gain.gain.setValueAtTime(0, time);
    const entry = { source, gain, scene }; this.loops.add(entry);
    source.onended = () => { this.loops.delete(entry); source.disconnect(); gain.disconnect(); };
    const duration = .6, points = 32;
    const curve = Float32Array.from({length:points}, (_, i) => Math.sin(i / (points - 1) * Math.PI / 2));
    gain.gain.setValueCurveAtTime(curve, time, duration);
    // Retire all prior sources; rapid navigation cannot leave a fading loop alive.
    for (const previous of this.loops) if (previous !== entry) this.retire(previous, duration);
    this.currentLoop = entry; source.start(time, offset);
  }
  retire(entry, duration = .1) {
    if (entry.stopping) return;
    entry.stopping = true;
    this.ramp(entry.gain.gain, 0, duration);
    try { entry.source.stop(this.context.currentTime + duration); } catch {}
  }
  stopMusic() {
    this.revision++;
    for (const entry of this.loops) this.retire(entry);
    this.currentLoop = null;
  }
  stopTransient() {
    this.eventRevision++;
    for (const voice of this.voices) { try { voice.source.stop(); } catch {} voice.source.disconnect(); voice.gain.disconnect(); }
    this.voices.clear(); this.jingle = null; this.updateGains();
  }
  async play(id, { jingle = false } = {}) {
    if (!this.ready || !this.preferences.sfx || !this.preferences.sfxVolume) return false;
    const started = this.now(), revision = this.eventRevision;
    if (id.startsWith('select_')) { if (started - this.lastSelect < 55) return false; this.lastSelect = started; }
    if (jingle) this.stopTransient();
    const token = jingle ? this.eventRevision : revision;
    const buffer = await this.load(id);
    if (!buffer || token !== this.eventRevision || !this.ready || !this.preferences.sfx || (!jingle && this.now() - started > 250)) return false;
    if (!jingle && this.jingle) return false;
    const small = [...this.voices].filter(v => !v.jingle);
    if (!jingle && small.length >= 3) { const oldest = small[0]; oldest.source.stop(); this.voices.delete(oldest); }
    const source = this.context.createBufferSource(), gain = this.context.createGain();
    source.buffer = buffer; source.connect(gain); gain.connect(this.effectsGain);
    gain.gain.setValueAtTime(jingle ? .85 : 1, this.context.currentTime);
    const voice = { source, gain, jingle }; this.voices.add(voice);
    if (jingle) { this.jingle = voice; this.updateGains(.08); }
    source.onended = () => {
      source.disconnect(); gain.disconnect(); this.voices.delete(voice);
      if (this.jingle === voice) { this.jingle = null; this.updateGains(.3); }
    };
    source.start(); return true;
  }
  select(length) { return this.play(`select_${Math.min(5, Math.max(1, length))}`); }
  result(won, complete = false) { return this.play(complete ? 'complete' : won ? 'clear' : 'retry', { jingle: true }); }
  setHidden(hidden) {
    if (hidden === this.hidden) return;
    this.hidden = hidden; this.revision++;
    if (hidden) {
      this.resumeAfterHidden = this.unlocked && this.context?.state === 'running' && this.audible;
      this.stopTransient();
      this.context?.suspend().catch(() => {});
    } else if (this.resumeAfterHidden) {
      this.resumeAfterHidden = false; void this.unlock();
    }
  }
  dispose() {
    this.disposed = true; this.stopTransient(); this.stopMusic(); this.buffers.clear();
    this.context?.close().catch(() => {});
  }
}
