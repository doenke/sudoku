// App controller: wires the board, input, timer and persistence together.

import { Board } from './board.js';
import { Game } from './game.js';
import { load, save } from './store.js';
import { formatTime } from './stats.js';
import { VARIANTS, PLAYABLE, LEVELS, levelByValue } from '../core/variants.js';
import { pickPuzzle, markPlayed, unplayedCount } from './bank.js';

const $ = (id) => document.getElementById(id);

const state = {
  game: null,
  selection: new Set(),
  cursor: 40,
  noteMode: false,
  running: false,
  tickStart: 0,
};

const board = new Board($('board'), {
  onDown(cell, e) {
    if (e.ctrlKey || e.metaKey) {
      if (state.selection.has(cell) && state.selection.size > 1) state.selection.delete(cell);
      else state.selection.add(cell);
    } else if (e.shiftKey) {
      state.selection.add(cell);
    } else {
      state.selection = new Set([cell]);
    }
    state.cursor = cell;
    render();
  },
  onDrag(cell) {
    state.selection.add(cell);
    state.cursor = cell;
    render();
  },
});

// ---- Rendering ----

function view() {
  return {
    selection: state.selection,
    cursor: state.cursor,
    conflicts: { cells: new Set(), cages: new Set() },
    wrong: new Set(),
    highlightHouses: false,
    highlightDigits: false,
  };
}

function render() {
  const g = state.game;
  if (!g) return;
  board.render(view());
  document.body.classList.toggle('notes-mode', state.noteMode);
  $('btn-notes').setAttribute('aria-pressed', String(state.noteMode));
  $('btn-undo').disabled = !g.history.length;
  $('btn-redo').disabled = !g.future.length;
  for (const b of padButtons) b.classList.toggle('done', g.count(+b.dataset.d) >= 9);
}

function puzzleLabel(g) {
  const level = levelByValue(g.level);
  return `${VARIANTS[g.variant].name}${level ? ' · ' + level.name : ''}`;
}

// ---- Timer ----

function updateTimer() {
  const g = state.game;
  if (!g) return;
  const ms = g.elapsed + (state.running ? performance.now() - state.tickStart : 0);
  const text = formatTime(ms);
  for (const el of [$('timer'), $('timer-side')]) {
    if (el.textContent !== text) el.textContent = text;
    el.classList.toggle('paused', !state.running);
  }
}

function startTimer() {
  if (state.running || !state.game || state.game.solved || document.hidden) return;
  state.running = true;
  state.tickStart = performance.now();
  updateTimer();
}

function stopTimer() {
  if (!state.running) return;
  state.game.elapsed += performance.now() - state.tickStart;
  state.running = false;
  updateTimer();
}

setInterval(updateTimer, 500);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { stopTimer(); persist(); } else startTimer();
});
window.addEventListener('pagehide', () => { stopTimer(); persist(); });

// ---- Persistence ----

function persist() {
  const g = state.game;
  if (!g) return;
  const running = state.running;
  if (running) { stopTimer(); }
  save('game', g.toJSON());
  if (running) startTimer();
}

setInterval(() => { if (state.running) persist(); }, 10000);

// ---- Game flow ----

function startGame(game) {
  stopTimer();
  state.game = game;
  state.selection = new Set([40]);
  state.cursor = 40;
  state.noteMode = false;
  board.setGame(game);
  const label = puzzleLabel(game);
  $('label').textContent = label;
  $('label-side').textContent = label;
  persist();
  render();
  startTimer();
}

/** Leaving an unsolved game with moves counts as abandoned. */
async function leaveCurrent(question) {
  const g = state.game;
  if (!g || g.solved || !g.moves) return true;
  if (!(await confirmDialog('Rätsel abbrechen?', question, 'Abbrechen und weiter'))) return false;
  onAbandon(g);
  return true;
}

function onAbandon() {}

let newVariant = load('last', { variant: 'killer' }).variant;

function renderNewDialog() {
  const box = $('new-variant');
  box.querySelectorAll('label').forEach((l) => l.remove());
  for (const key of PLAYABLE) {
    const label = document.createElement('label');
    label.innerHTML = `<input type="radio" name="variant" value="${key}"><span>${VARIANTS[key].name}</span>`;
    const input = label.querySelector('input');
    input.checked = key === newVariant;
    input.addEventListener('change', () => { newVariant = key; renderLevels(); });
    box.append(label);
  }
  renderLevels();
}

function renderLevels() {
  const box = $('new-levels');
  box.querySelectorAll('button').forEach((b) => b.remove());
  for (const level of LEVELS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `<span>${level.name}</span><small>…</small>`;
    const g = state.game;
    if (g && !g.solved && g.variant === newVariant && g.level === level.value) b.classList.add('current');
    b.addEventListener('click', () => chooseLevel(level.key));
    box.append(b);
    unplayedCount(newVariant, level.key).then(({ total, fresh }) => {
      b.querySelector('small').textContent = fresh ? `${fresh} von ${total} neu` : `alle ${total} gespielt`;
    }).catch(() => { b.querySelector('small').textContent = 'nicht verfügbar'; b.disabled = true; });
  }
}

