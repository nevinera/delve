import { gunzipSync, gzipSync } from "fflate";
import { PLATE_TILES, PLATTER_PLATES, PLATTER_TILES, TILE_CHUNKS } from "./sizes.js";

// Platter files: the renditions of the tiles and plates in one platter (64×64 tiles, 8×8 plates,
// 16,384 ft a side), so a client can draw a continent's ground from afar in a few requests.
//
//   places/continents/<continent>/platters/<px>_<pz>.platter
//
// A rendition is a thing's ground an eighth of its size across: heights at the 9×9 corners of its
// 8×8 parts, and each part's color, with a hash of what it was made from, to tell when it's out of
// date. A tile's parts are its chunks, and a plate's its tiles (rendition.js).
//
// The file is gzipped. Inside, numbers are little-endian:
//
//   0   "DLP1"
//   4   u32 version (2)
//   8   i32 px, i32 pz
//   16  the tiles: 512 bytes, a bit for each of the platter's 4,096 tiles in row order, set where
//       it has one, then a record for each of those, in row order
//   then the plates: 8 bytes, a bit for each of its 64 plates, then a record for each of those
//
// A record is:
//   81 i16 corner heights in quarter feet, row order
//   64 × 3 bytes of part color, RGB, row order
//   8 bytes of hash

export const CORNERS = TILE_CHUNKS + 1;
const MAGIC = "DLP1";
const VERSION = 2;
const HEADER = 16;
const RECORD = CORNERS * CORNERS * 2 + TILE_CHUNKS * TILE_CHUNKS * 3 + 8;
const TILE_COUNT = PLATTER_TILES * PLATTER_TILES;
const PLATE_COUNT = PLATTER_PLATES * PLATTER_PLATES;

export const platterPath = (continent, [px, pz]) => `places/continents/${continent}/platters/${px}_${pz}.platter`;
export const PLATTER_PATH = /^places\/continents\/([\w-]+)\/platters\/(-?\d+)_(-?\d+)\.platter$/;

// The platter a tile is in, and its index there.
export const platterOf = (tx, tz) => [Math.floor(tx / PLATTER_TILES), Math.floor(tz / PLATTER_TILES)];
export const indexIn = (tx, tz) => (tz - Math.floor(tz / PLATTER_TILES) * PLATTER_TILES) * PLATTER_TILES + (tx - Math.floor(tx / PLATTER_TILES) * PLATTER_TILES);
// The same for a plate (px, pz).
export const plateIndexIn = (px, pz) => (pz - Math.floor(pz / PLATTER_PLATES) * PLATTER_PLATES) * PLATTER_PLATES + (px - Math.floor(px / PLATTER_PLATES) * PLATTER_PLATES);
export const platterOfPlate = (px, pz) => [Math.floor(px / PLATTER_PLATES), Math.floor(pz / PLATTER_PLATES)];
export const plateOf = (tx, tz) => [Math.floor(tx / PLATE_TILES), Math.floor(tz / PLATE_TILES)];

// platter: { coords: [px, pz], tiles, plates }, tiles and plates each a Map(index -> rendition),
// a rendition { heights: 81 feet, colors: 192 bytes, hash: 16 hex digits }.
export function encodePlatter({ coords, tiles, plates = new Map() }) {
  const sections = [
    [tiles, TILE_COUNT],
    [plates, PLATE_COUNT],
  ];
  const size = sections.reduce((sum, [map, count]) => sum + count / 8 + map.size * RECORD, HEADER);
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < 4; i++) bytes[i] = MAGIC.charCodeAt(i);
  view.setUint32(4, VERSION, true);
  view.setInt32(8, coords[0], true);
  view.setInt32(12, coords[1], true);
  let at = HEADER;
  for (const [map, count] of sections) {
    const bits = at;
    at += count / 8;
    for (const index of [...map.keys()].sort((a, b) => a - b)) {
      bytes[bits + (index >> 3)] |= 1 << (index & 7);
      const { heights, colors, hash } = map.get(index);
      for (let k = 0; k < CORNERS * CORNERS; k++) view.setInt16(at + k * 2, Math.max(-32768, Math.min(32767, Math.round(heights[k] * 4))), true);
      at += CORNERS * CORNERS * 2;
      bytes.set(colors, at);
      at += colors.length;
      for (let k = 0; k < 8; k++) bytes[at + k] = parseInt(hash.slice(k * 2, k * 2 + 2), 16);
      at += 8;
    }
  }
  return gzipSync(bytes, { level: 9 });
}

export function decodePlatter(gzipped) {
  const bytes = gunzipSync(gzipped);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  if (magic !== MAGIC) throw new Error(`not a platter file (magic ${JSON.stringify(magic)})`);
  if (view.getUint32(4, true) !== VERSION) throw new Error(`unsupported platter version ${view.getUint32(4, true)}`);
  const coords = [view.getInt32(8, true), view.getInt32(12, true)];
  let at = HEADER;
  const section = (count) => {
    const bits = at;
    at += count / 8;
    const map = new Map();
    for (let index = 0; index < count; index++) {
      if (!(bytes[bits + (index >> 3)] & (1 << (index & 7)))) continue;
      const heights = new Float32Array(CORNERS * CORNERS);
      for (let k = 0; k < heights.length; k++) heights[k] = view.getInt16(at + k * 2, true) / 4;
      at += CORNERS * CORNERS * 2;
      const colors = bytes.slice(at, at + TILE_CHUNKS * TILE_CHUNKS * 3);
      at += colors.length;
      const hash = [...bytes.subarray(at, at + 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
      at += 8;
      map.set(index, { heights, colors, hash });
    }
    return map;
  };
  const tiles = section(TILE_COUNT);
  const plates = section(PLATE_COUNT);
  return { coords, tiles, plates };
}
