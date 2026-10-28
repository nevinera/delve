import { CELL_FT, TILE_FT } from "./constants.js";
import { footprintOf, specOf } from "./objects.js";

// Plates: tiles kept as text, 16×16 tiles to a file (plans/plates.md). A plate is a header, then
// its tiles in row order, each from its `tile` line to the next, so it reads as a stream of tiles.
//
//   plate 1 3,1 surface              format version, plate coords, layer
//   palette terrain grass dirt …     names the layers' values index into
//   clutter 100                      the plate's clutter default
//   object 0 rock                    the object table: a short id for each kind of object
//   tile 48,16 64                    tile coords, cells a side
//   generator 23 3935363592
//   clutter 90                       the tile's clutter default, where it isn't the plate's
//   layer height                     a line of values per row, or `layer terrain =3` when all alike
//   chunks clutter                   the 8×8-cell chunks with a cell off the tile's default:
//   3,5 =0                           as one value for all the chunk's cells, or all 64
//   place 0 <x z yaw scale> <colors> <extra>   one placed object a line, sorted by position
//   fall {...}, road {...}, river {...}
//
// Values are fixed width in a 64-symbol alphabet. Heights and water are quarter feet above
// HEIGHT_BASE_FT in 3 symbols (`~~~` for no water); palette indices are 1 symbol, or 2 when the
// palette's longer than 64; forest and clutter are 2. A place line's object id is 1 or 2 symbols,
// then x and z within the plate in 1/32 ft (3 each), yaw in 1/4096 turns (2) and scale in 1/64ths
// (2), then each color as 6 hex digits, then any other fields as JSON. Ids aren't kept: decoding
// numbers each tile's objects, and works out their footprint and height from their kind.

export const PLATE_VERSION = 1;
export const PLATE_TILES = 16;
export const PLATE_FT = PLATE_TILES * TILE_FT;
const CHUNK = 8; // cells a side
const HEIGHT_BASE_FT = -256;
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
const VALUE = new Map([...ALPHABET].map((c, i) => [c, i]));
const NONE = "~";
const PALETTES = ["terrain", "biome", "water"];
// Layers in tile order: how wide each value is, and the palette it indexes, if any.
const LAYERS = [
  { name: "height", width: 3 },
  { name: "water", width: 3 },
  { name: "waterKind", palette: "water" },
  { name: "terrain", palette: "terrain" },
  { name: "biome", palette: "biome" },
  { name: "forest", width: 2 },
];
// Object fields a place line holds itself, or that decoding works out.
const PLACED = new Set(["id", "type", "at", "yaw", "scale", "colors", "footprint", "height"]);
const POSITION_STEPS = 32;
const YAW_STEPS = 4096;
const SCALE_STEPS = 64;

export const plateOf = (tx, tz) => [Math.floor(tx / PLATE_TILES), Math.floor(tz / PLATE_TILES)];

export function platePath(continent, layer, px, pz) {
  return `places/continents/${continent}/plates/${layer}/${px}_${pz}.plate`;
}

// The plate (px, pz) of a layer as text, from its tiles (tileCodec.js's shape). Tiles from other
// plates are an error.
export function encodePlate([px, pz], layer, tiles) {
  const sorted = [...tiles].sort((a, b) => a.coords[1] - b.coords[1] || a.coords[0] - b.coords[0]);
  for (const { coords } of sorted) {
    const [qx, qz] = plateOf(...coords);
    if (qx !== px || qz !== pz) throw new Error(`tile ${coords} isn't in plate ${px},${pz}`);
  }
  // One palette per kind for the whole plate, in the order the tiles first use each entry.
  const palettes = Object.fromEntries(PALETTES.map((kind) => [kind, []]));
  for (const tile of sorted) {
    for (const kind of PALETTES) for (const name of paletteOf(tile, kind)) if (!palettes[kind].includes(name)) palettes[kind].push(name);
  }
  // Kinds by name, so the table doesn't change with the order objects are listed in.
  const kinds = [...new Set(sorted.flatMap((tile) => (tile.objects ?? []).map((o) => o.type)))].sort();
  const idWidth = widthFor(kinds.length);
  const clutters = sorted.map((tile) => mostCommon(clutterOf(tile)));
  const plateClutter = mostCommon(clutters);

  const lines = [`plate ${PLATE_VERSION} ${px},${pz} ${layer}`];
  for (const kind of PALETTES) lines.push(`palette ${kind}${palettes[kind].map((name) => ` ${name}`).join("")}`);
  lines.push(`clutter ${plateClutter}`);
  kinds.forEach((type, n) => lines.push(`object ${encode(n, idWidth)} ${type}`));
  sorted.forEach((tile, n) => encodeTileInto(lines, tile, { palettes, kinds, idWidth, clutter: clutters[n], plateClutter, origin: [px * PLATE_FT, pz * PLATE_FT] }));
  return `${lines.join("\n")}\n`;
}

