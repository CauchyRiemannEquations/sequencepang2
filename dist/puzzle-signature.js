// Ordinary tiles keep their original tuple so previously unlocked hints still match.
export function puzzleSignature(level) {
  const tiles = level.board.map(cell => {
    if (!cell) return null;
    const tile = [cell.v, Boolean(cell.star)];
    if (cell.frost) tile.push('frost');
    return tile;
  });
  return JSON.stringify([level.n, level.moves, tiles]);
}
