import { gunzipSync } from "fflate";
import { bytesToDigits, digit, digits, digitsToBytes, readDigits } from "./digits.js";
import { CELL_FT, PLATE_TILES, TILE_FT } from "./sizes.js";
import { unzip, zip } from "./zstd.js";

// Caves (docs/formats/caves.md): air under the ground, dug by hand. Each tile that has any keeps a
// column of air spans for each of its cells, any number of them, lowest first, so ledges, arches
// and overhangs are just more spans. Rock is everywhere under the ground that no span opens.
// A span is { floor, ceiling, stone: [ceiling, wall, floor] }: heights in feet, and the stone types
// of its ceiling, walls and floor, each a theme (an index into CAVE_THEMES) plus HEWN where it's
// cut flat-faced, as by hand. Spans are under MAX_SPAN_FT high.
//
// They're kept in a text file for each plate that has any, as docs/formats/caves.md has it:
//
//   places/continents/<continent>/caves/<px>_<pz>.caves
//
// Digging opens air in a shape, a sphere or a box, column by column, and filling puts rock back.
// Air opened through the ground runs up out of it, so digging in from the surface makes a mouth.
// Filling leaves no crumbs of air: it fills every column the shape touches any of, not just
// those whose middles it covers; air it leaves thinner than MIN_AIR_FT closes; and pockets of
// air near it smaller than POCKET_FT3, that don't open through the ground, close too.

export const CAVE_THEMES = ["jagged", "smooth", "carved", "mined"];
export const HEWN = 4;
// A stone type's theme, whether it's hewn, and the type for both.
export const themeOf = (stone) => stone & 3;
export const isHewn = (stone) => stone >= HEWN;
export const stoneOf = (theme, hewn) => theme + (hewn ? HEWN : 0);
// The stone types a span of one theme has.
export const allStone = (theme, hewn) => Array(3).fill(stoneOf(theme, hewn));
// Which of a span's stone types rock facing `up` (the up part of the unit way out of the rock)
// takes: the floor's facing up, the ceiling's facing down, the wall's sideways.
export const stonePart = (up) => (up > 0.5 ? 2 : up < -0.5 ? 0 : 1);
export const TILE_CELLS = TILE_FT / CELL_FT;
const COLUMNS = TILE_CELLS * TILE_CELLS;
const VERSION = 1;
const OFFSET = 32768; // added to heights written absolutely, in quarter feet
const TWO = 64 * 64; // what 2 digits hold
const C2_MOST = 31; // the most spans a cell has in c2; digits over it are runs of empty cells
const C2_RUN = 33; // the longest run of empty cells a c2 digit stands for
export const MAX_SPAN_FT = (TWO - 1) / 4;
const MOUTH_FT = 2; // air opened through the ground reaches this far over it
export const ROOF_FT = 4; // the least rock over air that doesn't open through the ground
const MIN_ROCK_FT = 0.25; // spans closer than this join
const MAX_SPANS = 63;
const MIN_AIR_FT = 2;
const POCKET_FT3 = 512; // an 8 ft cube

export const cavesPath = (continent, [px, pz]) => `places/continents/${continent}/caves/${px}_${pz}.caves`;
export const CAVES_PATH = /^places\/continents\/([\w-]+)\/caves\/(-?\d+)_(-?\d+)\.caves$/;

const quarter = (v) => Math.round(v * 4) / 4;

// The height a shape covers over (x, z), [low, high], or null where it misses. A shape is
// { kind: "sphere", at: [x, y, z], radius }, { kind: "box", at, half: [x, y, z], yaw } (radians,
// as an object's), or { kind: "dome", at, radii: [x, y, z], yaw }: half an ellipsoid standing on
// a flat floor at `at`. All in continent feet.
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
  if (shape.kind === "dome") {
    const [rx, ry, rz] = shape.radii;
    const d2 = (u / rx) ** 2 + (v / rz) ** 2;
    if (d2 >= 1) return null;
    return [cy, cy + ry * Math.sqrt(1 - d2)];
  }
  if (Math.abs(u) > shape.half[0] || Math.abs(v) > shape.half[2]) return null;
  return [cy - shape.half[1], cy + shape.half[1]];
}

// The shape's reach across the ground, [x0, z0, x1, z1].
export function shapeBounds(shape) {
  const [cx, , cz] = shape.at;
  const r = shape.kind === "sphere" ? shape.radius : shape.kind === "dome" ? Math.max(shape.radii[0], shape.radii[2]) : Math.hypot(shape.half[0], shape.half[2]);
  return [cx - r, cz - r, cx + r, cz + r];
}

