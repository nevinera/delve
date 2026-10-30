import { gunzipSync, gzipSync } from "fflate";
import { CHUNK_CELLS, PLATE_TILES, TILE_CHUNKS } from "./sizes.js";

// Plate files (spike): the ground of a plate's tiles at cell scale, which is what each chunk's
// rendition is. A client loads one only when it's near.
//
//   places/continents/<continent>/plates/<px>_<pz>.plate
//
// The file is gzipped. Inside, numbers are little-endian:
//
//   0   "DLD1"
//   4   u32 version (1)
//   8   i32 px, i32 pz
//   16  8 bytes: a bit for each of the plate's 64 tiles, in row order, set where it has one
//   24  for each tile that has one, in row order:
//       65 × 65 i16 heights at cell corners, in quarter feet, row order
//       64 × 64 × 3 bytes of cell color, RGB, row order

export const TILE_CELLS = TILE_CHUNKS * CHUNK_CELLS; // 64
export const CELL_CORNERS = TILE_CELLS + 1;
const MAGIC = "DLD1";
const VERSION = 1;
const HEADER = 24;
const HEIGHTS = CELL_CORNERS * CELL_CORNERS;
const COLORS = TILE_CELLS * TILE_CELLS * 3;

export const platePath = (continent, [px, pz]) => `places/continents/${continent}/plates/${px}_${pz}.plate`;
export const PLATE_PATH = /^places\/continents\/([\w-]+)\/plates\/(-?\d+)_(-?\d+)\.plate$/;

// The index of tile (tx, tz) within its plate.
export const tileIndexInPlate = (tx, tz) => (tz - Math.floor(tz / PLATE_TILES) * PLATE_TILES) * PLATE_TILES + (tx - Math.floor(tx / PLATE_TILES) * PLATE_TILES);

// plate: { coords: [px, pz], tiles: Map(index -> { heights: 65×65 feet, colors: 64×64×3 bytes }) }.
export function encodePlate({ coords, tiles }) {
  const indexes = [...tiles.keys()].sort((a, b) => a - b);
  const bytes = new Uint8Array(HEADER + indexes.length * (HEIGHTS * 2 + COLORS));
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < 4; i++) bytes[i] = MAGIC.charCodeAt(i);
  view.setUint32(4, VERSION, true);
  view.setInt32(8, coords[0], true);
  view.setInt32(12, coords[1], true);
  let at = HEADER;
  for (const index of indexes) {
    bytes[16 + (index >> 3)] |= 1 << (index & 7);
    const { heights, colors } = tiles.get(index);
    for (let k = 0; k < HEIGHTS; k++) view.setInt16(at + k * 2, Math.max(-32768, Math.min(32767, Math.round(heights[k] * 4))), true);
    at += HEIGHTS * 2;
    bytes.set(colors, at);
    at += COLORS;
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
  for (let index = 0; index < PLATE_TILES * PLATE_TILES; index++) {
    if (!(bytes[16 + (index >> 3)] & (1 << (index & 7)))) continue;
    const heights = new Float32Array(HEIGHTS);
    for (let k = 0; k < HEIGHTS; k++) heights[k] = view.getInt16(at + k * 2, true) / 4;
    at += HEIGHTS * 2;
    tiles.set(index, { heights, colors: bytes.slice(at, at + COLORS) });
    at += COLORS;
  }
  return { coords, tiles };
}
