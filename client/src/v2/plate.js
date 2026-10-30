import { gunzipSync, gzipSync } from "fflate";
import { CHUNK_CELLS, PLATE_TILES, TILE_CHUNKS } from "./sizes.js";
import { SLOT_BYTES, makeSlots } from "./slots.js";
import { dryWater } from "./water.js";

// Plate files (spike): the ground of a plate's tiles at cell scale, which is what each chunk's
// rendition is, the ground painted by hand there, each cell's biome, the tile's object slots
// (slots.js) and its water (water.js). What the ground looks
// like is worked out from those where it's drawn (look.js). A client loads one only when it's near.
//
//   places/continents/<continent>/plates/<px>_<pz>.plate
//
// The file is gzipped. Inside, numbers are little-endian:
//
//   0   "DLD1"
//   4   u32 version (6)
//   8   i32 px, i32 pz
//   16  8 bytes: a bit for each of the plate's 64 tiles, in row order, set where it has one
//   24  the terrain palette: u8 count, then each name as a u8 length and that many ASCII bytes
//   then for each tile that has one, in row order:
//       65 × 65 i16 heights at cell corners, in quarter feet, row order
//       64 × 64 bytes of cell terrain painted by hand, 0 for none, else 1 + an index into the palette
//       64 × 64 bytes of cell biome, indexes into v2/biomes.js's BIOME_NAMES
//       u16 how many object slots, then SLOT_BYTES bytes each
//       64 bytes, a mode for each of the tile's 8 × 8 chunks, in row order: 0 dry, 1 one level for
//         the whole chunk, 2 a level for each cell, 3 a level and a type for each cell
//       then for each chunk that isn't dry, in row order:
//         mode 1: u8 type, i16 level
//         mode 2: u8 type, 8 × 8 i16 levels, row order, -32768 where the cell's dry
//         mode 3: 8 × 8 i16 levels as for mode 2, then 8 × 8 u8 types
//       levels in quarter feet, types indexes into water.js's WATER_TYPES
//
// Versions 2 and 3 are read too, without what they kept that's now worked out: cell colors,
// terrain and forest density, all left out, and in version 2, biomes, all plains. Tiles from before
// version 5 get their slots scattered as they're read, and from before version 6 have no water.

export const TILE_CELLS = TILE_CHUNKS * CHUNK_CELLS; // 64
export const CELL_CORNERS = TILE_CELLS + 1;
const MAGIC = "DLD1";
const VERSION = 6;
const VERSIONS = new Set([2, 3, 4, 5, 6]);
const HEADER = 24;
const HEIGHTS = CELL_CORNERS * CELL_CORNERS;
const COLORS = TILE_CELLS * TILE_CELLS * 3;
const CELLS = TILE_CELLS * TILE_CELLS;
const CHUNKS = TILE_CHUNKS * TILE_CHUNKS;
const CHUNK_AREA = CHUNK_CELLS * CHUNK_CELLS;
const DRY = -32768;

export const platePath = (continent, [px, pz]) => `places/continents/${continent}/plates/${px}_${pz}.plate`;
export const PLATE_PATH = /^places\/continents\/([\w-]+)\/plates\/(-?\d+)_(-?\d+)\.plate$/;

// Tile `index` of plate `coords`, [tx, tz].
const tileOf = ([px, pz], index) => [px * PLATE_TILES + (index % PLATE_TILES), pz * PLATE_TILES + Math.floor(index / PLATE_TILES)];

// The index of tile (tx, tz) within its plate.
export const tileIndexInPlate = (tx, tz) => (tz - Math.floor(tz / PLATE_TILES) * PLATE_TILES) * PLATE_TILES + (tx - Math.floor(tx / PLATE_TILES) * PLATE_TILES);

// plate: { coords: [px, pz], palette: terrain names, tiles: Map(index -> { heights: 65×65 feet,
// terrain: 64×64 bytes, 0 or 1 + palette indexes, biome: 64×64 indexes, slots, water: as water.js
// has it }) }, each layer all 0 where it's missing, slots scattered and water dry.
export function encodePlate({ coords, palette, tiles }) {
  const indexes = [...tiles.keys()].sort((a, b) => a - b);
  const names = palette.map((name) => new TextEncoder().encode(name));
  const paletteBytes = 1 + names.reduce((sum, name) => sum + 1 + name.length, 0);
  const slotsOf = (index) => tiles.get(index).slots ?? makeSlots(...tileOf(coords, index));
  const slotBytes = indexes.reduce((sum, index) => sum + 2 + slotsOf(index).length, 0);
  const waters = new Map(indexes.map((index) => [index, encodeWater(tiles.get(index).water)]));
  const waterBytes = [...waters.values()].reduce((sum, water) => sum + water.length, 0);
  const bytes = new Uint8Array(HEADER + paletteBytes + indexes.length * (HEIGHTS * 2 + CELLS * 2) + slotBytes + waterBytes);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < 4; i++) bytes[i] = MAGIC.charCodeAt(i);
  view.setUint32(4, VERSION, true);
  view.setInt32(8, coords[0], true);
  view.setInt32(12, coords[1], true);
  let at = HEADER;
  bytes[at++] = names.length;
  for (const name of names) {
    bytes[at++] = name.length;
    bytes.set(name, at);
    at += name.length;
  }
  for (const index of indexes) {
    bytes[16 + (index >> 3)] |= 1 << (index & 7);
    const { heights, terrain = new Uint8Array(CELLS), biome = new Uint8Array(CELLS) } = tiles.get(index);
    for (let k = 0; k < HEIGHTS; k++) view.setInt16(at + k * 2, Math.max(-32768, Math.min(32767, Math.round(heights[k] * 4))), true);
    at += HEIGHTS * 2;
    for (const layer of [terrain, biome]) {
      bytes.set(layer, at);
      at += layer.length;
    }
    const slots = slotsOf(index);
    view.setUint16(at, slots.length / SLOT_BYTES, true);
    bytes.set(slots, at + 2);
    at += 2 + slots.length;
    bytes.set(waters.get(index), at);
    at += waters.get(index).length;
  }
  return gzipSync(bytes, { level: 9 });
}

