// The grid: 81 DOM cells for digits and notes, one SVG layer on top for the
// grid lines and the dashed cage outlines. Pointer input is reported as cell
// indices so that selection logic stays in the app.

import { rowOf, colOf, boxOf } from '../core/model.js';
import { bit } from '../core/bits.js';

const SVG = 'http://www.w3.org/2000/svg';
const U = 100; // svg units per cell
const INSET = 8; // cage outline inset

export class Board {
  constructor(root, { onDown, onDrag }) {
    this.root = root;
    this.cellsEl = document.createElement('div');
    this.cellsEl.className = 'cells';
    this.svg = document.createElementNS(SVG, 'svg');
    this.svg.setAttribute('viewBox', `0 0 ${9 * U} ${9 * U}`);
    this.svg.setAttribute('aria-hidden', 'true');
    this.svg.classList.add('lines');
    root.append(this.cellsEl, this.svg);
    this.cells = [];
    for (let i = 0; i < 81; i++) {
      const el = document.createElement('div');
      el.className = 'cell';
      el.setAttribute('role', 'gridcell');
      const val = document.createElement('span');
      val.className = 'val';
      const notes = document.createElement('div');
      notes.className = 'notes';
      const noteEls = [];
      for (let d = 1; d <= 9; d++) {
        const n = document.createElement('span');
        n.textContent = d;
        notes.append(n);
        noteEls.push(n);
      }
      el.append(val, notes);
      this.cellsEl.append(el);
      this.cells.push({ el, val, notes, noteEls, sum: null, state: '' });
    }
    this.pointer = null;
    root.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      const cell = this.cellAt(e);
      if (cell < 0) return;
      e.preventDefault();
      root.setPointerCapture?.(e.pointerId);
      this.pointer = { id: e.pointerId, last: cell };
      onDown(cell, e);
    });
    root.addEventListener('pointermove', (e) => {
      if (!this.pointer || e.pointerId !== this.pointer.id) return;
      const cell = this.cellAt(e);
      if (cell < 0 || cell === this.pointer.last) return;
      this.pointer.last = cell;
      onDrag(cell, e);
    });
    const end = (e) => { if (this.pointer && e.pointerId === this.pointer.id) this.pointer = null; };
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
  }

  cellAt(e) {
    const r = this.root.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * 9);
    const y = Math.floor(((e.clientY - r.top) / r.height) * 9);
    if (x < 0 || x > 8 || y < 0 || y > 8) return -1;
    return y * 9 + x;
  }

  /** Builds lines, cages and sum labels for a new puzzle. */
  setGame(game) {
    this.game = game;
    const { model } = game;
    this.root.classList.toggle('killer', model.cages.length > 0);
    for (const c of this.cells) { c.sum?.remove(); c.sum = null; }
    this.svg.replaceChildren();
    const g = (cls) => { const el = document.createElementNS(SVG, 'g'); el.setAttribute('class', cls); this.svg.append(el); return el; };
    const thin = g('thin'), cageLayer = g('cages'), thick = g('thick');
    const line = (parent, x1, y1, x2, y2) => {
      const l = document.createElementNS(SVG, 'line');
      l.setAttribute('x1', x1); l.setAttribute('y1', y1); l.setAttribute('x2', x2); l.setAttribute('y2', y2);
      parent.append(l);
    };
    for (let k = 1; k < 9; k++) {
      const p = (k % 3 ? thin : thick);
      line(p, k * U, 0, k * U, 9 * U);
      line(p, 0, k * U, 9 * U, k * U);
    }
    const border = document.createElementNS(SVG, 'rect');
    border.setAttribute('x', 0); border.setAttribute('y', 0);
    border.setAttribute('width', 9 * U); border.setAttribute('height', 9 * U);
    thick.append(border);

    this.cagePaths = model.cages.map((cage, k) => {
      const first = cage.cells[0];
      const label = document.createElement('span');
      label.className = 'sum';
      label.textContent = cage.sum;
      this.cells[first].el.append(label);
      this.cells[first].sum = label;
      const path = document.createElementNS(SVG, 'path');
      path.setAttribute('d', cageOutline(model.cellCage, k, first, cage.sum));
      cageLayer.append(path);
      return path;
    });
  }

  /**
   * view: { selection:Set, cursor, conflicts:{cells,cages}, wrong:Set,
   *         highlightHouses, highlightDigits }
   */
  render(view) {
    const game = this.game;
    if (!game) return;
    const { values, notes } = game;
    const cur = view.cursor;
    const curDigit = cur >= 0 ? values[cur] : 0;
    for (let i = 0; i < 81; i++) {
      const c = this.cells[i];
      const v = values[i];
      const cls = ['cell'];
      if (game.isGiven(i)) cls.push('given');
      if (i === cur) cls.push('cursor');
      if (view.selection.has(i)) cls.push('selected');
      if (view.highlightHouses && cur >= 0 && i !== cur &&
        (rowOf(i) === rowOf(cur) || colOf(i) === colOf(cur) || boxOf(i) === boxOf(cur))) cls.push('house');
      if (view.highlightDigits && curDigit && v === curDigit) cls.push('same');
      if (v && view.conflicts.cells.has(i)) cls.push('conflict');
      if (v && view.wrong.has(i)) cls.push('wrong');
      if (c.sum) cls.push('has-sum');
      const state = cls.join(' ');
      if (state !== c.state) { c.el.className = state; c.state = state; }
      const text = v ? String(v) : '';
      if (c.val.textContent !== text) c.val.textContent = text;
      const n = v ? 0 : notes[i];
      if (c.noteMask !== n || c.noteDigit !== curDigit) {
        c.noteMask = n;
        c.noteDigit = curDigit;
        for (let d = 1; d <= 9; d++) {
          const on = (n & bit(d)) !== 0;
          c.noteEls[d - 1].className = on ? (view.highlightDigits && d === curDigit ? 'on mark' : 'on') : '';
        }
      }
    }
    (this.cagePaths || []).forEach((p, k) => p.classList.toggle('conflict', view.conflicts.cages.has(k)));
  }
}

