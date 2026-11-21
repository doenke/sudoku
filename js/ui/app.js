// App controller: wires board, input, helps, timer, statistics, sharing and
// persistence together.

import { Board } from './board.js';
import { Game } from './game.js';
import { load, save } from './store.js';
import { loadSettings, saveSettings } from './settings.js';
import { formatTime, loadStats, recordSolved, recordAbandoned, resetStats, bucketKey } from './stats.js';
import { pickPuzzle, markPlayed, unplayedCount } from './bank.js';
import { findConflicts, findWrong } from '../core/conflicts.js';
import { cageComboStatus } from '../core/combos.js';
import { decodePuzzle } from '../core/codec.js';
import { validatePuzzle, buildModel } from '../core/model.js';
import { solve } from '../core/solve.js';
import { VARIANTS, PLAYABLE, LEVELS, levelByValue } from '../core/variants.js';

const VERSION = '__VERSION__';
const $ = (id) => document.getElementById(id);

const state = {
  game: null,
  selection: new Set(),
  cursor: 40,
  noteMode: false,
  running: false,
  tickStart: 0,
  checkMarks: null, // wrong cells shown after "Prüfen", until the next move
  settings: loadSettings(),
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

const NONE = { cells: new Set(), cages: new Set() };

function view() {
  const g = state.game;
  const s = state.settings;
  let wrong = new Set();
  if (s.errors === 'solution' && g.solution) wrong = findWrong(g.values, g.solution, g.givens);
  else if (state.checkMarks) wrong = state.checkMarks;
  return {
    selection: state.selection,
    cursor: state.cursor,
    conflicts: s.errors === 'rules' ? findConflicts(g.model, g.values) : NONE,
    wrong,
    highlightHouses: s.highlightHouses,
    highlightDigits: s.highlightDigits,
  };
}

function render() {
  const g = state.game;
  if (!g) return;
  const s = state.settings;
  board.render(view());
  if (!s.notes) state.noteMode = false;
  document.body.classList.toggle('notes-mode', state.noteMode);
  $('btn-notes').hidden = !s.notes;
  $('btn-notes').setAttribute('aria-pressed', String(state.noteMode));
  $('btn-undo').disabled = !g.history.length || g.solved;
  $('btn-redo').disabled = !g.future.length || g.solved;
  $('btn-fill').hidden = !s.fillCandidates || !s.notes;
  $('btn-check').hidden = s.errors !== 'off';
  for (const el of [$('btn-fill'), $('btn-check'), $('btn-erase')]) el.disabled = g.solved;
  for (const b of padButtons) b.classList.toggle('done', g.count(+b.dataset.d) >= 9);
  renderCombos();
}

function renderCombos() {
  const g = state.game;
  const box = $('combos');
  const show = state.settings.combos && g.model.cages.length > 0;
  box.hidden = !show;
  if (!show) return;
  const k = g.model.cellCage[state.cursor] ?? -1;
  const list = $('combos-list');
  if (k < 0) {
    $('combos-title').textContent = 'Käfig-Kombinationen';
    list.innerHTML = '<li class="empty">Wähle eine Zelle in einem Käfig.</li>';
    return;
  }
  const cage = g.model.cages[k];
  $('combos-title').textContent = `Käfig ${cage.sum} · ${cage.cells.length} ${cage.cells.length === 1 ? 'Zelle' : 'Zellen'}`;
  const status = cageComboStatus(g.model, g.values, k);
  list.replaceChildren(...status.map(({ digits, possible }) => {
    const li = document.createElement('li');
    li.textContent = digits.join('');
    if (!possible) { li.className = 'off'; li.title = 'durch gesetzte Ziffern unmöglich'; }
    return li;
  }));
}

function puzzleLabel(g) {
  const level = levelByValue(g.level);
  return `${VARIANTS[g.variant].name}${level ? ' · ' + level.name : ''}`;
}

// ---- Settings ----

function applyTheme() {
  const t = state.settings.theme;
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

/** "Against the solution" while playing: the game counts as assisted. */
function markAssistedIfNeeded() {
  const g = state.game;
  if (g && !g.solved && state.settings.errors === 'solution' && !g.assisted) {
    g.assisted = true;
    persist();
  }
}

const settingsForm = $('dlg-settings').querySelector('form');
function fillSettingsForm() {
  for (const el of settingsForm.elements) {
    if (!el.name || !(el.name in state.settings)) continue;
    if (el.type === 'checkbox') el.checked = !!state.settings[el.name];
    else if (el.type === 'radio') el.checked = state.settings[el.name] === el.value;
  }
}
settingsForm.addEventListener('change', (e) => {
  const el = e.target;
  if (!el.name) return;
  state.settings[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  saveSettings(state.settings);
  if (el.name === 'theme') applyTheme();
  if (el.name === 'errors') state.checkMarks = null;
  markAssistedIfNeeded();
  render();
});
$('btn-settings').addEventListener('click', () => { fillSettingsForm(); $('dlg-settings').showModal(); });
$('version').textContent = VERSION.startsWith('__') ? 'lokal' : VERSION;

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
  if (running) stopTimer();
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
  state.checkMarks = null;
  board.setGame(game);
  const label = puzzleLabel(game);
  $('label').textContent = label;
  $('label-side').textContent = label;
  markAssistedIfNeeded();
  persist();
  render();
  startTimer();
}

/** Leaving an unsolved game with moves counts as abandoned. */
async function leaveCurrent(question) {
  const g = state.game;
  if (!g || g.solved || !g.moves) return true;
  if (!(await confirmDialog('Rätsel abbrechen?', question, 'Abbrechen und weiter'))) return false;
  recordAbandoned(g.variant, g.level);
  return true;
}

function solved() {
  const g = state.game;
  stopTimer();
  g.solved = true;
  state.checkMarks = null;
  const { best, streak } = recordSolved(g.variant, g.level, g.elapsed, g.assisted);
  persist();
  render();
  $('solved-time').textContent = formatTime(g.elapsed);
  const parts = [];
  if (best) parts.push('Neue Bestzeit!');
  if (streak > 1) parts.push(`${streak} gelöst in Folge.`);
  if (g.assisted) parts.push('Mit Hilfen gelöst – zählt in der Statistik getrennt.');
  $('solved-text').textContent = parts.join(' ') || `${puzzleLabel(g)} – gut gemacht.`;
  $('dlg-solved').showModal();
}

$('dlg-solved').addEventListener('close', () => {
  if ($('dlg-solved').returnValue === 'new') openNewDialog();
});

function afterMove() {
  const g = state.game;
  state.checkMarks = null;
  markAssistedIfNeeded();
  if (!g.solved && g.isFull()) {
    if (g.isCorrect()) { solved(); return; }
    showToast('Alles ausgefüllt – aber noch nicht richtig.');
  }
  persist();
  render();
}

// ---- New game ----

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
  $('new-hint').textContent = first ? 'Willkommen! Such dir eine Spielart und eine Stufe aus. Leicht gibt es hier nicht.' : '';
  $('new-hint').hidden = !first;
  $('new-cancel').hidden = !state.game;
  renderNewDialog();
  $('dlg-new').showModal();
}

// Without a game there is nothing behind the dialog: keep it open.
$('dlg-new').addEventListener('cancel', (e) => { if (!state.game) e.preventDefault(); });

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
    if (!state.game) openNewDialog(true);
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

// ---- Sharing ----

async function share() {
  const g = state.game;
  if (!g) return;
  const url = `${location.origin}${location.pathname}#${g.code}`;
  const title = `Sudoku – ${puzzleLabel(g)}`;
  if (navigator.share) {
    try { await navigator.share({ title, text: `${title}. Schaffst du es?`, url }); return; } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast('Link kopiert.');
  } catch {
    window.prompt('Link zum Kopieren:', url);
  }
}

/** Opens a puzzle from the link fragment (#code). */
async function openFromHash() {
  const code = decodeURIComponent(location.hash.slice(1)).trim();
  if (!code) return false;
  history.replaceState(null, '', location.pathname + location.search);
  let puzzle;
  try {
    puzzle = decodePuzzle(code);
    if (validatePuzzle(puzzle)) throw new Error('invalid');
    const r = solve(buildModel(puzzle), puzzle.givens, { limit: 2, maxNodes: 2_000_000 });
    if (r.count !== 1) throw new Error('not unique');
  } catch {
    showToast('Dieser Link enthält kein gültiges Rätsel.');
    return false;
  }
  const game = new Game(puzzle, { source: 'link' });
  if (state.game && state.game.id === game.id && !state.game.solved) {
    showToast('Dieses Rätsel spielst du gerade.');
    return true;
  }
  if (!(await leaveCurrent('Du öffnest ein geteiltes Rätsel. Dein aktuelles ist noch nicht gelöst und gilt dann als abgebrochen.'))) return !!state.game;
  markPlayed(game.id);
  startGame(game);
  showToast(`Geteiltes Rätsel: ${puzzleLabel(game)}`);
  return true;
}

window.addEventListener('hashchange', () => { if (location.hash.length > 1) openFromHash(); });
$('btn-share').addEventListener('click', share);

// ---- Statistics ----

function renderStats() {
  const stats = loadStats();
  const body = $('stats-body');
  body.replaceChildren();
  const levels = [...LEVELS.map((l) => ({ value: l.value, name: l.name })), { value: 0, name: 'ohne Stufe' }];
  for (const variant of PLAYABLE) {
    const rows = levels.filter((l) => l.value || stats[bucketKey(variant, 0)]);
    const table = document.createElement('table');
    table.className = 'stats';
    table.innerHTML = `<caption>${VARIANTS[variant].name}</caption>
      <thead><tr><th>Stufe</th><th>gelöst</th><th>Bestzeit</th><th>Ø</th><th>Serie</th></tr></thead>`;
    const tbody = document.createElement('tbody');
    for (const l of rows) {
      const e = stats[bucketKey(variant, l.value)];
      const n = e?.normal, a = e?.assisted;
      const avg = (p) => (p && p.solved ? formatTime(p.total / p.solved) : '–');
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${l.name}</td><td>${n?.solved || 0}</td><td>${formatTime(n?.best ?? null)}</td><td>${avg(n)}</td>
        <td>${e ? `${e.streak}${e.bestStreak > e.streak ? ` (${e.bestStreak})` : ''}` : '0'}</td>`;
      tbody.append(tr);
      if (a?.solved) {
        const ta = document.createElement('tr');
        ta.className = 'assisted';
        ta.innerHTML = `<td>&nbsp;&nbsp;mit Hilfen</td><td>${a.solved}</td><td>${formatTime(a.best)}</td><td>${avg(a)}</td><td></td>`;
        tbody.append(ta);
      }
    }
    table.append(tbody);
    body.append(table);
  }
}

$('btn-stats').addEventListener('click', () => { renderStats(); $('dlg-stats').showModal(); });
$('stats-reset').addEventListener('click', async () => {
  $('dlg-stats').close();
  if (await confirmDialog('Statistik zurücksetzen?', 'Alle Zeiten und Serien auf diesem Gerät werden gelöscht.', 'Zurücksetzen')) {
    resetStats();
    showToast('Statistik zurückgesetzt.');
  }
});

// ---- Input ----

function inputDigit(d, asNote = false) {
  const g = state.game;
  if (!g || g.solved) return;
  const cells = [...state.selection];
  if (!cells.length) return;
  const note = asNote || state.noteMode || cells.length > 1;
  if (note && !state.settings.notes) return;
  const cell = cells.includes(state.cursor) ? state.cursor : cells[0];
  const changed = note ? g.toggleNote(cells, d) : g.setDigit(cell, d, { autoRemove: state.settings.autoRemove });
  if (changed) afterMove();
}

function erase() {
  const g = state.game;
  if (g && !g.solved && g.erase([...state.selection])) afterMove();
}

function undo() { if (state.game && !state.game.solved && state.game.undo()) afterMove(); }
function redo() { if (state.game && !state.game.solved && state.game.redo()) afterMove(); }

function toggleNoteMode() {
  if (!state.settings.notes) return;
  state.noteMode = !state.noteMode;
  render();
}

function fillCandidates() {
  const g = state.game;
  if (!g || g.solved || !state.settings.fillCandidates) return;
  if (g.fillCandidates()) { afterMove(); showToast('Kandidaten ausgefüllt.'); }
}

function check() {
  const g = state.game;
  if (!g || g.solved) return;
  const wrong = findWrong(g.values, g.solution, g.givens);
  state.checkMarks = wrong;
  render();
  if (!wrong.size) showToast('Bisher alles richtig.');
  else showToast(wrong.size === 1 ? 'Eine Ziffer ist falsch.' : `${wrong.size} Ziffern sind falsch.`);
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
  if (e.target.closest?.('input, textarea')) return;
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
      if (e.key === '?') { e.preventDefault(); $('dlg-keys').showModal(); }
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
// Keep focus and selection on the board when tapping controls.
for (const el of [$('pad'), document.querySelector('.tools')]) el.addEventListener('pointerdown', (e) => e.preventDefault());

$('btn-notes').addEventListener('click', toggleNoteMode);
$('btn-erase').addEventListener('click', erase);
$('btn-undo').addEventListener('click', undo);
$('btn-redo').addEventListener('click', redo);
$('btn-fill').addEventListener('click', fillCandidates);
$('btn-check').addEventListener('click', check);
$('btn-new').addEventListener('click', () => openNewDialog());
$('btn-keys').addEventListener('click', () => $('dlg-keys').showModal());

// ---- Toast ----

let toastTimer = 0;
function showToast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

// ---- Start ----

applyTheme();
const saved = load('game', null);
let restored = null;
try { restored = saved ? Game.fromJSON(saved) : null; } catch { restored = null; }
if (restored) startGame(restored);
openFromHash().then((opened) => { if (!opened && !state.game) openNewDialog(true); });

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {});
}
