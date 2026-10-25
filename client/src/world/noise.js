// Seeded value noise in continent space. Only 32-bit integer math feeds the hash, so the Go server
// can reproduce it exactly.

export function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// A value in [0, 1) for an integer lattice point.
export function hash2(ix, iz, seed) {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iz | 0, 0x165667b1) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

// Smooth noise in [-1, 1] with features about one unit apart.
export function valueNoise(x, z, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const u = fade(x - ix);
  const v = fade(z - iz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}

// Fractal noise in about [-1, 1]. wavelength is in feet; each octave halves it.
export function fbm(x, z, seed, { wavelength, octaves = 3 }) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let scale = 1 / wavelength;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(x * scale, z * scale, (seed + Math.imul(o, 0x9e3779b9)) | 0) * amp;
    norm += amp;
    amp *= 0.5;
    scale *= 2;
  }
  return sum / norm;
}
