import { GameAudio } from './audio.js';
import { kind, adjacent, stars } from './engine.js';
import { levels as allLevels } from './levels.js';
import { playableLevels, hundredStageRelease } from './release.js';
import { GameSession } from './session.js';
import { readProgress, saveProgress, restoreRun, saveRun, nextStageIndex, resetProgress, campaignComplete } from './progress.js';
import { dragTargets, dragHits } from './drag-hit.js';
import { MangoHints, firstHint, hintTier } from './hints.js';

const $ = id => document.getElementById(id);
let levels = playableLevels(allLevels);
let session;
try { session = restoreRun(localStorage, levels); } catch {}
session ||= new GameSession(levels);
const modal = $('modal');
let selected = [];
let dragging = false, moved = false, gesture;
let resultOpen = false;
let progress = {};
let hintStorage;
try { hintStorage = localStorage; } catch {}
let hints = new MangoHints(hintStorage, levels);
let visibleHint = [];
try { progress = readProgress(localStorage, levels); } catch {}
const gameAudio = new GameAudio({ storage: hintStorage });
function persistRun() { try { saveRun(localStorage, session); } catch {} }
// The capture phase unlocks Web Audio inside a real input, before game handlers.
function unlockAudio(event) { if (event.isTrusted) void gameAudio.unlock(); }
document.addEventListener('pointerdown', unlockAudio, { capture: true });
document.addEventListener('keydown', unlockAudio, { capture: true });
document.addEventListener('click', unlockAudio, { capture: true });


function message(text, good = false) {
  $('feedback').removeAttribute('aria-label');
  $('feedback').textContent = text;
  $('feedback').classList.toggle('good', good);
}

function closeModal() {
  resultOpen = false;
  modal.close();
  gameAudio.setModal(false);
  if (visibleHint.length && !$('game').hidden) paintHint();
}

function refreshRelease() {
  const available = playableLevels(allLevels);
  if (available.length === levels.length) return false;
  levels = available;
  session.levels = levels;
  return true;
}

function showHome() {
  gameAudio.setScene('menu');
  refreshRelease();
  stopHintMotion();
  visibleHint = [];
  closeModal();
  dragging = false;
  selected = [];
  $('home').hidden = false;
  $('game').hidden = true;
  $('coming-soon').hidden = true;
  $('home-cleared').textContent = levels.filter(level => progress[level.key] === true).length;
  $('home-total').textContent = `/ ${levels.length}`;
  $('release-note').hidden = levels.length < 100;
  const next = ['playing', 'failed'].includes(session.status) ? session.index : nextStageIndex(levels, progress);
  $('resume-note').textContent = session.status === 'playing' || next > 0 ? `STAGE ${String(next + 1).padStart(2, '0')}에서 이어서` : '첫 번째 별을 만나러 가요';
  if (campaignComplete(levels, progress)) $('resume-note').textContent = '모든 스테이지를 클리어했어요!';
}

function showGame() {
  gameAudio.setScene('play');
  visibleHint = [];
  closeModal();
  $('home').hidden = true;
  $('coming-soon').hidden = true;
  $('game').hidden = false;
  render();
}

function load(index) {
  session.start(index);
  persistRun();
  selected = [];
  dragging = false;
  showGame();
  message('별을 모두 모아 보세요');
}