function encodeTileInto(lines, tile, { palettes, kinds, idWidth, clutter, plateClutter, origin }) {
  const { cells } = tile;
  lines.push(`tile ${tile.coords.join(",")} ${cells}`);
  if (tile.generator) lines.push(`generator ${tile.generator.version} ${tile.generator.seed}`);
  if (clutter !== plateClutter) lines.push(`clutter ${clutter}`);
  for (const spec of LAYERS) {
    const values = layerValues(tile, spec, palettes);
    const width = spec.width ?? widthFor(palettes[spec.palette].length);
    const text = values.map((v) => encodeValue(v, spec, width));
    if (text.every((t) => t === text[0])) {
      lines.push(`layer ${spec.name} =${text[0]}`);
      continue;
    }
    lines.push(`layer ${spec.name}`);
    for (let j = 0; j < cells; j++) lines.push(text.slice(j * cells, (j + 1) * cells).join(""));
  }
  const clutterCells = clutterOf(tile);
  const chunks = [];
  for (let cz = 0; cz < cells / CHUNK; cz++) {
    for (let cx = 0; cx < cells / CHUNK; cx++) {
      const values = [];
      for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) values.push(clutterCells[(cz * CHUNK + j) * cells + cx * CHUNK + i]);
      if (values.every((v) => v === clutter)) continue;
      chunks.push(values.every((v) => v === values[0]) ? `${cx},${cz} =${encode(values[0], 2)}` : `${cx},${cz} ${values.map((v) => encode(v, 2)).join("")}`);
    }
  }
  if (chunks.length) lines.push("chunks clutter", ...chunks);
  const byPosition = (line) => line.split(" ")[2];
  const places = (tile.objects ?? []).map((o) => placeLine(o, kinds.indexOf(o.type), idWidth, origin)).sort((a, b) => (byPosition(a) < byPosition(b) ? -1 : byPosition(a) > byPosition(b) ? 1 : 0));
  lines.push(...places);
  for (const [word, list] of [["fall", tile.falls], ["road", tile.roads], ["river", tile.rivers]]) for (const item of list ?? []) lines.push(`${word} ${JSON.stringify(item)}`);
}

function placeLine(object, kind, idWidth, [x0, z0]) {
  const extra = Object.fromEntries(Object.entries(object).filter(([key]) => !PLACED.has(key)));
  const [x, z] = [Math.round((object.at[0] - x0) * POSITION_STEPS), Math.round((object.at[1] - z0) * POSITION_STEPS)];
  const span = 64 ** 3;
  if (!(x >= 0 && x < span && z >= 0 && z < span)) extra.at = object.at;
  const yaw = Math.round((((object.yaw ?? 0) / (2 * Math.PI)) % 1) * YAW_STEPS + YAW_STEPS) % YAW_STEPS;
  const scale = Math.round((object.scale ?? 1) * SCALE_STEPS);
  if (!(scale >= 0 && scale < 64 ** 2)) extra.scale = object.scale;
  const position = `${encode(clamp(x, 0, span - 1), 3)}${encode(clamp(z, 0, span - 1), 3)}${encode(yaw, 2)}${encode(clamp(scale, 0, 64 ** 2 - 1), 2)}`;
  const colors = (object.colors ?? []).map(hex).join("");
  return `place ${encode(kind, idWidth)} ${position}${colors ? ` ${colors}` : ""}${Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : ""}`;
}

