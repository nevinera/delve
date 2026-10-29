import * as THREE from "three";
import { SLAB_PRESETS } from "../world/slabs.js";
import { Canvas, PATTERN_FT, PATTERN_PX, patternFactors } from "./groundMaterial.js";

// The pictures slabs wear (world/slabs.js): one for each preset, painted in its colors, and one for
// each color and ground pattern an advanced surface asks for. Each repeats every so many feet.

const SIZE = 128;
// How many feet each preset's picture spans before it repeats.
export const PRESET_FT = {
  woodgrain: 4,
  floorboards: 8,
  logs: 8,
  shingles: 4,
  stone: 8,
  stoneBlocks: 8,
  brick: 4,
  roughRock: 12,
  dirtyStone: 8,
  cobblestone: 6,
  flagstones: 12,
  marble: 8,
  sandstone: 8,
  thatch: 4,
  slateTiles: 4,
  clayTiles: 4,
  plaster: 8,
  packedEarth: PATTERN_FT.dirt,
  ironPlate: 8,
  rustyIronPlate: 8,
};

const kept = new Map(); // surface key -> { texture, feet }

// How many feet a surface's picture spans before it repeats.
export function repeatFt(surface) {
  if (typeof surface === "string") return PRESET_FT[surface] ?? 1;
  if (surface.tile) return surface.tile.every;
  return surface.pattern ? PATTERN_FT[surface.pattern] : 1;
}

// The picture for a preset's name, or a { color, pattern } surface: { texture, feet }.
export function slabTexture(surface) {
  const key = typeof surface === "string" ? surface : `${surface.color}/${surface.pattern}`;
  if (!kept.has(key)) {
    const made = typeof surface === "string" ? presetPixels(surface) : patternPixels(surface);
    const texture = new THREE.DataTexture(made.rgba, made.size, made.size);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    kept.set(key, { texture, feet: made.feet });
  }
  return kept.get(key);
}

// A preset's picture as { size, rgba, feet }.
export function presetPixels(name) {
  const base = rgbOf(SLAB_PRESETS[name].color);
  const c = new Canvas(PAINT[name].size ?? SIZE, 1 + Object.keys(SLAB_PRESETS).indexOf(name));
  return { size: c.size, rgba: toBytes(PAINT[name](c, base)), feet: PRESET_FT[name] };
}

// A color shaded by a ground pattern, as { size, rgba, feet }.
export function patternPixels({ color, pattern }) {
  const base = rgbOf(color);
  if (!pattern) return { size: 1, rgba: toBytes(new Float32Array(base)), feet: 1 };
  return { size: PATTERN_PX, rgba: toBytes(tinted(patternFactors(pattern), base)), feet: PATTERN_FT[pattern] };
}

const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const times = (rgb, f) => rgb.map((v, i) => v * (Array.isArray(f) ? f[i] : f));
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (t) => t * t * (3 - 2 * t);
const step = (from, to, v) => smooth(clamp01((v - from) / (to - from)));

function toBytes(rgb) {
  const rgba = new Uint8Array((rgb.length / 3) * 4);
  for (let k = 0; k < rgb.length / 3; k++) {
    for (let i = 0; i < 3; i++) rgba[k * 4 + i] = Math.round(clamp01(rgb[k * 3 + i]) * 255);
    rgba[k * 4 + 3] = 255;
  }
  return rgba;
}

function tinted(factors, base) {
  return factors.map((v, k) => v * base[k % 3]);
}

// Sets every pixel of the canvas to f(x, y, k), an [r, g, b] color.
function paint(c, f) {
  for (let y = 0; y < c.size; y++) {
    for (let x = 0; x < c.size; x++) {
      const k = y * c.size + x;
      c.rgb.set(f(x, y, k), k * 3);
    }
  }
  return c.rgb;
}