// A column with air opened from `low` to `high`, no higher than MAX_SPAN_FT: spans it meets join
// it, taking the lowest's themes, each type staying hewn only if both are; `span` gives a new
// span's stone.
export function openAir(column, low, high, span) {
  high = Math.min(high, low + MAX_SPAN_FT);
  const out = [];
  let joined = { ...span, floor: low, ceiling: high };
  let met = false;
  for (const s of column ?? []) {
    if (s.ceiling < low - MIN_ROCK_FT || s.floor > high + MIN_ROCK_FT) {
      out.push(s);
      continue;
    }
    const stone = (met ? joined : s).stone.map((t, i) => themeOf(t) + (t & span.stone[i] & HEWN));
    joined = { floor: Math.min(joined.floor, s.floor), ceiling: Math.min(Math.max(joined.ceiling, s.ceiling), Math.min(joined.floor, s.floor) + MAX_SPAN_FT), stone };
    met = true;
  }
  out.push(joined);
  return out.sort((a, b) => a.floor - b.floor).slice(-MAX_SPANS);
}

// The height a shape covers over any of cell (ci, cj): its reach at the point in the cell
// nearest its middle.
function reachCell(shape, ci, cj) {
  const near = (v, i) => Math.min((i + 1) * CELL_FT, Math.max(i * CELL_FT, v));
  return reach(shape, near(shape.at[0], ci), near(shape.at[2], cj));
}

// A column with rock from `low` to `high`: spans are cut back, split or dropped, and what's left
// of them closes where it's no more than `minAir` high.
export function fillRock(column, low, high, minAir = MIN_ROCK_FT) {
  const out = [];
  for (const s of column ?? []) {
    if (s.ceiling <= low || s.floor >= high) out.push(s);
    else {
      if (low - s.floor > minAir) out.push({ ...s, ceiling: low });
      if (s.ceiling - high > minAir) out.push({ ...s, floor: high });
    }
  }
  return out.length ? out : null;
}

// Carves `shape` into the caves: opens air (`fill` false) or fills rock. columnsOf(tx, tz, make):
// the tile's columns, made when `make` and it has none, or null; groundAt(ci, cj): the ground's
// height at a continent cell's middle, or null where its cells aren't read. New air takes the
// stone of the air it's dug from, the one most of it meets, or `stone` (always, with `own`).
// With `mouth`, air opens through the ground where it would leave less than ROOF_FT of rock over
// it; without, it stops ROOF_FT under the ground. Gives the "tx,tz" of the tiles changed.
export function carve(shape, columnsOf, groundAt, { fill = false, stone = allStone(0, false), own = false, mouth = true } = {}) {
  const [x0, z0, x1, z1] = shapeBounds(shape);
  const cuts = [];
  for (let cj = Math.floor(z0 / CELL_FT); cj <= Math.floor(z1 / CELL_FT); cj++) {
    for (let ci = Math.floor(x0 / CELL_FT); ci <= Math.floor(x1 / CELL_FT); ci++) {
      const r = fill ? reachCell(shape, ci, cj) : reach(shape, (ci + 0.5) * CELL_FT, (cj + 0.5) * CELL_FT);
      const ground = r && groundAt(ci, cj);
      if (ground == null || r[0] >= ground + MOUTH_FT) continue;
      const top = fill ? Math.min(r[1], ground + MOUTH_FT) : mouth ? (r[1] > ground - ROOF_FT ? ground + MOUTH_FT : r[1]) : Math.min(r[1], ground - ROOF_FT);
      const [low, high] = [quarter(r[0]), quarter(top)];
      if (high > low) cuts.push({ ci, cj, low, high });
    }
  }
  const at = ({ ci, cj }, make) => cellAt(columnsOf, ci, cj, make);
  const changed = new Set();
  if (fill) {
    for (const cut of cuts) {
      const found = at(cut, false);
      if (!found?.columns[found.k]) continue;
      found.columns[found.k] = fillRock(found.columns[found.k], cut.low, cut.high, MIN_AIR_FT);
      changed.add(found.key);
    }
    if (changed.size) closePockets([x0, z0, x1, z1], at, groundAt, changed);
    return changed;
  }
  // The stone most of the air met has.
  const met = new Map();
  for (const cut of cuts) {
    const found = at(cut, false);
    for (const s of found?.columns[found.k] ?? []) if (s.ceiling >= cut.low && s.floor <= cut.high) met.set(`${s.stone}`, (met.get(`${s.stone}`) ?? 0) + 1);
  }
  const span = { stone: met.size && !own ? [...met].sort((a, b) => b[1] - a[1])[0][0].split(",").map(Number) : stone };
  for (const cut of cuts) {
    const found = at(cut, true);
    found.columns[found.k] = openAir(found.columns[found.k], cut.low, cut.high, span);
    changed.add(found.key);
  }
  return changed;
}

