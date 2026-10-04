import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const root = new URL('../dist/', import.meta.url);
const code = await readFile(new URL('sw.js', root), 'utf8');
const origin = 'https://game.example/';
const hosting = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url)));

function worker() {
  const handlers = {}, stores = new Map(), state = { online: true, claimed: false, skipped: false, failAsset: null };
  const key = value => typeof value === 'string' ? value : value.url;
  const fetch = async request => {
    if (!state.online) throw Error('offline');
    const path = new URL(key(request)).pathname.slice(1);
    if (path === state.failAsset) throw Error('download failed');
    const headers = new Headers();
    for (const rule of hosting.headers) {
      if (rule.source === '/(.*)' || rule.source === '/' + path) {
        for (const { key, value } of rule.headers) headers.set(key, value);
      }
    }
    return new Response(await readFile(new URL(path, root)), { headers });
  };
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async addAll(requests) { for (const request of requests) store.set(key(request), await fetch(request)); },
        async match(request) { return store.get(key(request))?.clone(); },
        async put(request, response) { store.set(key(request), response); }
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); }
  };
  vm.runInNewContext(code, {
    URL, Request, caches, fetch,
    self: {
      location: { href: origin + 'sw.js' },
      addEventListener(type, fn) { handlers[type] = fn; },
      clients: { async claim() { state.claimed = true; } },
      async skipWaiting() { state.skipped = true; }
    }
  });
  return { state, stores, caches,
    async emit(type, data = {}) {
      let result;
      handlers[type]({ ...data, waitUntil(promise) { result = promise; }, respondWith(promise) { result = promise; } });
      return await result;
    }
  };
}

test('manifest launches the named game and every declared PNG has the correct dimensions', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', root)));
  assert.equal(manifest.name, '시퀀스팡2');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.ok(manifest.icons.some(icon => icon.sizes === '192x192' && icon.purpose === 'any'));
  assert.ok(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'maskable'));
  for (const icon of [...manifest.icons, {src:'icons/apple-touch-icon.png',sizes:'180x180'}]) {
    const image = await readFile(new URL(icon.src, root));
    assert.equal(image.subarray(1,4).toString(), 'PNG');
    assert.equal(`${image.readUInt32BE(16)}x${image.readUInt32BE(20)}`, icon.sizes);
  }
});

test('after one successful install, navigation, all game modules, images and fonts work with no network', async () => {
  const w = worker();
  await w.emit('install');
  assert.equal(w.state.skipped, false, 'install must not force activation over an ongoing game');
  await w.emit('activate');
  assert.equal(w.state.claimed, true);
  w.state.online = false;
  const page = await w.emit('fetch', {request:{url:origin + '?source=homescreen',method:'GET',mode:'navigate'}});
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(page.headers.get('x-frame-options'), 'DENY', 'offline navigation retains framing protection');
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  assert.match(await page.text(), /시퀀스팡2/);
  for (const store of w.stores.values()) {
    for (const url of store.keys()) {
      const response = await w.emit('fetch', {request:{url,method:'GET',mode:'cors'}});
      assert.ok(response?.ok, `${url} must work offline`);
      assert.ok((await response.arrayBuffer()).byteLength > 0);
    }
  }
  const html = await readFile(new URL('index.html', root), 'utf8');
  assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic/);
});

test('a failed installation drops the incomplete cache and keeps the previous playable version', async () => {
  const w = worker();
  await w.caches.open('sequencepang2-shell-old');
  w.state.failAsset = 'levels.js';
  await assert.rejects(w.emit('install'), /download failed/);
  assert.deepEqual(await w.caches.keys(), ['sequencepang2-shell-old']);
  assert.equal(w.state.skipped, false);
});

test('activation cleans only this app caches; updates require an explicit message', async () => {
  const w = worker();
  await w.caches.open('another-game');
  await w.caches.open('sequencepang2-shell-old');
  await w.emit('install');
  await w.emit('message', {data:{type:'unrelated'}});
  assert.equal(w.state.skipped, false);
  await w.emit('message', {data:{type:'ACTIVATE_UPDATE'}});
  assert.equal(w.state.skipped, true);
  await w.emit('activate');
  const names = await w.caches.keys();
  assert.ok(names.includes('another-game'));
  assert.ok(!names.includes('sequencepang2-shell-old'));
});

test('the worker does not intercept external traffic, writes or unknown paths', async () => {
  const w = worker();
  for (const request of [
    {url:'https://external.example/index.html',method:'GET',mode:'navigate'},
    {url:origin+'app.js',method:'POST',mode:'cors'},
    {url:origin+'missing',method:'GET',mode:'navigate'}
  ]) assert.equal(await w.emit('fetch', {request}), undefined);
});


test('audio is optional at install, then cached for offline use without decoding or autoplay', async () => {
  const w = worker();
  w.state.failAsset = 'audio/music/01_mango_garden_menu.ogg';
  await w.emit('install');
  assert.equal(w.stores.size, 1);
  w.state.failAsset = null;
  const request = {url:origin + 'audio/music/01_mango_garden_menu.ogg',method:'GET',mode:'cors'};
  const online = await w.emit('fetch', {request});
  const bytes = await online.arrayBuffer();
  assert.ok(bytes.byteLength > 100000);
  await w.emit('activate');
  w.state.online = false;
  const offline = await w.emit('fetch', {request});
  assert.deepEqual(await offline.arrayBuffer(), bytes);
});
