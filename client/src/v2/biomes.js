import { fbm } from "../world/noise.js";
import { CELL_FT, PLATE_TILES, TILE_FT } from "./sizes.js";

// Which biome each place is, from a continent's biome areas (create/biomes.js keeps them in its
// biomes.json): the area on top there, the one drawn last, or outside them all, the area whose edge
// is nearest, within REACH_FT, or else plains. Each place is looked up moved a little by noise
// (WARP), so every edge between biomes wanders. Plate files keep each cell's, as an index into
// BIOME_NAMES (v2/plate.js).

// Plate files keep indexes into this, so add to its end and never reorder it. A biome only changes
// how things look and what stands there, never the ground's shape.
export const BIOME_NAMES = [
  "plains", "forest", "rocky", "swamp",
  "autumn forest", "giant woods", "taiga", "blossom valley", "bamboo grove", "snowy forest", "highlands",
  "savanna", "red canyon", "sand desert", "salt flats",
  "jungle", "primeval valley", "tropical coast", "sandy beach",
  "snowfield", "frozen tundra", "glacier",
  "mangrove", "fungal marsh",
  "haunted woods", "plague lands", "volcanic waste", "corrupted waste", "enchanted glade", "crystal forest",
];
export const REACH_FT = 1320; // a quarter mile
const BUCKET_FT = 1024; // edges are kept in squares this wide, in each one they come within REACH_FT of
const TILE_CELLS = TILE_FT / CELL_FT;
// How far places are moved, each way, at each scale: broad wander and fine jitter.
const WARP = [
  { wavelength: 420, ft: 80, octaves: 2 },
  { wavelength: 60, ft: 12, octaves: 1 },
];
export const WARP_FT = WARP.reduce((sum, { ft }) => sum + ft, 0); // the most a place is moved
const WARP_SEED = 0x77617270;
const GRID_FT = CELL_FT * 2; // how far apart a tile's biomes are worked out before they're moved
const MARGIN = Math.ceil(WARP_FT / GRID_FT) + 1; // how many more round its edges
const GRID = TILE_FT / GRID_FT + 2 * MARGIN;
const WARP_STEP = 4; // cells between where a tile's moves are worked out, and straight between
const WARP_SIDE = TILE_CELLS / WARP_STEP + 1;
const TILE_REACH_FT = REACH_FT + WARP_FT * Math.SQRT2 + (TILE_FT * Math.SQRT2) / 2; // from a tile's middle to past its moved corners

// Where (x, z) is looked up: moved by noise, up to WARP_FT. Noise bunches round 0, so it's spread
// out to cover more of -1 to 1 before it's scaled.
export function warp(x, z) {
  let [dx, dz] = [0, 0];
  WARP.forEach(({ wavelength, ft, octaves }, k) => {
    const spread = (v) => Math.max(-1, Math.min(1, v * 1.5));
    dx += ft * spread(fbm(x, z, WARP_SEED + 2 * k, { wavelength, octaves }));
    dz += ft * spread(fbm(x, z, WARP_SEED + 2 * k + 1, { wavelength, octaves }));
  });
  return [x + dx, z + dz];
}

// Whether (x, z) is inside the polygon `points`.
export function inside(points, x, z) {
  let within = false;
  for (let k = 0, j = points.length - 1; k < points.length; j = k++) {
    const [[ax, az], [bx, bz]] = [points[k], points[j]];
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) within = !within;
  }
  return within;
}

// How far (x, z) is from the segment (ax, az) to (bx, bz).
function toSegment(x, z, ax, az, bx, bz) {
  const [dx, dz] = [bx - ax, bz - az];
  const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(ax + dx * t - x, az + dz * t - z);
}

const bucketKey = (i, j) => (i + 32768) * 65536 + (j + 32768);