// Continent cell (ci, cj)'s place in columnsOf's tiles: { columns, k, key }, k its index in its
// tile's columns and key its tile's "tx,tz", or null where its tile has none (and not `make`).
function cellAt(columnsOf, ci, cj, make) {
  const [tx, tz] = [Math.floor(ci / TILE_CELLS), Math.floor(cj / TILE_CELLS)];
  const columns = columnsOf(tx, tz, make);
  return columns && { columns, k: (cj - tz * TILE_CELLS) * TILE_CELLS + ci - tx * TILE_CELLS, key: `${tx},${tz}` };
}

// Smooths the cave's rock round continent feet `at`, out to `radius` across, where it faces
// `normal` (unit, out of the rock): a floor (facing up) or a ceiling (facing down) eases toward
// its neighbours' heights, by `strength` (0 to 1) at the middle and less further out; a wall
// evens its outline at that height, air that's mostly rock round it closing and rock that's
// mostly air round it opening. groundAt is carve's; ceilings opening through the ground aren't
// smoothed. Gives the "tx,tz" of the tiles changed.
export function smoothCave({ at: [x, y, z], normal, radius, strength = 0.5 }, columnsOf, groundAt) {
  const facing = normal[1] > 0.5 ? "floor" : normal[1] < -0.5 ? "ceiling" : "wall";
  const spansAt = (ci, cj) => {
    const found = cellAt(columnsOf, ci, cj, false);
    return found?.columns[found.k] ?? [];
  };
  const cells = [];
  for (let cj = Math.floor((z - radius) / CELL_FT); cj <= Math.floor((z + radius) / CELL_FT); cj++) {
    for (let ci = Math.floor((x - radius) / CELL_FT); ci <= Math.floor((x + radius) / CELL_FT); ci++) {
      const d = Math.hypot((ci + 0.5) * CELL_FT - x, (cj + 0.5) * CELL_FT - z) / radius;
      if (d < 1) cells.push({ ci, cj, weight: strength * (1 - d * d) });
    }
  }
  const changed = new Set();
  const set = (ci, cj, column) => {
    const found = cellAt(columnsOf, ci, cj, column !== null);
    if (!found) return;
    found.columns[found.k] = column?.length ? column.sort((a, b) => a.floor - b.floor) : null;
    changed.add(found.key);
  };
  const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  if (facing === "wall") {
    // Air at y in each column, and how many of the eight round it have it.
    const airAt = (ci, cj) => spansAt(ci, cj).find((s) => s.floor <= y && y <= s.ceiling) ?? null;
    const round = (ci, cj) => {
      const out = [];
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (di || dj) out.push(airAt(ci + di, cj + dj));
      return out.filter(Boolean);
    };
    const plans = cells.map(({ ci, cj }) => ({ ci, cj, air: airAt(ci, cj), round: round(ci, cj) }));
    for (const { ci, cj, air, round: near } of plans) {
      if (air && near.length <= 3) set(ci, cj, fillRock(spansAt(ci, cj), Math.max(air.floor, y - radius), Math.min(air.ceiling, y + radius), MIN_AIR_FT) ?? null);
      else if (!air && near.length >= 5) {
        const mean = (key) => quarter(near.reduce((sum, s) => sum + s[key], 0) / near.length);
        const [low, high] = [Math.max(mean("floor"), y - radius), Math.min(mean("ceiling"), y + radius)];
        if (high - low > MIN_AIR_FT) set(ci, cj, openAir(spansAt(ci, cj), low, high, { stone: near[0].stone }));
      }
    }
    return changed;
  }
  // The span whose floor (or ceiling) is this surface in each column: the nearest to y, within
  // the radius.
  const key = facing;
  const surfaceAt = (ci, cj) => {
    let best = null;
    for (const s of spansAt(ci, cj)) if (Math.abs(s[key] - y) <= radius && (!best || Math.abs(s[key] - y) < Math.abs(best[key] - y))) best = s;
    return best;
  };
  const plans = [];
  for (const { ci, cj, weight } of cells) {
    const span = surfaceAt(ci, cj);
    if (!span) continue;
    const ground = groundAt(ci, cj);
    if (key === "ceiling" && (ground == null || span.ceiling >= ground)) continue;
    // Its neighbours' heights, where their air meets its.
    const heights = [span[key]];
    for (const [di, dj] of SIDES) {
      const other = spansAt(ci + di, cj + dj).filter((s) => s.floor < span.ceiling && s.ceiling > span.floor);
      if (other.length) heights.push(other.reduce((a, b) => (Math.abs(b[key] - span[key]) < Math.abs(a[key] - span[key]) ? b : a))[key]);
    }
    const mean = heights.reduce((a, b) => a + b, 0) / heights.length;
    let to = quarter(span[key] + (mean - span[key]) * weight);
    to = key === "floor" ? Math.min(to, span.ceiling - MIN_AIR_FT) : Math.max(to, span.floor + MIN_AIR_FT);
    if (to !== span[key]) plans.push({ ci, cj, span, to });
  }
  for (const { ci, cj, span, to } of plans) set(ci, cj, spansAt(ci, cj).map((s) => (s === span ? { ...s, [key]: to } : s)));
  return changed;
}

