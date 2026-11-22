import { hintData } from './hint-data.js';
import { valid } from './engine.js';
import { puzzleSignature } from './puzzle-signature.js';

export { puzzleSignature };

export const hintKey = 'sequencepang2-hints-v1';
export const hintTier = count => count >= 5 ? 2 : count >= 3 ? 1 : 0;

// Precomputed, verified first moves keep expensive search off mobile devices.
export function firstHint(level) {
  const entry = hintData[level.key];
  if (level.id < 11 || !entry || entry.signature !== puzzleSignature(level) || !valid(level.board, entry.path, level.n)) return null;
  return [...entry.path];
}

export class MangoHints {
  constructor(storage, levels) {
    this.storage = storage;
    this.counts = {};
    this.counted = new WeakSet();
    try {
      const saved = JSON.parse(storage?.getItem(hintKey) || '{}');
      for (const level of levels) {
        const entry = saved?.[level.key];
        if (firstHint(level) && entry?.signature === puzzleSignature(level) && Number.isInteger(entry.failures) && entry.failures >= 0) {
          this.counts[level.key] = { signature: entry.signature, failures: Math.min(5, entry.failures) };
        }
      }
    } catch {}
  }
  failures(level) { return this.counts[level.key]?.failures || 0; }
  recordFailure(session) {
    if (session.status !== 'failed' || !session.history.length || !firstHint(session.level) || this.counted.has(session.history)) return false;
    this.counted.add(session.history);
    this.counts[session.level.key] = { signature: puzzleSignature(session.level), failures: Math.min(5, this.failures(session.level) + 1) };
    try { this.storage?.setItem(hintKey, JSON.stringify(this.counts)); } catch {}
    return true;
  }
}