function render(previousBoard) {
  const { board, moves, index, level } = session;
  $('stage-no').textContent = String(index + 1).padStart(2, '0');
  $('moves').textContent = moves;
  $('lesson').hidden = !level.lesson;
  $('lesson').textContent = level.lesson || '';
  $('board').setAttribute('aria-label', `${level.n}×${level.n} 수열 퍼즐판`);
  $('star-count').textContent = `${stars(level.board) - stars(board)} / ${stars(level.board)}`;
  $('board').style.setProperty('--n', level.n);
  $('board').innerHTML = board.map((cell, i) => cell ? `
    <button class="tile${cell.star ? ' starred' : ''}" data-i="${i}"
      aria-label="${Math.floor(i / level.n) + 1}행 ${i % level.n + 1}열, ${cell.v}${cell.star ? ', 별' : ''}" aria-pressed="false">
      <span>${cell.v}</span>${cell.star ? '<span class="star" aria-hidden="true">★</span>' : ''}
    </button>` : '<div class="empty" aria-hidden="true"></div>').join('');
  $('submit').hidden = selected.length < 3 || dragging;
  renderHint();
  fitBoard();
  if (previousBoard && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (const tile of $('board').querySelectorAll('[data-i]')) {
      const i = +tile.dataset.i, before = previousBoard.findIndex(c => c?.id === board[i].id);
      const rows = Math.floor(i / level.n) - Math.floor(before / level.n);
      if (before >= 0 && rows > 0) {
        const gap = parseFloat(getComputedStyle($('board')).gap) || 0;
        tile.style.setProperty('--fall-y', `${-rows * (tile.offsetHeight + gap)}px`);
        tile.classList.add('falling');
      }
    }
  }
  paint();
}

// Size against the visible viewport and actual text height, including tutorials.
// A small minimum keeps numbers touchable; tiny landscape windows may scroll.
function fitBoard() {
  if ($('game').hidden) return;
  const game = $('game'), css = getComputedStyle(game);
  const paddingY = parseFloat(css.paddingTop) + parseFloat(css.paddingBottom);
  const paddingX = parseFloat(css.paddingLeft) + parseFloat(css.paddingRight);
  let controls = 0;
  for (const element of game.children) {
    if (element.classList.contains('board-frame') || element.hidden) continue;
    const style = getComputedStyle(element);
    if (style.display === 'none') continue;
    controls += element.getBoundingClientRect().height + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
  }
  const visibleHeight = window.visualViewport?.height || window.innerHeight;
  const minBoard = session.level.n === 5 ? 250 : 220;
  const size = Math.floor(Math.min(game.clientWidth - paddingX, Math.max(minBoard, visibleHeight - paddingY - controls - 8)));
  game.querySelector('.board-frame').style.width = `${size}px`;
}

function paint() {
  const showSubmit = selected.length >= 3 && !dragging;
  if ($('submit').hidden === showSubmit) { $('submit').hidden = !showSubmit; fitBoard(); }
  document.querySelectorAll('.tile').forEach(element => {
    const i = +element.dataset.i;
    element.classList.toggle('selected', selected.includes(i));
    element.setAttribute('aria-pressed', String(selected.includes(i)));
  });
  const shell = $('board').parentElement.getBoundingClientRect();
  $('lines').querySelector('polyline').setAttribute('points', selected.map(i => {
    const element = $('board').querySelector(`[data-i="${i}"]`);
    if (!element) return '';
    const bounds = element.getBoundingClientRect();
    return `${bounds.x + bounds.width / 2 - shell.x},${bounds.y + bounds.height / 2 - shell.y}`;
  }).join(' '));
  paintHint();
}

let hintAnimations = [], hintAnimationKey = '';
const reducedHintMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
function stopHintMotion() {
  hintAnimations.forEach(animation => animation.cancel());
  hintAnimations = []; hintAnimationKey = '';
  $('hint-lines').classList.remove('demonstrating', 'still-hint');
  $('hint-lines').querySelector('polyline').setAttribute('points', '');
}

function renderHint() {
  const level = session.level, path = firstHint(level);
  $('mango-hint').hidden = !path;
  if (!path) return;
  const failures = hints.failures(level), tier = hintTier(failures);
  const button = $('ask-mango');
  button.style.setProperty('--unripe', `${100 - Math.min(3, failures) / 3 * 100}%`);
  button.classList.toggle('ripe', tier > 0);
  button.classList.toggle('full-hint', tier === 2);
  button.disabled = tier === 0 || session.status !== 'playing';
  button.setAttribute('aria-label', visibleHint.length ? '힌트 숨기기' : tier === 2 ? '망고 힌트: 첫 연결 시범 보기' : tier === 1 ? '망고 힌트: 첫 숫자 보기' : `망고 힌트, 실패 ${failures}/3`);
  button.setAttribute('aria-pressed', String(visibleHint.length > 0));
}

