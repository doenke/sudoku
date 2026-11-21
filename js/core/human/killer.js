// Killer techniques: cage combinations, sum reasoning and the rule of 45.

import { POP, bit, digitsOf } from '../bits.js';
import { combosFor, assignable } from '../combos.js';
import { rowOf, colOf, boxOf } from '../model.js';

const hasCages = (model) => model.cages.length > 0;

/** Empty cells, remaining sum and the combinations that fit the candidates. */
export function cageInfo(g, k) {
  const cage = g.model.cages[k];
  let placed = 0, rem = cage.sum;
  const empty = [];
  let union = 0;
  for (const c of cage.cells) {
    const v = g.values[c];
    if (v) { placed |= bit(v); rem -= v; } else { empty.push(c); union |= g.cands[c]; }
  }
  const combos = empty.length
    ? combosFor(rem, empty.length).filter((m) => {
        if (m & placed || m & ~union) return false;
        for (const d of digitsOf(m)) if (!empty.some((c) => g.cands[c] & bit(d))) return false;
        return true;
      })
    : [];
  return { cage, empty, rem, placed, combos };
}

/** Per empty cell the digits that occur in a valid distribution of some combination. */
function comboSupport(g, empty, combos) {
  const support = new Uint16Array(empty.length);
  const valid = [];
  for (const m of combos) {
    const s = new Uint16Array(empty.length);
    if (assignable(empty, m, g.cands, s)) {
      valid.push(m);
      for (let k = 0; k < empty.length; k++) support[k] |= s[k];
    }
  }
  return { support, valid };
}

/**
 * Generic sum constraint: Σ coeff[k] * value(cells[k]) = target, cells that
 * are peers must differ. Returns per cell the supported candidates, or null
 * if the search gets too large.
 */
export function supportSum(g, cells, coeffs, target, maxNodes = 50000) {
  const n = cells.length;
  const order = cells.map((_, k) => k).sort((a, b) => POP[g.cands[cells[a]]] - POP[g.cands[cells[b]]]);
  const lo = new Int16Array(n + 1), hi = new Int16Array(n + 1);
  for (let i = n - 1; i >= 0; i--) {
    const k = order[i];
    const ds = digitsOf(g.cands[cells[k]]);
    const a = coeffs[k] * ds[0], b = coeffs[k] * ds[ds.length - 1];
    lo[i] = lo[i + 1] + Math.min(a, b);
    hi[i] = hi[i + 1] + Math.max(a, b);
  }
  const sup = new Uint16Array(n);
  const val = new Int8Array(n);
  let nodes = 0, aborted = false;
  const full = () => { for (let k = 0; k < n; k++) if (sup[k] !== g.cands[cells[k]]) return false; return true; };
  const go = (i, sum) => {
    if (++nodes > maxNodes) { aborted = true; return true; }
    if (i === n) {
      if (sum !== target) return false;
      for (let k = 0; k < n; k++) sup[k] |= bit(val[k]);
      return full();
    }
    const k = order[i];
    const c = cells[k];
    let opts = g.cands[c];
    while (opts) {
      const b = opts & -opts;
      opts ^= b;
      const d = 32 - Math.clz32(b);
      let clash = false;
      for (let j = 0; j < i; j++) {
        const kj = order[j];
        if (val[kj] === d && g.model.isPeer(c, cells[kj])) { clash = true; break; }
      }
      if (clash) continue;
      const s = sum + coeffs[k] * d;
      if (s + lo[i + 1] > target || s + hi[i + 1] < target) continue;
      val[k] = d;
      if (go(i + 1, s)) return true;
    }
    val[k] = 0;
    return false;
  };
  go(0, 0);
  return aborted ? null : sup;
}

function elimFromSupport(g, cells, sup) {
  const elim = [];
  cells.forEach((c, k) => { const x = g.cands[c] & ~sup[k]; if (x) elim.push([c, x]); });
  return elim;
}

