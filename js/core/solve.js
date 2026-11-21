// Backtracking solver for any model: finds solutions and checks uniqueness.
// Candidates come from all units; cages restrict them further by the
// combinations that still fit their remaining sum.

import { ALL, POP, lowDigit } from './bits.js';
import { comboUnion, comboRequired } from './combos.js';

/**
 * @returns {{ count: number, solution: Int8Array|null, solutions: Int8Array[], aborted: boolean, nodes: number }}
 * count stops at `limit`. With `rng` the digits are tried in random order.
 */
export function solve(model, givens, { limit = 2, rng = null, maxNodes = Infinity } = {}) {
  const { units, cellUnits, cellCage, cages } = model;
  const used = new Uint16Array(units.length);
  const vals = new Int8Array(81);
  const cageRem = new Int16Array(cages.length);
  const cageLeft = new Int8Array(cages.length);
  cages.forEach((c, k) => { cageRem[k] = c.sum; cageLeft[k] = c.cells.length; });

  const cand = (i) => {
    let m = 0;
    for (const u of cellUnits[i]) m |= used[u];
    m = ALL & ~m;
    const k = cellCage[i];
    if (k >= 0) m &= comboUnion(cageRem[k], cageLeft[k], used[cages[k].unit]);
    return m;
  };
  const place = (i, d) => {
    vals[i] = d;
    const b = 1 << (d - 1);
    for (const u of cellUnits[i]) used[u] |= b;
    const k = cellCage[i];
    if (k >= 0) { cageRem[k] -= d; cageLeft[k]--; }
  };
  const unplace = (i, d) => {
    vals[i] = 0;
    const b = ~(1 << (d - 1));
    for (const u of cellUnits[i]) used[u] &= b;
    const k = cellCage[i];
    if (k >= 0) { cageRem[k] += d; cageLeft[k]++; }
  };

  const result = { count: 0, solution: null, solutions: [], aborted: false, nodes: 0 };
  for (let i = 0; i < 81; i++) {
    const d = givens[i];
    if (!d) continue;
    if (!(cand(i) & (1 << (d - 1)))) return result;
    place(i, d);
  }

  const stack = Array.from({ length: 82 }, () => new Uint16Array(81));
  let depth = 0;

  const dfs = () => {
    if (++result.nodes > maxNodes) { result.aborted = true; return true; }
    const c = stack[depth];
    let best = -1, bestCount = 10, empty = 0;
    for (let i = 0; i < 81; i++) {
      if (vals[i]) continue;
      empty++;
      const m = cand(i);
      if (!m) return false;
      c[i] = m;
      const p = POP[m];
      if (p < bestCount) { bestCount = p; best = i; }
    }
    if (!empty) {
      result.count++;
      if (!result.solution) result.solution = vals.slice();
      if (result.solutions.length < 2) result.solutions.push(vals.slice());
      return result.count >= limit;
    }
    let forced = 0;
    if (bestCount > 1) {
      // Hidden singles in houses and "required" digits of cages.
      for (const unit of units) {
        let need;
        if (unit.full) {
          need = 0;
          let u = 0;
          for (const cell of unit.cells) if (vals[cell]) u |= 1 << (vals[cell] - 1);
          need = ALL & ~u;
        } else {
          const k = unit.index;
          if (!cageLeft[k]) continue;
          let u = 0;
          for (const cell of unit.cells) if (vals[cell]) u |= 1 << (vals[cell] - 1);
          need = comboRequired(cageRem[k], cageLeft[k], u);
        }
        if (!need) continue;
        let once = 0, twice = 0;
        for (const cell of unit.cells) {
          if (vals[cell]) continue;
          const m = c[cell] & need;
          twice |= once & m;
          once |= m;
        }
        if ((once & need) !== need) return false;
        const single = once & ~twice & need;
        if (single) {
          const b = single & -single;
          for (const cell of unit.cells) if (!vals[cell] && c[cell] & b) { best = cell; break; }
          forced = b;
          break;
        }
      }
    }
    let opts = forced || c[best];
    const ds = [];
    while (opts) { const b = opts & -opts; opts ^= b; ds.push(lowDigit(b)); }
    if (rng) for (let i = ds.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [ds[i], ds[j]] = [ds[j], ds[i]]; }
    for (const d of ds) {
      place(best, d);
      depth++;
      const stop = dfs();
      depth--;
      unplace(best, d);
      if (stop) return true;
    }
    return false;
  };
  dfs();
  return result;
}

export const solutionOf = (model, givens) => solve(model, givens, { limit: 1 }).solution;

export function isUnique(model, givens, maxNodes = Infinity) {
  const r = solve(model, givens, { limit: 2, maxNodes });
  return !r.aborted && r.count === 1;
}
