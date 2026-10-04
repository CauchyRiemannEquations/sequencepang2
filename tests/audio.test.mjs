import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GameAudio, audioKey, music, readAudioPreferences } from '../dist/audio.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const settle = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const storage = (values = {}) => ({
  values: new Map(Object.entries(values)),
  getItem(key) { return this.values.get(key) ?? null; },
  setItem(key, value) { this.values.set(key, String(value)); },
});

class Param {
  constructor() { this.value = 1; this.events = []; }
  record(type, value, time, duration) { this.events.push({ type, value, time, duration }); }
  cancelAndHoldAtTime(time) { this.record('hold', this.value, time); }
  cancelScheduledValues(time) { this.record('cancel', this.value, time); }
  setValueAtTime(value, time) { this.value = value; this.record('set', value, time); }
  linearRampToValueAtTime(value, time) { this.value = value; this.record('ramp', value, time); }
  setValueCurveAtTime(value, time, duration) { this.value = value.at(-1); this.record('curve', value, time, duration); }
}

class Node {
  constructor(context) { this.context = context; this.gain = new Param(); this.connected = []; this.disconnected = false; }
  connect(destination) { this.connected.push(destination); }
  disconnect() { this.disconnected = true; this.connected = []; }
}

class Source extends Node {
  start(time = 0, offset = 0) { this.started = { time, offset }; }
  stop(time = 0) {
    this.stoppedAt = time;
    if (time <= this.context.currentTime) queueMicrotask(() => this.finish());
  }
  finish() { if (!this.ended) { this.ended = true; this.onended?.(); } }
}

class Context {
  constructor({ resumeGate, decode } = {}) {
    this.state = 'suspended'; this.currentTime = 0; this.destination = {};
    this.sources = []; this.gains = []; this.resumeCalls = 0; this.suspendCalls = 0;
    this.resumeGate = resumeGate; this.decode = decode;
  }
  createGain() { const node = new Node(this); this.gains.push(node); return node; }
  createBufferSource() { const source = new Source(this); this.sources.push(source); return source; }
  async resume() { this.resumeCalls++; if (this.resumeGate) await this.resumeGate.promise; this.state = 'running'; }
  async suspend() { this.suspendCalls++; this.state = 'suspended'; }
  async close() { this.state = 'closed'; }
  async decodeAudioData(data) { return this.decode ? this.decode(data) : { name: new TextDecoder().decode(data), duration: 80 }; }
  advance(seconds) { this.currentTime += seconds; for (const source of this.sources) if (source.stoppedAt <= this.currentTime) source.finish(); }
}

function setup({ preferences = { master: true, bgm: false, sfx: true }, contextOptions, fetcher, clock = { value: 0 }, store } = {}) {
  const context = new Context(contextOptions), requests = [];
  store ??= storage({ [audioKey]: JSON.stringify(preferences) });
  let created = 0;
  const audio = new GameAudio({
    storage: store,
    createContext: () => { created++; return context; },
    now: () => clock.value,
    fetcher: async url => {
      requests.push(url.pathname);
      return fetcher ? fetcher(url) : { ok: true, arrayBuffer: async () => new TextEncoder().encode(url.pathname).buffer };
    },
  });
  return { audio, context, requests, clock, store, get created() { return created; } };
}

async function ready(options) {
  const fixture = setup(options);
  await fixture.audio.unlock(); await settle();
  return fixture;
}

test('audio defaults are silent and the most recent legacy key takes precedence', () => {
  assert.deepEqual(readAudioPreferences(), { master: true, bgm: false, sfx: false, bgmVolume: .65, sfxVolume: .8 });
  assert.equal(readAudioPreferences(storage({ 'sequenstar-sound': 'on' })).sfx, true);
  assert.equal(readAudioPreferences(storage({ 'sequenstar-sound': 'on', 'sequencepang2-sound': 'off' })).sfx, false);
  assert.equal(readAudioPreferences(storage({ 'sequencepang2-sound': 'on' })).bgm, false);
});

