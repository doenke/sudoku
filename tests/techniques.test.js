// Every technique is checked on a small hand-built candidate pattern where it
// must fire, and with the expected eliminations or placements.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bit, maskOf } from '../js/core/bits.js';
import { TECHNIQUE_BY_KEY as T } from '../js/core/human/techniques.js';
import { blank, setCands, removeDigit, rc, row, col, elimMap } from './helpers.js';

const others = (cells, except) => cells.filter((c) => !except.includes(c));

test('naked single', () => {
  const g = blank();
  setCands(g, 40, [5]);
  assert.deepEqual(T.nakedSingle.find(g).place, [[40, 5]]);
});

test('hidden single', () => {
  const g = blank();
  removeDigit(g, 7, others(row(0), [3]));
  const s = T.hiddenSingle.find(g);
  assert.ok(s.place.some(([c, d]) => c === 3 && d === 7));
});

test('pointing (locked candidates)', () => {
  const g = blank();
  removeDigit(g, 4, [9, 10, 11, 18, 19, 20]); // box 0 keeps 4 only in row 0
  const e = elimMap(T.lockedCandidates.find(g));
  for (let c = 3; c < 9; c++) assert.equal(e.get(c), bit(4));
  assert.equal(e.size, 6);
});

test('box-line (locked candidates)', () => {
  const g = blank();
  removeDigit(g, 2, others(row(4), [rc(4, 0), rc(4, 1)])); // row 4 keeps 2 only in box 3
  const e = elimMap(T.lockedCandidates.find(g));
  assert.equal(e.get(rc(3, 0)), bit(2));
  assert.equal(e.get(rc(5, 2)), bit(2));
  assert.ok(!e.has(rc(4, 5)));
});

test('naked pair, triple, quad', () => {
  for (const [key, cells, sets] of [
    ['nakedPair', [0, 4], [[1, 2], [1, 2]]],
    ['nakedTriple', [0, 4, 8], [[1, 2], [2, 3], [1, 3]]],
    ['nakedQuad', [0, 2, 4, 8], [[1, 2], [2, 3], [3, 4], [1, 4]]],
  ]) {
    const g = blank();
    cells.forEach((c, k) => setCands(g, c, sets[k]));
    const digits = [...new Set(sets.flat())];
    const e = elimMap(T[key].find(g));
    assert.equal(e.get(rc(0, 1)), maskOf(digits), key);
    assert.ok(!cells.some((c) => e.has(c)), key);
  }
});

test('hidden pair, triple, quad', () => {
  for (const [key, cells, digits] of [
    ['hiddenPair', [rc(0, 0), rc(0, 5)], [6, 7]],
    ['hiddenTriple', [rc(0, 0), rc(0, 4), rc(0, 8)], [6, 7, 8]],
    ['hiddenQuad', [rc(0, 0), rc(0, 2), rc(0, 4), rc(0, 8)], [5, 6, 7, 8]],
  ]) {
    const g = blank();
    for (const d of digits) removeDigit(g, d, others(row(0), cells));
    const e = elimMap(T[key].find(g));
    for (const c of cells) assert.equal(e.get(c), 0x1ff & ~maskOf(digits), key);
  }
});

test('x-wing', () => {
  const g = blank();
  removeDigit(g, 5, others(row(0), [rc(0, 1), rc(0, 5)]));
  removeDigit(g, 5, others(row(4), [rc(4, 1), rc(4, 5)]));
  const e = elimMap(T.xWing.find(g));
  assert.equal(e.get(rc(7, 1)), bit(5));
  assert.equal(e.get(rc(2, 5)), bit(5));
  assert.ok(!e.has(rc(0, 1)) && !e.has(rc(4, 5)));
});

test('swordfish', () => {
  const g = blank();
  removeDigit(g, 3, others(row(0), [rc(0, 0), rc(0, 4)]));
  removeDigit(g, 3, others(row(3), [rc(3, 4), rc(3, 8)]));
  removeDigit(g, 3, others(row(7), [rc(7, 0), rc(7, 8)]));
  const e = elimMap(T.swordfish.find(g));
  assert.equal(e.get(rc(5, 0)), bit(3));
  assert.equal(e.get(rc(1, 8)), bit(3));
  assert.equal(e.get(rc(8, 4)), bit(3));
});

