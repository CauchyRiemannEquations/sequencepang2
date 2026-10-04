import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../dist/', import.meta.url);
const files = ['index.html', 'style.css', 'manifest.webmanifest', 'sequencepang2-logo-v2.jpg', 'mango-v2.png'];
for (const name of await readdir(root)) {
  if (name.endsWith('.js') && name !== 'sw.js') files.push(name);
}
for (const directory of ['icons', 'fonts']) {
  for (const name of await readdir(new URL(`${directory}/`, root))) {
    if (/\.(png|woff)$/.test(name)) files.push(`${directory}/${name}`);
  }
}
files.sort();
const audioFiles = [];
for (const directory of ['music', 'jingles', 'sfx']) {
  for (const name of await readdir(new URL(`audio/${directory}/`, root))) {
    if (/\.(ogg|wav)$/.test(name)) audioFiles.push(`audio/${directory}/${name}`);
  }
}
audioFiles.sort();
const template = await readFile(new URL('./sw-template.js', import.meta.url), 'utf8');
const hash = createHash('sha256').update(template);
// CacheStorage retains response headers too. Refresh cached pages when the
// hosting policy changes, even if none of the game assets changed.
hash.update(await readFile(new URL('../vercel.json', import.meta.url)));
for (const name of [...files, ...audioFiles]) hash.update(name).update(await readFile(new URL(name, root)));
const version = hash.digest('hex').slice(0, 16);
const output = template.replace('__VERSION__', version).replace('__ASSETS__', JSON.stringify(files.map(f => './' + f), null, 2)).replace('__AUDIO_ASSETS__', JSON.stringify(audioFiles.map(f => './' + f), null, 2));
const target = new URL('sw.js', root);
if (process.argv.includes('--check')) {
  if (await readFile(target, 'utf8') !== output) throw new Error('Offline bundle is stale. Run npm run build:pwa.');
} else await writeFile(target, output);
console.log(`PWA ${version}: ${files.length} offline assets`);
