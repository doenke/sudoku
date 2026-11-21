// Constraint model of a puzzle.
//
// A puzzle is { variant, givens: Int8Array(81) (0 = empty), cages: [{ cells, sum }], level }.
// The model turns it into units: every unit is an all-different constraint.
// "Full" units (houses: rows, columns, boxes, diagonals) contain each digit
// exactly once; cage units additionally carry a sum.

import { VARIANTS } from './variants.js';

export const rowOf = (i) => (i / 9) | 0;
export const colOf = (i) => i % 9;
export const boxOf = (i) => ((rowOf(i) / 3) | 0) * 3 + ((colOf(i) / 3) | 0);

const HOUSE_KINDS = {
  row: () => Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => r * 9 + c)),
  col: () => Array.from({ length: 9 }, (_, c) => Array.from({ length: 9 }, (_, r) => r * 9 + c)),
  box: () =>
    Array.from({ length: 9 }, (_, b) =>
      Array.from({ length: 9 }, (_, k) => (((b / 3) | 0) * 3 + ((k / 3) | 0)) * 9 + (b % 3) * 3 + (k % 3)),
    ),
  diag: () => [
    Array.from({ length: 9 }, (_, k) => k * 10),
    Array.from({ length: 9 }, (_, k) => k * 8 + 8),
  ],
};

export function emptyPuzzle(variant = 'classic') {
  return { variant, givens: new Int8Array(81), cages: [], level: 0 };
}

export function buildModel(puzzle) {
  const variant = VARIANTS[puzzle.variant];
  if (!variant) throw new Error(`unknown variant ${puzzle.variant}`);
  const units = [];
  for (const kind of variant.houses) {
    HOUSE_KINDS[kind]().forEach((cells, index) => units.push({ kind, index, cells, full: true }));
  }
  const houses = units.map((_, u) => u);
  const cages = [];
  const cellCage = new Int16Array(81).fill(-1);
  (puzzle.cages || []).forEach((cage, k) => {
    const cells = [...cage.cells].sort((a, b) => a - b);
    const unit = units.length;
    units.push({ kind: 'cage', index: k, cells, full: false, sum: cage.sum });
    cages.push({ cells, sum: cage.sum, unit });
    for (const c of cells) cellCage[c] = k;
  });

  const cellUnits = Array.from({ length: 81 }, () => []);
  units.forEach((u, idx) => u.cells.forEach((c) => cellUnits[c].push(idx)));

  const peerMatrix = new Uint8Array(81 * 81);
  const peers = Array.from({ length: 81 }, () => []);
  for (const u of units) {
    for (const a of u.cells) for (const b of u.cells) if (a !== b) peerMatrix[a * 81 + b] = 1;
  }
  for (let a = 0; a < 81; a++) for (let b = 0; b < 81; b++) if (peerMatrix[a * 81 + b]) peers[a].push(b);

  return {
    variant,
    puzzle,
    units,
    houses,
    cages,
    cellUnits,
    cellCage,
    peers,
    isPeer: (a, b) => peerMatrix[a * 81 + b] === 1,
    cache: {},
  };
}

/** Checks the structure of a puzzle: cages disjoint, connected, sums possible. */
export function validatePuzzle(puzzle) {
  const seen = new Int16Array(81).fill(-1);
  for (const [k, cage] of (puzzle.cages || []).entries()) {
    if (!cage.cells.length || cage.cells.length > 9) return `Käfig ${k} hat eine ungültige Größe`;
    const n = cage.cells.length;
    const min = (n * (n + 1)) / 2;
    const max = (n * (19 - n)) / 2;
    if (cage.sum < min || cage.sum > max) return `Käfig ${k} hat eine unmögliche Summe`;
    for (const c of cage.cells) {
      if (c < 0 || c > 80 || seen[c] >= 0) return `Zelle ${c} liegt in mehreren Käfigen`;
      seen[c] = k;
    }
    // connectivity
    const set = new Set(cage.cells);
    const stack = [cage.cells[0]];
    const reached = new Set(stack);
    while (stack.length) {
      const c = stack.pop();
      for (const nb of neighbours(c)) if (set.has(nb) && !reached.has(nb)) { reached.add(nb); stack.push(nb); }
    }
    if (reached.size !== set.size) return `Käfig ${k} ist nicht zusammenhängend`;
  }
  return null;
}

export function neighbours(c) {
  const r = rowOf(c), col = colOf(c), out = [];
  if (r > 0) out.push(c - 9);
  if (r < 8) out.push(c + 9);
  if (col > 0) out.push(c - 1);
  if (col < 8) out.push(c + 1);
  return out;
}
