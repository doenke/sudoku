// Singles, locked candidates and subsets. All of them work on the generic
// units of the model, so they apply to any variant.

import { POP, lowDigit, bit } from '../bits.js';

export const nakedSingle = {
  key: 'nakedSingle',
  find(g) {
    const place = [];
    for (let i = 0; i < 81; i++) if (!g.values[i] && POP[g.cands[i]] === 1) place.push([i, lowDigit(g.cands[i])]);
    return place.length ? { place } : null;
  },
};

export const hiddenSingle = {
  key: 'hiddenSingle',
  find(g) {
    const place = [];
    const taken = new Set();
    for (const u of g.model.houses) {
      const cells = g.model.units[u].cells;
      let once = 0, twice = 0, placed = 0;
      for (const c of cells) {
        if (g.values[c]) { placed |= bit(g.values[c]); continue; }
        twice |= once & g.cands[c];
        once |= g.cands[c];
      }
      let single = once & ~twice & ~placed;
      while (single) {
        const b = single & -single;
        single ^= b;
        const c = cells.find((x) => !g.values[x] && g.cands[x] & b);
        if (!taken.has(c)) { taken.add(c); place.push([c, lowDigit(b)]); }
      }
    }
    return place.length ? { place } : null;
  },
};

/** Pairs of units with at least two common cells; the first one is a house. */
function unitPairs(model) {
  if (model.cache.pairs) return model.cache.pairs;
  const pairs = [];
  for (const a of model.houses) {
    const A = new Set(model.units[a].cells);
    model.units.forEach((ub, b) => {
      if (b === a) return;
      const inter = ub.cells.filter((c) => A.has(c));
      if (inter.length >= 2 && inter.length < ub.cells.length) pairs.push({ a, b, inter: new Set(inter) });
    });
  }
  model.cache.pairs = pairs;
  return pairs;
}

// If a digit can only go into the intersection of house A and unit B, it is
// in B there, and every other cell of B loses it (pointing / box-line).
export const lockedCandidates = {
  key: 'lockedCandidates',
  find(g) {
    for (const { a, b, inter } of unitPairs(g.model)) {
      const A = g.model.units[a].cells, B = g.model.units[b].cells;
      for (let d = 1; d <= 9; d++) {
        const m = bit(d);
        let inside = false, outside = false;
        for (const c of A) {
          if (g.values[c] === d) { outside = true; break; }
          if (!g.values[c] && g.cands[c] & m) { if (inter.has(c)) inside = true; else { outside = true; break; } }
        }
        if (!inside || outside) continue;
        const elim = [];
        for (const c of B) if (!inter.has(c) && !g.values[c] && g.cands[c] & m) elim.push([c, m]);
        if (elim.length) return { elim, info: { digit: d, units: [a, b] } };
      }
    }
    return null;
  },
};

function* combinations(arr, k, start = 0, acc = []) {
  if (acc.length === k) { yield acc; return; }
  for (let i = start; i <= arr.length - (k - acc.length); i++) {
    acc.push(arr[i]);
    yield* combinations(arr, k, i + 1, acc);
    acc.pop();
  }
}

function nakedSubset(n, key) {
  return {
    key,
    find(g) {
      for (const unit of g.model.units) {
        const empty = unit.cells.filter((c) => !g.values[c]);
        if (empty.length <= n) continue;
        const pool = empty.filter((c) => POP[g.cands[c]] >= 2 && POP[g.cands[c]] <= n);
        if (pool.length < n) continue;
        for (const combo of combinations(pool, n)) {
          let union = 0;
          for (const c of combo) union |= g.cands[c];
          if (POP[union] !== n) continue;
          const elim = [];
          for (const c of empty) if (!combo.includes(c) && g.cands[c] & union) elim.push([c, union]);
          if (elim.length) return { elim, info: { cells: [...combo] } };
        }
      }
      return null;
    },
  };
}

function hiddenSubset(n, key) {
  return {
    key,
    find(g) {
      for (const u of g.model.houses) {
        const cells = g.model.units[u].cells;
        const pos = new Uint16Array(10); // digit -> bitmask over unit index
        let placed = 0;
        cells.forEach((c, k) => {
          if (g.values[c]) { placed |= bit(g.values[c]); return; }
          for (let d = 1; d <= 9; d++) if (g.cands[c] & bit(d)) pos[d] |= 1 << k;
        });
        const free = [];
        for (let d = 1; d <= 9; d++) if (!(placed & bit(d)) && POP[pos[d]] >= 1 && POP[pos[d]] <= n) free.push(d);
        if (9 - POP[placed] <= n) continue;
        for (const combo of combinations(free, n)) {
          let where = 0, dm = 0;
          for (const d of combo) { where |= pos[d]; dm |= bit(d); }
          if (POP[where] !== n) continue;
          const elim = [];
          cells.forEach((c, k) => {
            if (where & (1 << k) && g.cands[c] & ~dm) elim.push([c, g.cands[c] & ~dm]);
          });
          if (elim.length) return { elim, info: { digits: [...combo] } };
        }
      }
      return null;
    },
  };
}

export const nakedPair = nakedSubset(2, 'nakedPair');
export const nakedTriple = nakedSubset(3, 'nakedTriple');
export const nakedQuad = nakedSubset(4, 'nakedQuad');
export const hiddenPair = hiddenSubset(2, 'hiddenPair');
export const hiddenTriple = hiddenSubset(3, 'hiddenTriple');
export const hiddenQuad = hiddenSubset(4, 'hiddenQuad');

export { combinations };
