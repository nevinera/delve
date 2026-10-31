import { bytesToDigits, digit, digits, digitsToBytes, readDigits } from "./digits.js";
import { decodeTile, encodeTile } from "./heights.js";
import { decodeBinaryPlate } from "./plateBinary.js";
import { CHUNK_CELLS, PLATE_TILES, TILE_CHUNKS } from "./sizes.js";
import { SLOT_BYTES, makeSlots } from "./slots.js";
import { dryWater } from "./water.js";

// Plate files: the ground of a plate's tiles at cell scale, which is what each chunk's rendition
// is, each cell's biome, the tile's object slots (slots.js), its water (water.js) and how far
// courses (courses.js) cut it. What the ground looks like is worked out where it's drawn
// (look.js). A client loads one only when it's near.
//
//   places/continents/<continent>/plates/<px>_<pz>.plate
//
// The file is text, a line at a time, numbers in base64 digits (digits.js), so an edit changes
// only the lines for what it touched (plans/plate-text.md has the reasons):
//
//   plate 8 <px> <pz>
//   tile <index>              each tile the plate has, in row order, `tz * 8 + tx`
//   h ...                     its 65×65 corner heights, as heights.js writes them
//   b <runs>                  its 64×64 cells' biomes in row order, as runs: 2 digits of the run's
//                             length less one, and a digit of the biome (biomes.js's BIOME_NAMES)
//   s s1 <sx> <sz>            its object slots, as slots.js's makeSlots makes them from the seed
//   s raw <digits>            or where no generator made them, SLOT_BYTES each
//   w <chunk> 1 <type><level> water: a line for each chunk of 8×8 cells that isn't dry, its index
//   w <chunk> 2 <type><levels>  in 2 digits; one level and type for the whole chunk, one type and a
//   w <chunk> 3 <levels><types> level for each cell, or a level and a type for each cell. A type is
//                             a digit (water.js's WATER_TYPES), a level 3 digits of quarter feet
//                             plus 32,768, ~~~ where a cell's dry
//   w all 1 <type><level>     or for a tile all at one level, such as the sea's, one line
//   c <row> <column> <cuts>   how far courses cut the corners: a line for each run of cut corners
//                             in a row, row and column in 2 digits, then 2 digits a corner of its
//                             cut in quarter feet plus 2,048 (under 2,048 where it's built up)
//
// Lines a tile has none of are left out. Plate files from before they were text are read too
// (plateBinary.js); what they painted by hand on the ground is left out, as it's kept no more.

export const TILE_CELLS = TILE_CHUNKS * CHUNK_CELLS; // 64
export const CELL_CORNERS = TILE_CELLS + 1;
const VERSION = 8;
const CELLS = TILE_CELLS * TILE_CELLS;
const CORNERS = CELL_CORNERS * CELL_CORNERS;
const CHUNKS = TILE_CHUNKS * TILE_CHUNKS;
const CHUNK_AREA = CHUNK_CELLS * CHUNK_CELLS;
const OFFSET = 32768;
const CUT_OFFSET = 2048;
const DRY = "~~~";
const SLOTS = "s1"; // makeSlots

export const platePath = (continent, [px, pz]) => `places/continents/${continent}/plates/${px}_${pz}.plate`;
export const PLATE_PATH = /^places\/continents\/([\w-]+)\/plates\/(-?\d+)_(-?\d+)\.plate$/;

// Tile `index` of plate `coords`, [tx, tz].
const tileOf = ([px, pz], index) => [px * PLATE_TILES + (index % PLATE_TILES), pz * PLATE_TILES + Math.floor(index / PLATE_TILES)];

// The index of tile (tx, tz) within its plate.
export const tileIndexInPlate = (tx, tz) => (tz - Math.floor(tz / PLATE_TILES) * PLATE_TILES) * PLATE_TILES + (tx - Math.floor(tx / PLATE_TILES) * PLATE_TILES);

// The cells of chunk `c` of a tile, in row order.
const CHUNK_CELL_LISTS = Array.from({ length: CHUNKS }, (_, c) => {
  const [ci, cj] = [(c % TILE_CHUNKS) * CHUNK_CELLS, Math.floor(c / TILE_CHUNKS) * CHUNK_CELLS];
  const cells = [];
  for (let j = 0; j < CHUNK_CELLS; j++) for (let i = 0; i < CHUNK_CELLS; i++) cells.push((cj + j) * TILE_CELLS + ci + i);
  return cells;
});