function paintHint() {
  const path = !session.history.length && !$('game').hidden && !modal.open ? visibleHint : [];
  for (const tile of $('board').querySelectorAll('[data-i]')) {
    tile.classList.toggle('hint-start', path[0] === +tile.dataset.i);
    tile.classList.remove('hinted');
    tile.querySelector('.hint-sparkles')?.remove();
    tile.removeAttribute('aria-describedby');
    if (path[0] === +tile.dataset.i) {
      tile.setAttribute('aria-describedby', 'hint-announcement');
      const sparks = document.createElement('span');
      sparks.className = 'hint-sparkles'; sparks.setAttribute('aria-hidden', 'true');
      sparks.innerHTML = '<i>✦</i><i>✧</i><i>✦</i>';
      tile.append(sparks);
    }
  }
  if (path.length < 2) { stopHintMotion(); return; }
  const shell = $('board').parentElement.getBoundingClientRect();
  const points = path.map(i => {
    const bounds = $('board').querySelector(`[data-i="${i}"]`).getBoundingClientRect();
    return { x: bounds.x + bounds.width / 2 - shell.x, y: bounds.y + bounds.height / 2 - shell.y };
  });
  const key = JSON.stringify([points, reducedHintMotion.matches]);
  if (key === hintAnimationKey) return;
  stopHintMotion(); hintAnimationKey = key;
  const overlay = $('hint-lines'), line = overlay.querySelector('polyline');
  line.setAttribute('points', points.map(p => `${p.x},${p.y}`).join(' '));
  const distances = [0];
  for (let i = 1; i < points.length; i++) distances.push(distances[i-1] + Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y));
  const length = distances.at(-1);
  if (!length) return;
  if (reducedHintMotion.matches) {
    overlay.classList.add('still-hint');
    line.style.strokeDasharray = 'none'; line.style.strokeDashoffset = '0';
    return;
  }
  overlay.classList.add('demonstrating');
  const timing = { duration: 2800, iterations: Infinity, easing: 'linear' };
  line.style.strokeDasharray = `${length} ${length}`;
  hintAnimations.push(line.animate([
    {strokeDashoffset:length,opacity:0,offset:0},
    {strokeDashoffset:length,opacity:.9,offset:.14},
    {strokeDashoffset:0,opacity:.9,offset:.7},
    {strokeDashoffset:0,opacity:.9,offset:.82},
    {strokeDashoffset:0,opacity:0,offset:.94},
    {strokeDashoffset:0,opacity:0,offset:1},
  ],timing));
  const at = (p,opacity,offset) => ({transform:`translate(${p.x}px, ${p.y}px)`,opacity,offset});
  for (const circle of overlay.querySelectorAll('circle')) {
    hintAnimations.push(circle.animate([
      at(points[0],0,0), at(points[0],1,.14),
      ...points.slice(1).map((p,i) => at(p,1,.14+.56*distances[i+1]/length)),
      at(points.at(-1),1,.82), at(points.at(-1),0,.94), at(points.at(-1),0,1),
    ],timing));
  }
}

function revealHint() {
  const path = firstHint(session.level), tier = hintTier(hints.failures(session.level));
  if (!path || !tier) return;
  if (session.history.length || session.status !== 'playing') load(session.index);
  else { selected = []; dragging = false; closeModal(); }
  visibleHint = tier === 1 ? path.slice(0, 1) : path;
  void gameAudio.play('mango_hint');
  renderHint(); fitBoard(); paint();
  message('별을 모두 모아 보세요');
  const position = i => `${Math.floor(i / session.level.n) + 1}행 ${i % session.level.n + 1}열`;
  $('hint-announcement').textContent = tier === 1 ? `첫 숫자 힌트: ${position(path[0])}의 ${session.board[path[0]].v}` : `첫 연결 힌트: ${path.map(i => `${position(i)}의 ${session.board[i].v}`).join(', 다음 ')}`;
}