test('saved preferences validate booleans, clamp finite volumes and tolerate bad storage', () => {
  const saved = readAudioPreferences(storage({
    [audioKey]: JSON.stringify({ master: false, bgm: true, sfx: 'yes', bgmVolume: 8, sfxVolume: -3 }),
    'sequencepang2-sound': 'on',
  }));
  assert.deepEqual(saved, { master: false, bgm: true, sfx: true, bgmVolume: 1, sfxVolume: 0 });
  for (const invalid of ['{', '[]', 'true', 'null']) {
    assert.equal(readAudioPreferences(storage({ [audioKey]: invalid, 'sequencepang2-sound': 'on' })).sfx, true);
  }
  assert.equal(readAudioPreferences(storage({ [audioKey]: '{"bgmVolume":"1","sfxVolume":null}' })).bgmVolume, .65);
  assert.doesNotThrow(() => readAudioPreferences({ getItem() { throw Error('blocked'); } }));
});

test('construction, navigation and a silent unlock do not create an audio context or fetch', async () => {
  const fixture = setup({ store: storage() });
  fixture.audio.setScene('play');
  assert.equal(await fixture.audio.unlock(), false);
  assert.equal(await fixture.audio.play('sequence_pop'), false);
  assert.equal(fixture.created, 0);
  assert.deepEqual(fixture.requests, []);
});

test('unlock invokes resume synchronously in the input stack, reuses one context and loads no music for SFX-only users', async () => {
  const fixture = setup();
  const unlocking = fixture.audio.unlock();
  assert.equal(fixture.context.resumeCalls, 1);
  await unlocking; await settle();
  await fixture.audio.unlock(); await settle();
  assert.equal(fixture.created, 1);
  assert.equal(fixture.context.state, 'running');
  assert.equal(fixture.requests.filter(path => path.includes('/music/')).length, 0);
  assert.equal(fixture.requests.length, 12);
  assert.equal(fixture.requests.some(path => path.includes('ui_tap')), false);
});

test('unavailable or rejected AudioContext never blocks the caller', async () => {
  const audio = new GameAudio({ storage: storage({ 'sequencepang2-sound': 'on' }), createContext() { throw Error('unsupported'); } });
  assert.equal(await audio.unlock(), false);
  const fixture = setup(); fixture.context.resume = async () => { throw Error('gesture required'); };
  assert.equal(await fixture.audio.unlock(), false);
  assert.equal(await fixture.audio.play('sequence_pop'), false);
  assert.deepEqual(fixture.requests, []);
});

test('concurrent loads are deduplicated and Ogg decoding falls back to WAV', async () => {
  const fixture = setup({ contextOptions: { decode(data) {
    const path = new TextDecoder().decode(data);
    if (path.endsWith('.ogg')) throw Error('codec unsupported');
    return { name: path };
  } } });
  fixture.audio.init();
  const [a, b] = await Promise.all([fixture.audio.load('menu'), fixture.audio.load('menu')]);
  assert.equal(a, b);
  assert.equal(fixture.requests.length, 2);
  assert.ok(a.name.endsWith('.wav'));
  assert.equal(fixture.audio.pending.size, 0);
  assert.equal(await fixture.audio.load('menu'), a);
  assert.equal(fixture.requests.length, 2);
});

test('network failures resolve silently and a later load retries rather than caching failure', async () => {
  let online = false;
  const fixture = setup({ fetcher: async () => { if (!online) throw Error('offline'); return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) }; } });
  fixture.audio.init();
  assert.equal(await fixture.audio.load('menu'), null);
  assert.equal(fixture.audio.pending.size, 0);
  online = true;
  assert.ok(await fixture.audio.load('menu'));
  assert.equal(fixture.requests.length, 3);
});