// Basic: restrict cells to the digits of fitting combinations; a digit that
// every combination needs and only one cell can take goes there.
export const cageCombo = {
  key: 'cageCombo',
  applies: hasCages,
  find(g) {
    const elim = [], place = [];
    g.model.cages.forEach((_, k) => {
      const { empty, combos } = cageInfo(g, k);
      if (!empty.length) return;
      let union = 0, req = 0x1ff;
      for (const m of combos) { union |= m; req &= m; }
      if (!combos.length) req = 0;
      for (const c of empty) if (g.cands[c] & ~union) elim.push([c, g.cands[c] & ~union]);
      for (const d of digitsOf(req)) {
        const pos = empty.filter((c) => g.cands[c] & bit(d) & union);
        if (pos.length === 1) place.push([pos[0], d]);
      }
    });
    if (!elim.length && !place.length) return null;
    // keep placements consistent: one per cell
    const seen = new Set();
    return { elim, place: place.filter(([c]) => (seen.has(c) ? false : seen.add(c))) };
  },
};

// Sum elimination: a candidate stays only if the other cells of the cage can
// still complete the sum with distinct digits (min/max reasoning and more).
export const sumElimination = {
  key: 'sumElimination',
  applies: hasCages,
  find(g) {
    const elim = [];
    g.model.cages.forEach((_, k) => {
      const { empty, combos } = cageInfo(g, k);
      if (empty.length < 2) return;
      const { support } = comboSupport(g, empty, combos);
      elim.push(...elimFromSupport(g, empty, support));
    });
    return elim.length ? { elim } : null;
  },
};

// A digit that every combination of the cage contains is in the cage; cells
// outside that see all its possible positions lose it.
export const cagePointing = {
  key: 'cagePointing',
  applies: hasCages,
  find(g) {
    for (let k = 0; k < g.model.cages.length; k++) {
      const { empty, combos, cage } = cageInfo(g, k);
      if (!combos.length) continue;
      let req = 0x1ff;
      for (const m of combos) req &= m;
      for (const d of digitsOf(req)) {
        const b = bit(d);
        const pos = empty.filter((c) => g.cands[c] & b);
        if (!pos.length) continue;
        const elim = [];
        for (const c of g.model.peers[pos[0]]) {
          if (g.values[c] || !(g.cands[c] & b) || cage.cells.includes(c)) continue;
          if (pos.every((p) => g.model.isPeer(c, p))) elim.push([c, b]);
        }
        if (elim.length) return { elim, info: { cage: k, digit: d } };
      }
    }
    return null;
  },
};

// Combination conflicts: a combination drops out when a house forces a digit
// into the cage that the combination lacks, or when it collides with every
// combination of another cage whose cells all see each other.
export const comboConflict = {
  key: 'comboConflict',
  applies: hasCages,
  find(g) {
    const { model } = g;
    const infos = model.cages.map((_, k) => {
      const info = cageInfo(g, k);
      info.valid = comboSupport(g, info.empty, info.combos).valid;
      return info;
    });
    for (let k = 0; k < infos.length; k++) {
      const A = infos[k];
      if (A.empty.length < 2 || A.valid.length < 2) continue;
      const inA = new Set(A.empty);
      let forced = 0;
      for (const u of model.houses) {
        const cells = model.units[u].cells;
        for (let d = 1; d <= 9; d++) {
          const b = bit(d);
          if (A.placed & b) continue;
          const pos = cells.filter((c) => !g.values[c] && g.cands[c] & b);
          if (pos.length && pos.every((c) => inA.has(c)) && !cells.some((c) => g.values[c] === d)) forced |= b;
        }
      }
      let keep = A.valid.filter((m) => (m & forced) === forced);
      for (let j = 0; j < infos.length && keep.length; j++) {
        const B = infos[j];
        if (j === k || !B.empty.length || !B.valid.length) continue;
        const allSee = A.empty.every((a) => B.empty.every((b) => model.isPeer(a, b)));
        if (!allSee) continue;
        keep = keep.filter((m) => B.valid.some((o) => !(o & m)));
      }
      if (keep.length === A.valid.length) continue;
      const { support } = comboSupport(g, A.empty, keep);
      const elim = elimFromSupport(g, A.empty, support);
      if (elim.length) return { elim, info: { cage: k } };
    }
    return null;
  },
};

// ---- Rule of 45 -------------------------------------------------------------

