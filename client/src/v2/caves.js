import { gunzipSync, gzipSync } from "fflate";
import { CELL_FT, PLATE_TILES, TILE_FT } from "./sizes.js";

// Caves (docs/formats/caves.md): air under the ground, dug by hand. Each tile that has any keeps a
// column of air spans for each of its cells, any number of them, lowest first, so ledges, arches
// and overhangs are just more spans. Rock is everywhere under the ground that no span opens.
// A span is { floor, ceiling, theme, hewn }: heights in feet, theme an index into CAVE_THEMES,
// hewn whether it was cut by hand, drawn flat-faced.
//
// They're kept in a file for each plate that has any:
//
//   places/continents/<continent>/caves/<px>_<pz>.caves
//
// gzipped, little-endian: "DLC1", u32 version (1), i32 px, i32 pz, u8 how many tiles, then for
// each, u8 its index in the plate, TILE_CELLS² u8 how many spans each column has, in row order,
// then each span, column by column: i32 floor, i32 ceiling (quarter feet), u8 theme, u8 hewn.
//
// Digging opens air in a shape, a sphere or a box, column by column, and filling puts rock back.
// Air opened through the ground runs up out of it, so digging in from the surface makes a mouth.

export const CAVE_THEMES = ["jagged", "smooth", "carved", "mined"];
export const TILE_CELLS = TILE_FT / CELL_FT;
const COLUMNS = TILE_CELLS * TILE_CELLS;
const MAGIC = "DLC1";
const VERSION = 1;
const MOUTH_FT = 2; // air opened through the ground reaches this far over it
const MIN_ROCK_FT = 0.25; // spans closer than this join
const MAX_SPANS = 255;

export const cavesPath = (continent, [px, pz]) => `places/continents/${continent}/caves/${px}_${pz}.caves`;
export const CAVES_PATH = /^places\/continents\/([\w-]+)\/caves\/(-?\d+)_(-?\d+)\.caves$/;

const quarter = (v) => Math.round(v * 4) / 4;

// The height a shape covers over (x, z), [low, high], or null where it misses. A shape is
// { kind: "sphere", at: [x, y, z], radius } or { kind: "box", at, half: [x, y, z], yaw } (radians,
// as an object's), in continent feet.
export function reach(shape, x, z) {
  const [cx, cy, cz] = shape.at;
  if (shape.kind === "sphere") {
    const d2 = (x - cx) ** 2 + (z - cz) ** 2;
    if (d2 >= shape.radius ** 2) return null;
    const h = Math.sqrt(shape.radius ** 2 - d2);
    return [cy - h, cy + h];
  }
  const [c, s] = [Math.cos(shape.yaw ?? 0), Math.sin(shape.yaw ?? 0)];
  const [dx, dz] = [x - cx, z - cz];
  const [u, v] = [dx * c - dz * s, dx * s + dz * c];
  if (Math.abs(u) > shape.half[0] || Math.abs(v) > shape.half[2]) return null;
  return [cy - shape.half[1], cy + shape.half[1]];
}

// The shape's reach across the ground, [x0, z0, x1, z1].
export function shapeBounds(shape) {
  const [cx, , cz] = shape.at;
  const r = shape.kind === "sphere" ? shape.radius : Math.hypot(shape.half[0], shape.half[2]);
  return [cx - r, cz - r, cx + r, cz + r];
}

// A column with air opened from `low` to `high`: spans it meets join it, taking the lowest's
// theme and staying hewn only if both are; `span` gives a new span's.
export function openAir(column, low, high, span) {
  const out = [];
  let joined = { ...span, floor: low, ceiling: high };
  let met = false;
  for (const s of column ?? []) {
    if (s.ceiling < low - MIN_ROCK_FT || s.floor > high + MIN_ROCK_FT) {
      out.push(s);
      continue;
    }
    joined = { ...(met ? joined : s), floor: Math.min(joined.floor, s.floor), ceiling: Math.max(joined.ceiling, s.ceiling), hewn: (met ? joined.hewn : s.hewn) && span.hewn };
    met = true;
  }
  out.push(joined);
  return out.sort((a, b) => a.floor - b.floor).slice(-MAX_SPANS);
}

// A column with rock from `low` to `high`: spans are cut back, split or dropped.
export function fillRock(column, low, high) {
  const out = [];
  for (const s of column ?? []) {
    if (s.ceiling <= low || s.floor >= high) out.push(s);
    else {
      if (s.floor < low - MIN_ROCK_FT) out.push({ ...s, ceiling: low });
      if (s.ceiling > high + MIN_ROCK_FT) out.push({ ...s, floor: high });
    }
  }
  return out.length ? out : null;
}

