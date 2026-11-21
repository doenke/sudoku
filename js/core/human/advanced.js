// Fish, wings and unique rectangles.

import { POP, bit, lowDigit } from '../bits.js';
import { rowOf, colOf, boxOf } from '../model.js';
import { combinations } from './basic.js';

const lines = (kind) => Array.from({ length: 9 }, (_, k) =>
  Array.from({ length: 9 }, (_, j) => (kind === 'row' ? k * 9 + j : j * 9 + k)));
const ROWS = lines('row');
const COLS = lines('col');

function fish(n, key) {
  return {
    key,
    applies: (model) => model.variant.houses.includes('row') && model.variant.houses.includes('col'),
    find(g) {
      for (const [base, cover] of [[ROWS, COLS], [COLS, ROWS]]) {
        for (let d = 1; d <= 9; d++) {
          const m = bit(d);
          const cand = [];
          base.forEach((cells, k) => {
            if (cells.some((c) => g.values[c] === d)) return;
            let pos = 0;
            cells.forEach((c, j) => { if (!g.values[c] && g.cands[c] & m) pos |= 1 << j; });
            if (POP[pos] >= 2 && POP[pos] <= n) cand.push([k, pos]);
          });
          if (cand.length < n) continue;
          for (const combo of combinations(cand, n)) {
            let union = 0;
            for (const [, pos] of combo) union |= pos;
            if (POP[union] !== n) continue;
            const baseIdx = new Set(combo.map(([k]) => k));
            const elim = [];
            for (let j = 0; j < 9; j++) {
              if (!(union & (1 << j))) continue;
              cover[j].forEach((c, k) => {
                if (!baseIdx.has(k) && !g.values[c] && g.cands[c] & m) elim.push([c, m]);
              });
            }
            if (elim.length) return { elim, info: { digit: d } };
          }
        }
      }
      return null;
    },
  };
}

export const xWing = fish(2, 'xWing');
export const swordfish = fish(3, 'swordfish');
export const jellyfish = fish(4, 'jellyfish');

const seesAll = (g, c, cells) => cells.every((x) => x !== c && g.model.isPeer(c, x));

export const xyWing = {
  key: 'xyWing',
  find(g) {
    const bi = [];
    for (let i = 0; i < 81; i++) if (!g.values[i] && POP[g.cands[i]] === 2) bi.push(i);
    for (const p of bi) {
      const pm = g.cands[p];
      const wings = bi.filter((w) => w !== p && g.model.isPeer(p, w) && POP[g.cands[w] & pm] === 1);
      for (let a = 0; a < wings.length; a++) {
        for (let b = a + 1; b < wings.length; b++) {
          const x = wings[a], y = wings[b];
          const cx = g.cands[x] & ~pm, cy = g.cands[y] & ~pm;
          if (cx !== cy || (g.cands[x] & pm) === (g.cands[y] & pm)) continue;
          const elim = [];
          for (const c of g.model.peers[x]) {
            if (!g.values[c] && c !== y && g.cands[c] & cx && g.model.isPeer(c, y)) elim.push([c, cx]);
          }
          if (elim.length) return { elim, info: { cells: [p, x, y] } };
        }
      }
    }
    return null;
  },
};

export const xyzWing = {
  key: 'xyzWing',
  find(g) {
    for (let p = 0; p < 81; p++) {
      if (g.values[p] || POP[g.cands[p]] !== 3) continue;
      const pm = g.cands[p];
      const wings = [];
      for (const w of g.model.peers[p]) {
        if (!g.values[w] && POP[g.cands[w]] === 2 && (g.cands[w] & pm) === g.cands[w]) wings.push(w);
      }
      for (let a = 0; a < wings.length; a++) {
        for (let b = a + 1; b < wings.length; b++) {
          const x = wings[a], y = wings[b];
          if ((g.cands[x] | g.cands[y]) !== pm) continue;
          const z = g.cands[x] & g.cands[y];
          if (POP[z] !== 1) continue;
          const elim = [];
          for (const c of g.model.peers[p]) {
            if (!g.values[c] && c !== x && c !== y && g.cands[c] & z && seesAll(g, c, [x, y])) elim.push([c, z]);
          }
          if (elim.length) return { elim, info: { cells: [p, x, y] } };
        }
      }
    }
    return null;
  },
};