test('entering gameplay cancels pending menu music and returning home permits the cached menu loop', async () => {
  const gate = deferred();
  const fixture = setup({ preferences: { master: true, bgm: true, sfx: false }, fetcher: async url => {
    await gate.promise;
    return { ok: true, arrayBuffer: async () => new TextEncoder().encode(url.pathname).buffer };
  } });
  await fixture.audio.unlock();
  fixture.audio.setScene('play');
  gate.resolve(); await settle();
  assert.equal(fixture.context.sources.length, 0);
  assert.equal(fixture.audio.currentLoop, null);
  assert.equal(fixture.audio.loops.size, 0);
  assert.equal(fixture.requests.length, 1);
  assert.ok(fixture.requests[0].includes(music.menu.file));
  fixture.audio.setScene('menu'); await settle();
  assert.equal(fixture.audio.currentLoop.scene, 'menu');
  assert.equal(fixture.audio.loops.size, 1);
  assert.equal(fixture.requests.length, 1);
});

test('entering gameplay immediately stops menu BGM while retaining the saved music preference', async () => {
  const { audio, context } = await ready({ preferences: { master: true, bgm: true, sfx: false } });
  const source = audio.currentLoop.source;
  assert.equal(source.loopEnd, music.menu.duration);
  assert.equal(source.loop, true);
  context.advance(5);
  audio.setScene('play');
  assert.equal(audio.currentLoop, null);
  assert.ok(source.stoppedAt <= context.currentTime, 'music must stop before the gameplay scene returns');
  assert.equal(audio.musicGain.gain.value, 0);
  assert.equal(audio.preferences.bgm, true);
  await settle();
  assert.equal(audio.loops.size, 0);
  assert.equal(source.disconnected, true);
  assert.equal(context.sources.length, 1);
  context.advance(2);
  audio.setScene('menu'); await settle();
  assert.equal(audio.currentLoop.scene, 'menu');
  assert.equal(audio.currentLoop.source.loopEnd, music.menu.duration);
  assert.equal(audio.currentLoop.source.loop, true);
  assert.equal(audio.loops.size, 1);
});

test('gameplay also stops older menu sources that are already fading out', async () => {
  const { audio, context } = await ready({ preferences: { master: true, bgm: true, sfx: true } });
  const oldSource = audio.currentLoop.source;
  audio.setPreferences({ bgm: false }); await settle();
  audio.setPreferences({ bgm: true }); await settle();
  assert.notEqual(audio.currentLoop.source, oldSource);
  audio.setScene('play');
  for (const source of context.sources.filter(source => source.loop)) {
    assert.ok(source.stoppedAt <= context.currentTime, 'all music sources, including fading ones, must stop immediately');
  }
  await settle();
  assert.equal(audio.loops.size, 0);
  assert.equal(audio.currentLoop, null);
});

test('gameplay never loads or starts BGM on unlock, preference changes, modal changes or background resume', async () => {
  for (const sfx of [false, true]) {
    const { audio, context, requests } = setup({ preferences: { master: true, bgm: true, sfx } });
    audio.setScene('play');
    await audio.unlock(); await settle();
    audio.setPreferences({ bgmVolume: .4 }); await settle();
    audio.setPreferences({ bgm: false }); await settle();
    audio.setPreferences({ bgm: true, bgmVolume: 1 }); await settle();
    audio.setPreferences({ master: false }); await settle();
    audio.setPreferences({ master: true }); await settle();
    audio.setModal(true); audio.setModal(false);
    audio.setHidden(true); await settle();
    audio.setHidden(false); await settle();
    await audio.unlock(); await settle();
    assert.equal(audio.scene, 'play');
    assert.equal(audio.currentLoop ?? null, null);
    assert.equal(audio.loops.size, 0);
    assert.equal(audio.musicGain?.gain.value ?? 0, 0);
    assert.equal(context.sources.filter(source => source.loop).length, 0);
    assert.deepEqual(requests.filter(path => path.includes('/music/')), []);
  }
});