function askMango() {
  if (!firstHint(session.level) || !hintTier(hints.failures(session.level))) return;
  if (visibleHint.length) { visibleHint = []; renderHint(); paint(); message('별을 모두 모아 보세요'); return; }
  if (!session.history.length) { revealHint(); return; }
  show(`<h2 id="modal-title">다시 시작할까요?</h2><p class="reset-copy">힌트는 처음 배치에서 보여줘요.</p><button id="restart-with-hint" class="primary">다시 시작 · 힌트 보기</button><button id="keep-playing" class="secondary">계속 풀어보기</button>`);
  $('close-modal').hidden = true;
  $('restart-with-hint').onclick = revealHint;
  $('keep-playing').onclick = closeModal;
}

function pick(i) {
  if (modal.open || session.status !== 'playing' || !session.board[i]) return false;
  if (selected.length > 1 && selected.at(-2) === i) selected.pop();
  else if (!selected.includes(i) && (!selected.length || adjacent(selected.at(-1), i, session.level.n))) selected.push(i);
  else return false;
  if (visibleHint.length) { visibleHint = []; renderHint(); $('hint-announcement').textContent = ''; }
  paint();
  void gameAudio.select(selected.length);
  if (selected.length) {
    const values = selected.map(i => session.board[i].v), sequence = kind(values);
    message(`${values.join(' · ')}${sequence ? ' — ' + sequence : ''}`, !!sequence);
  }
  return true;
}

function commit() {
  if (modal.open || !selected.length) return;
  const previousBoard = session.board;
  const result = session.play(selected);
  selected = [];
  if (!result) {
    paint();
    message('등차·등비수열 3개 이상을 연결해 주세요');
    void gameAudio.play('invalid_soft');
    return;
  }
  if (result.status === 'playing') {
    void gameAudio.play('sequence_pop');
    if (stars(previousBoard) > stars(session.board)) void gameAudio.play('star_collect');
  }
  visibleHint = [];
  if (result.status === 'failed') hints.recordFailure(session);
  render(previousBoard);
  message(`${result.sequence} 팡!`, true);
  if (result.status === 'cleared') {
    progress[session.level.key] = true;
    try { saveProgress(localStorage, progress); } catch {}
    showResult(true);
  } else if (result.status === 'failed') showResult(false);
  persistRun();
}

function show(content, isResult = false) {
  dragging = false;
  selected = [];
  if (!$('game').hidden) paint();
  resultOpen = isResult;
  $('close-modal').hidden = isResult;
  $('modal-content').innerHTML = content;
  if (!modal.open) modal.showModal();
  gameAudio.setModal(!isResult);
  stopHintMotion();
}

function showComingSoon() {
  gameAudio.setScene('menu');
  closeModal();
  dragging = false;
  selected = [];
  $('home').hidden = true;
  $('game').hidden = true;
  $('coming-soon').hidden = false;
  $('complete-count').textContent = `${levels.length} STAGES CLEAR`;
  $('complete-copy').textContent = `준비된 ${levels.length}개의 스테이지를 모두 클리어했어요!`;
  // No old replay may take priority over newly released stages on a later visit.
  session = new GameSession(levels);
  persistRun();
  $('coming-title').focus({ preventScroll: true });
}