// A plate's text split into its header and each tile's text, for reading tile by tile.
export function splitPlate(text) {
  const lines = text.split("\n");
  const tiles = [];
  let header = null;
  let start = 0;
  for (let n = 0; n <= lines.length; n++) {
    if (n < lines.length && !lines[n].startsWith("tile ")) continue;
    const chunk = lines.slice(start, n).join("\n");
    if (header === null) header = chunk;
    else tiles.push({ coords: lines[start].split(" ")[1].split(",").map(Number), text: chunk });
    start = n;
  }
  return { header: readHeader(header), tiles };
}

// A plate's header: { version, coords, layer, palettes, clutter, kinds }.
export function readHeader(text) {
  const header = { palettes: {}, kinds: [], clutter: 100 };
  for (const line of text.split("\n")) {
    const words = line.split(" ");
    if (words[0] === "plate") {
      header.version = Number(words[1]);
      if (header.version !== PLATE_VERSION) throw new Error(`unsupported plate version ${words[1]}`);
      header.coords = words[2].split(",").map(Number);
      header.layer = words[3];
    } else if (words[0] === "palette") header.palettes[words[1]] = words.slice(2);
    else if (words[0] === "clutter") header.clutter = Number(words[1]);
    else if (words[0] === "object") header.kinds[decode(words[1])] = words.slice(2).join(" ");
  }
  header.idWidth = widthFor(header.kinds.length);
  return header;
}

// One tile from its text in a plate, with the plate's header (readHeader).
export function decodePlateTile(header, text) {
  const lines = text.split("\n");
  const [, coordText, cellText] = lines[0].split(" ");
  const coords = coordText.split(",").map(Number);
  const cells = Number(cellText);
  const count = cells * cells;
  const tile = {
    coords,
    layer: header.layer,
    cells,
    cellFt: CELL_FT,
    palettes: structuredClone(header.palettes),
    objects: [],
    layers: {},
  };
  const [x0, z0] = header.coords.map((v) => v * PLATE_FT);
  let clutter = header.clutter;
  let chunks = null;
  for (let n = 1; n < lines.length; n++) {
    const line = lines[n];
    const space = line.indexOf(" ");
    const word = space < 0 ? line : line.slice(0, space);
    const rest = space < 0 ? "" : line.slice(space + 1);
    if (word === "generator") {
      const [version, seed] = rest.split(" ").map(Number);
      tile.generator = { version, seed };
    } else if (word === "clutter") clutter = Number(rest);
    else if (word === "layer") {
      const [name, same] = rest.split(" ");
      const spec = LAYERS.find((s) => s.name === name);
      if (!spec) throw new Error(`unknown layer ${name}`);
      const width = spec.width ?? widthFor(header.palettes[spec.palette].length);
      const values = new (spec.width === 3 ? Float64Array : Uint8Array)(count);
      if (same) values.fill(decodeValue(same.slice(1), spec));
      else {
        for (let j = 0; j < cells; j++) {
          const row = lines[++n];
          for (let i = 0; i < cells; i++) values[j * cells + i] = decodeValue(row.slice(i * width, (i + 1) * width), spec);
        }
      }
      tile.layers[name] = values;
    } else if (word === "chunks") {
      chunks = [];
      while (n + 1 < lines.length && /^\d+,\d+ /.test(lines[n + 1])) chunks.push(lines[++n]);
    } else if (word === "place") tile.objects.push(readPlace(rest, header, [x0, z0], tile.objects.length, coords));
    else if (word === "fall" || word === "road" || word === "river") (tile[`${word}s`] ??= []).push(JSON.parse(rest));
  }
  tile.layers.clutter = new Uint8Array(count).fill(clutter);
  for (const line of chunks ?? []) {
    const [at, values] = line.split(" ");
    const [cx, cz] = at.split(",").map(Number);
    for (let j = 0; j < CHUNK; j++) {
      for (let i = 0; i < CHUNK; i++) {
        const k = values.startsWith("=") ? 0 : (j * CHUNK + i) * 2;
        tile.layers.clutter[(cz * CHUNK + j) * cells + cx * CHUNK + i] = decode(values.startsWith("=") ? values.slice(1) : values.slice(k, k + 2));
      }
    }
  }
  return tile;
}