function openNewDialog(first = false) {
  $('new-hint').textContent = first
    ? 'Willkommen! Such dir eine Spielart und eine Stufe aus. Leicht gibt es hier nicht.'
    : '';
  $('new-hint').hidden = !first;
  $('new-cancel').hidden = !state.game;
  renderNewDialog();
  $('dlg-new').showModal();
}

async function chooseLevel(levelKey) {
  $('dlg-new').close();
  if (!(await leaveCurrent('Dein aktuelles Rätsel ist noch nicht gelöst. Wenn du ein neues anfängst, gilt es als abgebrochen.'))) return;
  save('last', { variant: newVariant });
  try {
    const pick = await pickPuzzle(newVariant, levelKey);
    markPlayed(pick.id);
    startGame(new Game(pick.puzzle, { source: 'bank' }));
    if (pick.repeat) showToast('Alle Rätsel dieser Stufe hast du schon gespielt – hier eins zum Wiederholen.');
  } catch {
    showToast('Die Rätsel konnten nicht geladen werden.');
  }
}

function confirmDialog(title, text, yes = 'OK') {
  const dlg = $('dlg-confirm');
  $('confirm-title').textContent = title;
  $('confirm-text').textContent = text;
  $('confirm-yes').textContent = yes;
  dlg.returnValue = '';
  dlg.showModal();
  return new Promise((resolve) => dlg.addEventListener('close', () => resolve(dlg.returnValue === 'yes'), { once: true }));
}

function afterMove() {
  const g = state.game;
  if (!g.solved && g.isFull()) {
    if (g.isCorrect()) {
      stopTimer();
      g.solved = true;
      showToast(`Gelöst in ${formatTime(g.elapsed)}.`);
    } else {
      showToast('Alles ausgefüllt – aber noch nicht richtig.');
    }
  }
  persist();
  render();
}

// ---- Input ----

function targetCells() {
  return [...state.selection];
}

function inputDigit(d, asNote = false) {
  const g = state.game;
  if (!g || g.solved) return;
  const cells = targetCells();
  if (!cells.length) return;
  const note = asNote || state.noteMode || cells.length > 1;
  const changed = note ? g.toggleNote(cells, d) : g.setDigit(cells[0], d);
  if (changed) afterMove();
}

function erase() {
  const g = state.game;
  if (g && !g.solved && g.erase(targetCells())) afterMove();
}

function undo() { if (state.game?.undo()) afterMove(); }
function redo() { if (state.game?.redo()) afterMove(); }

function toggleNoteMode() {
  state.noteMode = !state.noteMode;
  render();
}

function move(dr, dc, extend) {
  const r = (Math.floor(state.cursor / 9) + dr + 9) % 9;
  const c = ((state.cursor % 9) + dc + 9) % 9;
  state.cursor = r * 9 + c;
  if (extend) state.selection.add(state.cursor);
  else state.selection = new Set([state.cursor]);
  render();
}

const MOVES = {
  ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
  KeyW: [-1, 0], KeyS: [1, 0], KeyA: [0, -1], KeyD: [0, 1],
};

document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]')) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && !e.altKey) {
    if (e.code === 'KeyZ' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey)) { e.preventDefault(); redo(); }
    return;
  }
  if (e.altKey) return;
  const digit = /^(Digit|Numpad)([1-9])$/.exec(e.code);
  if (digit) { e.preventDefault(); inputDigit(+digit[2], e.shiftKey); return; }
  if (MOVES[e.code]) { e.preventDefault(); move(...MOVES[e.code], e.shiftKey); return; }
  switch (e.code) {
    case 'Space': e.preventDefault(); toggleNoteMode(); break;
    case 'Backspace': case 'Delete': case 'Digit0': case 'Numpad0': e.preventDefault(); erase(); break;
    case 'Escape': state.selection = new Set([state.cursor]); render(); break;
    case 'KeyN': e.preventDefault(); openNewDialog(); break;
    default:
      if (e.key === '?') $('dlg-keys').showModal();
  }
});

const padButtons = [];
for (let d = 1; d <= 9; d++) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = d;
  b.dataset.d = d;
  b.setAttribute('aria-label', `Ziffer ${d}`);
  b.addEventListener('click', () => inputDigit(d));
  $('pad').append(b);
  padButtons.push(b);
}
// Keep the board selection when tapping controls.
for (const el of [$('pad'), document.querySelector('.tools')]) el.addEventListener('pointerdown', (e) => e.preventDefault());

$('btn-notes').addEventListener('click', toggleNoteMode);
$('btn-erase').addEventListener('click', erase);
$('btn-undo').addEventListener('click', undo);
$('btn-redo').addEventListener('click', redo);
$('btn-new').addEventListener('click', () => openNewDialog());
$('btn-keys').addEventListener('click', () => $('dlg-keys').showModal());

// ---- Toast ----

let toastTimer = 0;
function showToast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

// ---- Start ----

const saved = load('game', null);
let restored = null;
try { restored = saved ? Game.fromJSON(saved) : null; } catch { restored = null; }
if (restored) startGame(restored);
else openNewDialog(true);

// Without a game there is nothing behind the dialog: keep it open.
$('dlg-new').addEventListener('cancel', (e) => { if (!state.game) e.preventDefault(); });
