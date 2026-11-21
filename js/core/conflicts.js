// Rule conflicts that a player could see without knowing the solution:
// a digit twice in a unit, a cage whose filled digits exceed its sum, and a
// full cage with the wrong sum.

/**
 * @param values Int8Array/Array(81) of all digits on the board (givens and entries)
 * @returns {{ cells: Set<number>, cages: Set<number> }}
 */
export function findConflicts(model, values) {
  const cells = new Set();
  const cages = new Set();
  for (const unit of model.units) {
    const at = new Map();
    for (const c of unit.cells) {
      const d = values[c];
      if (!d) continue;
      if (at.has(d)) {
        cells.add(c);
        cells.add(at.get(d));
        if (unit.kind === 'cage') cages.add(unit.index);
      } else at.set(d, c);
    }
  }
  model.cages.forEach((cage, k) => {
    let sum = 0, filled = 0;
    for (const c of cage.cells) if (values[c]) { sum += values[c]; filled++; }
    if (sum > cage.sum || (filled === cage.cells.length && sum !== cage.sum)) cages.add(k);
  });
  return { cells, cages };
}

/** Cells whose digit differs from the solution. */
export function findWrong(values, solution, givens) {
  const wrong = new Set();
  for (let i = 0; i < 81; i++) if (!givens[i] && values[i] && values[i] !== solution[i]) wrong.add(i);
  return wrong;
}
