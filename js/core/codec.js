// Compact encoding of a puzzle for share links (#…) and the puzzle bank.
//
// Bit stream, written MSB first, then base64url:
//   4 bit  format version (1)
//   8 bit  flags: 1 = givens, 2 = cages, 4 = diagonals, rest reserved
//   3 bit  level (0 = unknown, 1 schwer, 2 extrem, 3 teuflisch)
//   givens: 81 bit presence mask, then 4 bit per given digit
//   cages:  per cell 2 bit: 0 new cage, 1 same as left, 2 same as above,
//           3 back reference followed by 6 bit cage number;
//           then 6 bit sum per cage in order of first appearance.

import { VARIANTS, variantFromFlags } from './variants.js';
import { rowOf, colOf } from './model.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const FORMAT = 1;
const F_GIVENS = 1, F_CAGES = 2, F_DIAG = 4;

class BitWriter {
  constructor() { this.bits = []; }
  write(value, n) { for (let i = n - 1; i >= 0; i--) this.bits.push((value >> i) & 1); }
  toString() {
    let s = '';
    for (let i = 0; i < this.bits.length; i += 6) {
      let v = 0;
      for (let k = 0; k < 6; k++) v = (v << 1) | (this.bits[i + k] || 0);
      s += ALPHABET[v];
    }
    return s;
  }
}

class BitReader {
  constructor(str) {
    this.bits = [];
    for (const ch of str) {
      const v = ALPHABET.indexOf(ch);
      if (v < 0) throw new Error('invalid character');
      for (let k = 5; k >= 0; k--) this.bits.push((v >> k) & 1);
    }
    this.pos = 0;
  }
  read(n) {
    if (this.pos + n > this.bits.length) throw new Error('code too short');
    let v = 0;
    for (let i = 0; i < n; i++) v = (v << 1) | this.bits[this.pos++];
    return v;
  }
}

export function encodePuzzle(puzzle) {
  const variant = VARIANTS[puzzle.variant];
  const hasGivens = puzzle.givens.some((d) => d > 0);
  const hasCages = variant.cages && puzzle.cages.length > 0;
  const w = new BitWriter();
  w.write(FORMAT, 4);
  w.write((hasGivens ? F_GIVENS : 0) | (hasCages ? F_CAGES : 0) | (variant.houses.includes('diag') ? F_DIAG : 0), 8);
  w.write(puzzle.level || 0, 3);
  if (hasGivens) {
    for (let i = 0; i < 81; i++) w.write(puzzle.givens[i] ? 1 : 0, 1);
    for (let i = 0; i < 81; i++) if (puzzle.givens[i]) w.write(puzzle.givens[i], 4);
  }
  if (hasCages) {
    const cageOf = new Int16Array(81).fill(-1);
    puzzle.cages.forEach((c, k) => c.cells.forEach((cell) => { cageOf[cell] = k; }));
    if (cageOf.some((k) => k < 0)) throw new Error('cages must cover the grid');
    const order = []; // original cage index by appearance
    const number = new Map();
    for (let i = 0; i < 81; i++) {
      const k = cageOf[i];
      if (colOf(i) > 0 && cageOf[i - 1] === k) w.write(1, 2);
      else if (rowOf(i) > 0 && cageOf[i - 9] === k) w.write(2, 2);
      else if (!number.has(k)) { number.set(k, order.length); order.push(k); w.write(0, 2); }
      else { w.write(3, 2); w.write(number.get(k), 6); }
    }
    for (const k of order) w.write(puzzle.cages[k].sum, 6);
  }
  return w.toString();
}

export function decodePuzzle(code) {
  const r = new BitReader(code.trim());
  const format = r.read(4);
  if (format !== FORMAT) throw new Error('unknown format');
  const flags = r.read(8);
  const level = r.read(3);
  const variant = variantFromFlags({ cages: flags & F_CAGES, diagonals: flags & F_DIAG });
  if (!VARIANTS[variant]) throw new Error('unknown variant');
  const givens = new Int8Array(81);
  if (flags & F_GIVENS) {
    const present = [];
    for (let i = 0; i < 81; i++) if (r.read(1)) present.push(i);
    for (const i of present) {
      const d = r.read(4);
      if (d < 1 || d > 9) throw new Error('invalid digit');
      givens[i] = d;
    }
  }
  const cages = [];
  if (flags & F_CAGES) {
    const cageOf = new Int16Array(81);
    for (let i = 0; i < 81; i++) {
      const op = r.read(2);
      if (op === 0) { cageOf[i] = cages.length; cages.push({ cells: [], sum: 0 }); }
      else if (op === 1 && colOf(i) > 0) cageOf[i] = cageOf[i - 1];
      else if (op === 2 && rowOf(i) > 0) cageOf[i] = cageOf[i - 9];
      else if (op === 3) {
        const k = r.read(6);
        if (k >= cages.length) throw new Error('invalid cage reference');
        cageOf[i] = k;
      } else throw new Error('invalid cage code');
      cages[cageOf[i]].cells.push(i);
    }
    for (const c of cages) c.sum = r.read(6);
  }
  return { variant, givens, cages, level: level > 3 ? 0 : level };
}

/** Stable id of a puzzle: cyrb53 hash of its code without the level, base36. */
export function puzzleId(puzzle) {
  const code = encodePuzzle({ ...puzzle, level: 0 });
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < code.length; i++) {
    const ch = code.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return n.toString(36).padStart(11, '0');
}
