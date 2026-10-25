// A tile's content as a picture: one pixel per cell, colored by terrain type with forest and
// water on top, and hill-shaded. Used for the editor's thumbnails and the bake overview.

const COLORS = {
  grass: [96, 140, 70],
  dirt: [140, 112, 80],
  sand: [210, 196, 150],
  rock: [130, 126, 120],
  path: [176, 150, 110],
  shore: [150, 150, 110],
  mud: [100, 88, 70],
  tree_1: [44, 74, 36],
  tree_2: [44, 74, 36],
  tree_3: [44, 74, 36],
};
const UNKNOWN = [255, 0, 255];
const FOREST = [40, 80, 40];

// A cell's ground color, 0-255 RGB: its terrain type darkened toward green by forest. No water or
// shading; the 3D view lights the ground and draws water itself.
export function groundRgb(tile, k) {
  const c = COLORS[tile.palettes.terrain[tile.layers.terrain[k]]] ?? UNKNOWN;
  const f = tile.layers.forest[k] / 255;
  return c.map((v, m) => v + (FOREST[m] - v) * f * 0.8);
}

// RGBA, row by row from the tile's north-west corner.
export function tileRgba(tile) {
  const n = tile.cells;
  const { height: h, water } = tile.layers;
  const out = new Uint8ClampedArray(n * n * 4);
  const at = (i, j) => h[Math.max(0, Math.min(n - 1, j)) * n + Math.max(0, Math.min(n - 1, i))];
  const spacing = 2 * tile.cellFt;

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      // Light from the north-west, exaggerated so gentle coastal slopes still show.
      const dx = (at(i + 1, j) - at(i - 1, j)) / spacing;
      const dz = (at(i, j + 1) - at(i, j - 1)) / spacing;
      const shade = Math.max(0.55, Math.min(1.35, 1 - (dx + dz) * 2.5));
      let c = groundRgb(tile, k);
      if (!Number.isNaN(water[k])) {
        const depth = Math.min(1, (water[k] - h[k]) / 20);
        c = [60 - depth * 30, 110 - depth * 40, 170 - depth * 30];
      }
      out[k * 4] = c[0] * shade;
      out[k * 4 + 1] = c[1] * shade;
      out[k * 4 + 2] = c[2] * shade;
      out[k * 4 + 3] = 255;
    }
  }
  return out;
}
