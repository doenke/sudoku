// A running game: board state, unlimited undo/redo (values and notes),
// timer bookkeeping and serialisation for localStorage.

import { buildModel } from '../core/model.js';
import { solutionOf } from '../core/solve.js';
import { encodePuzzle, decodePuzzle, puzzleId } from '../core/codec.js';
import { ALL, bit } from '../core/bits.js';
import { comboUnion } from '../core/combos.js';

export class Game {
  constructor(puzzle, { source = 'bank' } = {}) {
    this.puzzle = puzzle;
    this.code = encodePuzzle(puzzle);
    this.id = puzzleId(puzzle);
    this.source = source;
    this.model = buildModel(puzzle);
    this.givens = puzzle.givens;
    this.values = Int8Array.from(puzzle.givens);
    this.notes = new Uint16Array(81);
    this.history = [];
    this.future = [];
    this.elapsed = 0; // ms
    this.solved = false;
    this.assisted = false; // used "against the solution" or "fill all candidates"
    this.moves = 0;
    this.excluded = {}; // cage index -> combination masks ruled out by the player
    this._solution = null;
  }

  get solution() {
    if (!this._solution) this._solution = solutionOf(this.model, this.givens);
    return this._solution;
  }

  get variant() { return this.puzzle.variant; }
  get level() { return this.puzzle.level; }
  isGiven(i) { return this.givens[i] > 0; }

  /** changes: [[cell, newValue, newNotes]]; recorded as one undo step. */
  commit(changes) {
    const entry = [];
    for (const [c, v, n] of changes) {
      if (this.isGiven(c)) continue;
      const ov = this.values[c], on = this.notes[c];
      if (ov === v && on === n) continue;
      entry.push([c, ov, on, v, n]);
      this.values[c] = v;
      this.notes[c] = n;
    }
    if (!entry.length) return false;
    this.history.push(entry);
    this.future = [];
    this.moves++;
    return true;
  }

  undo() {
    const entry = this.history.pop();
    if (!entry) return false;
    for (const [c, ov, on] of entry) { this.values[c] = ov; this.notes[c] = on; }
    this.future.push(entry);
    return true;
  }

  redo() {
    const entry = this.future.pop();
    if (!entry) return false;
    for (const [c, , , v, n] of entry) { this.values[c] = v; this.notes[c] = n; }
    this.history.push(entry);
    return true;
  }

  setDigit(cell, d, { autoRemove = false } = {}) {
    if (this.isGiven(cell)) return false;
    const v = this.values[cell] === d ? 0 : d;
    const changes = [[cell, v, this.notes[cell]]];
    if (v && autoRemove) {
      for (const p of this.model.peers[cell]) {
        if (!this.values[p] && this.notes[p] & bit(d)) changes.push([p, 0, this.notes[p] & ~bit(d)]);
      }
    }
    return this.commit(changes);
  }

  toggleNote(cells, d) {
    const open = cells.filter((c) => !this.values[c]);
    if (!open.length) return false;
    const b = bit(d);
    const allHave = open.every((c) => this.notes[c] & b);
    return this.commit(open.map((c) => [c, 0, allHave ? this.notes[c] & ~b : this.notes[c] | b]));
  }

  erase(cells) {
    const own = cells.filter((c) => !this.isGiven(c));
    const anyValue = own.some((c) => this.values[c]);
    return this.commit(own.map((c) => (anyValue ? [c, 0, this.notes[c]] : [c, this.values[c], 0])));
  }

  /** Candidates from the digits on the board (houses and cage combinations). */
  candidates(cell) {
    let m = ALL;
    for (const p of this.model.peers[cell]) if (this.values[p]) m &= ~bit(this.values[p]);
    const k = this.model.cellCage[cell];
    if (k >= 0) {
      const cage = this.model.cages[k];
      let rem = cage.sum, left = 0, used = 0;
      for (const c of cage.cells) {
        if (this.values[c]) { rem -= this.values[c]; used |= bit(this.values[c]); } else left++;
      }
      m &= comboUnion(rem, left, used);
    }
    return m;
  }

  fillCandidates() {
    this.assisted = true;
    const changes = [];
    for (let i = 0; i < 81; i++) if (!this.values[i]) changes.push([i, 0, this.candidates(i)]);
    return this.commit(changes);
  }

  isExcluded(cage, mask) { return (this.excluded[cage] || []).includes(mask); }

  toggleExcluded(cage, mask) {
    const list = this.excluded[cage] || [];
    this.excluded[cage] = list.includes(mask) ? list.filter((m) => m !== mask) : [...list, mask];
    if (!this.excluded[cage].length) delete this.excluded[cage];
  }

  isFull() { return this.values.every((v) => v > 0); }

  isCorrect() {
    const s = this.solution;
    return !!s && this.values.every((v, i) => v === s[i]);
  }

  count(d) {
    let n = 0;
    for (let i = 0; i < 81; i++) if (this.values[i] === d) n++;
    return n;
  }

  toJSON() {
    return {
      v: 1,
      code: this.code,
      source: this.source,
      values: Array.from(this.values).join(''),
      notes: Array.from(this.notes),
      history: this.history,
      future: this.future,
      elapsed: Math.round(this.elapsed),
      solved: this.solved,
      assisted: this.assisted,
      excluded: this.excluded,
      moves: this.moves,
    };
  }

  static fromJSON(data) {
    const g = new Game(decodePuzzle(data.code), { source: data.source });
    g.values = Int8Array.from(data.values, (ch) => +ch);
    g.notes = Uint16Array.from(data.notes);
    g.history = data.history || [];
    g.future = data.future || [];
    g.elapsed = data.elapsed || 0;
    g.solved = !!data.solved;
    g.assisted = !!data.assisted;
    g.excluded = data.excluded || {};
    g.moves = data.moves || g.history.length;
    return g;
  }
}
