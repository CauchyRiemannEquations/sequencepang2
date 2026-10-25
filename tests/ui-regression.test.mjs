// DOM integration, not browser/device E2E. Geometry, dialog and animation APIs
// are explicit stubs; layout arithmetic is verified separately from rendering.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { GameAudio } from '../dist/audio.js';
import * as engine from '../dist/engine.js';
import { levels as allLevels } from '../dist/levels.js';
import * as release from '../dist/release.js';
import { GameSession } from '../dist/session.js';
import * as progress from '../dist/progress.js';
import * as drag from '../dist/drag-hit.js';
import * as hints from '../dist/hints.js';
const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
const css = readFileSync(new URL('../dist/style.css', import.meta.url), 'utf8');
function app(t) {
  const dom = new JSDOM(html, {url:'https://game.example/',runScripts:'outside-only',pretendToBeVisual:true});
  t.after(() => dom.window.close());
  const w = dom.window, doc = w.document;
  const style = doc.createElement('style'); style.textContent = css; doc.head.append(style);
  Object.assign(w, {GameAudio,...engine,allLevels,...release,GameSession,...progress,...drag,...hints,structuredClone});
  w.matchMedia = () => ({matches:false,addEventListener(){}});
  w.Element.prototype.animate = () => ({cancel(){}});
  w.HTMLElement.prototype.getBoundingClientRect = function () {
    const i = Number(this.dataset.i)||0;
    return {x:(i%5)*60,y:Math.floor(i/5)*60,width:50,height:50};
  };
  Object.defineProperty(doc.getElementById('game'), 'clientWidth', {value:320});
  w.HTMLDialogElement.prototype.showModal = function () { this.open=true; this.querySelector('button')?.focus(); };
  w.HTMLDialogElement.prototype.close = function () { if(this.open) {this.open=false;this.dispatchEvent(new w.Event('close'));} };
  const run = code => vm.runInContext(code, dom.getInternalVMContext());
  run(source);
  return {w,doc,run};
}
function selectFirstMove(a) {
  a.run('load(8)');
  const solution = engine.solve(allLevels[8].board, allLevels[8].n, allLevels[8].moves);
  for (const i of solution[0]) {
    a.doc.querySelector(`[data-i="${i}"]`).focus();
    a.run(`pick(${i})`);
  }
}
for (const route of ['ctrl-enter', 'submit']) test(`keyboard focus survives ${route} board replacement`, t => {
  const a=app(t);selectFirstMove(a);
  if(route==='submit') {a.doc.getElementById('submit').focus();a.doc.getElementById('submit').click();}
  else a.doc.activeElement.dispatchEvent(new a.w.KeyboardEvent('keydown', {key:'Enter',ctrlKey:true,bubbles:true}));
  assert.equal(a.run('session.status'), 'playing');
  assert.ok(a.doc.activeElement.matches('#board [data-i]'));
});
test('pointer-driven replacement does not move keyboard focus onto the board', t => {
  const a=app(t);selectFirstMove(a);
  a.doc.getElementById('game-settings').focus();
  a.run('pointerCommit = true; commit(); pointerCommit = false');
  assert.equal(a.doc.activeElement.id, 'game-settings');
});
test('help replacement focuses the selected topic; dialog replacement keeps meaningful focus', t => {
  const a=app(t);a.run('help()');
  for(const topic of ['geometric','gravity','arithmetic']) {
    const button=a.doc.querySelector(`[data-demo="${topic}"]`);button.focus();button.click();
    assert.equal(a.doc.activeElement.dataset.demo,topic);
  }
  a.run('settings()');a.doc.getElementById('settings-reset').focus();a.doc.getElementById('settings-reset').click();
  assert.equal(a.doc.activeElement.id,'confirm-reset');
});
for(const route of ['button', 'native', 'cancel']) test(`full hint returns after ${route} dialog dismissal`, t => {
  const a=app(t);a.run('load(10); hints.counts[session.level.key]={failures:5}; revealHint(); settings()');
  const line=a.doc.getElementById('hint-lines'), modal=a.doc.getElementById('modal');
  assert.equal(line.classList.contains('demonstrating'),false);
  if(route==='button') a.doc.getElementById('close-modal').click();
  else if(route==='native') modal.close();
  else {const cancel=new a.w.Event('cancel',{cancelable:true});modal.dispatchEvent(cancel);if(!cancel.defaultPrevented)modal.close();}
  assert.equal(line.classList.contains('demonstrating'),true);
});
test('hidden-page dismissal does not animate until the page becomes visible', t => {
  const a=app(t);a.run('load(10); hints.counts[session.level.key]={failures:5}; revealHint(); settings()');
  Object.defineProperty(a.doc,'hidden',{configurable:true,value:true});
  a.doc.getElementById('modal').close();
  assert.equal(a.doc.getElementById('hint-lines').classList.contains('demonstrating'),false);
  Object.defineProperty(a.doc,'hidden',{configurable:true,value:false});
  a.doc.dispatchEvent(new a.w.Event('visibilitychange'));
  assert.equal(a.doc.getElementById('hint-lines').classList.contains('demonstrating'),true);
});
test('short viewports retain 44px cells with frame, shell and gaps included', t => {
  const a=app(t);Object.defineProperty(a.w,'innerHeight',{value:200});
  for(const index of [0,10,24]) {
    a.run(`load(${index}); fitBoard()`);
    const n=allLevels[index].n,frame=a.doc.querySelector('.board-frame'), shell=a.doc.querySelector('.board-shell');
    const inset=el=>{const s=a.w.getComputedStyle(el);return ['paddingLeft','paddingRight','borderLeftWidth','borderRightWidth'].reduce((v,k)=>v+(parseFloat(s[k])||0),0)};
    const gap=parseFloat(a.w.getComputedStyle(a.doc.getElementById('board')).gap);
    const minimum=parseFloat(frame.style.minWidth);
    assert.ok((minimum-inset(frame)-inset(shell)-(n-1)*gap)/n>=44);
  }
});
test('storage reset from another tab discards the old active session', t => {
  const a=app(t);a.run('load(8)');
  progress.resetProgress(a.w.localStorage);
  a.w.dispatchEvent(new a.w.StorageEvent('storage',{key:progress.progressEpochKey,storageArea:a.w.localStorage}));
  assert.equal(a.doc.getElementById('game').hidden,true);
  assert.equal(a.run('Object.keys(progress).length'),0);
  a.w.dispatchEvent(new a.w.Event('pagehide'));
  assert.equal(progress.restoreRun(a.w.localStorage,allLevels),null);
});

test('an invalid keyboard submission returns focus from the hidden submit button', t => {
  const a=app(t);a.run('load(8); selected = [0, 4, 8]; paint()');
  a.doc.getElementById('submit').focus();a.doc.getElementById('submit').click();
  assert.ok(a.doc.activeElement.matches('#board [data-i]'));
});

test('a stale queued close event cannot unmute or restore hints behind a reopened modal', t => {
  const a=app(t);a.run('load(10); hints.counts[session.level.key]={failures:5}; revealHint(); settings()');
  const modal=a.doc.getElementById('modal');
  modal.dispatchEvent(new a.w.Event('close'));
  assert.equal(modal.open,true);
  assert.equal(a.run('gameAudio.modal'),true);
  assert.equal(a.doc.getElementById('hint-lines').classList.contains('demonstrating'),false);
});