// Adds rock to the cave's rock round continent feet `at`, out to `radius` across, where it faces
// `normal` (unit, out of the rock): a floor rises and a ceiling comes down by up to `amountFt`,
// that at the middle and less further out; a wall comes out, its air filled a column at a time
// where the column's middle is within half a column and `amountFt` of it. Air left too thin
// closes, and so do pockets left near it (closePockets). groundAt is carve's. Gives the "tx,tz"
// of the tiles changed.
export function growCave({ at: [x, y, z], normal, radius, amountFt }, columnsOf, groundAt) {
  const facing = normal[1] > 0.5 ? "floor" : normal[1] < -0.5 ? "ceiling" : "wall";
  const at = ({ ci, cj }, make) => cellAt(columnsOf, ci, cj, make);
  const spansAt = (ci, cj) => {
    const found = at({ ci, cj }, false);
    return found?.columns[found.k] ?? [];
  };
  const changed = new Set();
  const set = (ci, cj, column) => {
    const found = at({ ci, cj }, false);
    if (!found) return;
    found.columns[found.k] = column?.length ? column : null;
    changed.add(found.key);
  };
  const flat = Math.hypot(normal[0], normal[2]) || 1;
  const [nx, nz] = [normal[0] / flat, normal[2] / flat];
  for (let cj = Math.floor((z - radius) / CELL_FT); cj <= Math.floor((z + radius) / CELL_FT); cj++) {
    for (let ci = Math.floor((x - radius) / CELL_FT); ci <= Math.floor((x + radius) / CELL_FT); ci++) {
      const [cx, cz] = [(ci + 0.5) * CELL_FT, (cj + 0.5) * CELL_FT];
      const d = Math.hypot(cx - x, cz - z) / radius;
      if (facing !== "wall") {
        if (d >= 1) continue;
        const by = amountFt * (1 - d * d);
        let best = null;
        for (const s of spansAt(ci, cj)) if (Math.abs(s[facing] - y) <= radius && (!best || Math.abs(s[facing] - y) < Math.abs(best[facing] - y))) best = s;
        if (!best) continue;
        const [low, high] = facing === "floor" ? [best.floor, quarter(best.floor + by)] : [quarter(best.ceiling - by), best.ceiling];
        if (high > low) set(ci, cj, fillRock(spansAt(ci, cj), low, high, MIN_AIR_FT));
        continue;
      }
      // A wall: the columns just off it, within the ring up and down.
      const out = (cx - x) * nx + (cz - z) * nz;
      const along = Math.hypot(cx - x - out * nx, cz - z - out * nz);
      if (out < 0 || out > CELL_FT / 2 + amountFt || along >= radius) continue;
      const h = Math.sqrt(radius * radius - along * along);
      if (spansAt(ci, cj).some((s) => s.ceiling > y - h && s.floor < y + h)) set(ci, cj, fillRock(spansAt(ci, cj), quarter(y - h), quarter(y + h), MIN_AIR_FT));
    }
  }
  if (changed.size) closePockets([x - radius, z - radius, x + radius, z + radius], at, groundAt, changed);
  return changed;
}