function showResult(won) {
  refreshRelease();
  if (won && session.index === levels.length - 1) { showComingSoon(); void gameAudio.result(true, true); return; }
  void gameAudio.result(won);
  show(`<div class="result-content ${won ? 'cleared' : 'failed'}">
    <div class="result-stage">STAGE ${String(session.index + 1).padStart(2, '0')}</div>
    <div class="result-symbol" aria-hidden="true">${won ? '★ ★ ★' : '☆'}</div>
    <h2 id="modal-title">${won ? '성공!' : '실패!'}</h2>
    <p>${won ? '별을 모두 모았어요.' : (session.moves === 0 ? '남은 횟수를 모두 썼어요.' : '더 이상 연결할 수 없어요.')}</p>
    <button class="primary" id="result-action">${won ? '다음 스테이지' : '재도전'}</button>
    ${!won && firstHint(session.level) && hintTier(hints.failures(session.level)) ? '<button class="secondary result-hint" id="result-hint">🥭 힌트 보고 재도전</button>' : ''}
    <button class="secondary" id="result-home">메인으로</button>
  </div>`, true);
  $('result-action').onclick = () => {
    if (won) {
      load(session.index + 1);
    } else if (session.retry()) {
      persistRun();
      selected = [];
      showGame();
      message('숫자 3개 이상을 이어 보세요');
    }
  };
  $('result-home').onclick = showHome;
  if ($('result-hint')) $('result-hint').onclick = revealHint;
}

function settings() {
  const playing = !$('game').hidden;
  const p = gameAudio.preferences;
  show(`<h2 id="modal-title">설정</h2>
    <div class="settings-list">
      <button id="settings-master" aria-pressed="${p.master}">전체 소리 <span>${p.master ? '켜짐' : '음소거'}</span></button>
      <button id="settings-bgm" aria-pressed="${p.bgm}">메인 배경음악 <span>${p.bgm ? '켜짐' : '꺼짐'}</span></button>
      <label class="audio-volume" for="bgm-volume">음악 음량 <output id="bgm-value">${Math.round(p.bgmVolume * 100)}%</output><input id="bgm-volume" type="range" min="0" max="100" step="5" value="${p.bgmVolume * 100}"></label>
      <button id="settings-sound" aria-pressed="${p.sfx}">효과음 <span>${p.sfx ? '켜짐' : '꺼짐'}</span></button>
      <label class="audio-volume" for="sfx-volume">효과음 음량 <output id="sfx-value">${Math.round(p.sfxVolume * 100)}%</output><input id="sfx-volume" type="range" min="0" max="100" step="5" value="${p.sfxVolume * 100}"></label>
      ${playing ? '<button id="settings-restart">다시하기 <span>↻</span></button><button id="settings-home">메인화면 <span>⌂</span></button>' : ''}
      <button id="settings-reset" class="reset-setting">게임 초기화 <span>↺</span></button>
    </div>${playing ? '<p class="settings-note">스테이지를 기억해요. 나갔다 돌아오면 그 판을 처음부터 시작해요.</p>' : ''}`);
  for (const [id, key] of [['settings-master', 'master'], ['settings-bgm', 'bgm'], ['settings-sound', 'sfx']]) {
    $(id).onclick = () => { gameAudio.setPreferences({ [key]: !gameAudio.preferences[key] }); settings(); $(id).focus(); };
  }
  for (const key of ['bgm', 'sfx']) {
    $(key + '-volume').oninput = event => {
      const value = Number(event.target.value);
      gameAudio.setPreferences({ [key + 'Volume']: value / 100 });
      $(key + '-value').textContent = value + '%';
    };
  }
  if (playing) {
    $('settings-restart').onclick = () => { session.restart(); persistRun(); showGame(); message('처음부터 다시 시작해요'); };
    $('settings-home').onclick = showHome;
  }
  $('settings-reset').onclick = confirmReset;
}

