// Puzzle bank: loads data/<variant>-<level>.json, picks unplayed puzzles and
// remembers which ones were started.

import { decodePuzzle, puzzleId } from '../core/codec.js';
import { load, save } from './store.js';

const cache = new Map();

export async function loadBank(variant, level) {
  const key = `${variant}-${level}`;
  if (!cache.has(key)) {
    cache.set(key, fetch(`data/${key}.json`).then((r) => {
      if (!r.ok) throw new Error(`Rätselbank ${key} fehlt`);
      return r.json();
    }).then((bank) => bank.puzzles.map(([code]) => {
      const puzzle = decodePuzzle(code);
      return { code, id: puzzleId(puzzle), puzzle };
    })).catch((e) => { cache.delete(key); throw e; }));
  }
  return cache.get(key);
}

export function playedMap() {
  return load('played', {});
}

export function markPlayed(id) {
  const played = playedMap();
  played[id] = Date.now();
  save('played', played);
}

export async function unplayedCount(variant, level) {
  const list = await loadBank(variant, level);
  const played = playedMap();
  return { total: list.length, fresh: list.filter((e) => !played[e.id]).length };
}

/** A random unplayed puzzle; when all were played, the one played longest ago. */
export async function pickPuzzle(variant, level) {
  const list = await loadBank(variant, level);
  const played = playedMap();
  const fresh = list.filter((e) => !played[e.id]);
  if (fresh.length) return { ...fresh[Math.floor(Math.random() * fresh.length)], repeat: false };
  const oldest = [...list].sort((a, b) => played[a.id] - played[b.id])[0];
  return { ...oldest, repeat: true };
}