function regions(model) {
  if (model.cache.regions) return model.cache.regions;
  const single = [], multi = [];
  const rowCells = (r) => Array.from({ length: 9 }, (_, c) => r * 9 + c);
  const colCells = (c) => Array.from({ length: 9 }, (_, r) => r * 9 + c);
  const boxCells = (b) => Array.from({ length: 81 }, (_, i) => i).filter((i) => boxOf(i) === b);
  for (const u of model.houses) single.push({ cells: model.units[u].cells, houses: 1 });
  for (const [mk] of [[rowCells], [colCells]]) {
    for (let a = 0; a < 9; a++) {
      for (const len of [2, 3]) {
        if (a + len > 9) continue;
        const cells = [];
        for (let k = 0; k < len; k++) cells.push(...mk(a + k));
        multi.push({ cells, houses: len });
      }
    }
  }
  // two boxes of the same band or stack
  for (let a = 0; a < 9; a++) for (let b = a + 1; b < 9; b++) {
    if (((a / 3) | 0) === ((b / 3) | 0) || a % 3 === b % 3) multi.push({ cells: [...boxCells(a), ...boxCells(b)], houses: 2 });
  }
  model.cache.regions = { single, multi };
  return model.cache.regions;
}

/**
 * Linear constraints from a region of whole houses (sum 45 per house).
 * mode 'pure': innies or outies only; 'mixed': some crossing cages split.
 */
function regionConstraints(g, region, mode, maxCells) {
  const { model } = g;
  const inR = new Uint8Array(81);
  for (const c of region.cells) inR[c] = 1;
  let target = 45 * region.houses;
  const partial = [];
  const seen = new Set();
  for (const c of region.cells) {
    const k = model.cellCage[c];
    if (k < 0 || seen.has(k)) continue;
    seen.add(k);
    const cage = model.cages[k];
    if (cage.cells.every((x) => inR[x])) target -= cage.sum;
    else partial.push(cage);
  }
  // cells not covered by any cage count as innies with unknown value
  const loose = region.cells.filter((c) => model.cellCage[c] < 0);
  const m = partial.length;
  if (!m || m > 6) return [];
  const out = [];
  for (let rep = 0; rep < 1 << m; rep++) {
    const isPure = rep === 0 || rep === (1 << m) - 1;
    if ((mode === 'pure') !== isPure) continue;
    let t = target;
    const cells = [], coeffs = [];
    const add = (c, k) => {
      if (g.values[c]) t -= k * g.values[c];
      else { cells.push(c); coeffs.push(k); }
    };
    for (const c of loose) add(c, 1);
    partial.forEach((cage, j) => {
      if (rep & (1 << j)) {
        t -= cage.sum;
        for (const c of cage.cells) if (!inR[c]) add(c, -1);
      } else {
        for (const c of cage.cells) if (inR[c]) add(c, 1);
      }
    });
    if (cells.length && cells.length <= maxCells) out.push({ cells, coeffs, target: t });
  }
  return out;
}

function applyConstraints(g, list) {
  for (const { cells, coeffs, target } of list) {
    const sup = supportSum(g, cells, coeffs, target);
    if (!sup) continue;
    const elim = elimFromSupport(g, cells, sup);
    if (elim.length) return { elim, info: { cells } };
  }
  return null;
}

export const innies45 = {
  key: 'innies45',
  applies: hasCages,
  find(g) {
    for (const r of regions(g.model).single) {
      const s = applyConstraints(g, regionConstraints(g, r, 'pure', 6));
      if (s) return s;
    }
    return null;
  },
};

export const cageSplit = {
  key: 'cageSplit',
  applies: hasCages,
  find(g) {
    for (const r of regions(g.model).single) {
      const s = applyConstraints(g, regionConstraints(g, r, 'mixed', 5));
      if (s) return s;
    }
    return null;
  },
};

export const multi45 = {
  key: 'multi45',
  applies: hasCages,
  find(g) {
    for (const r of regions(g.model).multi) {
      const s = applyConstraints(g, [
        ...regionConstraints(g, r, 'pure', 6),
        ...regionConstraints(g, r, 'mixed', 5),
      ]);
      if (s) return s;
    }
    return null;
  },
};

export { rowOf, colOf };
