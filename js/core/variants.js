// A variant is a set of constraints. Adding a variant (Sudoku X, Killer X, …)
// means listing its house kinds and whether it has cages; the solvers and the
// conflict check work on whatever constraints the model contains.

export const VARIANTS = {
  classic: { key: 'classic', name: 'Klassisch', houses: ['row', 'col', 'box'], cages: false },
  killer: { key: 'killer', name: 'Killer', houses: ['row', 'col', 'box'], cages: true },
  // Prepared for later, not offered in the app yet:
  // x:       { key: 'x', name: 'Sudoku X', houses: ['row', 'col', 'box', 'diag'], cages: false },
  // killerx: { key: 'killerx', name: 'Killer X', houses: ['row', 'col', 'box', 'diag'], cages: true },
};

/** Variants offered in the app, in menu order. */
export const PLAYABLE = ['killer', 'classic'];

export const LEVELS = [
  { key: 'schwer', name: 'schwer', value: 1 },
  { key: 'extrem', name: 'extrem', value: 2 },
  { key: 'teuflisch', name: 'teuflisch', value: 3 },
];

export const levelByValue = (v) => LEVELS.find((l) => l.value === v) || null;
export const levelByKey = (k) => LEVELS.find((l) => l.key === k) || null;

/** Derive the variant key from the constraint flags (used by the share codec). */
export function variantFromFlags({ cages, diagonals }) {
  for (const v of Object.values(VARIANTS)) {
    if (v.cages === !!cages && v.houses.includes('diag') === !!diagonals) return v.key;
  }
  return cages ? (diagonals ? 'killerx' : 'killer') : diagonals ? 'x' : 'classic';
}
