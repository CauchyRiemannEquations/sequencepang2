export function kind(values){if(values.length<3)return null;const d=values[1]-values[0];if(values.every((v,i)=>i<1||v-values[i-1]===d))return '등차수열';if(values.every((v,i)=>i<2||v*values[i-2]===values[i-1]*values[i-1]))return '등비수열';return null;}
export function adjacent(a,b,n){return a!==b&&Math.abs(a%n-b%n)<=1&&Math.abs(Math.floor(a/n)-Math.floor(b/n))<=1;}
export function valid(board,path,n){return path.length>=3&&new Set(path).size===path.length&&path.every((p,i)=>Number.isInteger(p)&&!!board[p]&&(!i||adjacent(p,path[i-1],n)))&&!!kind(path.map(p=>board[p].v));}
export function remove(board, path, n) {
  const next = board.map(cell => cell ? { ...cell } : null);
  for (const index of path) {
    if (next[index]?.frost) delete next[index].frost;
    else next[index] = null;
  }
  for (let column = 0; column < n; column++) {
    const remaining = [];
    for (let row = 0; row < n; row++) {
      const cell = next[row * n + column];
      if (cell) remaining.push(cell);
    }
    for (let row = n - 1; row >= 0; row--) next[row * n + column] = remaining.pop() ?? null;
  }
  return next;
}
export const stars=board=>board.filter(c=>c?.star).length;

// Tile identities do not affect the solution; frost does, even on a starless tile.
export function searchKey(board, moves) {
  return board.map(cell => cell ? `${cell.v}${cell.star ? 's' : ''}${cell.frost ? 'f' : ''}` : '_').join(',') + ':' + moves;
}
const exhausted = Symbol('search limit');
function spend(budget) { if (--budget.left < 0) throw exhausted; }

// Reverse paths and paths using the same cells produce identical next boards.
export function paths(board, n, budget = { left: 200000 }) {
  const out = [], seen = new Set();
  const neighbors = board.map((cell, i) => cell ? board.flatMap((c, j) => c && adjacent(i, j, n) ? [j] : []) : []);
  function walk(path) {
    spend(budget);
    if (path.length >= 3) {
      if (!kind(path.map(i => board[i].v))) return;
      const key = [...path].sort((a, b) => a - b).join(',');
      if (!seen.has(key)) { seen.add(key); out.push(path); }
    }
    for (const j of neighbors[path.at(-1)]) if (!path.includes(j)) walk([...path, j]);
  }
  for (let i = 0; i < board.length; i++) if (board[i]) walk([i]);
  return out;
}

// An interrupted search must never be reported as proof that a puzzle is unsolvable.
export function solveDetailed(board, n, moves, limit = 200000) {
  const budget = { left: limit }, memo = new Set();
  function search(board, moves) {
    if (!stars(board)) return [];
    if (!moves) return null;
    spend(budget);
    const key = searchKey(board, moves);
    if (memo.has(key)) return null;
    memo.add(key);
    const options = paths(board, n, budget).sort((a, b) => b.filter(i => board[i].star).length - a.filter(i => board[i].star).length);
    for (const path of options) {
      const tail = search(remove(board, path, n), moves - 1);
      if (tail) return [path, ...tail];
    }
    return null;
  }
  try {
    const solution = search(board, moves);
    return { status: solution ? 'solved' : 'unsolvable', solution, visited: limit - budget.left };
  } catch (error) {
    if (error !== exhausted) throw error;
    return { status: 'budget-exceeded', solution: null, visited: limit };
  }
}
export function solve(board, n, moves) { return solveDetailed(board, n, moves).solution; }