// Closes the pockets of air with a column within a cell of [x0, z0, x1, z1]: air joined through
// the sides of columns, smaller than POCKET_FT3 and nowhere reaching the ground. at(cell, make)
// is carve's; the "tx,tz" of tiles changed are added to `changed`.
function closePockets([x0, z0, x1, z1], at, groundAt, changed) {
  const spansAt = (ci, cj) => {
    const found = at({ ci, cj }, false);
    return found?.columns[found.k] ?? [];
  };
  const kept = new Set(); // spans in air too big to close
  const closed = new Set();
  for (let cj = Math.floor(z0 / CELL_FT) - 1; cj <= Math.floor(z1 / CELL_FT) + 1; cj++) {
    for (let ci = Math.floor(x0 / CELL_FT) - 1; ci <= Math.floor(x1 / CELL_FT) + 1; ci++) {
      for (const start of spansAt(ci, cj)) {
        if (kept.has(start) || closed.has(start)) continue;
        // The air joined to it, till it's big enough to keep, opens through the ground, or meets
        // air that's kept.
        const pocket = [];
        const met = new Set([start]);
        const todo = [{ ci, cj, span: start }];
        let volume = 0;
        let keep = false;
        while (todo.length && !keep) {
          const here = todo.pop();
          pocket.push(here);
          volume += (here.span.ceiling - here.span.floor) * CELL_FT * CELL_FT;
          const ground = groundAt(here.ci, here.cj);
          keep = volume >= POCKET_FT3 || ground == null || here.span.ceiling >= ground;
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            for (const span of spansAt(here.ci + di, here.cj + dj)) {
              if (met.has(span) || span.floor >= here.span.ceiling || span.ceiling <= here.span.floor) continue;
              if (kept.has(span)) keep = true;
              met.add(span);
              todo.push({ ci: here.ci + di, cj: here.cj + dj, span });
            }
          }
        }
        if (keep) {
          for (const span of met) kept.add(span);
          continue;
        }
        for (const { ci: i, cj: j, span } of pocket) {
          closed.add(span);
          const found = at({ ci: i, cj: j }, false);
          const left = found.columns[found.k].filter((s) => s !== span);
          found.columns[found.k] = left.length ? left : null;
          changed.add(found.key);
        }
      }
    }
  }
}

// A new tile's columns: all rock.
export const emptyColumns = () => new Array(COLUMNS).fill(null);

// A plate's caves file, as text: `tiles`, index in the plate -> columns. Tiles with no air are
// left out, and each tile's cells take whichever form is shortest.
export function encodeCaves([px, pz], tiles) {
  const lines = [`caves ${VERSION} ${px} ${pz}`];
  for (const [index, columns] of [...tiles].filter(([, columns]) => columns.some(Boolean)).sort((a, b) => a[0] - b[0])) lines.push(`tile ${index}`, cellsLine(columns));
  return new TextEncoder().encode(`${lines.join("\n")}\n`);
}

// A span's stone types (ceiling, wall, floor), start and length: 3 digits, `startDigits` of its
// start (over `base`, or written absolutely), and 2 of its length.
const spanDigits = (s, startDigits, base) => s.stone.map(digit).join("") + digits(Math.round(s.floor * 4) - base, startDigits) + digits(Math.round((s.ceiling - s.floor) * 4), 2);

// A tile's cells in the shortest form they fit (docs/formats/caves.md), zipped where that's shorter.
function cellsLine(columns) {
  const spans = columns.flatMap((column) => column ?? []);
  const starts = spans.map((s) => Math.round(s.floor * 4));
  const forms = [["c3", columns.map((c) => digit(c?.length ?? 0)).join("") + " " + spans.map((s) => spanDigits(s, 6, -OFFSET)).join("")]];
  const base = Math.min(...starts);
  if (Math.max(...starts) - base < TWO && columns.every((c) => (c?.length ?? 0) <= C2_MOST)) {
    let counts = "";
    for (let k = 0; k < COLUMNS; ) {
      let run = 0;
      while (run < C2_RUN && k + run < COLUMNS && !columns[k + run]) run++;
      if (run >= 2) [counts, k] = [counts + digit(run + 30), k + run];
      else [counts, k] = [counts + digit(columns[k]?.length ?? 0), k + 1];
    }
    forms.push(["c2", `${digits(base + OFFSET, 3)} ${counts} ${spans.map((s) => spanDigits(s, 2, base)).join("")}`]);
  }
  if (spans.length < TWO) {
    const listed = columns.flatMap((column, k) => (column ?? []).map((s) => ` ${digit(k % TILE_CELLS)}${digit(Math.floor(k / TILE_CELLS))}${spanDigits(s, 6, -OFFSET)}`));
    forms.push(["c1", digits(spans.length, 2) + listed.join("")]);
  }
  for (const [tag, text] of [...forms]) {
    const zipped = zip(new TextEncoder().encode(text));
    if (zipped) forms.push([`${tag}z`, bytesToDigits(zipped)]);
  }
  const [tag, text] = forms.reduce((a, b) => (b[1].length < a[1].length ? b : a));
  return `${tag} ${text}`;
}

