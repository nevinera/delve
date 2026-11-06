import { steepParts } from "../v2/rendition.js";
import { BiomeMap, bakePlate } from "../v2/biomes.js";
import { bakeWater, partWater, seaEdges } from "../v2/water.js";
import { CELL_CORNERS, TILE_CELLS, decodePlate, encodePlate } from "../v2/plate.js";
import { CORNERS } from "../v2/platter.js";
import { CHUNK_CELLS, PLATE_TILES } from "../v2/sizes.js";
import { makeSlots } from "../v2/slots.js";

// Puts a builder's edits into plate files as they're read: on the main thread for drawing, and on
// the worker for saving (plateWorker.js). It's pure, so both can call it.

export const EMPTY_FT = -100; // the sea floor's height where there are no tiles

// A value `t` of the way from p1 to p2, curved through p0 to p3 round them, never past p1 or p2
// where they're the highest or lowest round there (a monotone cubic), so a cliff gets no ditch at
// its foot or lip at its top.
function curve(p0, p1, p2, p3, t) {
  const [s0, s1, s2] = [p1 - p0, p2 - p1, p3 - p2];
  let m1 = s0 * s1 > 0 ? (s0 + s1) / 2 : 0;
  let m2 = s1 * s2 > 0 ? (s1 + s2) / 2 : 0;
  if (s1 !== 0) {
    const [a, b] = [m1 / s1, m2 / s1];
    const r = a * a + b * b;
    if (r > 9) [m1, m2] = [(3 * a * s1) / Math.sqrt(r), (3 * b * s1) / Math.sqrt(r)];
  }
  const [t2, t3] = [t * t, t * t * t];
  return (2 * t3 - 3 * t2 + 1) * p1 + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2 + (t3 - t2) * m2;
}

// A `count` × `count` grid of values curved smoothly between a grid's corners, through each: from
// (u0, v0) in the grid's squares, `step` squares apart. The grid has `side` corners a row, a ring
// of them round its squares, so it curves the same across its edges as its neighbours do.
export function smooth(grid, side, u0, v0, step, count) {
  const n = side - 3;
  const place = (u) => {
    const i = Math.min(n - 1, Math.max(0, Math.floor(u)));
    return [i, u - i];
  };
  const across = Array.from({ length: count }, (_, i) => place(u0 + i * step));
  // Each row of the grid curved across first, then those down.
  const rows = new Float32Array(side * count);
  for (let r = 0; r < side; r++) {
    for (let c = 0; c < count; c++) {
      const [i, t] = across[c];
      const at = r * side + i;
      rows[r * count + c] = curve(grid[at], grid[at + 1], grid[at + 2], grid[at + 3], t);
    }
  }
  const out = new Float32Array(count * count);
  for (let k = 0; k < count; k++) {
    const [j, t] = place(v0 + k * step);
    for (let c = 0; c < count; c++) out[k * count + c] = curve(rows[j * count + c], rows[(j + 1) * count + c], rows[(j + 2) * count + c], rows[(j + 3) * count + c], t);
  }
  return out;
}

// Puts `edits` (Renditions' editsFor) into plate `key`, just read: takes out the tiles cleared,
// and puts in tiles' water as last baked, cuts and roads as last carved, the tiles made, and the moves.
export function applyEdits(key, plate, { cleared, made, tiles, plateMove }) {
  const [px, pz] = key.split(",").map(Number);
  for (const index of cleared ?? []) plate.tiles.delete(index);
  for (const [index, tile] of plate.tiles) {
    const edit = tiles?.get(index);
    if (edit?.water !== undefined) tile.water = edit.water;
    if (edit?.cut !== undefined) tile.cut = edit.cut;
    if (edit?.road !== undefined) tile.road = edit.road;
  }
  for (const index of made ?? []) {
    if (plate.tiles.has(index)) continue;
    const slots = makeSlots(px * PLATE_TILES + (index % PLATE_TILES), pz * PLATE_TILES + Math.floor(index / PLATE_TILES));
    plate.tiles.set(index, { heights: new Float32Array(CELL_CORNERS * CELL_CORNERS).fill(EMPTY_FT), terrain: new Uint8Array(TILE_CELLS * TILE_CELLS), biome: new Uint8Array(TILE_CELLS * TILE_CELLS), slots });
  }
  for (const [index, cells] of plate.tiles) {
    const { fine, coarse } = tiles?.get(index) ?? {};
    if (!fine && !coarse && !plateMove) continue;
    const [i0, j0] = [index % PLATE_TILES, Math.floor(index / PLATE_TILES)];
    const side = CORNERS + 2;
    const moves = [fine, coarse && smooth(coarse, side, 0, 0, 1 / CHUNK_CELLS, CELL_CORNERS), plateMove && smooth(plateMove, side, i0, j0, 1 / TILE_CELLS, CELL_CORNERS)];
    for (const move of moves) if (move) for (let k = 0; k < move.length; k++) cells.heights[k] += move[k];
  }
  return plate;
}

// A plate's tiles as far as its file goes, without what's kept for drawing.
export const fileTiles = (tiles) => new Map([...tiles].map(([index, { heights, slots, slotSeed, water, cut }]) => [index, { heights, slots, slotSeed, water, cut }]));

// A plate from its file's `bytes`, or from nothing where it has none, with `edits` in.
function readPlate({ coords, bytes, edits }) {
  const plate = bytes ? decodePlate(bytes) : { palette: [], tiles: new Map() };
  plate.coords = coords;
  return applyEdits(coords.join(","), plate, edits);
}

// The sea along the sides of a plate from its file, as water.js's seaEdges() has it.
export function plateEdges(value) {
  const { tiles } = readPlate(value);
  return seaEdges((a, b) => tiles.get(b * PLATE_TILES + a)?.water ?? null);
}

// A plate's file, with its biomes and water baked in: its `bytes`, or null where it has no tiles
// left, and each tile's water, its parts' water and how steep its parts are as they're baked, `waters`, or null. `value` has its `tiles`, or the
// `bytes` and `edits` to read them from.
export function bakedPlate(value, biomes = new BiomeMap(), water) {
  let plate = value;
  if (!value.tiles) {
    const { palette, tiles } = readPlate(value);
    if (!tiles.size) return { bytes: null, waters: null };
    plate = { coords: value.coords, palette, tiles: fileTiles(tiles), around: value.around, shores: value.shores };
  }
  const bytes = encodePlate(bakeWater(bakePlate(plate, biomes), water));
  return { bytes, waters: [...plate.tiles].map(([index, tile]) => [index, tile.water, partWater(tile.water), steepParts(tile.heights)]) };
}