export class BiomeMap {
  // areas: [{ biome, points: [[x, z], ...] }], the last on top.
  constructor(areas = []) {
    this.areas = areas
      .filter(({ points }) => points.length >= 3)
      .map(({ biome, points }) => {
        const xs = points.map((p) => p[0]);
        const zs = points.map((p) => p[1]);
        return { index: Math.max(0, BIOME_NAMES.indexOf(biome)), points, box: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] };
      });
    this.buckets = new Map(); // bucketKey -> edges, [ax, az, bx, bz, biome index]
    for (const { index, points } of this.areas) {
      points.forEach(([ax, az], k) => {
        const [bx, bz] = points[(k + 1) % points.length];
        const edge = [ax, az, bx, bz, index];
        const [i0, i1] = [Math.floor((Math.min(ax, bx) - REACH_FT) / BUCKET_FT), Math.floor((Math.max(ax, bx) + REACH_FT) / BUCKET_FT)];
        const [j0, j1] = [Math.floor((Math.min(az, bz) - REACH_FT) / BUCKET_FT), Math.floor((Math.max(az, bz) + REACH_FT) / BUCKET_FT)];
        for (let j = j0; j <= j1; j++) {
          for (let i = i0; i <= i1; i++) {
            // Only squares the edge comes within reach of.
            if (toSegment((i + 0.5) * BUCKET_FT, (j + 0.5) * BUCKET_FT, ax, az, bx, bz) > REACH_FT + BUCKET_FT * Math.SQRT1_2) continue;
            const key = bucketKey(i, j);
            if (!this.buckets.has(key)) this.buckets.set(key, []);
            this.buckets.get(key).push(edge);
          }
        }
      });
    }
  }

  // The index in BIOME_NAMES of the biome at (x, z).
  at(x, z) {
    return this.unmoved(...warp(x, z));
  }

  // The same, with (x, z) not moved.
  unmoved(x, z) {
    for (let k = this.areas.length - 1; k >= 0; k--) {
      const { box, points, index } = this.areas[k];
      if (x >= box[0] && x <= box[2] && z >= box[1] && z <= box[3] && inside(points, x, z)) return index;
    }
    const edges = this.buckets.get(bucketKey(Math.floor(x / BUCKET_FT), Math.floor(z / BUCKET_FT)));
    if (!edges) return 0;
    let [best, nearest] = [0, REACH_FT];
    for (const [ax, az, bx, bz, index] of edges) {
      const d = toSegment(x, z, ax, az, bx, bz);
      if (d <= nearest) [best, nearest] = [index, d];
    }
    return best;
  }

  // Edges within `reach` ft of (x, z), from its square and those round it.
  near(x, z, reach) {
    const found = new Set();
    const [i0, i1] = [Math.floor((x - reach) / BUCKET_FT), Math.floor((x + reach) / BUCKET_FT)];
    const [j0, j1] = [Math.floor((z - reach) / BUCKET_FT), Math.floor((z + reach) / BUCKET_FT)];
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        for (const edge of this.buckets.get(bucketKey(i, j)) ?? []) if (toSegment(x, z, ...edge) <= reach) found.add(edge);
      }
    }
    return found;
  }

  // Tile (tx, tz)'s biomes, at its cells' middles, into `out`, 64 × 64 in row order. A tile no
  // edge comes near is one biome all over. Otherwise biomes are worked out unmoved on a grid round
  // it, GRID_FT apart, and each cell takes the grid's nearest to where it's moved.
  tile(tx, tz, out = new Uint8Array(TILE_CELLS * TILE_CELLS)) {
    const [x0, z0] = [tx * TILE_FT, tz * TILE_FT];
    const [cx, cz] = [x0 + TILE_FT / 2, z0 + TILE_FT / 2];
    const edges = [...this.near(cx, cz, TILE_REACH_FT)];
    if (!edges.length) return out.fill(this.areas.length ? this.unmoved(cx, cz) : 0);
    const [gx, gz] = [x0 - MARGIN * GRID_FT, z0 - MARGIN * GRID_FT];
    const grid = this.grid(gx, gz, edges);
    const moves = new Float32Array(WARP_SIDE * WARP_SIDE * 2);
    for (let b = 0; b < WARP_SIDE; b++) {
      for (let a = 0; a < WARP_SIDE; a++) {
        const [x, z] = [x0 + (a * WARP_STEP + 0.5) * CELL_FT, z0 + (b * WARP_STEP + 0.5) * CELL_FT];
        const [wx, wz] = warp(x, z);
        moves.set([wx - x, wz - z], (b * WARP_SIDE + a) * 2);
      }
    }
    const move = (i, j, m) => {
      const [a, b] = [Math.min(WARP_SIDE - 2, Math.floor(i / WARP_STEP)), Math.min(WARP_SIDE - 2, Math.floor(j / WARP_STEP))];
      const [u, v] = [i / WARP_STEP - a, j / WARP_STEP - b];
      const at = (da, db) => moves[((b + db) * WARP_SIDE + a + da) * 2 + m];
      return (at(0, 0) * (1 - u) + at(1, 0) * u) * (1 - v) + (at(0, 1) * (1 - u) + at(1, 1) * u) * v;
    };
    for (let j = 0; j < TILE_CELLS; j++) {
      for (let i = 0; i < TILE_CELLS; i++) {
        const [x, z] = [x0 + (i + 0.5) * CELL_FT + move(i, j, 0), z0 + (j + 0.5) * CELL_FT + move(i, j, 1)];
        const [a, b] = [Math.floor((x - gx) / GRID_FT), Math.floor((z - gz) / GRID_FT)];
        out[j * TILE_CELLS + i] = grid[Math.max(0, Math.min(GRID - 1, b)) * GRID + Math.max(0, Math.min(GRID - 1, a))];
      }
    }
    return out;
  }

  // Biomes unmoved on a GRID × GRID grid of squares GRID_FT wide from (gx, gz), at their middles:
  // each row filled across the areas it crosses, the last on top, and squares left outside them all
  // taking the nearest of `edges`'.
  grid(gx, gz, edges) {
    const top = new Int16Array(GRID * GRID).fill(-1);
    const crossings = [];
    const span = GRID * GRID_FT;
    this.areas.forEach(({ box, points }, k) => {
      if (box[0] > gx + span || box[2] < gx || box[1] > gz + span || box[3] < gz) return;
      for (let j = 0; j < GRID; j++) {
        const z = gz + (j + 0.5) * GRID_FT;
        crossings.length = 0;
        for (let m = 0, n = points.length - 1; m < points.length; n = m++) {
          const [[ax, az], [bx, bz]] = [points[m], points[n]];
          if (az > z !== bz > z) crossings.push(((bx - ax) * (z - az)) / (bz - az) + ax);
        }
        crossings.sort((p, q) => p - q);
        // Inside from each odd crossing up to the next.
        for (let c = 0; c + 1 < crossings.length; c += 2) {
          const i0 = Math.max(0, Math.ceil((crossings[c] - gx) / GRID_FT - 0.5));
          const i1 = Math.min(GRID, Math.ceil((crossings[c + 1] - gx) / GRID_FT - 0.5));
          for (let i = i0; i < i1; i++) top[j * GRID + i] = k;
        }
      }
    });
    const out = new Uint8Array(GRID * GRID);
    // Where every edge near is one biome's, and one comes well within reach of the whole grid,
    // the squares outside the areas are all that biome.
    const [cx, cz] = [gx + span / 2, gz + span / 2];
    const covered = edges.every((e) => e[4] === edges[0][4]) && edges.some((e) => toSegment(cx, cz, ...e) <= REACH_FT - span * Math.SQRT1_2);
    for (let j = 0; j < GRID; j++) {
      const z = gz + (j + 0.5) * GRID_FT;
      for (let i = 0; i < GRID; i++) {
        const k = j * GRID + i;
        if (top[k] >= 0) {
          out[k] = this.areas[top[k]].index;
          continue;
        }
        if (covered) {
          out[k] = edges[0][4];
          continue;
        }
        const x = gx + (i + 0.5) * GRID_FT;
        let [best, nearest] = [0, REACH_FT];
        for (const [ax, az, bx, bz, index] of edges) {
          const d = toSegment(x, z, ax, az, bx, bz);
          if (d <= nearest) [best, nearest] = [index, d];
        }
        out[k] = best;
      }
    }
    return out;
  }
}