// Unique rectangles rely on the puzzle having one solution and on the fact
// that swapping two digits in the rectangle keeps every constraint intact.
// With cages (or other extra constraints) that is not guaranteed, so the
// technique only applies to plain row/column/box models.
export const uniqueRectangle = {
  key: 'uniqueRectangle',
  applies: (model) => model.cages.length === 0 && model.units.length === 27,
  find(g) {
    const { isPeer } = g.model;
    for (let r1 = 0; r1 < 9; r1++) for (let r2 = r1 + 1; r2 < 9; r2++) {
      for (let c1 = 0; c1 < 9; c1++) for (let c2 = c1 + 1; c2 < 9; c2++) {
        const sameBand = ((r1 / 3) | 0) === ((r2 / 3) | 0);
        const sameStack = ((c1 / 3) | 0) === ((c2 / 3) | 0);
        if (sameBand === sameStack) continue; // must span exactly two boxes
        const cells = [r1 * 9 + c1, r1 * 9 + c2, r2 * 9 + c1, r2 * 9 + c2];
        if (cells.some((c) => g.values[c])) continue;
        let common = 0x1ff;
        for (const c of cells) common &= g.cands[c];
        if (POP[common] < 2) continue;
        for (const [x, y] of combinations(digitsOfMask(common), 2)) {
          const pair = bit(x) | bit(y);
          const exact = cells.filter((c) => g.cands[c] === pair);
          const extra = cells.filter((c) => g.cands[c] !== pair);
          if (exact.length === 3) {
            return { elim: [[extra[0], pair]], info: { type: 1, cells } };
          }
          if (exact.length !== 2) continue;
          const [e1, e2] = extra;
          if (rowOf(e1) !== rowOf(e2) && colOf(e1) !== colOf(e2)) continue; // diagonal roof: skip
          const x1 = g.cands[e1] & ~pair, x2 = g.cands[e2] & ~pair;
          // Type 2: both roof cells have the same single extra digit.
          if (x1 === x2 && POP[x1] === 1) {
            const elim = [];
            for (const c of g.model.peers[e1]) {
              if (c !== e2 && !g.values[c] && g.cands[c] & x1 && isPeer(c, e2) && !cells.includes(c)) elim.push([c, x1]);
            }
            if (elim.length) return { elim, info: { type: 2, cells } };
          }
          const shared = g.model.houses.filter((u) => {
            const uc = g.model.units[u].cells;
            return uc.includes(e1) && uc.includes(e2);
          });
          // Type 4: one of the pair digits is locked to the roof in a shared house.
          for (const u of shared) {
            const uc = g.model.units[u].cells;
            for (const [keep, drop] of [[x, y], [y, x]]) {
              const kb = bit(keep);
              const pos = uc.filter((c) => !g.values[c] && g.cands[c] & kb);
              if (pos.length === 2 && pos.includes(e1) && pos.includes(e2)) {
                return { elim: [[e1, bit(drop)], [e2, bit(drop)]], info: { type: 4, cells } };
              }
            }
          }
          // Type 3: the extras of the roof form a naked pair with another cell.
          const xu = x1 | x2;
          if (POP[xu] === 2) {
            for (const u of shared) {
              const uc = g.model.units[u].cells;
              const partner = uc.find((c) => !g.values[c] && c !== e1 && c !== e2 && g.cands[c] === xu);
              if (partner === undefined) continue;
              const elim = [];
              for (const c of uc) {
                if (c !== e1 && c !== e2 && c !== partner && !g.values[c] && g.cands[c] & xu) elim.push([c, xu]);
              }
              if (elim.length) return { elim, info: { type: 3, cells } };
            }
          }
        }
      }
    }
    return null;
  },
};

function digitsOfMask(m) {
  const out = [];
  while (m) { const b = m & -m; m ^= b; out.push(lowDigit(b)); }
  return out;
}

export { boxOf };