function readPlace(rest, header, [x0, z0], n, [tx, tz]) {
  const w = header.idWidth;
  const json = rest.indexOf(" {");
  const extra = json < 0 ? {} : JSON.parse(rest.slice(json + 1));
  const [idText, position, colorText = ""] = (json < 0 ? rest : rest.slice(0, json)).split(" ");
  const type = header.kinds[decode(idText.slice(0, w))];
  const object = {
    id: `${tx}.${tz}.${n}`,
    type,
    at: [x0 + decode(position.slice(0, 3)) / POSITION_STEPS, z0 + decode(position.slice(3, 6)) / POSITION_STEPS],
    yaw: (decode(position.slice(6, 8)) / YAW_STEPS) * 2 * Math.PI,
    scale: decode(position.slice(8, 10)) / SCALE_STEPS,
  };
  if (colorText) object.colors = colorText.match(/.{6}/g).map((h) => [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16) / 255));
  Object.assign(object, extra);
  const spec = specOf(type);
  if (spec) {
    object.footprint = footprintOf(type, object.scale);
    object.height = spec.structure ? spec.height : spec.height * object.scale;
  }
  return object;
}

// Every tile in a plate's text.
export function decodePlate(text) {
  const { header, tiles } = splitPlate(text);
  return { header, tiles: tiles.map(({ text: tileText }) => decodePlateTile(header, tileText)) };
}

// --- values ---

function encode(value, width) {
  let out = "";
  for (let k = 0; k < width; k++) {
    out = ALPHABET[value % 64] + out;
    value = Math.floor(value / 64);
  }
  return out;
}

function decode(text) {
  let value = 0;
  for (const c of text) {
    const v = VALUE.get(c);
    if (v === undefined) throw new Error(`bad symbol ${JSON.stringify(c)}`);
    value = value * 64 + v;
  }
  return value;
}

function encodeValue(value, spec, width) {
  if (spec.width === 3) {
    if (Number.isNaN(value)) return NONE.repeat(3);
    return encode(clamp(Math.round((value - HEIGHT_BASE_FT) * 4), 0, 64 ** 3 - 1), 3);
  }
  return encode(value, width);
}

function decodeValue(text, spec) {
  if (spec.width === 3) return text[0] === NONE ? NaN : decode(text) / 4 + HEIGHT_BASE_FT;
  return decode(text);
}

// A layer's values, with palette indices into the plate's palettes.
function layerValues(tile, spec, palettes) {
  const count = tile.cells * tile.cells;
  if (spec.name === "waterKind" && !tile.layers.waterKind) {
    // Without the layer, water at 0 ft was sea and the rest fresh (terrainMesh.js kindOf).
    return Array.from(tile.layers.water, (w) => palettes.water.indexOf(w === 0 ? "sea" : "fresh"));
  }
  const values = tile.layers[spec.name];
  if (!values || values.length !== count) throw new Error(`tile ${tile.coords} needs ${count} ${spec.name} values`);
  if (!spec.palette) return Array.from(values);
  const own = paletteOf(tile, spec.palette);
  const map = own.map((name) => palettes[spec.palette].indexOf(name));
  return Array.from(values, (v) => {
    if (map[v] === undefined) throw new Error(`tile ${tile.coords}: ${spec.name} value ${v} isn't in its palette`);
    return map[v];
  });
}

function paletteOf(tile, kind) {
  if (kind === "water") return tile.palettes.water ?? ["sea", "fresh"];
  return tile.palettes[kind];
}

function clutterOf(tile) {
  return tile.layers.clutter ?? new Uint8Array(tile.cells * tile.cells).fill(100);
}

function mostCommon(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = 100;
  let most = 0;
  for (const [v, n] of counts) if (n > most) [best, most] = [v, n];
  return best;
}

const widthFor = (size) => (size > 64 ? 2 : 1);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const hex = (rgb) => rgb.map((c) => clamp(Math.round(c * 255), 0, 255).toString(16).padStart(2, "0")).join("");