test('jellyfish', () => {
  const g = blank();
  removeDigit(g, 9, others(row(0), [rc(0, 0), rc(0, 3)]));
  removeDigit(g, 9, others(row(2), [rc(2, 3), rc(2, 6)]));
  removeDigit(g, 9, others(row(4), [rc(4, 6), rc(4, 8)]));
  removeDigit(g, 9, others(row(7), [rc(7, 0), rc(7, 8)]));
  const e = elimMap(T.jellyfish.find(g));
  assert.equal(e.get(rc(5, 0)), bit(9));
  assert.equal(e.get(rc(8, 6)), bit(9));
});

test('xy-wing', () => {
  const g = blank();
  setCands(g, rc(0, 0), [1, 2]);
  setCands(g, rc(0, 4), [1, 3]);
  setCands(g, rc(4, 0), [2, 3]);
  const e = elimMap(T.xyWing.find(g));
  assert.deepEqual([...e], [[rc(4, 4), bit(3)]]);
});

test('xyz-wing', () => {
  const g = blank();
  setCands(g, rc(0, 0), [1, 2, 3]);
  setCands(g, rc(0, 1), [1, 3]);
  setCands(g, rc(0, 4), [2, 3]);
  const e = elimMap(T.xyzWing.find(g));
  assert.equal(e.get(rc(0, 2)), bit(3));
  assert.equal(e.get(rc(0, 7)), bit(3));
  assert.ok(!e.has(rc(1, 0)));
});

test('unique rectangle type 1', () => {
  const g = blank();
  for (const c of [rc(0, 0), rc(0, 3), rc(1, 0)]) setCands(g, c, [1, 2]);
  setCands(g, rc(1, 3), [1, 2, 5, 7]);
  const s = T.uniqueRectangle.find(g);
  assert.deepEqual(s.elim, [[rc(1, 3), maskOf([1, 2])]]);
});

test('unique rectangle type 2 and 4', () => {
  const g = blank();
  for (const c of [rc(0, 0), rc(0, 3)]) setCands(g, c, [1, 2]);
  for (const c of [rc(4, 0), rc(4, 3)]) setCands(g, c, [1, 2, 6]);
  // rows 0 and 4 lie in different bands, columns 0 and 3 in different stacks:
  // that rectangle spans four boxes and must be ignored.
  assert.equal(T.uniqueRectangle.find(g), null);
  const h = blank();
  for (const c of [rc(0, 0), rc(0, 3)]) setCands(h, c, [1, 2]);
  for (const c of [rc(1, 0), rc(1, 3)]) setCands(h, c, [1, 2, 6]);
  const e = elimMap(T.uniqueRectangle.find(h));
  assert.equal(e.get(rc(1, 5)), bit(6)); // type 2
  const k = blank();
  for (const c of [rc(0, 0), rc(0, 3)]) setCands(k, c, [1, 2]);
  setCands(k, rc(1, 0), [1, 2, 6]);
  setCands(k, rc(1, 3), [1, 2, 7]);
  removeDigit(k, 1, others(row(1), [rc(1, 0), rc(1, 3)]));
  const e4 = elimMap(T.uniqueRectangle.find(k));
  assert.equal(e4.get(rc(1, 0)), bit(2)); // type 4
  assert.equal(e4.get(rc(1, 3)), bit(2));
});

test('unique rectangle is not used with cages', () => {
  assert.equal(T.uniqueRectangle.applies(blank([{ cells: [0, 1], sum: 3 }]).model), false);
});

test('x-chain (skyscraper)', () => {
  const g = blank();
  removeDigit(g, 1, others(col(0), [rc(0, 0), rc(6, 0)]));
  removeDigit(g, 1, others(col(4), [rc(1, 4), rc(6, 4)]));
  const s = T.xChain.find(g);
  assert.ok(s);
  const e = elimMap(s);
  // eliminated cells see both ends (0,0) and (1,4)
  for (const [c, m] of e) {
    assert.equal(m, bit(1));
    assert.ok(g.model.isPeer(c, rc(0, 0)) && g.model.isPeer(c, rc(1, 4)));
  }
  assert.equal(e.get(rc(1, 1)), bit(1));
});

test('xy-chain', () => {
  const g = blank();
  setCands(g, rc(0, 0), [1, 2]);
  setCands(g, rc(0, 4), [2, 3]);
  setCands(g, rc(4, 4), [3, 4]);
  setCands(g, rc(4, 8), [1, 4]);
  const e = elimMap(T.xyChain.find(g));
  assert.equal(e.get(rc(0, 8)), bit(1));
  assert.equal(e.get(rc(4, 0)), bit(1));
});

