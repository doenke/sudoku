// Chains: X-Chains, XY-Chains, alternating inference chains (AIC) and
// forcing chains. Candidates are nodes id = cell * 9 + (digit - 1).
//
// Implication graph: "x is off" -> "y is on" along a strong link,
// "y is on" -> "z is off" along a weak link. Starting from "s is off", every
// reached "e is on" proves "s or e". Candidates that see both s and e go.

import { POP, bit } from '../bits.js';
import { cageInfo } from './killer.js';
import { nakedSingle, hiddenSingle } from './basic.js';
import { cageCombo } from './killer.js';

const cellOf = (id) => (id / 9) | 0;
const digitOf = (id) => (id % 9) + 1;
const has = (g, id) => !g.values[cellOf(id)] && (g.cands[cellOf(id)] & bit(digitOf(id))) !== 0;

/** Strong links as adjacency lists; kind 'cell' (bivalue) or 'unit' (conjugate). */
function strongLinks(g) {
  const links = Array.from({ length: 729 }, () => []);
  const add = (a, b, kind) => { links[a].push({ to: b, kind }); links[b].push({ to: a, kind }); };
  for (let i = 0; i < 81; i++) {
    if (g.values[i] || POP[g.cands[i]] !== 2) continue;
    const m = g.cands[i];
    const d1 = 32 - Math.clz32(m & -m), d2 = 32 - Math.clz32(m);
    add(i * 9 + d1 - 1, i * 9 + d2 - 1, 'cell');
  }
  const { model } = g;
  for (const unit of model.units) {
    let need;
    if (unit.full) {
      need = 0x1ff;
      for (const c of unit.cells) if (g.values[c]) need &= ~bit(g.values[c]);
    } else {
      const { combos } = cageInfo(g, unit.index);
      need = combos.length ? combos.reduce((a, m) => a & m, 0x1ff) : 0;
    }
    for (let d = 1; d <= 9; d++) {
      if (!(need & bit(d))) continue;
      const pos = unit.cells.filter((c) => !g.values[c] && g.cands[c] & bit(d));
      if (pos.length === 2) add(pos[0] * 9 + d - 1, pos[1] * 9 + d - 1, 'unit');
    }
  }
  return links;
}

function weakNeighbours(g, id, filter) {
  const c = cellOf(id), d = digitOf(id);
  const out = [];
  if (filter.inCell) {
    let m = g.cands[c] & ~bit(d);
    while (m) { const b = m & -m; m ^= b; out.push(c * 9 + (31 - Math.clz32(b))); }
  }
  if (filter.sameDigit) {
    for (const p of g.model.peers[c]) if (!g.values[p] && g.cands[p] & bit(d)) out.push(p * 9 + d - 1);
  }
  return out;
}

const weak = (g, a, b) => {
  if (a === b) return false;
  const ca = cellOf(a), cb = cellOf(b);
  if (ca === cb) return true;
  return digitOf(a) === digitOf(b) && g.model.isPeer(ca, cb);
};

function eliminationsFor(g, s, e) {
  const elim = [];
  const cs = cellOf(s), ce = cellOf(e), ds = digitOf(s), de = digitOf(e);
  if (ds === de) {
    for (const p of g.model.peers[cs]) {
      if (p !== ce && !g.values[p] && g.cands[p] & bit(ds) && g.model.isPeer(p, ce)) elim.push([p, bit(ds)]);
    }
  } else if (cs === ce) {
    const x = g.cands[cs] & ~bit(ds) & ~bit(de);
    if (x) elim.push([cs, x]);
  } else {
    if (has(g, ce * 9 + ds - 1) && weak(g, ce * 9 + ds - 1, s)) elim.push([ce, bit(ds)]);
    if (has(g, cs * 9 + de - 1) && weak(g, cs * 9 + de - 1, e)) elim.push([cs, bit(de)]);
  }
  return elim;
}

/**
 * Breadth-first search over the implication graph, shortest chains first.
 * opts: strong(kind) -> bool, weak filter, startOk(id), maxLinks.
 */
