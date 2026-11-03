import { bytesToDigits, digit, digits, digitsToBytes, readDigits } from "./digits.js";
import { CHUNK_FT, PLATE_TILES, TILE_FT } from "./sizes.js";
import { unzip, zip } from "./zstd.js";

// Caves (docs/formats/caves.md): air under the ground. Each tile that has any keeps a column of
// air spans for each VOXEL_FT square of it, any number of them, lowest first, so ledges, arches
// and overhangs are just more spans. Rock is everywhere under the ground that no span opens.
// A span is { floor, ceiling, stone: [ceiling, wall, floor], net }: heights in feet, on the
// VOXEL_FT steps, the stone types of its ceiling, walls and floor, each a theme (an index into
// CAVE_THEMES), and the slug of the cave network it's in. Spans are under MAX_SPAN_FT high.
//
// They're kept in a text file for each plate that has any, as docs/formats/caves.md has it:
//
//   places/continents/<continent>/caves/<px>_<pz>.caves
//
// Digging opens air in a shape, a sphere or a box, column by column, and filling puts rock back.
// Air opened through the ground runs up out of it, so digging in from the surface makes a mouth.
// Air is opened and filled a whole voxel at a time: its heights are rounded to VOXEL_FT.
// Filling leaves no crumbs of air: it fills every column the shape touches any of, not just
// those whose middles it covers; air it leaves thinner than MIN_AIR_FT closes; and pockets of
// air near it smaller than POCKET_FT3, that don't open through the ground, close too.

export const CAVE_THEMES = ["jagged", "smooth", "carved", "mined"];
// A stone type's theme.
export const themeOf = (stone) => stone & 3;
// The stone types a span of one theme has.
export const allStone = (theme) => Array(3).fill(theme);
// Which of a span's stone types rock facing `up` (the up part of the unit way out of the rock)
// takes: the floor's facing up, the ceiling's facing down, the wall's sideways.
export const stonePart = (up) => (up > 0.5 ? 2 : up < -0.5 ? 0 : 1);
export const VOXEL_FT = 2;
export const TILE_COLUMNS = TILE_FT / VOXEL_FT;
const COLUMNS = TILE_COLUMNS * TILE_COLUMNS;
const VERSION = 2;
// The network air carved without one is in, till networks are laid out.
export const UNNAMED = "unnamed";
export const NET_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const OFFSET = 32768; // added to heights written absolutely, in quarter feet
const TWO = 64 * 64; // what 2 digits hold
const C2_MOST = 31; // the most spans a cell has in c2; digits over it are runs of empty cells
const C2_RUN = 33; // the longest run of empty cells a c2 digit stands for
export const MAX_SPAN_FT = (TWO - 1) / 4;
const MOUTH_FT = 2; // air opened through the ground reaches this far over it
export const ROOF_FT = 4; // the least rock over air that doesn't open through the ground
export const THIN_ROOF_FT = 1; // with `mouth`, the least rock over air that doesn't
const MIN_ROCK_FT = 0.25; // spans closer than this join
const MAX_SPANS = 63;
const MIN_AIR_FT = 2;
const POCKET_FT3 = 512; // an 8 ft cube

export const cavesPath = (continent, [px, pz]) => `places/continents/${continent}/caves/${px}_${pz}.caves`;
export const CAVES_PATH = /^places\/continents\/([\w-]+)\/caves\/(-?\d+)_(-?\d+)\.caves$/;

export const snap = (v) => Math.round(v / VOXEL_FT) * VOXEL_FT;

// The height a shape covers over (x, z), [low, high], or null where it misses. A shape is
// { kind: "sphere", at: [x, y, z], radius }, { kind: "box", at, half: [x, y, z], yaw } (radians,
// as an object's), { kind: "dome", at, radii: [x, y, z], yaw }: half an ellipsoid standing on
// a flat floor at `at`, or { kind: "cylinder", at, radius, half: [r, h, r] }: upright, `at` its
// middle, h its half height. All in continent feet.
export function reach(shape, x, z) {
  const [cx, cy, cz] = shape.at;
  if (shape.kind === "sphere") {
    const d2 = (x - cx) ** 2 + (z - cz) ** 2;
    if (d2 >= shape.radius ** 2) return null;
    const h = Math.sqrt(shape.radius ** 2 - d2);
    return [cy - h, cy + h];
  }
  if (shape.kind === "cylinder") {
    if ((x - cx) ** 2 + (z - cz) ** 2 >= shape.radius ** 2) return null;
    return [cy - shape.half[1], cy + shape.half[1]];
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
  const r = shape.kind === "sphere" || shape.kind === "cylinder" ? shape.radius : shape.kind === "dome" ? Math.max(shape.radii[0], shape.radii[2]) : Math.hypot(shape.half[0], shape.half[2]);
  return [cx - r, cz - r, cx + r, cz + r];
}

// A column with air opened from `low` to `high`, no higher than MAX_SPAN_FT: spans it meets join
// it, taking the lowest's themes; `span` gives a new span's stone
// and net.
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
    const stone = [...(met ? joined : s).stone];
    joined = { ...joined, floor: Math.min(joined.floor, s.floor), ceiling: Math.min(Math.max(joined.ceiling, s.ceiling), Math.min(joined.floor, s.floor) + MAX_SPAN_FT), stone };
    met = true;
  }
  out.push(joined);
  return out.sort((a, b) => a.floor - b.floor).slice(-MAX_SPANS);
}