// Carves `shape` into the caves: opens air (`fill` false) or fills rock. columnsOf(tx, tz, make):
// the tile's columns, made when `make` and it has none, or null; groundAt(ci, cj): the ground's
// height at a continent cell's middle, or null where its cells aren't read. New air takes the
// theme of the air it's dug from, the one most of it meets, or `theme`; and is hewn as `hewn`.
// Gives the "tx,tz" of the tiles changed.
export function carve(shape, columnsOf, groundAt, { fill = false, theme = 0, hewn = false } = {}) {
  const [x0, z0, x1, z1] = shapeBounds(shape);
  const cuts = [];
  for (let cj = Math.floor(z0 / CELL_FT); cj <= Math.floor(z1 / CELL_FT); cj++) {
    for (let ci = Math.floor(x0 / CELL_FT); ci <= Math.floor(x1 / CELL_FT); ci++) {
      const r = reach(shape, (ci + 0.5) * CELL_FT, (cj + 0.5) * CELL_FT);
      const ground = r && groundAt(ci, cj);
      if (ground == null || r[0] >= ground + MOUTH_FT) continue;
      const [low, high] = [quarter(r[0]), quarter(Math.min(r[1], ground + MOUTH_FT))];
      if (high > low) cuts.push({ ci, cj, low, high });
    }
  }
  const at = ({ ci, cj }, make) => {
    const [tx, tz] = [Math.floor(ci / TILE_CELLS), Math.floor(cj / TILE_CELLS)];
    const columns = columnsOf(tx, tz, make);
    return columns && { columns, k: (cj - tz * TILE_CELLS) * TILE_CELLS + ci - tx * TILE_CELLS, key: `${tx},${tz}` };
  };
  const changed = new Set();
  if (fill) {
    for (const cut of cuts) {
      const found = at(cut, false);
      if (!found?.columns[found.k]) continue;
      found.columns[found.k] = fillRock(found.columns[found.k], cut.low, cut.high);
      changed.add(found.key);
    }
    return changed;
  }
  // The theme most of the air met has.
  const met = new Map();
  for (const cut of cuts) {
    const found = at(cut, false);
    for (const s of found?.columns[found.k] ?? []) if (s.ceiling >= cut.low && s.floor <= cut.high) met.set(s.theme, (met.get(s.theme) ?? 0) + 1);
  }
  const span = { theme: met.size ? [...met].sort((a, b) => b[1] - a[1])[0][0] : theme, hewn };
  for (const cut of cuts) {
    const found = at(cut, true);
    found.columns[found.k] = openAir(found.columns[found.k], cut.low, cut.high, span);
    changed.add(found.key);
  }
  return changed;
}

// A new tile's columns: all rock.
export const emptyColumns = () => new Array(COLUMNS).fill(null);

// A plate's caves file: `tiles`, index in the plate -> columns. Tiles with no air are left out.
export function encodeCaves([px, pz], tiles) {
  const kept = [...tiles].filter(([, columns]) => columns.some(Boolean)).sort((a, b) => a[0] - b[0]);
  const spans = kept.reduce((n, [, columns]) => n + columns.reduce((m, c) => m + (c?.length ?? 0), 0), 0);
  const bytes = new Uint8Array(17 + kept.length * (1 + COLUMNS) + spans * 10);
  const view = new DataView(bytes.buffer);
  bytes.set([...MAGIC].map((c) => c.charCodeAt(0)));
  view.setUint32(4, VERSION, true);
  view.setInt32(8, px, true);
  view.setInt32(12, pz, true);
  bytes[16] = kept.length;
  let at = 17;
  for (const [index, columns] of kept) {
    bytes[at++] = index;
    columns.forEach((c, k) => (bytes[at + k] = c?.length ?? 0));
    at += COLUMNS;
    for (const column of columns) {
      for (const s of column ?? []) {
        view.setInt32(at, Math.round(s.floor * 4), true);
        view.setInt32(at + 4, Math.round(s.ceiling * 4), true);
        bytes[at + 8] = s.theme;
        bytes[at + 9] = s.hewn ? 1 : 0;
        at += 10;
      }
    }
  }
  return gzipSync(bytes);
}

// A caves file's { coords: [px, pz], tiles: index -> columns }.
export function decodeCaves(gz) {
  const bytes = gunzipSync(gz);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (String.fromCharCode(...bytes.slice(0, 4)) !== MAGIC) throw new Error("not a caves file");
  const version = view.getUint32(4, true);
  if (version !== VERSION) throw new Error(`caves file version ${version} isn't known`);
  const coords = [view.getInt32(8, true), view.getInt32(12, true)];
  const tiles = new Map();
  let at = 17;
  for (let t = 0; t < bytes[16]; t++) {
    const index = bytes[at++];
    const counts = bytes.slice(at, at + COLUMNS);
    at += COLUMNS;
    const columns = emptyColumns();
    counts.forEach((count, k) => {
      if (!count) return;
      const column = [];
      for (let n = 0; n < count; n++, at += 10) column.push({ floor: view.getInt32(at, true) / 4, ceiling: view.getInt32(at + 4, true) / 4, theme: bytes[at + 8], hewn: Boolean(bytes[at + 9]) });
      columns[k] = column;
    });
    tiles.set(index, columns);
  }
  return { coords, tiles };
}

// Tile (tx, tz)'s index in its plate.
export const tileIndex = (tx, tz) => (tz - Math.floor(tz / PLATE_TILES) * PLATE_TILES) * PLATE_TILES + tx - Math.floor(tx / PLATE_TILES) * PLATE_TILES;
