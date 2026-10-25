import { GameSession } from './session.js';
import { hintKey } from './hints.js';

export const progressKey = 'sequenstar-campaign-v2';
export const progressEpochKey = 'sequencepang2-progress-epoch';
const snapshots = new WeakMap();
export function readProgressEpoch(storage) {
  try { return storage.getItem(progressEpochKey) || 'legacy'; } catch { return 'legacy'; }
}
const completionKey = (epoch, key) => `sequencepang2-completed:${epoch}:${key}`;


// Stable stage keys keep completion attached to the puzzle when chapters move.
export function readProgress(storage, levels) {
  const epoch = readProgressEpoch(storage);
  let progress = {};
  try {
    // Legacy maps remain readable, but reset generations never import them.
    let current = {};
    if (epoch === 'legacy') {
      try { current = JSON.parse(storage.getItem(progressKey) || 'null'); } catch {}
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        let legacy = {};
        try { legacy = JSON.parse(storage.getItem('sequencepang2-v1') || '{}'); } catch {}
        current = Object.fromEntries(levels.filter(l => l.legacyIndex !== undefined && legacy?.[l.legacyIndex] === true).map(l => [l.key, true]));
      }
    }
    progress = Object.fromEntries(levels.filter(l => current[l.key] === true || storage.getItem(completionKey(epoch, l.key)) === 'true').map(l => [l.key, true]));
  } catch {}
  snapshots.set(progress, epoch);
  return progress;
}

// Keep the generation bound to the exact read, even if another tab resets
// between storage accesses. Callers must never stamp a snapshot with a later epoch.
export function readProgressState(storage, levels) {
  const progress = readProgress(storage, levels);
  return { progress, epoch: snapshots.get(progress) };
}

export function saveProgress(storage, progress, epoch = snapshots.get(progress) ?? 'legacy') {
  try {
    if (epoch !== readProgressEpoch(storage)) return false;
    // Separate monotonic keys avoid read/modify/write races between tabs.
    // A reset switches namespaces, so even an in-flight old write stays old.
    for (const [key, complete] of Object.entries(progress)) {
      if (complete === true) storage.setItem(completionKey(epoch, key), 'true');
    }
    if (epoch !== readProgressEpoch(storage)) return false;
    // Compatibility snapshot is not authoritative: the per-stage keys above
    // preserve concurrent writes even if two snapshots race.
    let current = {};
    try { current = JSON.parse(storage.getItem(progressKey) || '{}'); } catch {}
    if (!current || typeof current !== 'object' || Array.isArray(current)) current = {};
    storage.setItem(progressKey, JSON.stringify({ ...current, ...progress }));
    return epoch === readProgressEpoch(storage);
  } catch { return false; }
}

// Keep the old completion key to preserve existing players' records.
export const runKey = 'sequencepang2-active-v1';
export function saveRun(storage, session, epoch = readProgressEpoch(storage)) {
  try {
    if (epoch !== readProgressEpoch(storage)) return;
    if (!['playing', 'failed'].includes(session.status)) { storage.removeItem(runKey); return; }
    storage.setItem(runKey, JSON.stringify({ version: 2, key: session.level.key, ...(epoch === 'legacy' ? {} : { epoch }) }));
  } catch {}
}

// Remember the stage only. Old v1 move histories are deliberately discarded.
export function restoreRun(storage, levels, expectedEpoch) {
  try {
    const saved = JSON.parse(storage.getItem(runKey) || 'null');
    if (!saved || ![1, 2].includes(saved.version)) return null;
    const epoch = saved.epoch || 'legacy';
    if ((expectedEpoch !== undefined && epoch !== expectedEpoch) || epoch !== readProgressEpoch(storage)) return null;
    const index = levels.findIndex(level => level.key === saved.key);
    if (index < 0) return null;
    const game = new GameSession(levels); game.start(index);
    saveRun(storage, game, epoch);
    return epoch === readProgressEpoch(storage) ? game : null;
  } catch { return null; }
}

export function campaignComplete(levels, progress) {
  return levels.length > 0 && levels.every(level => progress[level.key] === true);
}

export function nextStageIndex(levels, progress) {
  const next = levels.findIndex(level => progress[level.key] !== true);
  return next < 0 ? 0 : next;
}

// Reset this game's progress only; unrelated site data and sound preferences stay.
// New generations never reimport legacy completion, even during a stale write.
export function resetProgress(storage) {
  try {
    // Publish the new namespace before clearing compatibility records.
    const epoch = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    storage.setItem(progressEpochKey, epoch);
    storage.setItem(progressKey, '{}');
    storage.removeItem(runKey);
    storage.removeItem('sequencepang2-v1');
    storage.removeItem(hintKey);
    return true;
  } catch { return false; }
}
