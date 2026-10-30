import { courseBox, shape } from "./courses.js";
import { CELL_FT, PLATE_TILES, SEA_LEVEL_FT, TILE_CHUNKS, TILE_FT } from "./sizes.js";

// Water: bodies (sea, lakes, ponds, swamp pools) and, later, courses (rivers, streams), drawn by
// hand and kept in each continent's water.json, then baked into plate files (plate.js) as each
// cell's water: the height its surface stands at, in continent feet, and its type. A tile with no
// water keeps none.
//
// The sea is kept only in the plates, at SEA_LEVEL_FT: a cell's sea while its ground is lower,
// and ground made or moved lower than that takes the sea from cells next to it that have it, or
// from the edges of tiles next to none (the sea is all round the land), as its plate's saved. So ground
// lower than the sea but closed off from it stays dry till it's opened to it.
//
// A body is { type, level, points: [[x, z], ...] }: its surface stands at `level` ft over the cells
// inside its outline whose ground is lower, so its banks are where the ground rises through it.
// The last body is on top where they overlap, and courses (courses.js) are on top of them: their
// water's over the cells near enough their line whose ground's lower than their surface there.
//
// A tile's water is null, or { level: 64×64 feet, NaN where the cell's dry, type: 64×64 indexes
// into WATER_TYPES }, cells in row order.

export const WATER_TYPES = ["sea", "lake", "pond", "swamp", "river", "stream"];
export const waterPath = (continent) => `places/continents/${continent}/water.json`;
const TILE_CELLS = TILE_FT / CELL_FT;
const CORNERS = TILE_CELLS + 1;
const CELLS = TILE_CELLS * TILE_CELLS;
const SEA = 0;
// Around a plate: the tiles from one west and north of it to one east and south.
export const AROUND = PLATE_TILES + 2;

// A tile's water with every cell dry.
export const dryWater = (cells) => ({ level: new Float32Array(cells).fill(NaN), type: new Uint8Array(cells) });

const boxOf = (points) => {
  const xs = points.map((p) => p[0]);
  const zs = points.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
};

export class WaterMap {
  constructor(bodies = [], courses = []) {
    this.bodies = bodies
      .filter(({ points }) => points.length >= 3)
      .map(({ type, level, points }) => ({ type: Math.max(0, WATER_TYPES.indexOf(type)), level, points, box: boxOf(points) }));
    this.courses = courses.filter(({ points, surface }) => points.length >= 2 && surface?.length).map((course) => ({ course, type: WATER_TYPES.indexOf(course.type), box: courseBox(course) }));
  }

