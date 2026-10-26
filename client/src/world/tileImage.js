// A tile's content as a picture: one pixel per cell, colored by terrain type with forest and
// water on top, and hill-shaded. Used for the editor's thumbnails and the bake overview. Close up,
// the editor draws tileDetailRgba instead: several pixels per cell, smoothed, with tree crowns and
// objects drawn on top.

import { CELL_FT, TILE_FT } from "./constants.js";
import { findTrees } from "./trees.js";

const COLORS = {
  grass: [96, 140, 70],
  dirt: [140, 112, 80],
  sand: [210, 196, 150],
  rock: [130, 126, 120],
  path: [176, 150, 110],
  shore: [150, 150, 110],
  mud: [100, 88, 70],
  moss: [84, 108, 58],
};
const TREE = [44, 74, 36];
const UNKNOWN = [255, 0, 255];
const FOREST = [40, 80, 40];

// A cell's ground color, 0-255 RGB: its terrain type darkened toward green by forest. No water or
// shading; the 3D view lights the ground and draws water itself.
export function groundRgb(tile, k) {
  const name = tile.palettes.terrain[tile.layers.terrain[k]];
  const c = COLORS[name] ?? (name?.startsWith("tree_") ? TREE : UNKNOWN);
  const f = tile.layers.forest[k] / 255;
  return c.map((v, m) => v + (FOREST[m] - v) * f * 0.8);
}

export const BIOME_COLORS = {
  plains: [226, 200, 90],
  forest: [40, 140, 60],
  rocky: [150, 150, 150],
  swamp: [70, 120, 110],
};

// The biome layer as RGBA, for tinting the map: one color per biome, and clear for biomes it
// doesn't know.
export function biomeRgba(tile) {
  const n = tile.cells;
  const out = new Uint8ClampedArray(n * n * 4);
  const colors = (tile.palettes.biome ?? []).map((name) => BIOME_COLORS[name]);
  for (let k = 0; k < n * n; k++) {
    const c = colors[tile.layers.biome[k]];
    if (!c) continue;
    out.set([...c, 255], k * 4);
  }
  return out;
}

// RGBA, row by row from the tile's north-west corner.
export function tileRgba(tile) {
  const n = tile.cells;
  const out = new Uint8ClampedArray(n * n * 4);
  for (let k = 0; k < n * n; k++) out.set([...shadedRgb(tile, k), 255], k * 4);
  return out;
}

// A cell's color in the pictures: its ground, or its water by depth, hill-shaded with light from
// the north-west, exaggerated so gentle coastal slopes still show.
function shadedRgb(tile, k) {
  const n = tile.cells;
  const { height: h, water } = tile.layers;
  const [i, j] = [k % n, Math.floor(k / n)];
  const at = (a, b) => h[Math.max(0, Math.min(n - 1, b)) * n + Math.max(0, Math.min(n - 1, a))];
  const dx = (at(i + 1, j) - at(i - 1, j)) / (2 * tile.cellFt);
  const dz = (at(i, j + 1) - at(i, j - 1)) / (2 * tile.cellFt);
  const shade = Math.max(0.55, Math.min(1.35, 1 - (dx + dz) * 2.5));
  let c = groundRgb(tile, k);
  if (!Number.isNaN(water[k])) {
    const depth = Math.min(1, (water[k] - h[k]) / 20);
    c = [60 - depth * 30, 110 - depth * 40, 170 - depth * 30];
  }
  return c.map((v) => v * shade);
}

const CROWNS = { oak: [62, 104, 42], pine: [32, 74, 46], willow: [100, 128, 58], dead: [112, 98, 78] };

// The tile close up, as RGBA `px` pixels per cell on a side: cell colors blended smoothly between
// cell centers, then each tree's crown as a lit disc over its shadow, and each object as a disc in
// its own color.
export function tileDetailRgba(tile, px = 4) {
  const n = tile.cells;
  const side = n * px;
  const cells = new Float32Array(n * n * 3);
  for (let k = 0; k < n * n; k++) cells.set(shadedRgb(tile, k), k * 3);
  const out = new Uint8ClampedArray(side * side * 4);
  const clampCell = (v) => Math.max(0, Math.min(n - 1, v));
  for (let y = 0; y < side; y++) {
    const v = Math.max(0, Math.min(n - 1, (y + 0.5) / px - 0.5));
    const j = Math.min(n - 2, Math.floor(v));
    const fv = v - j;
    for (let x = 0; x < side; x++) {
      const u = Math.max(0, Math.min(n - 1, (x + 0.5) / px - 0.5));
      const i = Math.min(n - 2, Math.floor(u));
      const fu = u - i;
      const o = (y * side + x) * 4;
      for (let c = 0; c < 3; c++) {
        const at = (a, b) => cells[(clampCell(b) * n + clampCell(a)) * 3 + c];
        out[o + c] = (at(i, j) * (1 - fu) + at(i + 1, j) * fu) * (1 - fv) + (at(i, j + 1) * (1 - fu) + at(i + 1, j + 1) * fu) * fv;
      }
      out[o + 3] = 255;
    }
  }
  const disc = (cx, cy, r, paint) => {
    for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(side, Math.ceil(cy + r)); y++) {
      for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(side, Math.ceil(cx + r)); x++) {
        const [dx, dy] = [(x + 0.5 - cx) / r, (y + 0.5 - cy) / r];
        if (dx * dx + dy * dy <= 1) paint((y * side + x) * 4, dx, dy);
      }
    }
  };
  const trees = findTrees(tile);
  for (const { i, j, size } of trees) {
    const r = size * px * 0.62;
    disc((i + size / 2) * px + r * 0.3, (j + size / 2) * px + r * 0.3, r, (o) => {
      for (let c = 0; c < 3; c++) out[o + c] *= 0.7;
    });
  }
  for (const { i, j, size, kind } of trees) {
    const base = CROWNS[kind] ?? CROWNS.oak;
    disc((i + size / 2) * px, (j + size / 2) * px, size * px * 0.62, (o, dx, dy) => {
      const light = 1 - 0.3 * (dx + dy);
      for (let c = 0; c < 3; c++) out[o + c] = base[c] * light;
    });
  }
  const [x0, z0] = [tile.coords[0] * TILE_FT, tile.coords[1] * TILE_FT];
  for (const object of tile.objects ?? []) {
    const rgb = (object.colors?.[0] ?? [0.5, 0.5, 0.5]).map((c) => c * 255);
    const r = Math.max(0.8, ((object.scale ?? 4) * 0.45 * px) / CELL_FT);
    disc(((object.at[0] - x0) / CELL_FT) * px, ((object.at[1] - z0) / CELL_FT) * px, r, (o, dx, dy) => {
      const light = 1 - 0.25 * (dx + dy);
      for (let c = 0; c < 3; c++) out[o + c] = rgb[c] * light;
    });
  }
  return out;
}