// plate: { coords: [px, pz], tiles: Map(index -> { heights: 65×65 feet, biome: 64×64 indexes,
// slots, slotSeed: [sx, sz] (the tile's coordinates where it has none), water: as water.js has it,
// cut: 65×65 feet or null }) }, each layer all 0 where it's missing, slots scattered, water dry
// and nothing cut. Tiles' `terrain` (painted by hand) isn't kept.
export function encodePlate({ coords, tiles }) {
  const lines = [`plate ${VERSION} ${coords[0]} ${coords[1]}`];
  for (const index of [...tiles.keys()].sort((a, b) => a - b)) {
    const tile = tiles.get(index);
    lines.push(`tile ${index}`, ...encodeTile(tile.heights), biomeLine(tile.biome), slotLine(tile, tileOf(coords, index)), ...waterLines(tile.water), ...cutLines(tile.cut));
  }
  return new TextEncoder().encode(`${lines.join("\n")}\n`);
}

// A plate file's bytes, text or from before (plateBinary.js), as encodePlate takes it, with an
// empty `palette` and an empty `terrain` for each tile, as the rest of the client reads them.
export function decodePlate(bytes) {
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const plate = decodeBinaryPlate(bytes);
    for (const tile of plate.tiles.values()) tile.terrain = new Uint8Array(CELLS);
    return { ...plate, palette: [] };
  }
  const lines = new TextDecoder().decode(bytes).split("\n");
  const [word, version, px, pz] = lines[0].split(" ");
  if (word !== "plate") throw new Error(`not a plate file (${JSON.stringify(lines[0].slice(0, 20))})`);
  if (Number(version) !== VERSION) throw new Error(`unsupported plate version ${version}`);
  const coords = [Number(px), Number(pz)];
  const tiles = new Map();
  // Each tile's lines, by the tag they start with.
  let own = null;
  const read = () => {
    if (!own) return;
    const of = (tag) => own.lines.filter((line) => line.startsWith(`${tag} `));
    const tile = { heights: decodeTile(of("h")), terrain: new Uint8Array(CELLS), biome: readBiome(of("b")[0]), slots: null, slotSeed: tileOf(coords, own.index), water: readWater(of("w")), cut: readCuts(of("c")) };
    readSlots(of("s")[0], tile);
    tiles.set(own.index, tile);
  };
  for (let n = 1; n < lines.length; n++) {
    if (lines[n].startsWith("tile ")) {
      read();
      own = { index: Number(lines[n].slice(5)), lines: [] };
    } else if (lines[n] && own) own.lines.push(lines[n]);
  }
  read();
  return { coords, palette: [], tiles };
}

function biomeLine(biome = new Uint8Array(CELLS)) {
  let out = "b ";
  for (let k = 0; k < CELLS; ) {
    let run = 1;
    while (k + run < CELLS && biome[k + run] === biome[k]) run++;
    out += digits(run - 1, 2) + digit(biome[k]);
    k += run;
  }
  return out;
}

function readBiome(line) {
  const biome = new Uint8Array(CELLS);
  if (!line) return biome;
  for (let p = 2, k = 0; p < line.length; p += 3) {
    const run = readDigits(line, p, 2) + 1;
    biome.fill(readDigits(line, p + 2, 1), k, k + run);
    k += run;
  }
  return biome;
}

// The slots line: from the tile's seed where its slots are what that makes, else as they are.
function slotLine(tile, [tx, tz]) {
  const [sx, sz] = tile.slotSeed ?? [tx, tz];
  const made = makeSlots(sx, sz);
  if (!tile.slots || (made.length === tile.slots.length && made.every((b, k) => b === tile.slots[k]))) return `s ${SLOTS} ${sx} ${sz}`;
  return `s raw ${bytesToDigits(tile.slots)}`;
}