test('a resume completing after navigation into gameplay cannot start BGM', async () => {
  const resumeGate = deferred();
  const { audio, context, requests } = setup({
    preferences: { master: true, bgm: true, sfx: true }, contextOptions: { resumeGate },
  });
  const unlocking = audio.unlock();
  audio.setScene('play'); resumeGate.resolve();
  await unlocking; await settle();
  assert.equal(context.sources.filter(source => source.loop).length, 0);
  assert.deepEqual(requests.filter(path => path.includes('/music/')), []);
});

test('returning to menu respects music, master and volume preferences', async () => {
  for (const muted of [{ bgm: false }, { master: false }, { bgmVolume: 0 }]) {
    const { audio, context } = await ready({ preferences: { master: true, bgm: true, sfx: true, ...muted } });
    audio.setScene('play'); await settle();
    audio.setScene('menu'); await settle();
    assert.equal(context.sources.filter(source => source.loop).length, 0);
    audio.setPreferences({ master: true, bgm: true, bgmVolume: .65 }); await settle();
    assert.equal(audio.currentLoop.scene, 'menu');
    assert.equal(audio.loops.size, 1);
  }
});

test('muting while a loop is loading prevents any late music source', async () => {
  const gate = deferred();
  const fixture = setup({ preferences: { master: true, bgm: true, sfx: false }, fetcher: async () => {
    await gate.promise; return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) };
  } });
  await fixture.audio.unlock(); fixture.audio.setPreferences({ master: false });
  gate.resolve(); await settle();
  assert.equal(fixture.context.sources.length, 0);
  assert.equal(fixture.context.state, 'suspended');
});

test('selection sounds throttle fast drags and transient polyphony is bounded', async () => {
  const { audio, context, clock } = await ready();
  assert.equal(await audio.select(1), true);
  clock.value = 30;
  assert.equal(await audio.select(2), false);
  clock.value = 60;
  assert.equal(await audio.select(2), true);
  await audio.play('star_collect'); await audio.play('sequence_pop'); await settle();
  assert.equal(audio.voices.size, 3);
  assert.equal(context.sources.length, 4);
  assert.equal(context.sources[0].disconnected, true);
});

test('all five melodic tile notes and the existing game effects remain playable in gameplay', async () => {
  const { audio, context, clock } = await ready({ preferences: { master: true, bgm: true, sfx: true } });
  audio.setScene('play'); await settle();
  for (let note = 1; note <= 5; note++) {
    clock.value = note * 60;
    assert.equal(await audio.select(note), true);
    assert.ok(context.sources.at(-1).buffer.name.endsWith(`/select_${note}.wav`));
    assert.notEqual(context.sources.at(-1).loop, true);
  }
  for (const effect of ['invalid_soft', 'sequence_pop', 'star_collect', 'mango_hint']) {
    assert.equal(await audio.play(effect), true);
    assert.ok(context.sources.at(-1).buffer.name.endsWith(`/${effect}.wav`));
  }
  assert.equal(audio.currentLoop, null);
  assert.equal(audio.musicGain.gain.value, 0);
  assert.equal(await audio.play('ui_tap'), false);
});

test('clear, retry and completion jingles remain audible in gameplay without reactivating BGM', async () => {
  const { audio, context } = await ready({ preferences: { master: true, bgm: true, sfx: true } });
  audio.setScene('play'); await settle();
  for (const [won, complete, file] of [
    [true, false, '03_stage_clear.wav'],
    [false, false, '04_gentle_retry.wav'],
    [true, true, '05_all_stars_complete.wav'],
  ]) {
    assert.equal(await audio.result(won, complete), true);
    assert.ok(audio.jingle.source.buffer.name.endsWith(file));
    assert.equal(audio.jingle.gain.gain.value, .85);
    assert.equal(audio.effectsGain.gain.value, audio.preferences.sfxVolume);
    assert.equal(audio.musicGain.gain.value, 0);
    assert.equal(audio.currentLoop, null);
    audio.jingle.source.finish();
    assert.equal(audio.musicGain.gain.value, 0);
  }
  assert.equal(context.sources.filter(source => source.loop && !source.ended).length, 0);
});