  // Tile (tx, tz)'s water, from its 65 × 65 corner `heights`, or null where it has none.
  tile(tx, tz, heights) {
    const [x0, z0] = [tx * TILE_FT, tz * TILE_FT];
    let water = null;
    const crossings = [];
    for (const { type, level, points, box } of this.bodies) {
      if (box[0] > x0 + TILE_FT || box[2] < x0 || box[1] > z0 + TILE_FT || box[3] < z0) continue;
      // Each row of cells' middles filled across the outline, where the ground's lower.
      for (let j = 0; j < TILE_CELLS; j++) {
        const z = z0 + (j + 0.5) * CELL_FT;
        crossings.length = 0;
        for (let k = 0, m = points.length - 1; k < points.length; m = k++) {
          const [[ax, az], [bx, bz]] = [points[k], points[m]];
          if (az > z !== bz > z) crossings.push(((bx - ax) * (z - az)) / (bz - az) + ax);
        }
        crossings.sort((p, q) => p - q);
        for (let c = 0; c + 1 < crossings.length; c += 2) {
          const i0 = Math.max(0, Math.ceil((crossings[c] - x0) / CELL_FT - 0.5));
          const i1 = Math.min(TILE_CELLS, Math.ceil((crossings[c + 1] - x0) / CELL_FT - 0.5));
          for (let i = i0; i < i1; i++) {
            const at = j * CORNERS + i;
            const ground = (heights[at] + heights[at + 1] + heights[at + CORNERS] + heights[at + CORNERS + 1]) / 4;
            if (ground >= level) continue;
            water ??= dryWater(TILE_CELLS * TILE_CELLS);
            water.level[j * TILE_CELLS + i] = level;
            water.type[j * TILE_CELLS + i] = type;
          }
        }
      }
    }
    for (const { course, type, box } of this.courses) {
      if (box[0] > x0 + TILE_FT || box[2] < x0 || box[1] > z0 + TILE_FT || box[3] < z0) continue;
      const [i0, i1] = [Math.max(0, Math.floor((box[0] - x0) / CELL_FT)), Math.min(TILE_CELLS, Math.ceil((box[2] - x0) / CELL_FT))];
      const [j0, j1] = [Math.max(0, Math.floor((box[1] - z0) / CELL_FT)), Math.min(TILE_CELLS, Math.ceil((box[3] - z0) / CELL_FT))];
      for (let j = j0; j < j1; j++) {
        for (let i = i0; i < i1; i++) {
          const made = shape(course, x0 + (i + 0.5) * CELL_FT, z0 + (j + 0.5) * CELL_FT);
          if (!made?.wet) continue;
          const at = j * CORNERS + i;
          const ground = (heights[at] + heights[at + 1] + heights[at + CORNERS] + heights[at + CORNERS + 1]) / 4;
          if (ground >= made.level) continue;
          water ??= dryWater(TILE_CELLS * TILE_CELLS);
          // Where courses meet, the higher.
          const k = j * TILE_CELLS + i;
          if (water.type[k] === type && !(made.level > water.level[k])) continue;
          water.level[k] = made.level;
          water.type[k] = type;
        }
      }
    }
    return water;
  }
}

// A tile's water a part a chunk, for its rendition (platter.js), from its cells' (null for none):
// a part's wet where a quarter of its cells are or more, at their mean level, of the type most of
// them are. Null where no part's wet.
export const PART_WET = 0.25;
export function partWater(water) {
  if (!water) return null;
  const parts = TILE_CHUNKS;
  const n = TILE_CELLS / parts; // cells a part a side
  let out = null;
  for (let b = 0; b < parts; b++) {
    for (let a = 0; a < parts; a++) {
      let [sum, wet] = [0, 0];
      const types = new Map();
      for (let j = b * n; j < (b + 1) * n; j++) {
        for (let i = a * n; i < (a + 1) * n; i++) {
          const level = water.level[j * TILE_CELLS + i];
          if (Number.isNaN(level)) continue;
          sum += level;
          wet++;
          types.set(water.type[j * TILE_CELLS + i], (types.get(water.type[j * TILE_CELLS + i]) ?? 0) + 1);
        }
      }
      if (wet < PART_WET * n * n) continue;
      out ??= dryWater(parts * parts);
      out.level[b * parts + a] = sum / wet;
      out.type[b * parts + a] = [...types].reduce((best, t) => (t[1] > best[1] ? t : best))[0];
    }
  }
  return out;
}

// The boxes, [x0, z0, x1, z1], of bodies and courses in `before` or `after` but not both, where
// the water may have changed. before and after: { bodies, courses }, as water.json keeps them.
export function changedWaterBoxes(before, after) {
  const changed = (was, now, key) => {
    const [had, has] = [new Set(was.map(key)), new Set(now.map(key))];
    return [...was.filter((thing) => !has.has(key(thing))), ...now.filter((thing) => !had.has(key(thing)))];
  };
  const bodies = changed(before.bodies ?? [], after.bodies ?? [], ({ type, level, points }) => `${type}:${level}:${points.join(";")}`);
  const courses = changed(before.courses ?? [], after.courses ?? [], (course) => JSON.stringify(course));
  return [...bodies.filter(({ points }) => points.length).map(({ points }) => boxOf(points)), ...courses.filter(({ points }) => points.length).map(courseBox)];
}

// Each cell's ground: the mean of its corners', 64 × 64 in row order.
function cellGround(heights) {
  const ground = new Float32Array(CELLS);
  for (let j = 0; j < TILE_CELLS; j++) {
    for (let i = 0; i < TILE_CELLS; i++) {
      const at = j * CORNERS + i;
      ground[j * TILE_CELLS + i] = (heights[at] + heights[at + 1] + heights[at + CORNERS] + heights[at + CORNERS + 1]) / 4;
    }
  }
  return ground;
}

