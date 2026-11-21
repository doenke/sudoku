// Local statistics per variant and level. Puzzles solved with "against the
// solution" or "fill all candidates" are counted separately.

import { load, save } from './store.js';

const empty = () => ({ solved: 0, total: 0, best: null });

export function bucketKey(variant, level) {
  return `${variant}:${level || 0}`;
}

export function loadStats() {
  return load('stats', {});
}

function entry(stats, key) {
  if (!stats[key]) stats[key] = { normal: empty(), assisted: empty(), streak: 0, bestStreak: 0 };
  return stats[key];
}

export function recordSolved(variant, level, ms, assisted) {
  const stats = loadStats();
  const e = entry(stats, bucketKey(variant, level));
  const part = assisted ? e.assisted : e.normal;
  part.solved++;
  part.total += ms;
  part.best = part.best == null ? ms : Math.min(part.best, ms);
  e.streak++;
  e.bestStreak = Math.max(e.bestStreak, e.streak);
  save('stats', stats);
  return { best: part.best === ms, streak: e.streak };
}

/** An unsolved puzzle was left for another one: the streak starts again. */
export function recordAbandoned(variant, level) {
  const stats = loadStats();
  entry(stats, bucketKey(variant, level)).streak = 0;
  save('stats', stats);
}

export function resetStats() {
  save('stats', {});
}

export function formatTime(ms) {
  if (ms == null) return '–';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