test('late effects drop instead of playing out of time, and a scene change cancels pending effects', async () => {
  const fixture = await ready();
  fixture.audio.buffers.delete('sequence_pop');
  let gate = deferred();
  fixture.audio.fetcher = async () => { await gate.promise; return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) }; };
  const late = fixture.audio.play('sequence_pop'); fixture.clock.value = 251; gate.resolve();
  assert.equal(await late, false);
  fixture.audio.buffers.delete('sequence_pop'); gate = deferred();
  const cancelled = fixture.audio.play('sequence_pop'); fixture.audio.setScene('play'); gate.resolve();
  assert.equal(await cancelled, false);
  assert.equal(fixture.context.sources.length, 0);
});

test('a menu jingle replaces effects, ducks music, suppresses other effects and restores the previous modal level', async () => {
  const { audio } = await ready({ preferences: { master: true, bgm: true, sfx: true, bgmVolume: .6, sfxVolume: .7 } });
  audio.setModal(true);
  assert.equal(audio.musicGain.gain.value, .6 * .55);
  await audio.play('sequence_pop');
  assert.equal(await audio.result(true), true);
  await settle();
  assert.equal(audio.voices.size, 1);
  assert.equal(audio.musicGain.gain.value, .6 * .2);
  assert.equal(await audio.play('sequence_pop'), false);
  audio.jingle.source.finish();
  assert.equal(audio.jingle, null);
  assert.equal(audio.musicGain.gain.value, .6 * .55);
});

test('replacing or cancelling a pending jingle cannot resurrect the old result', async () => {
  const fixture = await ready();
  fixture.audio.buffers.delete('clear');
  const gate = deferred();
  fixture.audio.fetcher = async () => { await gate.promise; return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) }; };
  const old = fixture.audio.result(true);
  assert.equal(await fixture.audio.result(false), true);
  gate.resolve(); assert.equal(await old, false);
  assert.equal(fixture.audio.voices.size, 1);
  assert.ok(fixture.audio.jingle.source.buffer.name.endsWith('04_gentle_retry.wav'));
  fixture.audio.setScene('menu'); await settle();
  assert.equal(fixture.audio.jingle, null);
  assert.equal(fixture.audio.voices.size, 0);
});

test('preference updates persist independently, support mute, and survive blocked writes', async () => {
  const { audio, context, store } = await ready({ preferences: { master: true, bgm: true, sfx: true } });
  audio.setPreferences({ bgm: false, sfxVolume: .35 }); await settle();
  assert.equal(audio.preferences.sfx, true);
  assert.equal(audio.preferences.sfxVolume, .35);
  assert.equal(store.getItem('sequencepang2-sound'), 'on');
  assert.deepEqual(readAudioPreferences(store), audio.preferences);
  audio.setPreferences({ master: false }); await settle();
  assert.equal(context.state, 'suspended');
  assert.equal(audio.currentLoop, null);
  assert.equal(audio.voices.size, 0);
  audio.storage = { setItem() { throw Error('quota'); } };
  assert.doesNotThrow(() => audio.setPreferences({ master: true, sfxVolume: 20 }));
  await settle();
  assert.equal(audio.preferences.sfxVolume, 1);
  assert.equal(audio.preferences.bgm, false);
});

test('background suspends audio, cancels transients and resumes the same loop without duplicates', async () => {
  const { audio, context } = await ready({ preferences: { master: true, bgm: true, sfx: true } });
  const loop = audio.currentLoop;
  await audio.result(true);
  audio.setHidden(true); await settle();
  assert.equal(context.state, 'suspended');
  assert.equal(audio.voices.size, 0);
  assert.equal(audio.ready, false);
  assert.equal(await audio.play('sequence_pop'), false);
  audio.setHidden(false); await settle();
  assert.equal(context.state, 'running');
  assert.equal(audio.currentLoop, loop);
  assert.equal(audio.loops.size, 1);
  audio.setHidden(true); audio.setPreferences({ master: false }); audio.setHidden(false); await settle();
  assert.equal(context.state, 'suspended');
});