// Where (x, y) falls in courses of blocks: `rows` courses, each `cols` blocks long, each course
// slid along by shift(row) blocks. Gives the block's row and column, how far across it is (0 to
// 1 each way), and how many pixels to its nearest joint across and along.
function courses(c, x, y, rows, cols, shift) {
  const [h, w] = [c.size / rows, c.size / cols];
  const row = Math.floor(y / h);
  const along = (((x + shift(row) * w) % c.size) + c.size) % c.size;
  const col = Math.floor(along / w);
  const [fx, fy] = [(along - col * w) / w, (y - row * h) / h];
  return { row, col, fx, fy, side: Math.min(fx, 1 - fx) * w, end: Math.min(fy, 1 - fy) * h };
}

// A steady number in [0, 1) for a block.
const shade = (c, row, col, salt = 0) => hash(row * 131 + col * 7 + salt, c.seed);

function hash(n, seed) {
  let h = Math.imul(n ^ seed, 0x27d4eb2d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x165667b1);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

// Wood grain running along x: rings that wander, fine streaks, and a few knots.
function grain(c, salt, rings) {
  const warp = c.noise([2, 4], salt);
  const fine = c.noise([32, 64], salt + 1);
  const streak = Array.from({ length: c.size }, () => 0.94 + 0.12 * c.random());
  return (x, y, k) => {
    const ring = Math.sin(((y / c.size) * rings + warp[k] * 3) * Math.PI * 2);
    return (0.92 + 0.08 * ring) * streak[y] * (0.92 + 0.16 * fine[k]);
  };
}

// How each preset is painted, as absolute colors from its base color.
const PAINT = {
  woodgrain: (c, base) => {
    const g = grain(c, 1, 9);
    return paint(c, (x, y, k) => times(base, g(x, y, k)));
  },
  floorboards: (c, base) => {
    const g = grain(c, 1, 24);
    const offsets = Array.from({ length: 8 }, () => c.random());
    return paint(c, (x, y, k) => {
      const b = courses(c, x, y, 8, 1, (row) => offsets[row]);
      const joint = b.end < 1 || b.side < 0.7 ? 0.45 : 1;
      return times(base, g(x, y, k) * (0.85 + 0.3 * shade(c, b.row, b.col)) * joint);
    });
  },
  logs: (c, base) => {
    const bark = c.noise([16, 32, 64], 1);
    return paint(c, (x, y, k) => {
      const b = courses(c, x, y, 8, 1, () => 0);
      const round = 0.5 + 0.55 * Math.sin(Math.PI * b.fy);
      return times(base, round * (0.8 + 0.4 * bark[k]) * (0.9 + 0.2 * shade(c, b.row, 0)) * (b.end < 0.8 ? 0.4 : 1));
    });
  },
  shingles: (c, base) => {
    const g = grain(c, 1, 30);
    const offsets = Array.from({ length: 6 }, (_, row) => (row % 2) * 0.5 + 0.2 * c.random());
    return paint(c, (x, y, k) => {
      const b = courses(c, x, y, 6, 5, (row) => offsets[row]);
      const edge = b.fy > 0.82 ? 0.55 : b.side < 0.8 ? 0.5 : 1;
      return times(base, g(x, y, k) * (0.8 + 0.4 * shade(c, b.row, b.col)) * edge);
    });
  },
  stone: (c, base) => {
    const patches = c.noise([4, 8, 16], 1);
    const grit = c.noise([64, 128], 2);
    return paint(c, (x, y, k) => times(base, 0.8 + 0.25 * patches[k] + 0.15 * grit[k]));
  },
  stoneBlocks: (c, base) => {
    const grit = c.noise([32, 64, 128], 1);
    const offsets = Array.from({ length: 4 }, () => c.random());
    const mortar = mix(base, [0.75, 0.73, 0.68], 0.5);
    return paint(c, (x, y, k) => {
      const b = courses(c, x, y, 4, 3, (row) => offsets[row]);
      const gap = Math.min(b.side, b.end);
      if (gap < 1.5) return times(mortar, 0.85 + 0.2 * grit[k]);
      const chip = 0.82 + 0.18 * step(1.5, 5, gap);
      return times(base, (0.8 + 0.35 * shade(c, b.row, b.col)) * (0.85 + 0.25 * grit[k]) * chip);
    });
  },
  brick: (c, base) => {
    const grit = c.noise([64, 128], 1);
    const mortar = [0.72, 0.69, 0.63];
    return paint(c, (x, y, k) => {
      const b = courses(c, x, y, 16, 6, (row) => (row % 2) * 0.5);
      if (Math.min(b.side, b.end) < 1) return times(mortar, 0.9 + 0.15 * grit[k]);
      const tone = shade(c, b.row, b.col);
      return times(base, [0.8 + 0.4 * tone, 0.75 + 0.35 * tone, 0.75 + 0.3 * tone]).map((v) => v * (0.88 + 0.2 * grit[k]));
    });
  },
  roughRock: (c, base) => tinted(patternFactors("rock"), base),
  dirtyStone: (c, base) => {
    const patches = c.noise([4, 8, 16], 1);
    const grit = c.noise([64, 128], 2);
    const grime = c.noise([4, 8, 16], 3);
    const damp = c.noise([16, 32], 4);
    return paint(c, (x, y, k) => {
      const stone = times(base, 0.8 + 0.25 * patches[k] + 0.2 * grit[k]);
      const dirt = step(0.45, 0.7, grime[k]);
      return times(mix(stone, [0.3, 0.25, 0.19], 0.6 * dirt), 1 - 0.2 * step(0.6, 0.8, damp[k]));
    });
  },
  cobblestone: (c, base) => {
    const { near, second, id } = c.cells(36);
    const grit = c.noise([64, 128], 1);
    return paint(c, (x, y, k) => {
      if (second[k] - near[k] < 2.5) return [0.22, 0.2, 0.17];
      const dome = 1 - 0.35 * clamp01(near[k] / 14);
      return times(base, dome * (0.75 + 0.45 * hash(id[k], c.seed + 9)) * (0.88 + 0.2 * grit[k]));
    });
  },
  flagstones: (c, base) => {
    const { near, second, id } = c.cells(16);
    const grit = c.noise([32, 64, 128], 1);
    return paint(c, (x, y, k) => {
      if (second[k] - near[k] < 1.2) return [0.3, 0.28, 0.25];
      return times(base, (0.82 + 0.3 * hash(id[k], c.seed + 9)) * (0.85 + 0.25 * grit[k]));
    });
  },
  marble: (c, base) => {
    const warp = c.noise([2, 4, 8], 1);
    const cloud = c.noise([4, 8], 2);
    const vein = [0.55, 0.56, 0.6];
    return paint(c, (x, y, k) => {
      const v = Math.abs(Math.sin(((x + y) / c.size + warp[k] * 2.5) * Math.PI * 2));
      return mix(times(base, 0.94 + 0.08 * cloud[k]), vein, 0.7 * Math.pow(1 - v, 14));
    });
  },
  sandstone: (c, base) => {
    const warp = c.noise([2, 4], 1);
    const grit = c.noise([64, 128], 2);
    return paint(c, (x, y, k) => {
      const band = Math.sin(((y / c.size) * 11 + warp[k] * 2) * Math.PI * 2);
      return times(base, [0.95 + 0.07 * band, 0.94 + 0.08 * band, 0.92 + 0.1 * band]).map((v) => v * (0.9 + 0.18 * grit[k]));
    });
  },
  thatch: (c, base) => {
    const clumps = c.noise([4, 8], 1);
    c.each((k) => times(base, 0.75 + 0.35 * clumps[k]));
    for (let n = 0; n < 4000; n++) {
      const tint = c.random() < 0.5 ? [1.07, 1.06, 1.02] : [0.9, 0.88, 0.86];
      c.stroke(c.random() * c.size, c.random() * c.size, 12 + c.random() * 20, Math.PI / 2 + (c.random() - 0.5) * 0.2, tint);
    }
    return c.rgb;
  },
  slateTiles: (c, base) => {
    const grit = c.noise([32, 64, 128], 1);
    return paint(c, (x, y, k) => {
      const b = courses(c, x, y, 8, 6, (row) => (row % 2) * 0.5);
      const edge = b.fy > 0.85 ? 0.55 : b.side < 0.8 ? 0.6 : 1;
      const tone = shade(c, b.row, b.col);
      return times(base, [0.85 + 0.3 * tone, 0.85 + 0.3 * tone, 0.9 + 0.3 * tone]).map((v) => v * edge * (0.9 + 0.15 * grit[k]));
    });
  },
  clayTiles: (c, base) => {
    const grit = c.noise([64, 128], 1);
    return paint(c, (x, y, k) => {
      const b = courses(c, x, y, 6, 8, () => 0);
      const barrel = 0.6 + 0.5 * Math.sin(Math.PI * b.fx);
      const lap = b.fy > 0.85 ? 0.6 : 1;
      const tone = shade(c, b.row, b.col);
      return times(base, [0.85 + 0.3 * tone, 0.85 + 0.25 * tone, 0.85 + 0.2 * tone]).map((v) => v * barrel * lap * (0.92 + 0.12 * grit[k]));
    });
  },
  plaster: (c, base) => {
    const soft = c.noise([4, 8, 16], 1);
    const speck = c.noise([128], 2);
    return paint(c, (x, y, k) => times(base, 0.92 + 0.1 * soft[k] + 0.05 * speck[k]));
  },
  packedEarth: (c, base) => tinted(patternFactors("dirt"), base),
  ironPlate: (c, base) => plates(c, base, 0),
  rustyIronPlate: (c, base) => plates(c, base, 1),
};
PAINT.roughRock.size = PATTERN_PX;
PAINT.packedEarth.size = PATTERN_PX;

// Iron plates, four to a picture, riveted round their edges; rusty ones streaked and blotched with
// the base color over dark iron.
function plates(c, base, rust) {
  const brushed = c.noise([8, 16, 128], 1);
  const blotch = c.noise([4, 8, 16], 2);
  const runs = c.noise([16, 32], 3);
  const iron = rust ? [0.3, 0.31, 0.32] : base;
  const plate = c.size / 2;
  const inset = 5;
  const spacing = (plate - 2 * inset) / 6;
  // Pixels from the nearest rivet: they sit `inset` in from each edge, `spacing` apart.
  const rivetAt = (x, y) => {
    const line = (v) => Math.min(Math.abs(v - inset), Math.abs(v - (plate - inset)));
    const along = (v) => {
      const t = (v - inset) / spacing;
      return t < -0.5 || t > 6.5 ? Infinity : Math.abs(t - Math.round(t)) * spacing;
    };
    return Math.min(Math.hypot(line(x), along(y)), Math.hypot(line(y), along(x)));
  };
  return paint(c, (x, y, k) => {
    const b = courses(c, x, y, 2, 2, () => 0);
    if (Math.min(b.side, b.end) < 1) return [0.12, 0.12, 0.13];
    let color = times(iron, 0.85 + 0.2 * brushed[k] + 0.1 * shade(c, b.row, b.col));
    const rivet = rivetAt(x % plate, y % plate);
    if (rivet < 1.8) color = times(color, 1.45 - 0.2 * rivet);
    else if (rivet < 2.6) color = times(color, 0.6);
    if (rust) {
      const spread = step(0.35, 0.65, blotch[k] * 0.7 + runs[(k + c.size * 3) % (c.size * c.size)] * 0.5);
      color = mix(color, times(base, 0.75 + 0.5 * runs[k]), spread);
    }
    return color;
  });
}
