import { writeFile } from 'node:fs/promises';
import { paths, remove, searchKey, stars, valid } from '../dist/engine.js';

// Deterministic offline authoring. Exhaustive state search rejects incomplete
// candidates, proves minimum depth, and counts genuinely different openings.
let seed = 20260920;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
const pick = xs => xs[Math.floor(random() * xs.length)];
export function analyze(board, n, moves, limit = 30000) {
  const memo = new Map(); let visited = 0;
  function search(b, left) {
    if (!stars(b)) return [];
    if (!left) return null;
    const key = searchKey(b, left);
    if (memo.has(key)) return memo.get(key);
    if (++visited > limit) throw Error('budget');
    const options = paths(b,n).sort((a,z) => z.filter(i=>b[i].star).length-a.filter(i=>b[i].star).length);
    for(const p of options) {
      const tail = search(remove(b,p,n),left-1);
      if(tail) { const result=[p,...tail]; memo.set(key,result); return result; }
    }
    memo.set(key,null); return null;
  }
  try {
    if(search(board,moves-1)) return null;
    const openings = paths(board,n), winning=[];
    for(const path of openings) {
      const tail=search(remove(board,path,n),moves-1);
      if(tail) winning.push({path,solution:[path,...tail]});
    }
    return {openings:openings.length,winning,visited};
  } catch { return null; }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
const output=[];
for(let attempt=0; output.length<20 && attempt<100000; attempt++) {
  const index=output.length, n=index<10?4:5, moves=index<6?3:index<14?4:5;
  const board=Array.from({length:n*n},(_,i)=>({v:1+Math.floor(random()*9),star:false,id:String(i)}));
  let b=board, trace=[], removed=[];
  for(let step=0;step<moves;step++) {
    let ps;
    try { ps=paths(b,n); } catch { break; }
    if(!ps.length) break;
    const p=pick(ps.filter(p=>p.length<=5)); if(!p) break;
    trace.push(p); removed.push(p.map(i=>b[i].id)); b=remove(b,p,n);
  }
  if(trace.length!==moves) continue;
  // Some puzzles open with a starless preparation; others interleave collection.
  const setup=index%3===1;
  for(let step=setup?1:0;step<moves;step++) {
    const ids=removed[step];
    for(const id of ids.filter(()=>random()<0.7)) board[+id].star=true;
    board[+pick(ids)].star=true;
  }
  if(stars(board)<(index<6?4:6)) continue;
  const result=analyze(board,n,moves, index<10?4000:6000);
  if(!result?.winning.length || result.winning.length>3 || result.winning.length/result.openings>0.3) continue;
  if(setup && result.winning.some(w=>w.path.some(i=>board[i].star))) continue;
  let solution=result.winning[0].solution, shifted=0, geometric=false;
  b=board;
  for(const p of solution) {
    const original=p.map(i=>+b[i].id);
    if(!valid(board,original,n)) shifted++;
    const vs=p.map(i=>b[i].v);
    if(vs[1]!==vs[0] && vs[2]*vs[0]===vs[1]*vs[1]) geometric=true;
    b=remove(b,p,n);
  }
  if(shifted<(index<6?1:2)) continue;
  if(index%4===3 && !geometric) continue;
  output.push({n,moves,values:board.map(c=>c.v),stars:board.flatMap((c,i)=>c.star?[i]:[]),objective:setup?'setup':'order',solution,winningFirstMoves:result.winning.length,legalFirstMoves:result.openings,gravitySteps:shifted});
  console.log(`Stage ${index+11}: ${n}x${n}, ${moves} moves, ${result.winning.length}/${result.openings} winning openings, ${shifted} gravity steps, attempt ${attempt}`);
}
if(output.length!==20) throw Error('Not enough verified candidates');
  await writeFile(new URL('../dist/campaign-data.js',import.meta.url),`// Fixed solver-verified puzzles. Regenerate with npm run generate:campaign.\nexport const campaignData = ${JSON.stringify(output,null,2)};\n`);
}
