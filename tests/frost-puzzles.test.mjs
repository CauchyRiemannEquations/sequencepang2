import test from 'node:test';
import assert from 'node:assert/strict';
import { paths, remove, solveDetailed, stars } from '../dist/engine.js';
import { levels } from '../dist/levels.js';
import { puzzleSignature, firstHint } from '../dist/hints.js';

const frostStages = levels.filter(level => level.id >= 101 && level.id <= 110);

test('the frost chapter offers ten fixed stages with exact move limits', () => {
  assert.equal(frostStages.length, 10);
  for (const level of frostStages) {
    assert.equal(level.board.length, level.n ** 2);
    const frozen = level.board.filter(cell => cell?.frost);
    assert.equal(frozen.length, 1, level.title);
    assert.ok(frozen[0].star);
    assert.equal(solveDetailed(level.board, level.n, level.moves).status, 'solved', level.title);
    assert.equal(solveDetailed(level.board, level.n, level.moves - 1).status, 'unsolvable', level.title);
  }
});

test('106–110 require the thawed number in a different sequence on every winning line', () => {
  for (const level of frostStages.filter(stage => stage.id >= 106)) {
    const iceId = level.board.find(cell => cell?.frost).id;
    let wins = 0;
    function visit(board, moves, uses) {
      if (!stars(board)) {
        assert.equal(uses.length, 2, level.title);
        assert.notDeepEqual(uses[0], uses[1], level.title);
        wins++;
        return;
      }
      if (!moves) return;
      for (const path of paths(board, level.n)) {
        const touchesIce = path.some(i => board[i].id === iceId);
        // Opposite drag directions still count as the same number sequence.
        const nextUses = touchesIce
          ? [...uses, path.map(i => board[i].v).sort((a, b) => a - b)]
          : uses;
        visit(remove(board, path, level.n), moves - 1, nextUses);
      }
    }
    visit(level.board, level.moves, []);
    assert.ok(wins, level.title);
  }
});

test('moving the frost to a different tile invalidates a saved hint signature', () => {
  const level = frostStages[0];
  const changedBoard = level.board.map(cell => cell && { ...cell, frost: cell.v === 2 });
  const revised = { ...level, board: changedBoard };
  assert.ok(firstHint(level));
  assert.notEqual(puzzleSignature(revised), puzzleSignature(level));
  assert.equal(firstHint(revised), null);
});