function readSlots(line, tile) {
  const [, kind, ...rest] = (line ?? `s ${SLOTS} ${tile.slotSeed.join(" ")}`).split(" ");
  if (kind === SLOTS) {
    tile.slotSeed = rest.map(Number);
    tile.slots = makeSlots(...tile.slotSeed);
  } else if (kind === "raw") {
    tile.slots = digitsToBytes(rest[0] ?? "");
    tile.slots = tile.slots.subarray(0, tile.slots.length - (tile.slots.length % SLOT_BYTES));
  } else throw new Error(`unknown slots ${JSON.stringify(kind)}`);
}

const level = (feet) => (Number.isNaN(feet) ? DRY : digits(Math.max(0, Math.min(2 * OFFSET - 1, Math.round(feet * 4) + OFFSET)), 3));
const readLevel = (line, p) => (line.startsWith(DRY, p) ? NaN : (readDigits(line, p, 3) - OFFSET) / 4);

// A line for each chunk that isn't dry, each as small as it'll go.
function waterLines(water) {
  if (!water) return [];
  const lines = [];
  for (let c = 0; c < CHUNKS; c++) {
    const cells = CHUNK_CELL_LISTS[c];
    const levels = cells.map((k) => level(water.level[k]));
    const wet = cells.filter((_, n) => levels[n] !== DRY);
    if (!wet.length) continue;
    const type = water.type[wet[0]];
    const oneType = wet.every((k) => water.type[k] === type);
    const oneLevel = wet.length === CHUNK_AREA && levels.every((l) => l === levels[0]);
    const chunk = digits(c, 2);
    if (oneType && oneLevel) lines.push(`w ${chunk} 1 ${digit(type)}${levels[0]}`);
    else if (oneType) lines.push(`w ${chunk} 2 ${digit(type)}${levels.join("")}`);
    else lines.push(`w ${chunk} 3 ${levels.join("")}${cells.map((k, n) => digit(levels[n] === DRY ? 0 : water.type[k])).join("")}`);
  }
  // A tile all at one level, such as the sea's, in one.
  if (lines.length === CHUNKS && lines.every((line) => line.slice(5) === lines[0].slice(5) && line[5] === "1")) return [`w all ${lines[0].slice(5)}`];
  return lines;
}

function readWater(lines) {
  if (!lines.length) return null;
  const water = dryWater(CELLS);
  if (lines[0].startsWith("w all ")) lines = Array.from({ length: CHUNKS }, (_, c) => `w ${digits(c, 2)} ${lines[0].slice(6)}`);
  for (const line of lines) {
    const cells = CHUNK_CELL_LISTS[readDigits(line, 2, 2)];
    const mode = line[5];
    const p = 7;
    cells.forEach((k, n) => {
      const feet = mode === "1" ? readLevel(line, p + 1) : readLevel(line, mode === "2" ? p + 1 + n * 3 : p + n * 3);
      if (Number.isNaN(feet)) return;
      water.level[k] = feet;
      water.type[k] = mode === "3" ? readDigits(line, p + CHUNK_AREA * 3 + n, 1) : readDigits(line, p, 1);
    });
  }
  return water;
}

// A line for each run of cut corners in a row.
function cutLines(cut) {
  if (!cut) return [];
  const lines = [];
  const q = (k) => Math.max(-CUT_OFFSET, Math.min(CUT_OFFSET - 1, Math.round(cut[k] * 4)));
  for (let r = 0; r < CELL_CORNERS; r++) {
    for (let c = 0; c < CELL_CORNERS; ) {
      if (!q(r * CELL_CORNERS + c)) {
        c++;
        continue;
      }
      let out = `c ${digits(r, 2)} ${digits(c, 2)} `;
      for (; c < CELL_CORNERS && q(r * CELL_CORNERS + c); c++) out += digits(q(r * CELL_CORNERS + c) + CUT_OFFSET, 2);
      lines.push(out);
    }
  }
  return lines;
}

function readCuts(lines) {
  if (!lines.length) return null;
  const cut = new Float32Array(CORNERS);
  for (const line of lines) {
    const [r, c] = [readDigits(line, 2, 2), readDigits(line, 5, 2)];
    for (let p = 8, k = r * CELL_CORNERS + c; p < line.length; p += 2, k++) cut[k] = (readDigits(line, p, 2) - CUT_OFFSET) / 4;
  }
  return cut;
}