function searchChains(g, opts) {
  const links = strongLinks(g);
  const starts = [];
  for (let id = 0; id < 729; id++) if (has(g, id) && links[id].some((l) => opts.strong(l.kind)) && opts.startOk(g, id)) starts.push(id);
  let best = null;
  for (const s of starts) {
    // state: id*2 + (on ? 1 : 0)
    const dist = new Int16Array(1458).fill(-1);
    let frontier = [s * 2];
    dist[s * 2] = 0;
    for (let depth = 0; depth < opts.maxLinks && frontier.length; depth++) {
      const next = [];
      for (const st of frontier) {
        const id = st >> 1, on = st & 1;
        const targets = on
          ? weakNeighbours(g, id, opts.weak).filter((t) => opts.weakOk(g, id, t)).map((t) => t * 2)
          : links[id].filter((l) => opts.strong(l.kind)).map((l) => l.to * 2 + 1);
        for (const t of targets) {
          if (dist[t] >= 0) continue;
          dist[t] = depth + 1;
          next.push(t);
          if (t & 1) {
            const e = t >> 1;
            if (e === s) return { place: [[cellOf(s), digitOf(s)]], info: { length: depth + 1 } };
            if (best && best.length <= depth + 1) continue;
            const elim = eliminationsFor(g, s, e);
            if (elim.length) best = { elim, length: depth + 1, info: { start: s, end: e, length: depth + 1 } };
          }
        }
      }
      frontier = next;
      if (best && best.length <= depth + 1) break;
    }
    if (best) return best;
  }
  return null;
}

export const xChain = {
  key: 'xChain',
  find(g) {
    for (let d = 1; d <= 9; d++) {
      const r = searchChains(g, {
        strong: (kind) => kind === 'unit',
        weak: { inCell: false, sameDigit: true },
        weakOk: () => true,
        startOk: (gg, id) => digitOf(id) === d,
        maxLinks: 11,
      });
      if (r) return r;
    }
    return null;
  },
};

export const xyChain = {
  key: 'xyChain',
  find(g) {
    const bivalue = (gg, id) => POP[gg.cands[cellOf(id)]] === 2;
    return searchChains(g, {
      strong: (kind) => kind === 'cell',
      weak: { inCell: false, sameDigit: true },
      weakOk: (gg, a, b) => bivalue(gg, b),
      startOk: bivalue,
      maxLinks: 13,
    });
  },
};

export const aic = {
  key: 'aic',
  find(g) {
    return searchChains(g, {
      strong: () => true,
      weak: { inCell: true, sameDigit: true },
      weakOk: () => true,
      startOk: () => true,
      maxLinks: 13,
    });
  },
};

// ---- Forcing chains ---------------------------------------------------------

const PROPAGATORS = [nakedSingle, hiddenSingle, cageCombo];

/** Applies singles (and basic cage combinations) until nothing changes. */
function propagate(g) {
  for (let guard = 0; guard < 200; guard++) {
    if (g.broken()) return false;
    let moved = false;
    for (const t of PROPAGATORS) {
      if (t === cageCombo && !g.model.cages.length) continue;
      const step = t.find(g);
      if (step && g.apply(step)) { moved = true; break; }
    }
    if (!moved) return !g.broken();
  }
  return !g.broken();
}

function commonConclusions(g, branches) {
  const place = [], elim = [];
  for (let i = 0; i < 81; i++) {
    if (g.values[i]) continue;
    const v = branches[0].values[i];
    if (v && branches.every((b) => b.values[i] === v)) { place.push([i, v]); continue; }
    let gone = g.cands[i];
    for (const b of branches) gone &= ~b.cands[i];
    if (gone) elim.push([i, gone]);
  }
  return place.length || elim.length ? { place, elim } : null;
}

export const forcingChain = {
  key: 'forcingChain',
  find(g) {
    // Cell forcing: try every candidate of a cell with 2-3 candidates.
    const cells = [];
    for (let i = 0; i < 81; i++) if (!g.values[i] && POP[g.cands[i]] <= 3) cells.push(i);
    cells.sort((a, b) => POP[g.cands[a]] - POP[g.cands[b]]);
    for (const i of cells) {
      const branches = [];
      let m = g.cands[i];
      while (m) {
        const b = m & -m;
        m ^= b;
        const d = 32 - Math.clz32(b);
        const h = g.clone();
        h.place(i, d);
        if (!propagate(h)) return { elim: [[i, b]], info: { type: 'contradiction', cell: i } };
        branches.push(h);
      }
      const s = commonConclusions(g, branches);
      if (s) return { ...s, info: { type: 'cell', cell: i } };
    }
    // Unit forcing: every position of a digit in a house.
    for (const u of g.model.houses) {
      const ucells = g.model.units[u].cells;
      for (let d = 1; d <= 9; d++) {
        const pos = ucells.filter((c) => !g.values[c] && g.cands[c] & bit(d));
        if (pos.length < 2 || pos.length > 3) continue;
        const branches = [];
        for (const c of pos) {
          const h = g.clone();
          h.place(c, d);
          if (!propagate(h)) return { elim: [[c, bit(d)]], info: { type: 'contradiction', cell: c } };
          branches.push(h);
        }
        const s = commonConclusions(g, branches);
        if (s) return { ...s, info: { type: 'unit', unit: u, digit: d } };
      }
    }
    return null;
  },
};
