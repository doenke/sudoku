// Candidate grid for the human-style solver.

import { ALL, POP, bit } from '../bits.js';

export class Grid {
  constructor(model, givens) {
    this.model = model;
    this.values = new Int8Array(81);
    this.cands = new Uint16Array(81).fill(ALL);
    if (givens) for (let i = 0; i < 81; i++) if (givens[i]) this.place(i, givens[i]);
  }

  clone() {
    const g = Object.create(Grid.prototype);
    g.model = this.model;
    g.values = this.values.slice();
    g.cands = this.cands.slice();
    return g;
  }

  place(i, d) {
    const b = bit(d);
    this.values[i] = d;
    this.cands[i] = b;
    for (const p of this.model.peers[i]) if (!this.values[p]) this.cands[p] &= ~b;
  }

  /** Applies a step; returns false if the step changed nothing. */
  apply(step) {
    let changed = false;
    for (const [i, d] of step.place || []) {
      if (this.values[i]) continue;
      this.place(i, d);
      changed = true;
    }
    for (const [i, mask] of step.elim || []) {
      if (this.values[i] || !(this.cands[i] & mask)) continue;
      this.cands[i] &= ~mask;
      changed = true;
    }
    return changed;
  }

  solved() {
    for (let i = 0; i < 81; i++) if (!this.values[i]) return false;
    return true;
  }

  /** True when the grid can obviously no longer be completed. */
  broken() {
    const { model } = this;
    for (let i = 0; i < 81; i++) {
      if (!this.values[i] && !this.cands[i]) return true;
    }
    for (const unit of model.units) {
      let seen = 0, room = 0, sum = 0, empty = 0;
      for (const c of unit.cells) {
        const v = this.values[c];
        if (v) {
          if (seen & bit(v)) return true;
          seen |= bit(v);
          sum += v;
        } else { room |= this.cands[c]; empty++; }
      }
      if (unit.full && ((seen | room) !== ALL)) return true;
      if (unit.kind === 'cage' && (sum > unit.sum || (!empty && sum !== unit.sum))) return true;
    }
    return false;
  }

  emptyCells(cells) {
    return cells.filter((c) => !this.values[c]);
  }

  count(i) { return POP[this.cands[i]]; }
}