function confirmReset() {
  show(`<h2 id="modal-title">처음부터 시작할까요?</h2>
    <p class="reset-copy">클리어 기록, 망고 힌트와 진행 중인 판을 지우고<br>1스테이지부터 다시 시작해요.</p>
    <p id="reset-error" class="reset-error" role="alert" hidden></p>
    <button id="confirm-reset" class="primary">기록 지우고 초기화</button>
    <button id="cancel-reset" class="secondary">취소</button>`);
  $('close-modal').hidden = true;
  $('cancel-reset').onclick = settings;
  $('confirm-reset').onclick = () => {
    let reset = false;
    try { reset = resetProgress(localStorage); } catch {}
    if (!reset) {
      $('reset-error').hidden = false;
      $('reset-error').textContent = '저장소에 접근할 수 없어 초기화하지 못했어요. 브라우저 설정을 확인해 주세요.';
      return;
    }
    progress = {};
    hints = new MangoHints(hintStorage, levels);
    visibleHint = [];
    session = new GameSession(levels);
    selected = [];
    showHome();
  };
}

function help(active = 'arithmetic') {
  const demos = {
    arithmetic: { title: '등차수열', values: [1, 2, 3], caption: '1 → 2 → 3 · 공차 +1', copy: '숫자가 같은 간격으로 변하면 연결할 수 있어요. <b>6 → 6 → 6</b>처럼 같은 숫자도 가능해요.' },
    geometric: { title: '등비수열', values: [2, 4, 8], caption: '2 → 4 → 8 · 공비 ×2', copy: '같은 수를 계속 곱해도 연결할 수 있어요. <b>9 → 3 → 1</b>처럼 작아지는 방향도 괜찮아요.' },
    gravity: { title: '별과 낙하', caption: '지우면 위의 숫자가 아래로!', copy: '제한된 이동 안에 <b>★ 붙은 타일을 모두</b> 모으세요. 별 없는 숫자는 남아도 돼요. 새 타일은 생기지 않아요.' }
  };
  const d = demos[active];
  show(`<h2 id="modal-title">플레이 방법</h2>
    <div class="help-tabs" role="group" aria-label="설명 선택">${Object.entries(demos).map(([key, demo]) => `<button data-demo="${key}" aria-pressed="${key === active}">${demo.title}</button>`).join('')}</div>
    <div class="help-demo" aria-label="${active === 'gravity' ? '아래쪽 1, 2, 3이 사라지고 위쪽 2, 4, 8이 내려오는 시범' : `${d.values.join(', ')}을 차례로 드래그하는 시범`}">
      ${active === 'gravity' ? `<div class="gravity-demo" aria-hidden="true">${[2,4,8,1,2,3].map((v,i) => `<span class="demo-tile">${v}${i === 3 || i === 5 ? '<b class="demo-star">★</b>' : ''}</span>`).join('')}</div>` : `<div class="demo-track" aria-hidden="true">${d.values.map((v,i) => `<span class="demo-tile">${v}${i === 2 ? '<b class="demo-star">★</b>' : ''}</span>`).join('')}<i class="demo-stroke"></i><span class="demo-hand">☝</span></div>`}
      <div class="demo-caption">${d.caption}</div><p class="motion-caption">${active === 'gravity' ? '아랫줄을 지우면 윗줄이 한 칸 내려와요.' : '왼쪽부터 오른쪽까지 누른 채로 이어요.'}</p>
    </div>
    <button id="demo-toggle" class="demo-toggle" aria-pressed="false">시범 멈추기</button>
    <p class="help-copy">${d.copy}</p>
    <p class="help-note">이웃한 숫자 <b>3개 이상</b>을 누른 채로 이어요. 대각선과 꺾이는 길도 가능해요. 잘못된 연결은 이동을 쓰지 않아요.</p>
    <p class="help-keyboard">키보드: Tab으로 이동 → Space로 선택 → 선택 완료. 시간제한은 없어요.</p>`);
  $('modal-content').querySelectorAll('[data-demo]').forEach(button => button.onclick = () => help(button.dataset.demo));
  $('demo-toggle').onclick = () => {
    const paused = $('modal-content').querySelector('.help-demo').classList.toggle('paused');
    $('demo-toggle').setAttribute('aria-pressed', String(paused));
    $('demo-toggle').textContent = paused ? '시범 재생하기' : '시범 멈추기';
  };
}

