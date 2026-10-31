import { digit, digits, readDigits } from "./digits.js";
import { decodeLine, encodeLine, quarters } from "./heights.js";
import { decodeBinaryPlatter } from "./platterBinary.js";
import { PLATE_TILES, PLATTER_PLATES, PLATTER_TILES, TILE_CHUNKS } from "./sizes.js";

// Platter files: the renditions of the tiles and plates in one platter (64×64 tiles, 8×8 plates,
// 16,384 ft a side), so a client can draw a continent's ground from afar in a few requests.
//
//   places/continents/<continent>/platters/<px>_<pz>.platter
//
// A rendition is a thing's ground an eighth of its size across: heights at the 9×9 corners of its
// 8×8 parts, with a hash of what it was made from, to tell when it's out of date. A tile's parts
// are its chunks, and a plate's its tiles (rendition.js). What they look like is worked out where
// they're drawn (look.js). A tile's rendition has its water too, a part a chunk (water.js's
// partWater).
//
// The file is text, a line at a time, numbers in base64 digits (digits.js):
//
//   platter 5 <px> <pz>
//   t <index> <hash> <heights>   a tile's rendition: its index in the platter, its hash in 16 hex
//                                digits, and its corners as one heights.js line (rows of 9)
//   tw <index> <levels><types>   its water: 64 parts' levels, 3 digits of quarter feet plus 32,768
//                                each, ~~~ where it's dry, then their 64 types (water.js's
//                                WATER_TYPES)
//   p <index> <hash> <heights>   a plate's rendition, the same as a tile's
//
// Platter files from before they were text are read too (platterBinary.js).

export const CORNERS = TILE_CHUNKS + 1;
const VERSION = 5;
const PARTS = TILE_CHUNKS * TILE_CHUNKS;
const OFFSET = 32768;
const DRY = "~~~";

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
// a rendition { heights: 81 feet, hash: 16 hex digits }, and a tile's `water`, null or { level: 64
// feet, NaN where a part's dry, type: 64 }.
export function encodePlatter({ coords, tiles, plates = new Map() }) {
  const lines = [`platter ${VERSION} ${coords[0]} ${coords[1]}`];
  const rendition = (tag, index, { heights, hash }) => `${tag} ${index} ${hash} ${encodeLine(Int32Array.from(heights, quarters), CORNERS)}`;
  for (const index of [...tiles.keys()].sort((a, b) => a - b)) {
    const tile = tiles.get(index);
    lines.push(rendition("t", index, tile));
    if (!tile.water) continue;
    const { level, type } = tile.water;
    let out = `tw ${index} `;
    for (let k = 0; k < PARTS; k++) out += Number.isNaN(level[k]) ? DRY : digits(Math.max(0, Math.min(2 * OFFSET - 1, Math.round(level[k] * 4) + OFFSET)), 3);
    for (let k = 0; k < PARTS; k++) out += digit(type[k]);
    lines.push(out);
  }
  for (const index of [...plates.keys()].sort((a, b) => a - b)) lines.push(rendition("p", index, plates.get(index)));
  return new TextEncoder().encode(`${lines.join("\n")}\n`);
}

export function decodePlatter(bytes) {
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) return decodeBinaryPlatter(bytes);
  const lines = new TextDecoder().decode(bytes).split("\n");
  const [word, version, px, pz] = lines[0].split(" ");
  if (word !== "platter") throw new Error(`not a platter file (${JSON.stringify(lines[0].slice(0, 20))})`);
  if (Number(version) !== VERSION) throw new Error(`unsupported platter version ${version}`);
  const [tiles, plates] = [new Map(), new Map()];
  for (const line of lines.slice(1)) {
    if (!line) continue;
    const [tag, index] = line.split(" ", 2);
    const at = tag.length + 1 + index.length + 1;
    if (tag === "tw") {
      const water = { level: new Float32Array(PARTS), type: new Uint8Array(PARTS) };
      for (let k = 0; k < PARTS; k++) {
        water.level[k] = line.startsWith(DRY, at + k * 3) ? NaN : (readDigits(line, at + k * 3, 3) - OFFSET) / 4;
        water.type[k] = readDigits(line, at + PARTS * 3 + k, 1);
      }
      tiles.get(Number(index)).water = water;
      continue;
    }
    const hash = line.slice(at, at + 16);
    const [q] = decodeLine(line, at + 17, CORNERS * CORNERS);
    const rendition = { heights: Float32Array.from(q, (v) => v / 4), hash };
    if (tag === "t") tiles.set(Number(index), { ...rendition, water: null });
    else if (tag === "p") plates.set(Number(index), rendition);
    else throw new Error(`unknown platter line ${JSON.stringify(tag)}`);
  }
  return { coords: [Number(px), Number(pz)], tiles, plates };
}