test('aic with mixed links', () => {
  const g = blank();
  removeDigit(g, 5, others(row(0), [rc(0, 0), rc(0, 6)]));
  removeDigit(g, 7, others(col(6), [rc(0, 6), rc(4, 6)]));
  removeDigit(g, 5, others(row(4), [rc(4, 1), rc(4, 6)]));
  setCands(g, rc(0, 6), [5, 7]);
  setCands(g, rc(4, 6), [5, 7]);
  const s = T.aic.find(g);
  assert.ok(s);
  const e = elimMap(s);
  assert.ok([...e.keys()].some((c) => [rc(0, 1), rc(4, 0), rc(1, 1), rc(2, 1)].includes(c)));
});

test('forcing chain (contradiction)', () => {
  const g = blank();
  setCands(g, rc(0, 0), [1, 2]);
  setCands(g, rc(0, 1), [1, 3]);
  setCands(g, rc(0, 2), [1, 3]);
  const s = T.forcingChain.find(g);
  assert.deepEqual(s.elim, [[rc(0, 0), bit(1)]]);
});

// ---- Killer ----

test('cage combinations (basic)', () => {
  const g = blank([{ cells: [0, 1], sum: 3 }]);
  const e = elimMap(T.cageCombo.find(g));
  assert.equal(e.get(0), 0x1ff & ~maskOf([1, 2]));
});

test('sum elimination', () => {
  const g = blank([{ cells: [0, 1], sum: 10 }]);
  setCands(g, 0, [1, 2, 3]);
  const e = elimMap(T.sumElimination.find(g));
  assert.equal(e.get(1) & maskOf([4, 5, 6]), maskOf([4, 5, 6]));
  assert.equal(e.get(1) & maskOf([7, 8, 9]), 0);
});

test('cage pointing', () => {
  const g = blank([{ cells: [0, 1], sum: 3 }]);
  setCands(g, 0, [1, 2]);
  setCands(g, 1, [1, 2]);
  const e = elimMap(T.cagePointing.find(g));
  assert.ok(e.get(rc(0, 5)) & bit(1) || e.get(rc(0, 5)) & bit(2));
});

test('rule of 45: innie', () => {
  const cages = [
    { cells: [0, 1, 2, 3, 4], sum: 15 },
    { cells: [5, 6, 7], sum: 24 },
    { cells: [8, 17], sum: 10 },
  ];
  const g = blank(cages);
  const s = T.innies45.find(g);
  const e = elimMap(s);
  assert.equal(e.get(8), 0x1ff & ~bit(6));
});

test('cage split (innie-outie difference)', () => {
  const cages = [
    { cells: [0, 1], sum: 3 },
    { cells: [2, 3, 4, 5, 6, 7, 11], sum: 42 },
    { cells: [8, 17], sum: 10 },
  ];
  const g = blank(cages);
  setCands(g, 11, [8, 9]);
  const e = elimMap(T.cageSplit.find(g));
  assert.equal(e.get(8), 0x1ff & ~maskOf([8, 9]));
});

test('rule of 45 over two rows', () => {
  // vertical dominoes over rows 0-1 in columns 0-7, a crossing cage in column 8
  const sol = [1, 2, 3, 4, 5, 6, 7, 8, 9, 4, 5, 6, 7, 8, 9, 1, 2, 3];
  const cages = [];
  for (let c = 0; c < 8; c++) cages.push({ cells: [c, c + 9], sum: sol[c] + sol[c + 9] });
  cages.push({ cells: [8, 17, 26], sum: 9 + 3 + 4 });
  const g = blank(cages);
  for (let k = 0; k < 20 && g.cands[26] !== bit(4); k++) {
    const s = T.multi45.find(g);
    if (!s) break;
    g.apply(s);
  }
  assert.equal(g.cands[26], bit(4));
});

test('combination conflict with a house', () => {
  const g = blank([{ cells: [0, 1], sum: 10 }]);
  removeDigit(g, 9, row(0).slice(2)); // 9 in row 0 only inside the cage
  const e = elimMap(T.comboConflict.find(g));
  assert.equal(e.get(0), 0x1ff & ~maskOf([1, 9]));
});
