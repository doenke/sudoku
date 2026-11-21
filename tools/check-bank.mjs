#!/usr/bin/env node
// Checks every puzzle of the bank: decodes, exactly one solution, rated as
// the level of its file, stored hardest technique still matches.
// With --fix, puzzles whose rating changed (after a technique change) are
// moved to the right file or dropped.
//
//   node tools/check-bank.mjs [--fix]

import { readdirSync } from 'node:fs';
import { decodePuzzle, encodePuzzle } from '../js/core/codec.js';
import { buildModel } from '../js/core/model.js';
import { isUnique } from '../js/core/solve.js';
import { rate } from '../js/core/human/rate.js';
import { LEVELS, levelByValue } from '../js/core/variants.js';
import { readBank, writeBank } from './generate.mjs';

const fix = process.argv.includes('--fix');
const files = readdirSync(new URL('../data/', import.meta.url)).filter((f) => f.endsWith('.json'));
const variants = [...new Set(files.map((f) => f.split('-')[0]))];
let problems = 0;

for (const variant of variants) {
  const banks = Object.fromEntries(LEVELS.map((l) => [l.key, readBank(variant, l.key)]));
  const moved = Object.fromEntries(LEVELS.map((l) => [l.key, []]));
  for (const level of LEVELS) {
    const bank = banks[level.key];
    const keep = [];
    const t = Date.now();
    for (const [code, hardest] of bank.puzzles) {
      const p = decodePuzzle(code);
      const m = buildModel(p);
      if (!isUnique(m, p.givens)) { problems++; console.log(`${code}: nicht eindeutig`); continue; }
      const r = rate(m, p.givens);
      const now = r.solved ? levelByValue(r.level) : null;
      if (!now || now.key !== level.key || r.hardest !== hardest || p.level !== level.value) {
        problems++;
        console.log(`${variant}-${level.key}: ${code} jetzt ${now ? now.key + ' (' + r.hardest + ')' : 'verworfen'}`);
        if (now) moved[now.key].push([encodePuzzle({ ...p, level: now.value }), r.hardest]);
        continue;
      }
      keep.push([code, hardest]);
    }
    console.log(`${variant}-${level.key}: ${bank.puzzles.length} geprüft in ${((Date.now() - t) / 1000).toFixed(1)} s`);
    bank.puzzles = keep;
  }
  if (fix) {
    for (const l of LEVELS) { banks[l.key].puzzles.push(...moved[l.key]); writeBank(banks[l.key]); }
  }
}
console.log(problems ? `${problems} Abweichungen${fix ? ' – korrigiert' : ''}` : 'Bank in Ordnung');
if (problems && !fix) process.exitCode = 1;
