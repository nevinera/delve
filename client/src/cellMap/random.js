// Seeded randomness keyed by position, so the same map always renders the
// same way and editing one cell only changes what's drawn near it.

// A float in [0, 1) from the seed and any number of integers.
export function hash01(seed, ...ints) {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (const n of ints) {
    h = Math.imul(h ^ (n | 0), 0x85ebca6b);
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 0xc2b2ae35);
    h = (h ^ (h >>> 16)) >>> 0;
  }
  return h / 4294967296;
}

// The same, keyed by a point's position, quantized so equal points agree.
export function pointHash01(seed, x, y, salt = 0) {
  return hash01(seed, Math.round(x * 1000), Math.round(y * 1000), salt);
}

// A hash of a string (cyrb53), for cache keys.
export function hashString(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