// The boxes, [x0, z0, x1, z1] grown by REACH_FT and WARP_FT, of areas in `before` or `after` but not both, where
// which biome is where may have changed.
export function changedBoxes(before, after) {
  const key = ({ biome, points }) => `${biome}:${points.join(";")}`;
  const count = (areas) => {
    const counts = new Map();
    for (const area of areas) counts.set(key(area), (counts.get(key(area)) ?? 0) + 1);
    return counts;
  };
  const [was, now] = [count(before), count(after)];
  const boxes = [];
  for (const [areas, other] of [[before, now], [after, was]]) {
    for (const area of areas) {
      const k = key(area);
      if (other.get(k)) {
        other.set(k, other.get(k) - 1);
        continue;
      }
      const xs = area.points.map((p) => p[0]);
      const zs = area.points.map((p) => p[1]);
      const grow = REACH_FT + WARP_FT;
      boxes.push([Math.min(...xs) - grow, Math.min(...zs) - grow, Math.max(...xs) + grow, Math.max(...zs) + grow]);
    }
  }
  return boxes;
}

// Puts each of a plate's tiles' biomes in it, from `map`. plate: as v2/plate.js reads it.
export function bakePlate(plate, map) {
  const [px, pz] = plate.coords;
  for (const [index, tile] of plate.tiles) tile.biome = map.tile(px * PLATE_TILES + (index % PLATE_TILES), pz * PLATE_TILES + Math.floor(index / PLATE_TILES), tile.biome);
  return plate;
}
