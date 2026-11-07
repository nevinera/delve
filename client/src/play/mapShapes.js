import { CASCADE_STEEP } from "../v2/courses.js";
import { CORNERS } from "../v2/platter.js";
import { STEEP_STEPS } from "../v2/rendition.js";
import { CHUNK_FT, PLATTER_TILES, SEA_LEVEL_FT, TILE_CHUNKS } from "../v2/sizes.js";

// The shapes the map draws ground you can't reach as, from the platters' steep shares, a cell a
// chunk: steep cells blocked, small specks of them let through, everything you can't walk or swim
// to from the sea or the places given filled in, and its edges smoothed into closed outlines.

const SIDE = PLATTER_TILES * TILE_CHUNKS; // a platter's cells a side
export const BLOCK_STEPS = Math.ceil(STEEP_STEPS / 2); // a cell at least half steep is blocked
export const SPECK = 8; // blocked patches smaller than this many cells are let through
// How far water's surface can rise from a cell to the next for you to swim on up it, ft: under a
// cascade's slope (courses.js), since a cell's level is its water's average. More is a cascade or
// a falls, which you can swim down but not up, as /create's path tool has it (walk.js).
export const SWIM_RISE_FT = CHUNK_FT * CASCADE_STEEP * 0.75;
// Climbing into a cell this much steep or more, by more than CLIMB_RISE_FT, is taken as blocked:
// its steep cells likely lie across the way up in bands, as they do in a stepped gully. Going down
// it, you slide.
export const UPHILL_STEPS = Math.ceil(STEEP_STEPS / 5);
export const CLIMB_RISE_FT = 4;

// Which cells are land, 1 each.
export function landMask({ kind }) {
  return kind.map((v) => (v === 1 ? 1 : 0));
}

// The continent's cells, padded a cell all round: `kind` 0 sea or no tile, 1 land, 2 water;
// `level` the water's surface, ft, sea level past the tiles and NaN on land; `top` the ground's
// height, or the water's where it's higher, ft; `steep` each cell's steep share, in 63rds. x0
// and z0 are the first cell's, in chunks.
export function continentGrid(platters) {
  const xs = platters.map(({ coords }) => coords[0]);
  const zs = platters.map(({ coords }) => coords[1]);
  const [px0, pz0] = [Math.min(...xs), Math.min(...zs)];
  const w = (Math.max(...xs) - px0 + 1) * SIDE + 2;
  const h = (Math.max(...zs) - pz0 + 1) * SIDE + 2;
  const kind = new Uint8Array(w * h);
  const steep = new Uint8Array(w * h);
  const level = new Float32Array(w * h).fill(SEA_LEVEL_FT);
  const top = new Float32Array(w * h).fill(SEA_LEVEL_FT);
  for (const { coords, tiles } of platters) {
    for (const [index, tile] of tiles) {
      const ci = (coords[0] - px0) * SIDE + (index % PLATTER_TILES) * TILE_CHUNKS + 1;
      const cj = (coords[1] - pz0) * SIDE + Math.floor(index / PLATTER_TILES) * TILE_CHUNKS + 1;
      for (let b = 0; b < TILE_CHUNKS; b++) {
        for (let a = 0; a < TILE_CHUNKS; a++) {
          const part = b * TILE_CHUNKS + a;
          const k = (cj + b) * w + ci + a;
          const wet = tile.water && !Number.isNaN(tile.water.level[part]);
          kind[k] = wet ? 2 : 1;
          level[k] = wet ? tile.water.level[part] : NaN;
          const c = b * CORNERS + a;
          const ground = (tile.heights[c] + tile.heights[c + 1] + tile.heights[c + CORNERS] + tile.heights[c + CORNERS + 1]) / 4;
          top[k] = wet ? Math.max(ground, level[k]) : ground;
          steep[k] = tile.steep?.[part] ?? 0;
        }
      }
    }
  }
  return { w, h, x0: px0 * SIDE - 1, z0: pz0 * SIDE - 1, kind, level, top, steep };
}

// Spreads `queue` to every cell connected to its cells that open(next, from) lets in, marking
// them in `seen`, and gives how long it is: by their sides, or by their corners too when `corners`.
function spread(grid, queue, length, seen, open, corners = false) {
  const { w, h } = grid;
  const steps = corners ? [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]] : [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (let head = 0; head < length; head++) {
    const k = queue[head];
    const [i, j] = [k % w, Math.floor(k / w)];
    for (const [di, dj] of steps) {
      if (i + di < 0 || i + di >= w || j + dj < 0 || j + dj >= h) continue;
      const n = k + dj * w + di;
      if (seen[n] || !open(n, k)) continue;
      seen[n] = 1;
      queue[length++] = n;
    }
  }
  return length;
}

