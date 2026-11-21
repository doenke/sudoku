// Cage combinations: which sets of distinct digits 1..9 add up to a sum.

import { ALL, POP, MASK_SUM, digitsOf, bit } from './bits.js';

// COMBOS[size][sum] = masks
const COMBOS = Array.from({ length: 10 }, () => Array.from({ length: 46 }, () => []));
for (let m = 1; m < 512; m++) COMBOS[POP[m]][MASK_SUM[m]].push(m);

export function combosFor(sum, size) {
  if (size < 0 || size > 9 || sum < 0 || sum > 45) return [];
  if (size === 0) return sum === 0 ? [0] : [];
  return COMBOS[size][sum];
}

// Memo tables for the backtracking solver: union / intersection of all
// combinations of `left` digits summing to `rem` that avoid the `used` digits.
const UNION = new Int16Array(46 * 10 * 512).fill(-1);
const REQUIRED = new Int16Array(46 * 10 * 512).fill(-1);

function fillMemo(rem, left, used, key) {
  let union = 0, req = ALL, any = false;
  if (rem >= 0 && rem <= 45) {
    for (const m of combosFor(rem, left)) {
      if (m & used) continue;
      union |= m;
      req &= m;
      any = true;
    }
  }
  UNION[key] = union;
  REQUIRED[key] = any ? req : 0;
}

export function comboUnion(rem, left, used) {
  if (rem < 0 || rem > 45) return 0;
  const key = (rem * 10 + left) * 512 + used;
  if (UNION[key] < 0) fillMemo(rem, left, used, key);
  return UNION[key];
}

export function comboRequired(rem, left, used) {
  if (rem < 0 || rem > 45) return 0;
  const key = (rem * 10 + left) * 512 + used;
  if (REQUIRED[key] < 0) fillMemo(rem, left, used, key);
  return REQUIRED[key];
}

/**
 * Can the digits of `mask` be distributed over `cells` so that every cell gets
 * one digit it allows (allowed[c] masks)? Optionally collects, per cell, which
 * digits occur in at least one such distribution (support).
 */
export function assignable(cells, mask, allowed, support = null) {
  const ds = digitsOf(mask);
  if (ds.length !== cells.length) return false;
  const n = cells.length;
  const pick = new Array(n);
  let found = false;
  const full = support ? cells.map((c) => allowed[c] & mask) : null;
  const go = (i, free) => {
    if (i === n) {
      found = true;
      if (!support) return true;
      for (let k = 0; k < n; k++) support[k] |= bit(pick[k]);
      return support.every((s, k) => (s & full[k]) === full[k]);
    }
    let opts = allowed[cells[i]] & free;
    while (opts) {
      const b = opts & -opts;
      opts ^= b;
      pick[i] = 32 - Math.clz32(b);
      if (go(i + 1, free & ~b)) return true;
    }
    return false;
  };
  go(0, mask);
  return found;
}

/**
 * Combination panel for the UI: every combination of a cage with a flag
 * whether it is still possible given the placed digits (not the notes).
 */
export function cageComboStatus(model, values, cageIndex) {
  const cage = model.cages[cageIndex];
  let placed = 0;
  const empty = [];
  for (const c of cage.cells) {
    if (values[c]) placed |= bit(values[c]);
    else empty.push(c);
  }
  // a digit is blocked for an empty cell when a peer outside holds it
  const allowed = new Uint16Array(81);
  for (const c of empty) {
    let m = ALL;
    for (const p of model.peers[c]) if (values[p]) m &= ~bit(values[p]);
    allowed[c] = m;
  }
  return combosFor(cage.sum, cage.cells.length).map((mask) => {
    const possible = (placed & mask) === placed && assignable(empty, mask & ~placed, allowed);
    return { mask, digits: digitsOf(mask), possible };
  });
}
