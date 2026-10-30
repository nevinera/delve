import { CELL_FT, PLATE_TILES, TILE_FT } from "./sizes.js";

// Water: bodies (sea, lakes, ponds, swamp pools) and, later, courses (rivers, streams), drawn by
// hand and kept in each continent's water.json, then baked into plate files (plate.js) as each
// cell's water: the height its surface stands at, in continent feet, and its type. A tile with no
// water keeps none.
//
// A body is { type, level, points: [[x, z], ...] }: its surface stands at `level` ft over the cells
// inside its outline whose ground is lower, so its banks are where the ground rises through it.
// The last body is on top where they overlap.
//
// A tile's water is null, or { level: 64×64 feet, NaN where the cell's dry, type: 64×64 indexes
// into WATER_TYPES }, cells in row order.

export const WATER_TYPES = ["sea", "lake", "pond", "swamp", "river", "stream"];
export const waterPath = (continent) => `places/continents/${continent}/water.json`;
const TILE_CELLS = TILE_FT / CELL_FT;
const CORNERS = TILE_CELLS + 1;

// A tile's water with every cell dry.
export const dryWater = (cells) => ({ level: new Float32Array(cells).fill(NaN), type: new Uint8Array(cells) });

const boxOf = (points) => {
  const xs = points.map((p) => p[0]);
  const zs = points.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
};

export class WaterMap {
  constructor(bodies = []) {
    this.bodies = bodies
      .filter(({ points }) => points.length >= 3)
      .map(({ type, level, points }) => ({ type: Math.max(0, WATER_TYPES.indexOf(type)), level, points, box: boxOf(points) }));
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
    return water;
  }
}

// The boxes, [x0, z0, x1, z1], of bodies in `before` or `after` but not both, where the water
// may have changed.
export function changedWaterBoxes(before, after) {
  const key = ({ type, level, points }) => `${type}:${level}:${points.join(";")}`;
  const [was, now] = [new Set(before.map(key)), new Set(after.map(key))];
  return [...before.filter((body) => !now.has(key(body))), ...after.filter((body) => !was.has(key(body)))].filter(({ points }) => points.length).map(({ points }) => boxOf(points));
}

// Puts each of a plate's tiles' water in it, from `map`. plate: as v2/plate.js reads it.
export function bakeWater(plate, map) {
  const [px, pz] = plate.coords;
  for (const [index, tile] of plate.tiles) tile.water = map.tile(px * PLATE_TILES + (index % PLATE_TILES), pz * PLATE_TILES + Math.floor(index / PLATE_TILES), tile.heights);
  return plate;
}
