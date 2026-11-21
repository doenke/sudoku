import { load, save } from './store.js';

// Defaults: notes on, error display off, every other help off.
export const DEFAULTS = {
  notes: true,
  autoRemove: false,
  fillCandidates: false,
  errors: 'off', // 'off' | 'rules' | 'solution'
  combos: false,
  highlightHouses: false,
  highlightDigits: false,
  theme: 'system', // 'system' | 'light' | 'dark'
};

export function loadSettings() {
  return { ...DEFAULTS, ...load('settings', {}) };
}

export function saveSettings(s) {
  save('settings', s);
}
