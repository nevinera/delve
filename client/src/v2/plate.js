import { gunzipSync, gzipSync } from "fflate";
import { CHUNK_CELLS, PLATE_TILES, TILE_CHUNKS } from "./sizes.js";

// Plate files (spike): the ground of a plate's tiles at cell scale, which is what each chunk's
// rendition is, and what kind of ground each cell is, to draw it in full. A client loads one only
// when it's near.
//
//   places/continents/<continent>/plates/<px>_<pz>.plate
//
// The file is gzipped. Inside, numbers are little-endian:
//
//   0   "DLD1"
//   4   u32 version (2)
//   8   i32 px, i32 pz
//   16  8 bytes: a bit for each of the plate's 64 tiles, in row order, set where it has one
//   24  the terrain palette: u8 count, then each name as a u8 length and that many ASCII bytes
//   then for each tile that has one, in row order:
//       65 × 65 i16 heights at cell corners, in quarter feet, row order
//       64 × 64 × 3 bytes of cell color, RGB, row order
//       64 × 64 bytes of cell terrain, indexes into the palette
//       64 × 64 bytes of cell forest density, 0 to 255

export const TILE_CELLS = TILE_CHUNKS * CHUNK_CELLS; // 64
export const CELL_CORNERS = TILE_CELLS + 1;
const MAGIC = "DLD1";
const VERSION = 2;
const HEADER = 24;
const HEIGHTS = CELL_CORNERS * CELL_CORNERS;
const COLORS = TILE_CELLS * TILE_CELLS * 3;
const CELLS = TILE_CELLS * TILE_CELLS;

export const platePath = (continent, [px, pz]) => `places/continents/${continent}/plates/${px}_${pz}.plate`;
export const PLATE_PATH = /^places\/continents\/([\w-]+)\/plates\/(-?\d+)_(-?\d+)\.plate$/;

// The index of tile (tx, tz) within its plate.
export const tileIndexInPlate = (tx, tz) => (tz - Math.floor(tz / PLATE_TILES) * PLATE_TILES) * PLATE_TILES + (tx - Math.floor(tx / PLATE_TILES) * PLATE_TILES);

// plate: { coords: [px, pz], palette: terrain names, tiles: Map(index -> { heights: 65×65 feet,
// colors: 64×64×3 bytes, terrain: 64×64 palette indexes, forest: 64×64 bytes }) }.
export function encodePlate({ coords, palette, tiles }) {
  const indexes = [...tiles.keys()].sort((a, b) => a - b);
  const names = palette.map((name) => new TextEncoder().encode(name));
  const paletteBytes = 1 + names.reduce((sum, name) => sum + 1 + name.length, 0);
  const bytes = new Uint8Array(HEADER + paletteBytes + indexes.length * (HEIGHTS * 2 + COLORS + CELLS * 2));
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
    const { heights, colors, terrain, forest } = tiles.get(index);
    for (let k = 0; k < HEIGHTS; k++) view.setInt16(at + k * 2, Math.max(-32768, Math.min(32767, Math.round(heights[k] * 4))), true);
    at += HEIGHTS * 2;
    for (const layer of [colors, terrain, forest]) {
      bytes.set(layer, at);
      at += layer.length;
    }
  }
  return gzipSync(bytes, { level: 9 });
}

export function decodePlate(gzipped) {
  const bytes = gunzipSync(gzipped);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  if (magic !== MAGIC) throw new Error(`not a plate file (magic ${JSON.stringify(magic)})`);
  if (view.getUint32(4, true) !== VERSION) throw new Error(`unsupported plate version ${view.getUint32(4, true)}`);
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
    tiles.set(index, { heights, colors: take(COLORS), terrain: take(CELLS), forest: take(CELLS) });
  }
  return { coords, palette, tiles };
}