export function decodePlate(gzipped) {
  const bytes = gunzipSync(gzipped);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  if (magic !== MAGIC) throw new Error(`not a plate file (magic ${JSON.stringify(magic)})`);
  const version = view.getUint32(4, true);
  if (!VERSIONS.has(version)) throw new Error(`unsupported plate version ${version}`);
  const coords = [view.getInt32(8, true), view.getInt32(12, true)];
  const tiles = new Map();
  let at = HEADER;
  const palette = [];
  for (let n = bytes[at++]; n > 0; n--) {
    const length = bytes[at++];
    palette.push(new TextDecoder().decode(bytes.subarray(at, at + length)));
    at += length;
  }
  const take = (length) => bytes.slice(at, (at += length));
  for (let index = 0; index < PLATE_TILES * PLATE_TILES; index++) {
    if (!(bytes[16 + (index >> 3)] & (1 << (index & 7)))) continue;
    const heights = new Float32Array(HEIGHTS);
    for (let k = 0; k < HEIGHTS; k++) heights[k] = view.getInt16(at + k * 2, true) / 4;
    at += HEIGHTS * 2;
    if (version < 4) at += COLORS + CELLS * 2;
    const terrain = version < 4 ? new Uint8Array(CELLS) : take(CELLS);
    const biome = version >= 3 ? take(CELLS) : new Uint8Array(CELLS);
    let slots;
    if (version >= 5) {
      const count = view.getUint16(at, true);
      at += 2;
      slots = take(count * SLOT_BYTES);
    } else {
      slots = makeSlots(...tileOf(coords, index));
    }
    let water = null;
    if (version >= 6) [water, at] = decodeWater(bytes, view, at);
    tiles.set(index, { heights, terrain, biome, slots, water });
  }
  return { coords, palette, tiles };
}

// The cells of chunk `c` of a tile, in row order.
function chunkCells(c) {
  const [ci, cj] = [(c % TILE_CHUNKS) * CHUNK_CELLS, Math.floor(c / TILE_CHUNKS) * CHUNK_CELLS];
  const cells = [];
  for (let j = 0; j < CHUNK_CELLS; j++) for (let i = 0; i < CHUNK_CELLS; i++) cells.push((cj + j) * TILE_CELLS + ci + i);
  return cells;
}
const CHUNK_CELL_LISTS = Array.from({ length: CHUNKS }, (_, c) => chunkCells(c));

const quarters = (level) => (Number.isNaN(level) ? DRY : Math.max(DRY + 1, Math.min(32767, Math.round(level * 4))));

// A tile's water as the file has it, each chunk as small as it'll go.
function encodeWater(water) {
  const modes = new Uint8Array(CHUNKS);
  const parts = [modes];
  for (let c = 0; water && c < CHUNKS; c++) {
    const cells = CHUNK_CELL_LISTS[c];
    const levels = cells.map((k) => quarters(water.level[k]));
    const wet = cells.filter((_, n) => levels[n] !== DRY);
    if (!wet.length) continue;
    const type = water.type[wet[0]];
    const oneType = wet.every((k) => water.type[k] === type);
    const oneLevel = wet.length === CHUNK_AREA && levels.every((level) => level === levels[0]);
    modes[c] = oneType && oneLevel ? 1 : oneType ? 2 : 3;
    const part = new Uint8Array(modes[c] === 1 ? 3 : modes[c] === 2 ? 1 + CHUNK_AREA * 2 : CHUNK_AREA * 3);
    const view = new DataView(part.buffer);
    let at = 0;
    if (modes[c] !== 3) part[at++] = type;
    for (const level of modes[c] === 1 ? levels.slice(0, 1) : levels) {
      view.setInt16(at, level, true);
      at += 2;
    }
    if (modes[c] === 3) cells.forEach((k, n) => (part[at + n] = levels[n] === DRY ? 0 : water.type[k]));
    parts.push(part);
  }
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.length;
  }
  return bytes;
}

// A tile's water read from `bytes` at `at`, and where it ends, [water or null, at].
function decodeWater(bytes, view, at) {
  const modes = bytes.subarray(at, (at += CHUNKS));
  if (modes.every((mode) => !mode)) return [null, at];
  const water = dryWater(CELLS);
  for (let c = 0; c < CHUNKS; c++) {
    const mode = modes[c];
    if (!mode) continue;
    const cells = CHUNK_CELL_LISTS[c];
    const type = mode === 3 ? 0 : bytes[at++];
    const levels = [];
    for (let n = 0; n < (mode === 1 ? 1 : CHUNK_AREA); n++, at += 2) levels.push(view.getInt16(at, true));
    cells.forEach((k, n) => {
      const level = levels[mode === 1 ? 0 : n];
      if (level === DRY) return;
      water.level[k] = level / 4;
      water.type[k] = mode === 3 ? bytes[at + n] : type;
    });
    if (mode === 3) at += CHUNK_AREA;
  }
  return [water, at];
}