test('a resume completing while hidden immediately re-suspends without loading or playing', async () => {
  const resumeGate = deferred();
  const { audio, context, requests } = setup({ contextOptions: { resumeGate } });
  const unlocking = audio.unlock();
  audio.setHidden(true); resumeGate.resolve();
  assert.equal(await unlocking, false);
  assert.equal(context.state, 'suspended');
  assert.deepEqual(requests, []);
});

test('dispose stops voices and late decoding cannot retain buffers or restart audio', async () => {
  const fixture = await ready({ preferences: { master: true, bgm: true, sfx: true } });
  await fixture.audio.play('sequence_pop');
  fixture.audio.buffers.delete('menu');
  const gate = deferred(); fixture.context.decode = async () => { await gate.promise; return { name: 'late' }; };
  const late = fixture.audio.load('menu'); await settle();
  fixture.audio.dispose(); gate.resolve();
  assert.equal(await late, null);
  await settle();
  assert.equal(fixture.context.state, 'closed');
  assert.equal(fixture.audio.voices.size, 0);
  assert.equal(fixture.audio.buffers.size, 0);
  assert.equal(fixture.audio.currentLoop, null);
  assert.equal(fixture.audio.pending.size, 0);
  assert.equal(await fixture.audio.unlock(), false);
});

test('audio controls exist only in Settings and app wiring preserves game sounds without generic button beeps', async () => {
  const [app, html, css] = await Promise.all(['app.js', 'index.html', 'style.css'].map(file =>
    readFile(new URL(`../dist/${file}`, import.meta.url), 'utf8')));
  for (const source of [app, html, css]) assert.doesNotMatch(source, /home-audio/);
  assert.doesNotMatch(html, /audio-button/);
  assert.doesNotMatch(app, /ui_tap/);
  assert.match(html, /id="home-settings"/);
  assert.match(html, /id="game-settings"/);
  const settings = app.match(/function settings\(\)\s*\{[\s\S]*?(?=\nfunction\s)/)?.[0];
  assert.ok(settings, 'Settings contains the audio preference controls');
  for (const id of ['settings-master', 'settings-bgm', 'settings-sound', 'bgm-volume', 'sfx-volume']) {
    assert.ok(settings.includes(`id="${id}"`), id);
  }
  assert.match(settings, /gameAudio\.setPreferences\(/);
  assert.doesNotMatch(app.replace(settings, ''), /gameAudio\.setPreferences\(/);
  assert.match(app, /gameAudio\.setScene\('play'\)/);
  assert.match(app, /gameAudio\.select\(selected\.length\)/);
  assert.match(app, /gameAudio\.result\(won\)/);
  assert.match(app, /gameAudio\.result\(true, true\)/);
  for (const effect of ['invalid_soft', 'sequence_pop', 'star_collect', 'mango_hint']) {
    assert.ok(app.includes(`gameAudio.play('${effect}')`), effect);
  }
});

test('shipped WAV compatibility tracks keep exact stereo loop durations', async () => {
  for (const [scene, spec] of Object.entries(music)) {
    const bytes = await readFile(new URL(`../dist/audio/music/${spec.file}.wav`, import.meta.url));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    let offset = 12, sampleRate, channels, blockAlign, dataBytes;
    while (offset + 8 <= bytes.length) {
      const name = bytes.toString('ascii', offset, offset + 4), length = bytes.readUInt32LE(offset + 4);
      if (name === 'fmt ') { assert.equal(bytes.readUInt16LE(offset + 8), 1); channels = bytes.readUInt16LE(offset + 10); sampleRate = bytes.readUInt32LE(offset + 12); blockAlign = bytes.readUInt16LE(offset + 20); }
      if (name === 'data') dataBytes = length;
      offset += 8 + length + (length % 2);
    }
    assert.equal(channels, 2);
    assert.equal(dataBytes / blockAlign / sampleRate, spec.duration, scene);
  }
});
