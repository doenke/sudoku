import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { buildModel, validatePuzzle } from '../js/core/model.js';
import { solve, isUnique } from '../js/core/solve.js';
import { findConflicts, findWrong } from '../js/core/conflicts.js';
import { combosFor, cageComboStatus } from '../js/core/combos.js';
import { encodePuzzle, decodePuzzle, puzzleId } from '../js/core/codec.js';
import { rate } from '../js/core/human/rate.js';
import { levelByKey } from '../js/core/variants.js';
import { parseGrid, rc } from './helpers.js';

const EASY = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
const INKALA = '800000000003600000070090200050007000000045700000100030001000068008500010090000400';
const classic = (s) => ({ variant: 'classic', givens: parseGrid(s), cages: [], level: 0 });

test('backtracking finds the unique solution', () => {
  const p = classic(EASY);
  const r = solve(buildModel(p), p.givens);
  assert.equal(r.count, 1);
  assert.equal(r.solution.join(''), '534678912672195348198342567859761423426853791713924856961537284287419635345286179');
});

test('uniqueness detects a second solution', () => {
  const p = classic(EASY);
  p.givens[0] = 0; p.givens[1] = 0; p.givens[4] = 0; p.givens[9] = 0; p.givens[10] = 0;
  const g = p.givens.slice();
  g.fill(0, 0, 27);
  assert.equal(isUnique(buildModel(p), g), false);
  assert.equal(solve(buildModel(p), g).count, 2);
});

test('contradicting givens have no solution', () => {
  const p = classic(EASY);
  p.givens[2] = 5; // second 5 in row 0
  assert.equal(solve(buildModel(p), p.givens).count, 0);
});

test('killer solver respects cage sums', () => {
  // a killer built from the solution of EASY with dominoes along the rows
  const sol = solve(buildModel(classic(EASY)), parseGrid(EASY)).solution;
  const cages = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 8; c += 2) cages.push({ cells: [rc(r, c), rc(r, c + 1)], sum: sol[rc(r, c)] + sol[rc(r, c + 1)] });
    cages.push({ cells: [rc(r, 8)], sum: sol[rc(r, 8)] });
  }
  const p = { variant: 'killer', givens: new Int8Array(81), cages, level: 0 };
  assert.equal(validatePuzzle(p), null);
  const r = solve(buildModel(p), p.givens, { limit: 1 });
  const m = buildModel(p);
  for (const cage of m.cages) assert.equal(cage.cells.reduce((s, c) => s + r.solution[c], 0), cage.sum);
});

test('validatePuzzle rejects broken cages', () => {
  assert.match(validatePuzzle({ cages: [{ cells: [0, 2], sum: 5 }] }), /zusammenhängend/);
  assert.match(validatePuzzle({ cages: [{ cells: [0, 1], sum: 2 }] }), /unmögliche Summe/);
  assert.match(validatePuzzle({ cages: [{ cells: [0, 1], sum: 5 }, { cells: [1, 2], sum: 5 }] }), /mehreren/);
});

test('conflicts: duplicates in row, column, box and cage', () => {
  const p = { variant: 'killer', givens: new Int8Array(81), cages: [{ cells: [rc(4, 4), rc(4, 5)], sum: 9 }], level: 0 };
  const m = buildModel(p);
  const v = new Int8Array(81);
  v[rc(0, 0)] = 3; v[rc(0, 8)] = 3; // row
  v[rc(2, 2)] = 7; v[rc(8, 2)] = 7; // column
  v[rc(6, 6)] = 1; v[rc(8, 8)] = 1; // box
  const c = findConflicts(m, v);
  for (const cell of [rc(0, 0), rc(0, 8), rc(2, 2), rc(8, 2), rc(6, 6), rc(8, 8)]) assert.ok(c.cells.has(cell));
  assert.equal(c.cages.size, 0);
  v[rc(4, 4)] = 5; v[rc(4, 5)] = 5;
  const c2 = findConflicts(m, v);
  assert.ok(c2.cages.has(0));
});

test('conflicts: cage sum exceeded and full cage with wrong sum', () => {
  const p = { variant: 'killer', givens: new Int8Array(81), cages: [{ cells: [0, 1, 2], sum: 10 }], level: 0 };
  const m = buildModel(p);
  const v = new Int8Array(81);
  v[0] = 9; v[1] = 2;
  assert.ok(findConflicts(m, v).cages.has(0)); // 11 > 10 with one cell left
  v[0] = 1; v[1] = 2;
  assert.ok(!findConflicts(m, v).cages.has(0));
  v[2] = 4; // 7 != 10, full
  assert.ok(findConflicts(m, v).cages.has(0));
  v[2] = 7;
  assert.ok(!findConflicts(m, v).cages.has(0));
});

test('conflicts never reveal the solution', () => {
  const p = classic(EASY);
  const v = p.givens.slice();
  v[2] = 1; // wrong (solution 4) but no rule conflict
  assert.equal(findConflicts(buildModel(p), v).cells.size, 0);
  const sol = solve(buildModel(p), p.givens).solution;
  assert.deepEqual([...findWrong(v, sol, p.givens)], [2]);
});