/** Dashed outline of a cage, drawn inset; leaves room for the sum label. */
function cageOutline(cellCage, k, first, sum) {
  const same = (r, c) => r >= 0 && r < 9 && c >= 0 && c < 9 && cellCage[r * 9 + c] === k;
  const m = INSET;
  const h = [], v = []; // [fixed, from, to]
  for (let i = 0; i < 81; i++) {
    if (cellCage[i] !== k) continue;
    const r = rowOf(i), c = colOf(i);
    const x0 = c * U, x1 = (c + 1) * U, y0 = r * U, y1 = (r + 1) * U;
    const gapX = i === first ? (sum >= 10 ? 36 : 24) : 0;
    const gapY = i === first ? 30 : 0;
    if (!same(r - 1, c)) {
      const a = same(r, c - 1) ? (same(r - 1, c - 1) ? x0 - m : x0) : x0 + m + gapX;
      const b = same(r, c + 1) ? (same(r - 1, c + 1) ? x1 + m : x1) : x1 - m;
      h.push([y0 + m, a, b]);
    }
    if (!same(r + 1, c)) {
      const a = same(r, c - 1) ? (same(r + 1, c - 1) ? x0 - m : x0) : x0 + m;
      const b = same(r, c + 1) ? (same(r + 1, c + 1) ? x1 + m : x1) : x1 - m;
      h.push([y1 - m, a, b]);
    }
    if (!same(r, c - 1)) {
      const a = same(r - 1, c) ? (same(r - 1, c - 1) ? y0 - m : y0) : y0 + m + gapY;
      const b = same(r + 1, c) ? (same(r + 1, c - 1) ? y1 + m : y1) : y1 - m;
      v.push([x0 + m, a, b]);
    }
    if (!same(r, c + 1)) {
      const a = same(r - 1, c) ? (same(r - 1, c + 1) ? y0 - m : y0) : y0 + m;
      const b = same(r + 1, c) ? (same(r + 1, c + 1) ? y1 + m : y1) : y1 - m;
      v.push([x1 - m, a, b]);
    }
  }
  const merge = (segs) => {
    segs.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    const out = [];
    for (const s of segs) {
      const last = out[out.length - 1];
      if (last && last[0] === s[0] && last[2] >= s[1]) last[2] = Math.max(last[2], s[2]);
      else out.push([...s]);
    }
    return out;
  };
  let d = '';
  for (const [y, a, b] of merge(h)) d += `M${a} ${y}H${b}`;
  for (const [x, a, b] of merge(v)) d += `M${x} ${a}V${b}`;
  return d;
}
