import test from 'node:test';
import assert from 'node:assert/strict';
import { levels, chapters } from '../dist/levels.js';
import { paths, remove, stars, solveDetailed, valid } from '../dist/engine.js';
import { readProgress, saveProgress, progressKey } from '../dist/progress.js';
import { analyze } from '../scripts/generate-campaign.mjs';
import { campaignData } from '../dist/campaign-data.js';
import { GameSession } from '../dist/session.js';

test('campaign has 110 distinct boards and stable identities across eleven chapters', () => {
  assert.equal(levels.length, 110);
  assert.equal(new Set(levels.map(l => l.key)).size, 110);
  const boards = levels.map(l => JSON.stringify(l.board.map(c => c ? [c.v, c.star, !!c.frost] : null)));
  assert.equal(new Set(boards).size, 110);
  for (const level of levels) {
    assert.ok(chapters.some(c => c.id === level.chapter));
    assert.equal(level.board.length, level.n ** 2);
    assert.ok(stars(level.board) > 0);
  }
});

test('chapters contain ten stages and the original campaign keeps its difficulty curve', () => {
  assert.deepEqual(chapters.map(c => levels.filter(l => l.chapter === c.id).length), Array(11).fill(10));
  assert.ok(levels.slice(0,10).every(l => l.moves <= 2));
  assert.ok(levels.slice(10, 100).every(l => l.moves >= 3));
  assert.ok(levels.slice(24,30).every(l => l.moves === 5));
});
for (const [i, data] of campaignData.entries()) {
  const level = levels[i+10];
  test(`stage ${level.id}: exact depth, selective openings, gravity and playable solution`, () => {
    const result = analyze(level.board, level.n, level.moves);
    assert.ok(result, 'search must finish and rule out every shorter solution');
    assert.equal(result.winning.length, data.winningFirstMoves);
    assert.equal(result.openings, data.legalFirstMoves);
    assert.ok(result.winning.length > 0 && result.winning.length / result.openings <= 0.3);
    if (level.objective === 'setup') {
      assert.ok(result.winning.every(w => w.path.every(i => !level.board[i].star)));
    }
    const session = new GameSession(levels); session.start(i+10);
    let shifted = 0;
    for(const path of data.solution) {
      const original = path.map(p => level.board.findIndex(c => c.id === session.board[p].id));
      if(!valid(level.board,original,level.n)) shifted++;
      assert.ok(valid(session.board,path,level.n));
      assert.ok(session.play(path));
    }
    assert.equal(shifted,data.gravitySteps);
    assert.ok(shifted >= (i<6?1:2));
    assert.equal(session.status,'cleared');
    assert.equal(session.moves,0);
  });
}

test('solver distinguishes exhausted search from impossible board', () => {
  assert.equal(solveDetailed(levels[0].board, 3, 1, 0).status, 'budget-exceeded');
  assert.equal(solveDetailed(levels[0].board, 3, 0).status, 'unsolvable');
});

test('solver supports legal sequences longer than seven tiles', () => {
  const board = Array.from({length: 9}, (_, i) => ({v:i+1, star:true, id:String(i)}));
  // Snake the values across a 3x3 board.
  [board[3], board[5]] = [board[5], board[3]];
  const result = solveDetailed(board, 3, 1);
  assert.equal(result.status, 'solved');
  assert.equal(result.solution[0].length, 9);
  assert.ok(valid(board, result.solution[0], 3));
});

test('legacy completion follows the retained original puzzles, not their old stage numbers', () => {
  const data = new Map([['sequencepang2-v1', JSON.stringify({0:true,7:true})]]);
  const storage = {getItem: key => data.get(key), setItem: (key,value) => data.set(key,value)};
  const progress = readProgress(storage, levels);
  assert.deepEqual(progress, {'original-1':true});
  progress['intro-1'] = true;
  saveProgress(storage, progress);
  assert.ok(data.has(progressKey));
  assert.deepEqual(readProgress(storage, [...levels].reverse()), progress);
  assert.equal(JSON.parse(data.get('sequencepang2-v1'))[0], true);
});

test('unavailable or malformed storage does not prevent playing', () => {
  assert.deepEqual(readProgress({getItem: () => '{'}, levels), {});
  assert.deepEqual(readProgress({getItem: () => {throw Error('blocked');}}, levels), {});
  assert.doesNotThrow(() => saveProgress({setItem: () => {throw Error('full');}}, {}));
});

test('settings restart restores a partially played board and full move count', () => {
  const session = new GameSession(levels);
  assert.equal(session.restart(), false);
  session.start(20);
  const solution = campaignData[10].solution;
  session.play(solution[0]);
  assert.equal(session.status, 'playing');
  assert.equal(session.moves, levels[20].moves - 1);
  assert.equal(session.restart(), true);
  assert.equal(session.index, 20);
  assert.equal(session.moves, levels[20].moves);
  assert.deepEqual(session.board, levels[20].board);
});

test('old campaign completion does not mark replacement puzzles cleared', () => {
  const storage = {getItem: key => key === progressKey ? JSON.stringify({'campaign-17':true,'original-3':true,'intro-1':true,'original-1':true}) : null};
  assert.deepEqual(readProgress(storage, levels), {'intro-1':true,'original-1':true});
});