// The height a shape covers over any of column (ci, cj): its reach at the point in the column
// nearest its middle.
function reachCell(shape, ci, cj) {
  const near = (v, i) => Math.min((i + 1) * VOXEL_FT, Math.max(i * VOXEL_FT, v));
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
// height at a continent column's middle, or null where its cells aren't read. New air is in
// network `net`, and takes the stone of the air it's dug from, the one most of it meets, or
// `stone` (always, with `own`).
// With `mouth`, air opens through the ground where it would leave less than THIN_ROOF_FT of rock
// over it; without, it stops ROOF_FT under the ground. Filling `exact`ly leaves crumbs of air as
// they are, for filling a block at a time. Gives the "tx,tz" of the tiles changed.
export function carve(shape, columnsOf, groundAt, { fill = false, stone = allStone(0), own = false, mouth = true, net = UNNAMED, exact = false } = {}) {
  const [x0, z0, x1, z1] = shapeBounds(shape);
  const cuts = [];
  for (let cj = Math.floor(z0 / VOXEL_FT); cj <= Math.floor(z1 / VOXEL_FT); cj++) {
    for (let ci = Math.floor(x0 / VOXEL_FT); ci <= Math.floor(x1 / VOXEL_FT); ci++) {
      const r = fill ? reachCell(shape, ci, cj) : reach(shape, (ci + 0.5) * VOXEL_FT, (cj + 0.5) * VOXEL_FT);
      const ground = r && groundAt(ci, cj);
      // Air over the ground isn't the caves': only rock filled up to a mouth's lip is.
      if (ground == null || r[0] >= ground + (fill ? MOUTH_FT : 0)) continue;
      const top = fill ? Math.min(r[1], ground + MOUTH_FT) : mouth ? (r[1] > ground - THIN_ROOF_FT ? ground + MOUTH_FT : r[1]) : Math.min(r[1], ground - ROOF_FT);
      const [low, high] = [snap(r[0]), snap(top)];
      if (high > low) cuts.push({ ci, cj, low, high });
    }
  }
  const at = ({ ci, cj }, make) => cellAt(columnsOf, ci, cj, make);
  const changed = new Set();
  if (fill) {
    for (const cut of cuts) {
      const found = at(cut, false);
      if (!found?.columns[found.k]) continue;
      found.columns[found.k] = fillRock(found.columns[found.k], cut.low, cut.high, exact ? MIN_ROCK_FT : MIN_AIR_FT);
      changed.add(found.key);
    }
    if (changed.size && !exact) closePockets([x0, z0, x1, z1], at, groundAt, changed);
    return changed;
  }
  // The stone most of the air met has.
  const met = new Map();
  for (const cut of cuts) {
    const found = at(cut, false);
    for (const s of found?.columns[found.k] ?? []) if (s.ceiling >= cut.low && s.floor <= cut.high) met.set(`${s.stone}`, (met.get(`${s.stone}`) ?? 0) + 1);
  }
  const span = { stone: met.size && !own ? [...met].sort((a, b) => b[1] - a[1])[0][0].split(",").map(Number) : stone, net };
  for (const cut of cuts) {
    const found = at(cut, true);
    found.columns[found.k] = openAir(found.columns[found.k], cut.low, cut.high, span);
    changed.add(found.key);
  }
  return changed;
}

// Continent column (ci, cj)'s place in columnsOf's tiles: { columns, k, key }, k its index in its
// tile's columns and key its tile's "tx,tz", or null where its tile has none (and not `make`).
export function cellAt(columnsOf, ci, cj, make) {
  const [tx, tz] = [Math.floor(ci / TILE_COLUMNS), Math.floor(cj / TILE_COLUMNS)];
  const columns = columnsOf(tx, tz, make);
  return columns && { columns, k: (cj - tz * TILE_COLUMNS) * TILE_COLUMNS + ci - tx * TILE_COLUMNS, key: `${tx},${tz}` };
}

// The smooth floor walked on and drawn, from the voxels' stepped floors, so slopes aren't stairs.
// Each floor is smoothed to the mean of the floors joined to it within SMOOTH_COLUMNS columns
// round it, kept within a voxel of where it is; between columns' middles, the surface runs evenly.
// A floor joins one in a column beside it where that's within a voxel for each column away and
// their air overlaps; a bigger drop is a ledge, kept sharp.
// spansAt(ci, cj): a column's spans.
const SMOOTH_COLUMNS = 2;
const joinedFloor = (spans, span, reach) => spans.find((s) => Math.abs(s.floor - span.floor) <= reach && s.floor < span.ceiling && s.ceiling > span.floor);

// Span `span`'s floor in column (ci, cj), smoothed.
export function smoothFloor(spansAt, ci, cj, span) {
  let [sum, n] = [0, 0];
  for (let dj = -SMOOTH_COLUMNS; dj <= SMOOTH_COLUMNS; dj++) {
    for (let di = -SMOOTH_COLUMNS; di <= SMOOTH_COLUMNS; di++) {
      const s = di || dj ? joinedFloor(spansAt(ci + di, cj + dj), span, VOXEL_FT * Math.max(Math.abs(di), Math.abs(dj))) : span;
      if (s) [sum, n] = [sum + s.floor, n + 1];
    }
  }
  return Math.max(span.floor - VOXEL_FT, Math.min(span.floor + VOXEL_FT, sum / n));
}

// The smooth floor of span `span` of the column (x, z) is in, at continent feet (x, z): between
// the smoothed floors at the middles of the four columns round it, those not joined to it taking
// its own. `smooth` is smoothFloor, or a kept copy of it.
export function floorAt(spansAt, x, z, span, smooth = smoothFloor) {
  const [ci, cj] = [Math.floor(x / VOXEL_FT), Math.floor(z / VOXEL_FT)];
  const own = smooth(spansAt, ci, cj, span);
  const [u, v] = [x / VOXEL_FT - 0.5, z / VOXEL_FT - 0.5];
  const [i0, j0] = [Math.floor(u), Math.floor(v)];
  const at = (i, j) => {
    if (i === ci && j === cj) return own;
    const s = joinedFloor(spansAt(i, j), span, VOXEL_FT);
    return s ? smooth(spansAt, i, j, s) : own;
  };
  const [fu, fv] = [u - i0, v - j0];
  return (at(i0, j0) * (1 - fu) + at(i0 + 1, j0) * fu) * (1 - fv) + (at(i0, j0 + 1) * (1 - fu) + at(i0 + 1, j0 + 1) * fu) * fv;
}

// Closes the pockets of air with a column within a column of [x0, z0, x1, z1]: air joined through
// the sides of columns, smaller than POCKET_FT3 and nowhere reaching the ground. at(cell, make)
// is carve's; the "tx,tz" of tiles changed are added to `changed`.
function closePockets([x0, z0, x1, z1], at, groundAt, changed) {
  const spansAt = (ci, cj) => {
    const found = at({ ci, cj }, false);
    return found?.columns[found.k] ?? [];
  };
  const kept = new Set(); // spans in air too big to close
  const closed = new Set();
  for (let cj = Math.floor(z0 / VOXEL_FT) - 1; cj <= Math.floor(z1 / VOXEL_FT) + 1; cj++) {
    for (let ci = Math.floor(x0 / VOXEL_FT) - 1; ci <= Math.floor(x1 / VOXEL_FT) + 1; ci++) {
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
          volume += (here.span.ceiling - here.span.floor) * VOXEL_FT * VOXEL_FT;
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

// Each 32 ft chunk's spans belong to one network, all the way down: a chunk index in a tile
// (z * TILE_CHUNKS + x) -> the networks with spans in it, for each chunk more than one has.
const CHUNK_COLUMNS = CHUNK_FT / VOXEL_FT;
export function sharedChunks(columns) {
  const nets = new Map();
  for (let k = 0; k < columns.length; k++) {
    for (const s of columns[k] ?? []) {
      const c = Math.floor(Math.floor(k / TILE_COLUMNS) / CHUNK_COLUMNS) * (TILE_COLUMNS / CHUNK_COLUMNS) + Math.floor((k % TILE_COLUMNS) / CHUNK_COLUMNS);
      if (!nets.has(c)) nets.set(c, new Set());
      nets.get(c).add(s.net);
    }
  }
  return new Map([...nets].filter(([, n]) => n.size > 1).map(([c, n]) => [c, [...n].sort()]));
}

// A new tile's columns: all rock.
export const emptyColumns = () => new Array(COLUMNS).fill(null);

// A plate's caves file, as text: `tiles`, index in the plate -> columns. Each tile's spans are
// written a network at a time, on a line of their own, those of a tile highest first; tiles with
// no air are left out, and each tile's cells take whichever form is shortest.
export function encodeCaves([px, pz], tiles) {
  const lines = [`caves ${VERSION} ${px} ${pz}`];
  const parts = [];
  for (const [index, columns] of tiles) {
    const nets = new Map(); // net -> its columns
    columns.forEach((column, k) => {
      for (const s of column ?? []) {
        if (!nets.has(s.net)) nets.set(s.net, emptyColumns());
        (nets.get(s.net)[k] ??= []).push(s);
      }
    });
    for (const [net, own] of nets) parts.push({ index, net, own, top: Math.max(...own.flatMap((c) => (c ?? []).map((s) => s.ceiling))) });
  }
  parts.sort((a, b) => a.index - b.index || b.top - a.top || (a.net < b.net ? -1 : 1));
  for (const { index, net, own } of parts) lines.push(`tile ${index} ${net}`, cellsLine(own));
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
    const listed = columns.flatMap((column, k) => (column ?? []).map((s) => ` ${digits(k, 3)}${spanDigits(s, 6, -OFFSET)}`));
    forms.push(["c1", digits(spans.length, 2) + listed.join("")]);
  }
  for (const [tag, text] of [...forms]) {
    const zipped = zip(new TextEncoder().encode(text));
    if (zipped) forms.push([`${tag}z`, bytesToDigits(zipped)]);
  }
  const [tag, text] = forms.reduce((a, b) => (b[1].length < a[1].length ? b : a));
  return `${tag} ${text}`;
}

// A tile's columns from its cells' line, as cellsLine writes it, its spans in network `net`.
function readCells(line, net) {
  const space = line.indexOf(" ");
  let [tag, text] = [line.slice(0, space), line.slice(space + 1)];
  if (tag.endsWith("z")) [tag, text] = [tag.slice(0, -1), new TextDecoder().decode(unzip(digitsToBytes(text)))];
  const columns = emptyColumns();
  const span = (at, startDigits, base) => {
    const floor = (readDigits(text, at + 3, startDigits) + base) / 4;
    return { floor, ceiling: floor + readDigits(text, at + 3 + startDigits, 2) / 4, stone: [0, 1, 2].map((i) => themeOf(readDigits(text, at + i, 1))), net };
  };
  if (tag === "c1") {
    for (let n = readDigits(text, 0, 2), at = 3; n > 0; n--, at += 15) (columns[readDigits(text, at, 3)] ??= []).push(span(at + 3, 6, -OFFSET));
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

// A caves file's { coords: [px, pz], tiles: index -> columns, old }, from its text: each tile's
// networks' spans in the one set of columns, lowest first. Files from before networks (version 1,
// or the gzipped binary files before that) are read as having no caves, with `old` true.
export function decodeCaves(bytes) {
  const tiles = new Map();
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) return { coords: null, tiles, old: true };
  const lines = new TextDecoder().decode(bytes).split("\n");
  const [word, version, px, pz] = lines[0].split(" ");
  if (word !== "caves") throw new Error(`not a caves file (${JSON.stringify(lines[0].slice(0, 20))})`);
  const coords = [Number(px), Number(pz)];
  if (Number(version) < VERSION) return { coords, tiles, old: true };
  if (Number(version) !== VERSION) throw new Error(`caves file version ${version} isn't known`);
  for (let k = 1; k < lines.length; k++) {
    if (!lines[k].startsWith("tile ")) continue;
    const [, index, net] = lines[k].split(" ");
    const columns = readCells(lines[++k], net);
    const into = tiles.get(Number(index));
    if (!into) tiles.set(Number(index), columns);
    else columns.forEach((column, c) => column && (into[c] = [...(into[c] ?? []), ...column].sort((a, b) => a.floor - b.floor)));
  }
  return { coords, tiles, old: false };
}

// Tile (tx, tz)'s index in its plate.
export const tileIndex = (tx, tz) => (tz - Math.floor(tz / PLATE_TILES) * PLATE_TILES) * PLATE_TILES + tx - Math.floor(tx / PLATE_TILES) * PLATE_TILES;