test('combinations per sum and size', () => {
  assert.equal(combosFor(3, 2).length, 1);
  assert.equal(combosFor(10, 2).length, 4);
  assert.equal(combosFor(45, 9).length, 1);
  assert.equal(combosFor(17, 3).length, 7);
});

test('combination panel greys out impossible combinations', () => {
  const p = { variant: 'killer', givens: new Int8Array(81), cages: [{ cells: [0, 1], sum: 10 }], level: 0 };
  const m = buildModel(p);
  const v = new Int8Array(81);
  v[5] = 9; v[9] = 1; // row 0 holds 9, column 0 holds 1 -> {1,9} only if cell 1 = 1 and cell 0 = 9: blocked by row
  v[2] = 4; // 4 in box -> {4,6} impossible
  const status = Object.fromEntries(cageComboStatus(m, v, 0).map((s) => [s.digits.join(''), s.possible]));
  assert.deepEqual(status, { 19: false, 28: true, 37: true, 46: false });
  v[0] = 3;
  const s2 = Object.fromEntries(cageComboStatus(m, v, 0).map((s) => [s.digits.join(''), s.possible]));
  assert.deepEqual(s2, { 19: false, 28: false, 37: true, 46: false });
});

test('share code round trip: classic and killer', () => {
  const c = { ...classic(EASY), level: 2 };
  const code = encodePuzzle(c);
  const back = decodePuzzle(code);
  assert.equal(back.variant, 'classic');
  assert.equal(back.level, 2);
  assert.deepEqual([...back.givens], [...c.givens]);
  assert.ok(code.length <= 40, `classic code has ${code.length} chars`);

  const cages = [];
  for (let r = 0; r < 9; r++) for (let col = 0; col < 9; col += 3) cages.push({ cells: [rc(r, col), rc(r, col + 1), rc(r, col + 2)], sum: 15 });
  // an L-shaped cage whose second row starts left of its first cell
  const k = { variant: 'killer', givens: new Int8Array(81), cages, level: 3 };
  const kc = encodePuzzle(k);
  const kb = decodePuzzle(kc);
  assert.equal(kb.variant, 'killer');
  assert.equal(kb.level, 3);
  assert.deepEqual(kb.cages.map((x) => [x.cells, x.sum]), cages.map((x) => [x.cells, x.sum]));
});

test('share code: cages reached only by back reference', () => {
  // cage {1, 9, 10}: cell 9 joins neither left (none) nor above (0) -> back reference
  const cells = Array.from({ length: 81 }, (_, i) => i).filter((i) => ![1, 9, 10].includes(i));
  const cages = [{ cells: [1, 9, 10], sum: 6 }, ...cells.map((c) => ({ cells: [c], sum: 5 }))];
  const p = { variant: 'killer', givens: new Int8Array(81), cages, level: 0 };
  const back = decodePuzzle(encodePuzzle(p));
  assert.deepEqual(back.cages.find((c) => c.cells.includes(9)).cells, [1, 9, 10]);
});

test('share code rejects garbage', () => {
  assert.throws(() => decodePuzzle('!!!'));
  assert.throws(() => decodePuzzle('A'));
});

test('puzzle id is stable and ignores the level', () => {
  const a = classic(EASY);
  assert.equal(puzzleId(a), puzzleId({ ...a, level: 3 }));
  assert.equal(puzzleId(a), puzzleId(decodePuzzle(encodePuzzle(a))));
  assert.match(puzzleId(a), /^[0-9a-z]{11}$/);
});

test('rating: easy puzzle needs singles only, Inkala needs guessing', () => {
  const e = classic(EASY);
  const r = rate(buildModel(e), e.givens);
  assert.equal(r.solved, true);
  assert.equal(r.level, 0);
  const i = classic(INKALA);
  assert.equal(rate(buildModel(i), i.givens).solved, false);
});

// The bank: every puzzle decodes, is unique, and its rating matches its file.
// Checked on a sample to keep the test fast; tools/check-bank.mjs checks all.
const bankFiles = readdirSync(new URL('../data/', import.meta.url)).filter((f) => f.endsWith('.json'));
for (const f of bankFiles) {
  test(`bank ${f}: sample is unique and rated as its level`, () => {
    const bank = JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
    const level = levelByKey(bank.level).value;
    const ids = new Set();
    bank.puzzles.forEach(([code]) => ids.add(puzzleId(decodePuzzle(code))));
    assert.equal(ids.size, bank.puzzles.length, 'ids are unique');
    const step = Math.max(1, Math.floor(bank.puzzles.length / 6));
    for (let k = 0; k < bank.puzzles.length; k += step) {
      const [code, hardest] = bank.puzzles[k];
      const p = decodePuzzle(code);
      assert.equal(p.variant, bank.variant);
      assert.equal(p.level, level);
      const m = buildModel(p);
      assert.ok(isUnique(m, p.givens), `${code} unique`);
      const r = rate(m, p.givens);
      assert.equal(r.solved, true);
      assert.equal(r.level, level, `${code} level`);
      assert.equal(r.hardest, hardest);
    }
  });
}
