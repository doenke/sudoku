// Puzzle construction for the generator (Node only, not deployed).

import { buildModel, emptyPuzzle, neighbours } from '../js/core/model.js';
import { solve } from '../js/core/solve.js';
import { rate } from '../js/core/human/rate.js';
import { shuffle } from '../js/core/bits.js';

const EMPTY_MODEL = buildModel(emptyPuzzle('classic'));

export function randomSolution(rng) {
  return solve(EMPTY_MODEL, new Int8Array(81), { limit: 1, rng }).solution;
}

/** Classic: remove clues in point-symmetric pairs as long as the solution stays unique. */
export function makeClassic(rng) {
  const solution = randomSolution(rng);
  const givens = solution.slice();
  const order = shuffle([...Array(41).keys()], rng);
  for (const i of order) {
    const j = 80 - i;
    const keep = [givens[i], givens[j]];
    givens[i] = 0;
    givens[j] = 0;
    const r = solve(EMPTY_MODEL, givens, { limit: 2 });
    if (r.count !== 1) { givens[i] = keep[0]; givens[j] = keep[1]; }
  }
  return { puzzle: { variant: 'classic', givens, cages: [], level: 0 }, solution };
}

/**
 * Killer: random cages over a random solution; while the cages allow a second
 * solution, a cage around a differing cell is split.
 * opts.sizes: weights for cage sizes 1..6
 */
export function makeKiller(rng, { sizes = [0, 3, 5, 4, 2, 1], maxNodes = 300000, merges = 0, maxCage = 7 } = {}) {
  const solution = randomSolution(rng);
  const cageOf = new Int16Array(81).fill(-1);
  let cages = [];
  const pickSize = () => {
    const total = sizes.reduce((a, b) => a + b, 0);
    let x = rng() * total;
    for (let k = 0; k < sizes.length; k++) { x -= sizes[k]; if (x < 0) return k + 1; }
    return 2;
  };
  for (const start of shuffle([...Array(81).keys()], rng)) {
    if (cageOf[start] >= 0) continue;
    const target = pickSize();
    const cells = [start];
    let digits = 1 << solution[start];
    cageOf[start] = cages.length;
    while (cells.length < target) {
      const frontier = [];
      for (const c of cells) {
        for (const n of neighbours(c)) if (cageOf[n] < 0 && !((digits >> solution[n]) & 1) && !frontier.includes(n)) frontier.push(n);
      }
      if (!frontier.length) break;
      const n = frontier[Math.floor(rng() * frontier.length)];
      cageOf[n] = cages.length;
      cells.push(n);
      digits |= 1 << solution[n];
    }
    cages.push(cells);
  }
  // Merge lonely single cells into a neighbouring cage when possible.
  cages = mergeSingles(cages, solution, rng);

  for (let round = 0; round < 40; round++) {
    const puzzle = toPuzzle(cages, solution);
    const r = solve(buildModel(puzzle), puzzle.givens, { limit: 2, maxNodes });
    if (r.aborted) return null;
    if (r.count === 1) {
      if (!merges) return { puzzle, solution };
      const merged = mergeCages(cages, solution, rng, { tries: merges, maxCage, maxNodes });
      return { puzzle: toPuzzle(merged, solution), solution };
    }
    const [a, b] = r.solutions;
    const diff = [];
    for (let i = 0; i < 81; i++) if (a[i] !== b[i]) diff.push(i);
    const splittable = diff.filter((i) => cages.find((c) => c.includes(i)).length > 1);
    if (!splittable.length) return null;
    const x = splittable[Math.floor(rng() * splittable.length)];
    cages = splitCage(cages, x, rng);
  }
  return null;
}

/**
 * Makes a unique killer harder: merges neighbouring cages (distinct digits,
 * size limit) as long as the solution stays unique.
 */
function mergeCages(cages, solution, rng, { tries, maxCage, maxNodes }) {
  let current = cages.map((c) => [...c]);
  let failures = 0;
  while (failures < tries) {
    const cageOf = new Int16Array(81);
    current.forEach((c, k) => c.forEach((x) => { cageOf[x] = k; }));
    const pairs = [];
    for (let i = 0; i < 81; i++) {
      for (const n of neighbours(i)) {
        const a = cageOf[i], b = cageOf[n];
        if (a >= b) continue;
        if (current[a].length + current[b].length > maxCage) continue;
        let da = 0;
        for (const x of current[a]) da |= 1 << solution[x];
        if (current[b].some((x) => (da >> solution[x]) & 1)) continue;
        pairs.push([a, b]);
      }
    }
    if (!pairs.length) break;
    const [a, b] = pairs[Math.floor(rng() * pairs.length)];
    const next = current.filter((_, k) => k !== a && k !== b);
    next.push([...current[a], ...current[b]]);
    const puzzle = toPuzzle(next, solution);
    const r = solve(buildModel(puzzle), puzzle.givens, { limit: 2, maxNodes });
    if (!r.aborted && r.count === 1) current = next;
    else failures++;
  }
  return current;
}

function toPuzzle(cages, solution) {
  return {
    variant: 'killer',
    givens: new Int8Array(81),
    cages: cages.map((cells) => ({ cells: [...cells].sort((p, q) => p - q), sum: cells.reduce((s, c) => s + solution[c], 0) })),
    level: 0,
  };
}

function mergeSingles(cages, solution, rng) {
  const out = cages.map((c) => [...c]);
  for (let k = 0; k < out.length; k++) {
    if (out[k].length !== 1 || rng() < 0.3) continue;
    const c = out[k][0];
    const options = [];
    for (const n of neighbours(c)) {
      const j = out.findIndex((cc) => cc.includes(n));
      if (j === k || out[j].length >= 6) continue;
      if (out[j].some((x) => solution[x] === solution[c])) continue;
      options.push(j);
    }
    if (!options.length) continue;
    const j = options[Math.floor(rng() * options.length)];
    out[j].push(c);
    out[k] = [];
  }
  return out.filter((c) => c.length);
}

function components(cells) {
  const set = new Set(cells);
  const seen = new Set();
  const out = [];
  for (const s of cells) {
    if (seen.has(s)) continue;
    const comp = [s];
    seen.add(s);
    for (let i = 0; i < comp.length; i++) {
      for (const n of neighbours(comp[i])) if (set.has(n) && !seen.has(n)) { seen.add(n); comp.push(n); }
    }
    out.push(comp);
  }
  return out;
}

function splitCage(cages, x, rng) {
  const k = cages.findIndex((c) => c.includes(x));
  const cage = cages[k];
  const size = 1 + Math.floor(rng() * (cage.length - 1));
  const part = [x];
  const inCage = new Set(cage);
  while (part.length < size) {
    const frontier = [];
    for (const c of part) for (const n of neighbours(c)) if (inCage.has(n) && !part.includes(n) && !frontier.includes(n)) frontier.push(n);
    if (!frontier.length) break;
    part.push(frontier[Math.floor(rng() * frontier.length)]);
  }
  const rest = cage.filter((c) => !part.includes(c));
  const next = cages.filter((_, j) => j !== k);
  next.push(part, ...components(rest));
  return next;
}

/** Rates a puzzle; returns null for puzzles outside the bank (too easy or needs guessing). */
export function ratePuzzle(puzzle, solution) {
  const model = buildModel(puzzle);
  const r = rate(model, puzzle.givens);
  if (!r.solved) return null;
  for (let i = 0; i < 81; i++) if (r.values[i] !== solution[i]) throw new Error('rater reached a wrong solution');
  if (r.level < 1) return null;
  return r;
}
