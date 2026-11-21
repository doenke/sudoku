// Candidate sets are 9-bit masks: bit (d - 1) stands for digit d.

export const ALL = 0x1ff;

export const POP = new Uint8Array(512);
export const MASK_SUM = new Uint8Array(512);
for (let m = 1; m < 512; m++) {
  POP[m] = POP[m >> 1] + (m & 1);
  const low = 32 - Math.clz32(m & -m);
  MASK_SUM[m] = MASK_SUM[m & (m - 1)] + low;
}

export const bit = (d) => 1 << (d - 1);

/** Digit of the lowest set bit (1..9). */
export const lowDigit = (mask) => 32 - Math.clz32(mask & -mask);

export function digitsOf(mask) {
  const out = [];
  for (let d = 1; d <= 9; d++) if (mask & (1 << (d - 1))) out.push(d);
  return out;
}

export function maskOf(digits) {
  let m = 0;
  for (const d of digits) m |= 1 << (d - 1);
  return m;
}

/** Small seeded PRNG (mulberry32), returns floats in [0, 1). */
export function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
