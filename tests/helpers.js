import { buildModel } from '../js/core/model.js';
import { Grid } from '../js/core/human/grid.js';
import { bit, maskOf } from '../js/core/bits.js';

export const rc = (r, c) => r * 9 + c;

export function parseGrid(str) {
  return Int8Array.from(str.replace(/[^0-9.]/g, ''), (ch) => (ch === '.' ? 0 : +ch));
}

/** Grid with all candidates everywhere (no givens), for hand-built patterns. */
export function blank(cages = []) {
  const model = buildModel({ variant: cages.length ? 'killer' : 'classic', givens: new Int8Array(81), cages, level: 0 });
  return new Grid(model, null);
}

export function setCands(g, cell, digits) { g.cands[cell] = maskOf(digits); }

export function removeDigit(g, d, cells) { for (const c of cells) g.cands[c] &= ~bit(d); }

export const row = (r) => Array.from({ length: 9 }, (_, c) => rc(r, c));
export const col = (c) => Array.from({ length: 9 }, (_, r) => rc(r, c));

/** Map cell -> eliminated mask from a step. */
export function elimMap(step) {
  const m = new Map();
  for (const [c, mask] of step?.elim || []) m.set(c, (m.get(c) || 0) | mask);
  return m;
}