// Puts each of a plate's tiles' water in it: its sea, kept and spread (above), with `map`'s bodies
// on top. plate: as v2/plate.js reads it, with `around`, AROUND × AROUND, row order, 1 where
// there's a tile, from the one west and north of the plate's first; without it, the sea spreads
// in from no tiles outside the plate.
export function bakeWater(plate, map) {
  const [px, pz] = plate.coords;
  const [tx0, tz0] = [px * PLATE_TILES, pz * PLATE_TILES];
  const indexes = [...plate.tiles.keys()];
  const ground = new Map(indexes.map((index) => [index, cellGround(plate.tiles.get(index).heights)]));
  // Whether there's a tile `a` east and `b` south of the plate's first.
  const there = (a, b) => (a >= 0 && b >= 0 && a < PLATE_TILES && b < PLATE_TILES ? plate.tiles.has(b * PLATE_TILES + a) : Boolean(plate.around?.[(b + 1) * AROUND + a + 1] ?? 1));
  const sea = new Map(indexes.map((index) => [index, new Uint8Array(CELLS)]));
  const queue = [];
  const flood = (index, k) => {
    if (sea.get(index)[k] || !(ground.get(index)[k] < SEA_LEVEL_FT)) return;
    sea.get(index)[k] = 1;
    queue.push(index * CELLS + k);
  };
  for (const index of indexes) {
    const { water } = plate.tiles.get(index);
    const [a, b] = [index % PLATE_TILES, Math.floor(index / PLATE_TILES)];
    for (let k = 0; k < CELLS; k++) if (water && water.type[k] === SEA && !Number.isNaN(water.level[k])) flood(index, k);
    // The sea's all round the land: in from each side with no tile past it.
    for (let n = 0; n < TILE_CELLS; n++) {
      if (!there(a - 1, b)) flood(index, n * TILE_CELLS);
      if (!there(a + 1, b)) flood(index, n * TILE_CELLS + TILE_CELLS - 1);
      if (!there(a, b - 1)) flood(index, n);
      if (!there(a, b + 1)) flood(index, (TILE_CELLS - 1) * TILE_CELLS + n);
    }
  }
  // Out to the cells next to sea, across the plate's tiles.
  while (queue.length) {
    const at = queue.pop();
    const [index, k] = [Math.floor(at / CELLS), at % CELLS];
    const [a, b] = [index % PLATE_TILES, Math.floor(index / PLATE_TILES)];
    const [i, j] = [k % TILE_CELLS, Math.floor(k / TILE_CELLS)];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let [ni, nj, na, nb] = [i + di, j + dj, a, b];
      if (ni < 0) [ni, na] = [TILE_CELLS - 1, a - 1];
      if (ni >= TILE_CELLS) [ni, na] = [0, a + 1];
      if (nj < 0) [nj, nb] = [TILE_CELLS - 1, b - 1];
      if (nj >= TILE_CELLS) [nj, nb] = [0, b + 1];
      if (na < 0 || nb < 0 || na >= PLATE_TILES || nb >= PLATE_TILES || !plate.tiles.has(nb * PLATE_TILES + na)) continue;
      flood(nb * PLATE_TILES + na, nj * TILE_CELLS + ni);
    }
  }
  for (const [index, tile] of plate.tiles) {
    const bodies = map.tile(tx0 + (index % PLATE_TILES), tz0 + Math.floor(index / PLATE_TILES), tile.heights);
    const wet = sea.get(index);
    if (!wet.some(Boolean)) {
      tile.water = bodies;
      continue;
    }
    const water = bodies ?? dryWater(CELLS);
    for (let k = 0; k < CELLS; k++) {
      if (!wet[k] || !Number.isNaN(water.level[k])) continue;
      water.level[k] = SEA_LEVEL_FT;
      water.type[k] = SEA;
    }
    tile.water = water;
  }
  return plate;
}
