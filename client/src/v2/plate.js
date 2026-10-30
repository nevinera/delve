import { gunzipSync, gzipSync } from "fflate";
import { CHUNK_CELLS, PLATE_TILES, TILE_CHUNKS } from "./sizes.js";
import { SLOT_BYTES, makeSlots } from "./slots.js";

// Plate files (spike): the ground of a plate's tiles at cell scale, which is what each chunk's
// rendition is, the ground painted by hand there, each cell's biome, and the tile's object slots
// (slots.js). What the ground looks
// like is worked out from those where it's drawn (look.js). A client loads one only when it's near.
//
//   places/continents/<continent>/plates/<px>_<pz>.plate
//
// The file is gzipped. Inside, numbers are little-endian:
//
//   0   "DLD1"
//   4   u32 version (5)
//   8   i32 px, i32 pz
//   16  8 bytes: a bit for each of the plate's 64 tiles, in row order, set where it has one
//   24  the terrain palette: u8 count, then each name as a u8 length and that many ASCII bytes
//   then for each tile that has one, in row order:
//       65 × 65 i16 heights at cell corners, in quarter feet, row order
//       64 × 64 bytes of cell terrain painted by hand, 0 for none, else 1 + an index into the palette
//       64 × 64 bytes of cell biome, indexes into v2/biomes.js's BIOME_NAMES
//       u16 how many object slots, then SLOT_BYTES bytes each
//
// Versions 2 and 3 are read too, without what they kept that's now worked out: cell colors,
// terrain and forest density, all left out, and in version 2, biomes, all plains. Tiles from before
// version 5 get their slots scattered as they're read.

export const TILE_CELLS = TILE_CHUNKS * CHUNK_CELLS; // 64
export const CELL_CORNERS = TILE_CELLS + 1;
const MAGIC = "DLD1";
const VERSION = 5;
const VERSIONS = new Set([2, 3, 4, 5]);
const HEADER = 24;
const HEIGHTS = CELL_CORNERS * CELL_CORNERS;
const COLORS = TILE_CELLS * TILE_CELLS * 3;
const CELLS = TILE_CELLS * TILE_CELLS;

export const platePath = (continent, [px, pz]) => `places/continents/${continent}/plates/${px}_${pz}.plate`;
export const PLATE_PATH = /^places\/continents\/([\w-]+)\/plates\/(-?\d+)_(-?\d+)\.plate$/;

// Tile `index` of plate `coords`, [tx, tz].
const tileOf = ([px, pz], index) => [px * PLATE_TILES + (index % PLATE_TILES), pz * PLATE_TILES + Math.floor(index / PLATE_TILES)];

// The index of tile (tx, tz) within its plate.
export const tileIndexInPlate = (tx, tz) => (tz - Math.floor(tz / PLATE_TILES) * PLATE_TILES) * PLATE_TILES + (tx - Math.floor(tx / PLATE_TILES) * PLATE_TILES);

// plate: { coords: [px, pz], palette: terrain names, tiles: Map(index -> { heights: 65×65 feet,
// terrain: 64×64 bytes, 0 or 1 + palette indexes, biome: 64×64 indexes, slots }) }, each layer all
// 0 where it's missing, and slots scattered.
export function encodePlate({ coords, palette, tiles }) {
  const indexes = [...tiles.keys()].sort((a, b) => a - b);
  const names = palette.map((name) => new TextEncoder().encode(name));
  const paletteBytes = 1 + names.reduce((sum, name) => sum + 1 + name.length, 0);
  const slotsOf = (index) => tiles.get(index).slots ?? makeSlots(...tileOf(coords, index));
  const slotBytes = indexes.reduce((sum, index) => sum + 2 + slotsOf(index).length, 0);
  const bytes = new Uint8Array(HEADER + paletteBytes + indexes.length * (HEIGHTS * 2 + CELLS * 2) + slotBytes);
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
    tiles.set(index, { heights, terrain, biome, slots });
  }
  return { coords, palette, tiles };
}