// A tile's columns from its cells' line, as cellsLine writes it.
function readCells(line) {
  const space = line.indexOf(" ");
  let [tag, text] = [line.slice(0, space), line.slice(space + 1)];
  if (tag.endsWith("z")) [tag, text] = [tag.slice(0, -1), new TextDecoder().decode(unzip(digitsToBytes(text)))];
  const columns = emptyColumns();
  const span = (at, startDigits, base) => {
    const floor = (readDigits(text, at + 3, startDigits) + base) / 4;
    return { floor, ceiling: floor + readDigits(text, at + 3 + startDigits, 2) / 4, stone: [0, 1, 2].map((i) => readDigits(text, at + i, 1)) };
  };
  if (tag === "c1") {
    for (let n = readDigits(text, 0, 2), at = 3; n > 0; n--, at += 14) {
      const k = readDigits(text, at + 1, 1) * TILE_CELLS + readDigits(text, at, 1);
      (columns[k] ??= []).push(span(at + 2, 6, -OFFSET));
    }
    return columns;
  }
  const c2 = tag === "c2";
  if (!c2 && tag !== "c3") throw new Error(`caves cells form ${JSON.stringify(tag)} isn't known`);
  const base = c2 ? readDigits(text, 0, 3) - OFFSET : -OFFSET;
  let at = c2 ? 4 : 0;
  const counts = [];
  while (counts.length < COLUMNS) {
    const d = readDigits(text, at++, 1);
    if (c2 && d > C2_MOST) for (let r = d - 30; r > 0; r--) counts.push(0);
    else counts.push(d);
  }
  at++;
  const size = c2 ? 7 : 11;
  counts.forEach((count, k) => {
    for (let n = 0; n < count; n++, at += size) (columns[k] ??= []).push(span(at, c2 ? 2 : 6, base));
  });
  return columns;
}

// A caves file's { coords: [px, pz], tiles: index -> columns }, from its text, or from the gzipped
// binary files written before, each span's theme and hewn taken for all three of its stone types.
export function decodeCaves(bytes) {
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) return decodeBinaryCaves(bytes);
  const lines = new TextDecoder().decode(bytes).split("\n");
  const [word, version, px, pz] = lines[0].split(" ");
  if (word !== "caves") throw new Error(`not a caves file (${JSON.stringify(lines[0].slice(0, 20))})`);
  if (Number(version) !== VERSION) throw new Error(`caves file version ${version} isn't known`);
  const tiles = new Map();
  for (let k = 1; k < lines.length; k++) if (lines[k].startsWith("tile ")) tiles.set(Number(lines[k].slice(5)), readCells(lines[++k]));
  return { coords: [Number(px), Number(pz)], tiles };
}

function decodeBinaryCaves(gz) {
  const bytes = gunzipSync(gz);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (String.fromCharCode(...bytes.slice(0, 4)) !== "DLC1") throw new Error("not a caves file");
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
      for (let n = 0; n < count; n++, at += 10) column.push({ floor: view.getInt32(at, true) / 4, ceiling: view.getInt32(at + 4, true) / 4, stone: Array(3).fill(stoneOf(bytes[at + 8], bytes[at + 9])) });
      columns[k] = column;
    });
    tiles.set(index, columns);
  }
  return { coords, tiles };
}

// Tile (tx, tz)'s index in its plate.
export const tileIndex = (tx, tz) => (tz - Math.floor(tz / PLATE_TILES) * PLATE_TILES) * PLATE_TILES + tx - Math.floor(tx / PLATE_TILES) * PLATE_TILES;