// Which cells you can't reach, 1 each: cells blocked, or walled off by blocked ones from the sea
// and from `seeds`, [x, z] in ft. Water's reached by swimming, but not up a falls; sea is never
// solid.
export function solidMask(grid, seeds = []) {
  const { w, h, kind, level, top, steep } = grid;
  const n = w * h;
  const blocked = new Uint8Array(n);
  for (let k = 0; k < n; k++) blocked[k] = kind[k] === 1 && steep[k] >= BLOCK_STEPS ? 1 : 0;
  // Let small specks through, a speck's cells touching by their corners too, so a cliff running
  // slantwise stays whole.
  const queue = new Int32Array(n);
  const seen = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    if (!blocked[k] || seen[k]) continue;
    seen[k] = 1;
    queue[0] = k;
    const size = spread(grid, queue, 1, seen, (m) => blocked[m], true);
    if (size < SPECK) for (let q = 0; q < size; q++) blocked[queue[q]] = 0;
  }
  // Reach from the sea and the seeds.
  seen.fill(0);
  let length = 0;
  for (let k = 0; k < n; k++) if (kind[k] === 0) [seen[k], queue[length++]] = [1, k];
  for (const [x, z] of seeds) {
    const [i, j] = [Math.floor(x / CHUNK_FT) - grid.x0, Math.floor(z / CHUNK_FT) - grid.z0];
    const k = j * w + i;
    if (i < 0 || j < 0 || i >= w || j >= h || seen[k] || blocked[k]) continue;
    [seen[k], queue[length++]] = [1, k];
  }
  const open = (m, from) => !blocked[m] && !(level[m] - level[from] > SWIM_RISE_FT) && !(steep[m] >= UPHILL_STEPS && top[m] - top[from] > CLIMB_RISE_FT);
  spread(grid, queue, length, seen, open);
  const solid = new Uint8Array(n);
  for (let k = 0; k < n; k++) solid[k] = kind[k] !== 0 && !seen[k] ? 1 : 0;
  return solid;
}

// The mask blurred by a 3×3 box `passes` times, 0 to 9 ** passes.
function blurred(mask, w, h, passes) {
  let field = Uint16Array.from(mask);
  for (let pass = 0; pass < passes; pass++) {
    const across = new Uint16Array(w * h);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const k = j * w + i;
        across[k] = field[k] + (i > 0 ? field[k - 1] : 0) + (i < w - 1 ? field[k + 1] : 0);
      }
    }
    const down = new Uint16Array(w * h);
    for (let k = 0; k < w * h; k++) down[k] = across[k] + (k >= w ? across[k - w] : 0) + (k < w * (h - 1) ? across[k + w] : 0);
    field = down;
  }
  return field;
}

// Segments each case of a square's corners makes (bits: 1 nw, 2 ne, 4 se, 8 sw inside), as pairs
// of its edges: 0 north, 1 east, 2 south, 3 west. Saddles, 5 and 10, are settled by the middle.
const CASES = [[], [[3, 0]], [[0, 1]], [[3, 1]], [[1, 2]], null, [[0, 2]], [[3, 2]], [[2, 3]], [[2, 0]], null, [[2, 1]], [[1, 3]], [[1, 0]], [[0, 3]], []];

// The outlines of the mask's shapes, smoothed by blurring it `passes` times and tracing where it's
// `level` of the way up: closed loops of [x, z] in ft, as flat arrays. A higher level draws shapes
// smaller, and keeps narrow gaps between them open.
export function outlines(mask, grid, { passes = 2, level = 0.5 } = {}) {
  const { w, h, x0, z0 } = grid;
  const f = blurred(mask, w, h, passes);
  const LEVEL = 9 ** passes * level;
  // An edge's key: horizontal edges from point (i, j) east are (j*w+i)*2, vertical ones south +1.
  const edgeKey = (i, j, side) => (side === 0 ? (j * w + i) * 2 : side === 1 ? (j * w + i + 1) * 2 + 1 : side === 2 ? ((j + 1) * w + i) * 2 : (j * w + i) * 2 + 1);
  const ends = new Map(); // edge key -> the other ends of the segments that meet there
  const link = (a, b) => {
    for (const [from, to] of [[a, b], [b, a]]) {
      const list = ends.get(from);
      if (list) list.push(to);
      else ends.set(from, [to]);
    }
  };
  for (let j = 0; j < h - 1; j++) {
    for (let i = 0; i < w - 1; i++) {
      const k = j * w + i;
      const [a, b, c, d] = [f[k], f[k + 1], f[k + w + 1], f[k + w]];
      const bits = (a > LEVEL ? 1 : 0) | (b > LEVEL ? 2 : 0) | (c > LEVEL ? 4 : 0) | (d > LEVEL ? 8 : 0);
      if (bits === 0 || bits === 15) continue;
      let pairs = CASES[bits];
      if (!pairs) {
        // Joined through the middle where it's inside, cutting off the corners that aren't.
        const joined = (a + b + c + d) / 4 > LEVEL;
        pairs = (bits === 5) === joined ? [[0, 1], [2, 3]] : [[3, 0], [1, 2]];
      }
      for (const [s, t] of pairs) link(edgeKey(i, j, s), edgeKey(i, j, t));
    }
  }
  // Where on its edge the outline crosses, in ft.
  const point = (key) => {
    const p = key >> 1;
    const [i, j] = [p % w, Math.floor(p / w)];
    const q = key & 1 ? p + w : p + 1;
    const t = (LEVEL - f[p]) / (f[q] - f[p]);
    const [x, z] = key & 1 ? [i, j + t] : [i + t, j];
    return [(x0 + x + 0.5) * CHUNK_FT, (z0 + z + 0.5) * CHUNK_FT];
  };
  const loops = [];
  const used = new Set();
  for (const start of ends.keys()) {
    if (used.has(start)) continue;
    const loop = [];
    let [prev, at] = [-1, start];
    while (!used.has(at)) {
      used.add(at);
      loop.push(...point(at));
      const next = ends.get(at).find((e) => e !== prev && !used.has(e)) ?? ends.get(at).find((e) => e !== prev);
      [prev, at] = [at, next];
      if (at === undefined) break;
    }
    if (loop.length >= 6) loops.push(Float32Array.from(loop));
  }
  return loops;
}