$('board').addEventListener('pointerdown', event => {
  if (dragging || modal.open || event.button !== 0 || !event.isPrimary || session.status !== 'playing') return;
  const tile = event.target.closest('[data-i]');
  if (!tile) return;
  event.preventDefault();
  dragging = true;
  moved = false;
  selected = [];
  pick(+tile.dataset.i);
  const board = $('board'), style = getComputedStyle(board);
  gesture = {
    pointerId: event.pointerId,
    point: { x: event.clientX, y: event.clientY },
    targets: dragTargets(board.getBoundingClientRect(), session.level.n,
      parseFloat(style.columnGap) || 0, parseFloat(style.rowGap) || 0, session.board),
  };
  $('board').setPointerCapture(event.pointerId);
});
function moveSelection(event) {
  const point = { x: event.clientX, y: event.clientY };
  for (const i of dragHits(gesture.point, point, gesture.targets)) {
    if (pick(i)) moved = true;
  }
  gesture.point = point;
}
$('board').addEventListener('pointermove', event => {
  if (!dragging || event.pointerId !== gesture?.pointerId) return;
  moveSelection(event);
});
$('board').addEventListener('pointerup', event => {
  if (!dragging || event.pointerId !== gesture?.pointerId) return;
  moveSelection(event);
  dragging = false;
  gesture = null;
  if (moved) commit();
  else { selected = []; paint(); message('누른 채로 숫자 3개 이상을 이으세요'); }
});
function cancelDrag() {
  if (!dragging) return;
  dragging = false;
  gesture = null;
  selected = [];
  paint();
  message('선택을 취소했어요');
}
$('board').addEventListener('pointercancel', cancelDrag);
$('board').addEventListener('lostpointercapture', cancelDrag);
$('board').addEventListener('click', event => {
  if (event.detail !== 0) return;
  const tile = event.target.closest('[data-i]');
  if (tile) pick(+tile.dataset.i);
});
$('board').addEventListener('keydown', event => {
  if (event.key === 'Escape') { selected = []; paint(); }
  if (event.key === 'Enter' && event.ctrlKey) { event.preventDefault(); commit(); }
});
$('submit').onclick = commit;
$('ask-mango').onclick = askMango;
$('start-game').onclick = () => {
  refreshRelease();
  if (campaignComplete(levels, progress)) { showComingSoon(); return; }
  if (['playing', 'failed'].includes(session.status)) load(session.index);
  else load(nextStageIndex(levels, progress));
};
$('game-settings').onclick = settings;
$('home-settings').onclick = settings;
$('game-home').onclick = showHome;
$('coming-home').onclick = showHome;
$('close-modal').onclick = closeModal;
modal.addEventListener('cancel', event => { if (resultOpen) event.preventDefault(); });
modal.addEventListener('close', () => gameAudio.setModal(false));
$('home-help').onclick = () => help();
window.addEventListener('pagehide', () => { persistRun(); stopHintMotion(); gameAudio.setHidden(true); });
window.addEventListener('pageshow', () => gameAudio.setHidden(document.hidden));
document.addEventListener('visibilitychange', () => {
  gameAudio.setHidden(document.hidden);
  if (document.hidden) { stopHintMotion(); return; }
  const opened = refreshRelease();
  if (opened && (!$('home').hidden || !$('coming-soon').hidden)) showHome();
  else if (!$('game').hidden) paintHint();
});
reducedHintMotion.addEventListener('change', () => { if (!$('game').hidden) paintHint(); });
function resizeGame() { if (!$('game').hidden) { cancelDrag(); fitBoard(); paint(); } }
window.addEventListener('resize', resizeGame);
window.visualViewport?.addEventListener('resize', resizeGame);
document.fonts?.ready.then(resizeGame);
showHome();
if (Date.now() < hundredStageRelease) {
  setTimeout(() => {
    if (refreshRelease() && (!$('home').hidden || !$('coming-soon').hidden)) showHome();
  }, hundredStageRelease - Date.now() + 50);
}
