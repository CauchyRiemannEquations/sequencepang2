import test from 'node:test';
import assert from 'node:assert/strict';
import { remove, solveDetailed, stars } from '../dist/engine.js';
import { GameSession } from '../dist/session.js';

function frostLevel(moves = 2) {
  const board = [2, 3, 9, 1, 6, 4, 4, 8, 7].map((v, index) => ({
    v, id: String(index), star: index === 0, ...(index === 0 && { frost: true }),
  }));
  return { n: 3, moves, board };
}

test('thawing preserves the tile, its star and identity through gravity until actual removal', () => {
  const level = frostLevel();
  level.board[1].star = true;
  const game = new GameSession([level]);
  game.start(0);
  const before = structuredClone(game.board);
  assert.equal(game.play([0, 1, 4]), null);
  assert.deepEqual(game.board, before);
  assert.equal(game.moves, 2);

  // 1, 2, 3 clears the tile below the frozen 2. Its star falls with it.
  assert.equal(game.play([3, 0, 1]).status, 'playing');
  assert.deepEqual(game.board[3], { v: 2, id: '0', star: true });
  assert.equal(stars(game.board), 1);
  assert.equal(game.moves, 1);
  assert.deepEqual(level.board, before);

  // A different sequence (2, 4, 6) now collects the thawed star.
  assert.equal(game.play([3, 6, 4]).status, 'cleared');
  assert.equal(stars(game.board), 0);
  assert.equal(game.board.some(cell => cell?.id === '0'), false);
  assert.equal(game.restart(), true);
  assert.deepEqual(game.board, before);
});

test('only selected frozen tiles thaw, including unstarred ones', () => {
  const { board } = frostLevel();
  board[1].frost = true;
  board[2].frost = true;
  const after = remove(board, [3, 0, 1], 3);
  assert.deepEqual(after[1], { v: 3, id: '1', star: false });
  assert.deepEqual(after[2], board[2]);
  assert.equal(after.filter(Boolean).length, board.length - 1);
});

test('solver and live session require both uses of a frozen star even on the last move', () => {
  const level = frostLevel(1);
  const game = new GameSession([level]);
  game.start(0);
  assert.equal(game.play([3, 0, 1]).status, 'failed');
  assert.equal(stars(game.board), 1);
  assert.equal(game.retry(), true);
  assert.equal(game.board[0].frost, true);
  assert.equal(solveDetailed(level.board, level.n, 1).status, 'unsolvable');
  const { status, solution } = solveDetailed(level.board, level.n, 2);
  assert.equal(status, 'solved');
  const solvable = new GameSession([{ ...level, moves: 2 }]);
  solvable.start(0);
  for (const path of solution) assert.ok(solvable.play(path));
  assert.equal(solvable.status, 'cleared');
  assert.equal(solvable.moves, 0);
});

test('solver keeps two otherwise identical openings with different frost states distinct', () => {
  const board = [1, 1, 4, 4, 3, 2, 1, 4, 1].map((v, index) => ({
    v, star: index === 6, ...([1, 6].includes(index) && { frost: true }),
  }));
  // Both openings leave the same numbers and stars. Only the shorter one
  // preserves the centre's frost, letting that 1 participate twice.
  const thawedCentre = remove(board, [1, 5, 4, 2], 3);
  const frozenCentre = remove(board, [2, 4, 5], 3);
  assert.equal(solveDetailed(thawedCentre, 3, 2).status, 'unsolvable');
  assert.equal(solveDetailed(frozenCentre, 3, 2).status, 'solved');
  assert.equal(solveDetailed(board, 3, 3).status, 'solved');
});
