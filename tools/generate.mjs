#!/usr/bin/env node
// Fills the puzzle bank (data/<variant>-<level>.json) up to --count puzzles
// per level. New puzzles are appended; existing ones keep their place and id.
//
//   node tools/generate.mjs --variant killer --count 500 [--levels extrem,teuflisch]
//                           [--workers 4] [--seed 1] [--minutes 120]
//
// Every puzzle: exactly one solution (backtracking), rated by the human-style
// solver; too easy (singles/basic cage combinations only) or needing guesses
// means it is dropped.

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { encodePuzzle, decodePuzzle, puzzleId } from '../js/core/codec.js';
import { LEVELS, levelByValue } from '../js/core/variants.js';
import { rngFrom } from '../js/core/bits.js';
import { makeClassic, makeKiller, ratePuzzle } from './gen-lib.mjs';

const DATA = new URL('../data/', import.meta.url);

export function bankPath(variant, level) {
  return new URL(`${variant}-${level}.json`, DATA);
}

export function readBank(variant, level) {
  const p = bankPath(variant, level);
  if (!existsSync(p)) return { format: 1, variant, level, puzzles: [] };
  return JSON.parse(readFileSync(p, 'utf8'));
}

export function writeBank(bank) {
  const lines = bank.puzzles.map((e) => JSON.stringify(e));
  const text = `{"format":1,"variant":${JSON.stringify(bank.variant)},"level":${JSON.stringify(bank.level)},"puzzles":[\n${lines.join(',\n')}\n]}\n`;
  writeFileSync(bankPath(bank.variant, bank.level), text);
}

function parseArgs(argv) {
  const args = { variant: 'killer', count: 500, levels: LEVELS.map((l) => l.key), workers: Math.max(1, cpus().length), seed: Date.now() % 1e9, minutes: Infinity };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i].replace(/^--/, ''), v = argv[i + 1];
    if (k === 'levels') args.levels = v.split(',');
    else if (k === 'variant') args.variant = v;
    else args[k] = Number(v);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const banks = Object.fromEntries(LEVELS.map((l) => [l.key, readBank(args.variant, l.key)]));
  const ids = new Set();
  for (const b of Object.values(banks)) for (const [code] of b.puzzles) ids.add(puzzleId(decodePuzzle(code)));
  const needed = () => args.levels.filter((l) => banks[l].puzzles.length < args.count);
  const status = () => LEVELS.map((l) => `${l.key} ${banks[l.key].puzzles.length}`).join(', ');
  console.log(`${args.variant}: ${status()} – Ziel ${args.count} für ${args.levels.join(', ')}`);
  if (!needed().length) return;

  const started = Date.now();
  let dirty = false, tried = 0, finished = false;
  const save = () => {
    if (!dirty) return;
    for (const b of Object.values(banks)) writeBank(b);
    dirty = false;
  };
  const workers = [];
  const stop = () => {
    if (finished) return;
    finished = true;
    clearInterval(timer);
    save();
    workers.forEach((w) => w.terminate());
    console.log(`\nfertig nach ${Math.round((Date.now() - started) / 1000)} s, ${tried} Rätsel probiert: ${status()}`);
  };
  const timer = setInterval(() => {
    save();
    process.stdout.write(`\r${Math.round((Date.now() - started) / 1000)} s, ${tried} probiert: ${status()}   `);
    if (Date.now() - started > args.minutes * 60000) stop();
  }, 15000);

  for (let w = 0; w < args.workers; w++) {
    const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { variant: args.variant, seed: args.seed + w * 7919, needed: needed() } });
    worker.on('message', (msg) => {
      if (finished) return;
      tried += msg.tried;
      if (msg.entry) {
        const [code, , levelKey] = msg.entry;
        const id = puzzleId(decodePuzzle(code));
        if (!ids.has(id) && banks[levelKey].puzzles.length < args.count && args.levels.includes(levelKey)) {
          ids.add(id);
          banks[levelKey].puzzles.push([code, msg.entry[1]]);
          dirty = true;
        }
      }
      const n = needed();
      if (!n.length) stop();
      else for (const ww of workers) ww.postMessage({ needed: n });
    });
    worker.on('error', (e) => { console.error(e); stop(); process.exitCode = 1; });
    workers.push(worker);
  }
}

function workerMain() {
  const { variant, seed } = workerData;
  let needed = workerData.needed;
  parentPort.on('message', (m) => { needed = m.needed; });
  const rng = rngFrom(seed);
  const loop = () => {
    let tried = 0;
    const until = Date.now() + 200;
    while (Date.now() < until) {
      tried++;
      // Harder levels need fewer, larger cages: merge more often when only those are missing.
      const hardOnly = !needed.includes('schwer');
      const merges = variant === 'killer' ? [0, 3, 6, 10, 14][Math.floor(rng() * 5) + (hardOnly ? 0 : 0)] + (hardOnly ? 6 : 0) : 0;
      const made = variant === 'killer' ? makeKiller(rng, { merges }) : makeClassic(rng);
      if (!made) continue;
      const r = ratePuzzle(made.puzzle, made.solution);
      if (!r) continue;
      const level = levelByValue(r.level);
      if (!level || !needed.includes(level.key)) continue;
      const code = encodePuzzle({ ...made.puzzle, level: r.level });
      parentPort.postMessage({ tried, entry: [code, r.hardest, level.key] });
      tried = 0;
    }
    if (tried) parentPort.postMessage({ tried });
    setImmediate(loop);
  };
  loop();
}

if (isMainThread) {
  if (process.argv[1] === fileURLToPath(import.meta.url)) main();
} else workerMain();
