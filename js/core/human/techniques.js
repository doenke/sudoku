// All techniques in the order the human-style solver tries them, with the
// level they stand for (0 basis, 1 schwer, 2 extrem, 3 teuflisch) and a weight
// for the score within a level. See docs/schwierigkeit.md.

import * as B from './basic.js';
import * as A from './advanced.js';
import * as K from './killer.js';
import * as C from './chains.js';

const T = (impl, level, weight, name) => ({ ...impl, level, weight, name, applies: impl.applies || (() => true) });

export const TECHNIQUES = [
  T(B.nakedSingle, 0, 1, 'Naked Single'),
  T(B.hiddenSingle, 0, 1, 'Hidden Single'),
  T(K.cageCombo, 0, 1, 'Käfig-Kombinationen'),

  T(B.lockedCandidates, 1, 4, 'Pointing / Box-Line'),
  T(B.nakedPair, 1, 5, 'Naked Pair'),
  T(B.hiddenPair, 1, 6, 'Hidden Pair'),
  T(K.sumElimination, 1, 5, 'Summen-Eliminierung'),
  T(K.cagePointing, 1, 6, 'Käfig im Haus'),
  T(K.innies45, 1, 7, '45er-Regel (ein Haus)'),
  T(B.nakedTriple, 1, 8, 'Naked Triple'),
  T(B.hiddenTriple, 1, 9, 'Hidden Triple'),
  T(B.nakedQuad, 1, 10, 'Naked Quad'),
  T(B.hiddenQuad, 1, 11, 'Hidden Quad'),

  T(A.xWing, 2, 14, 'X-Wing'),
  T(A.xyWing, 2, 15, 'XY-Wing'),
  T(A.xyzWing, 2, 16, 'XYZ-Wing'),
  T(A.uniqueRectangle, 2, 16, 'Unique Rectangle'),
  T(K.comboConflict, 2, 15, 'Kombi-Konflikt mit Zeile/Spalte/Block'),
  T(K.cageSplit, 2, 16, 'Käfig-Teilung / Innie-Outie-Differenz'),
  T(K.multi45, 2, 18, '45er-Regel über mehrere Häuser'),
  T(A.swordfish, 2, 18, 'Swordfish'),
  T(A.jellyfish, 2, 20, 'Jellyfish'),

  T(C.xChain, 3, 25, 'X-Chain'),
  T(C.xyChain, 3, 27, 'XY-Chain'),
  T(C.aic, 3, 30, 'AIC'),
  T(C.forcingChain, 3, 40, 'Forcing Chain'),
];

export const TECHNIQUE_BY_KEY = Object.fromEntries(TECHNIQUES.map((t) => [t.key, t]));
