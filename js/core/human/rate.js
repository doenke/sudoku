// Human-style solver: always applies the easiest technique that makes
// progress, then starts again from the easiest. The level of a puzzle is the
// level of the hardest technique it needed.

import { Grid } from './grid.js';
import { TECHNIQUES } from './techniques.js';

/**
 * @returns {{ solved: boolean, level: number, hardest: string|null, score: number,
 *             counts: Record<string, number>, steps: number, values: Int8Array }}
 * level is -1 when the puzzle cannot be solved by logic (guessing needed).
 */
export function rate(model, givens, { maxLevel = 3, stopAboveLevel = Infinity } = {}) {
  const g = new Grid(model, givens);
  const techs = TECHNIQUES.filter((t) => t.level <= maxLevel && t.applies(model));
  const counts = {};
  let level = 0, hardest = null, hardestWeight = 0, score = 0, steps = 0;
  while (!g.solved()) {
    let used = null;
    for (const t of techs) {
      const step = t.find(g);
      if (step && g.apply(step)) { used = t; break; }
    }
    if (!used) return { solved: false, level: -1, hardest, score, counts, steps, values: g.values };
    if (g.broken()) throw new Error(`technique ${used.key} broke the grid`);
    steps++;
    counts[used.key] = (counts[used.key] || 0) + 1;
    score += used.weight;
    if (!hardest || used.level > level || (used.level === level && used.weight > hardestWeight)) {
      hardest = used.key;
      hardestWeight = used.weight;
    }
    level = Math.max(level, used.level);
    if (level > stopAboveLevel) return { solved: false, level, hardest, score, counts, steps, values: g.values };
  }
  return { solved: true, level, hardest, score, counts, steps, values: g.values };
}
