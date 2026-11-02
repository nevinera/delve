import { hash2, facets, valueNoise } from "../world/noise.js";
import { CAVE_THEMES, TILE_CELLS, isHewn, stonePart, themeOf } from "../v2/caves.js";
import { CELL_FT } from "../v2/sizes.js";

// Mesh data for a tile's caves (v2/caves.js), without three.js, so it can be tested. The rock's
// surface runs between the air of the caves' spans and the rock round them, smoothed by surface
// nets: a grid of points at the columns' middles, every STEP_FT up, a vertex in each grid cube
// the surface passes through, at the mean of where it crosses the cube's edges, and a face across
// each grid edge it crosses. Up and down, a crossing is exactly at a floor or ceiling. Across,
// between an open column and a solid one, it's where the open column's height would run out,
// going by how it shrinks from the column behind it (wallAt), so walls aren't held to the
// columns' grid. A cube by hewn stone (its floor, wall or ceiling, as it faces) keeps its vertex at the columns' corner instead, so hewn
// rock is squared off. Faces look into the air, so from outside a cave its rock isn't drawn.
//
// Each theme draws the rock its own way (THEME_LOOK): vertices are drawn toward their
// neighbours', rounding off the columns' grid, then pushed in or out by noise along the way the
// rock faces. Both come from the tiles alone, never from the mesh, so tiles agree at seams.
//
// Where a cave opens through the ground (a mouth: ground inside a span's air), the ground's full
// tiles leave those cells out (mouthCells), and the cave's rim, its vertices in cubes that reach
// the sky by an opened column, sits on the ground's corners, so the two meet along the cells'
// edges.
//
// The mesh covers the tile's grid edges, and reaches to its east and south neighbours' columns,
// so tiles meet without gaps. Positions are feet from the tile's northwest corner.
//
// world: what a mesh needs to know, by continent cell (ci, cj): spans(ci, cj), lowest first;
// ground(ci, cj), the ground's height at its middle, -Infinity where it's not known; corner(ci,
// cj), at its northwest corner; mouth(ci, cj), whether the ground there opens into a cave;
// and caved(tx, tz), whether a tile has any caves.

const STEP_FT = 2;
const ROCK = 0;
const CAVE = 1;
const SKY = 2;
// relax: how far toward its neighbours' a vertex is drawn (passes: how many times over); bumpFt:
// how far noise pushes it in or out, the noise's features about waveFt apart.
const THEME_LOOK = {
  jagged: { rgb: [112, 104, 96], floor: [92, 86, 78], relax: 0.25, passes: 1, bumpFt: 2.4, waveFt: 5 },
  smooth: { rgb: [118, 110, 100], floor: [98, 92, 84], relax: 1, passes: 2, bumpFt: 0.4, waveFt: 12 },
  carved: { rgb: [146, 134, 114], floor: [124, 114, 98], relax: 1, passes: 1, bumpFt: 0, waveFt: 1 },
  mined: { rgb: [104, 96, 88], floor: [86, 78, 70], relax: 0.8, passes: 1, bumpFt: 0.7, waveFt: 3 },
};
const SHADE = 0.1; // how much each vertex's color varies, lighter or darker

// Whether cell (ci, cj)'s ground lies in a cave's air.
export function opensAt(world, ci, cj) {
  const h = world.ground(ci, cj);
  return world.spans(ci, cj).some((s) => s.floor < h && h < s.ceiling);
}

// The cells of tile (tx, tz), by index in row order, whose ground the caves draw, as a Set, for
// the ground to leave out. Empty where the tile's caves don't reach the ground.
export function mouthCells(tx, tz, world) {
  const out = new Set();
  for (let j = 0; j < TILE_CELLS; j++) for (let i = 0; i < TILE_CELLS; i++) if (world.mouth(tx * TILE_CELLS + i, tz * TILE_CELLS + j)) out.add(j * TILE_CELLS + i);
  return out;
}

// Tile (tx, tz)'s cave rock as { positions, colors, themes, indices }, or null where there's none.
export function caveMesh(tx, tz, world) {
  let near = false;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) near ||= world.caved(tx + dx, tz + dz);
  if (!near) return null;
  const [ci0, cj0] = [tx * TILE_CELLS, tz * TILE_CELLS];
  // Each column's answers, kept for the tile and a border round it.
  const PAD = 3;
  const SIDE = TILE_CELLS + 2 * PAD;
  const kept = (fn) => {
    const values = new Array(SIDE * SIDE);
    return (ci, cj) => {
      const [i, j] = [ci - ci0 + PAD, cj - cj0 + PAD];
      if (i < 0 || j < 0 || i >= SIDE || j >= SIDE) return fn(ci, cj);
      return (values[j * SIDE + i] ??= fn(ci, cj));
    };
  };
  const spans = kept((ci, cj) => world.spans(ci, cj));
  const ground = kept((ci, cj) => world.ground(ci, cj));
  const mouthAt = kept((ci, cj) => world.mouth(ci, cj));
  const state = (ci, cj, y) => {
    for (const s of spans(ci, cj)) if (s.floor <= y && y <= s.ceiling) return CAVE;
    return y > ground(ci, cj) ? SKY : ROCK;
  };
  // Whether the surface runs along the edge between two grid points, and which way it faces: 1
  // toward the second, -1 toward the first, 0 for none.
  const facing = (a, b) => {
    if ((a === CAVE && b === ROCK) || (a === ROCK && b === CAVE)) return a === ROCK ? 1 : -1;
    return 0;
  };

  // The heights the surface could be at in a column's neighbourhood: grid steps from under the
  // lowest floor to over the highest ceiling, or the ground, near a mouth.
  const own = kept((ci, cj) => {
    let [lo, hi] = [Infinity, -Infinity];
    for (const s of spans(ci, cj)) [lo, hi] = [Math.min(lo, s.floor), Math.max(hi, s.ceiling)];
    if (mouthAt(ci, cj)) {
      const g = ground(ci, cj);
      [lo, hi] = [Math.min(lo, g), Math.max(hi, g)];
    }
    return [lo, hi];
  });
  const range = (ci, cj) => {
    let [lo, hi] = [Infinity, -Infinity];
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const [l, h] = own(ci + di, cj + dj);
        [lo, hi] = [Math.min(lo, l), Math.max(hi, h)];
      }
    }
    return lo > hi || !Number.isFinite(lo) || !Number.isFinite(hi) ? null : [Math.floor(lo / STEP_FT) - 1, Math.ceil(hi / STEP_FT) + 1];
  };

  const positions = [];
  const colors = [];
  const themes = [];
  const indices = [];
  // How far up or down from y a column's air reaches, to the nearer of its floor and ceiling, or 0
  // where it's rock.
  const reachAt = (ci, cj, y) => {
    for (const s of spans(ci, cj)) if (s.floor <= y && y <= s.ceiling) return Math.min(y - s.floor, s.ceiling - y);
    return 0;
  };
  // Where a wall crosses from an open column to a solid one beside it at height y, as a share of
  // the way: where the open column's reach would come to nothing, if it shrinks from the column
  // behind it as a round cave's does (its square falling evenly), or halfway without that.
  const wallAt = (open, shut, y) => {
    const near = reachAt(open[0], open[1], y);
    const far = reachAt(2 * open[0] - shut[0], 2 * open[1] - shut[1], y);
    if (!(far > near)) return 0.5;
    return Math.min(0.9, Math.max(0.1, (near * near) / (far * far - near * near)));
  };
  const vertices = new Map(); // grid cube -> vertex
  const cubeKey = (a, b, c) => ((c + 65536) * (SIDE + 8) + b - cj0 + PAD + 4) * (SIDE + 8) + a - ci0 + PAD + 4;
  // Where the surface crosses grid cube (a, b, c), as it is in the tiles: { at: [x, y, z]
  // continent feet, toward: the way to the air, hewn, theme, floor, rim }, or null where it
  // doesn't. The cube's corners are columns a..a+1, b..b+1, heights c..c+1 steps.
  const crossings = new Map();
  const crossing = (a, b, c) => {
    const key = cubeKey(a, b, c);
    if (crossings.has(key)) return crossings.get(key);
    const corners = [];
    const states = [];
    const toward = [0, 0, 0];
    for (let dc = 0; dc <= 1; dc++) {
      for (let db = 0; db <= 1; db++) {
        for (let da = 0; da <= 1; da++) {
          corners.push([a + da, b + db, c + dc]);
          const at = state(a + da, b + db, (c + dc) * STEP_FT);
          states.push(at);
          const way = at === ROCK ? -1 : 1;
          toward[0] += way * (da - 0.5);
          toward[1] += way * (dc - 0.5);
          toward[2] += way * (db - 0.5);
        }
      }
    }
    let [sx, sy, sz, n] = [0, 0, 0, 0];
    let [upY, ups] = [0, 0]; // crossings on the up edges alone
    let floor = false; // whether the vertex is on a span's floor
    const touched = []; // the spans the cube's crossings meet
    for (const [p, q] of CUBE_EDGES) {
      const [u, v] = [corners[p], corners[q]];
      const [su, sv] = [states[p], states[q]];
      if (!facing(su, sv)) continue;
      let y = ((u[2] + v[2]) / 2) * STEP_FT;
      const upright = u[0] === v[0] && u[1] === v[1];
      if (upright) {
        // Up and down: exactly where the span's floor or ceiling, or the ground, is.
        const [lowY, highY] = [u[2] * STEP_FT, v[2] * STEP_FT];
        const span = spans(u[0], u[1]).find((s) => (s.floor >= lowY && s.floor <= highY) || (s.ceiling >= lowY && s.ceiling <= highY));
        if (span) {
          y = span.floor >= lowY && span.floor <= highY && sv === CAVE ? span.floor : span.ceiling;
          if (sv === CAVE && y === span.floor) floor = true;
        }
      }
      for (const w of [u, v]) {
        const span = spans(w[0], w[1]).find((s) => s.floor <= w[2] * STEP_FT + STEP_FT && w[2] * STEP_FT - STEP_FT <= s.ceiling);
        if (span) touched.push(span);
      }
      let [cx, cz] = [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2];
      if (!upright) {
        const [open, shut] = su === CAVE ? [u, v] : [v, u];
        const off = wallAt(open, shut, y);
        [cx, cz] = [open[0] + (shut[0] - open[0]) * off, open[1] + (shut[1] - open[1]) * off];
      }
      sx += cx;
      sz += cz;
      sy += y;
      n++;
      if (upright) [upY, ups] = [upY + y, ups + 1];
    }
    let found = null;
    if (n) {
      let [x, y, z] = [sx / n, sy / n, sz / n];
      const length = Math.hypot(toward[0] * CELL_FT, toward[1] * STEP_FT, toward[2] * CELL_FT) || 1;
      const way = [(toward[0] * CELL_FT) / length, (toward[1] * STEP_FT) / length, (toward[2] * CELL_FT) / length];
      // The stone of the floor, wall or ceiling, as the rock faces.
      const part = stonePart(way[1]);
      const hewn = touched.some((span) => isHewn(span.stone[part]));
      const theme = touched.length ? CAVE_THEMES[themeOf(touched[0].stone[part])] : null;
      // Hewn rock: walls on the columns' edges, floors and ceilings at their heights.
      if (hewn) [x, y, z] = [a + 0.5, ups ? upY / ups : y, b + 0.5];
      // The rim, where the cave reaches the sky by an opened column: on the ground's own corner, so
      // it meets the ground drawn in full.
      const rim = states.includes(SKY) && corners.some(([ci, cj]) => mouthAt(ci, cj));
      if (rim) [x, y, z] = [a + 0.5, world.corner(a + 1, b + 1), b + 0.5];
      found = { at: [(x + 0.5) * CELL_FT, y, (z + 0.5) * CELL_FT], toward: way, hewn, theme: THEME_LOOK[theme] ? theme : CAVE_THEMES[0], floor, rim };
    }
    crossings.set(key, found);
    return found;
  };
  // A crossing drawn toward its neighbours', `passes` times over. Hewn rock and the rim stay where
  // they are.
  const relaxedBy = [new Map()];
  const relaxed = (a, b, c, passes) => {
    const here = crossing(a, b, c);
    if (!passes || here.hewn || here.rim) return here.at;
    const kept = (relaxedBy[passes] ??= new Map());
    const key = cubeKey(a, b, c);
    if (kept.has(key)) return kept.get(key);
    const sum = [0, 0, 0];
    let n = 0;
    for (let dc = -1; dc <= 1; dc++) {
      for (let db = -1; db <= 1; db++) {
        for (let da = -1; da <= 1; da++) {
          if (!crossing(a + da, b + db, c + dc)) continue;
          const p = relaxed(a + da, b + db, c + dc, passes - 1);
          sum[0] += p[0];
          sum[1] += p[1];
          sum[2] += p[2];
          n++;
        }
      }
    }
    const out = sum.map((v) => v / n);
    kept.set(key, out);
    return out;
  };
  const [ox, oz] = [ci0 * CELL_FT, cj0 * CELL_FT];
  // The vertex in grid cube (a, b, c), drawn as its theme draws it.
  const vertex = (a, b, c) => {
    const key = cubeKey(a, b, c);
    const found = vertices.get(key);
    if (found !== undefined) return found;
    const here = crossing(a, b, c);
    const look = THEME_LOOK[here.theme];
    let at = here.at;
    if (!here.hewn && !here.rim) {
      const smooth = relaxed(a, b, c, look.passes);
      at = at.map((v, i) => v + (smooth[i] - v) * look.relax);
      const bump = themeBump(here.theme, at, look) * look.bumpFt;
      at = at.map((v, i) => v + here.toward[i] * bump);
    }
    const index = positions.length / 3;
    positions.push(at[0] - ox, at[1], at[2] - oz);
    themes.push(CAVE_THEMES.indexOf(here.theme));
    const rgb = here.floor ? look.floor : look.rgb;
    const shade = 1 + (hash2(a * 3 + c, b * 5 - c) * 2 - 1) * SHADE;
    colors.push(...rgb.map((v) => Math.min(1, (v / 255) * shade)));
    vertices.set(key, index);
    return index;
  };
  // A face across a grid edge, from the four cubes round it, facing `way` along the edge.
  const quad = (cubes, way) => {
    const [v0, v1, v2, v3] = cubes.map((cube) => vertex(...cube));
    // The cubes run round the edge so that this order faces back along it.
    if (way > 0) indices.push(v0, v2, v1, v0, v3, v2);
    else indices.push(v0, v1, v2, v0, v2, v3);
  };

  for (let j = 0; j < TILE_CELLS; j++) {
    for (let i = 0; i < TILE_CELLS; i++) {
      const [ci, cj] = [ci0 + i, cj0 + j];
      const reachY = range(ci, cj);
      if (!reachY) continue;
      for (let k = reachY[0]; k <= reachY[1]; k++) {
        const here = state(ci, cj, k * STEP_FT);
        // East: the edge to (ci + 1, cj), and the cubes round it.
        const east = state(ci + 1, cj, k * STEP_FT);
        let way = facing(here, east);
        if (way) quad([[ci, cj - 1, k - 1], [ci, cj, k - 1], [ci, cj, k], [ci, cj - 1, k]], way);
        // South: the edge to (ci, cj + 1).
        const south = state(ci, cj + 1, k * STEP_FT);
        way = facing(here, south);
        if (way) quad([[ci - 1, cj, k - 1], [ci - 1, cj, k], [ci, cj, k], [ci, cj, k - 1]], way);
        // Up: the edge to the next step.
        const up = state(ci, cj, (k + 1) * STEP_FT);
        way = facing(here, up);
        if (way) quad([[ci - 1, cj - 1, k], [ci, cj - 1, k], [ci, cj, k], [ci - 1, cj, k]], way);
      }
    }
  }
  if (!indices.length) return null;
  return { positions: Float32Array.from(positions), colors: Float32Array.from(colors), themes: Float32Array.from(themes), indices: Uint32Array.from(indices) };
}

// How far a theme pushes the rock at continent feet [x, y, z], in about [-0.5, 0.5]: broken
// facets for jagged rock, gentle swells for smooth, and level grooves for mined.
function themeBump(theme, [x, y, z], { waveFt }) {
  if (theme === "jagged") return (facets(x + 0.6 * y, z - 0.4 * y, 11, waveFt) + facets(y + 0.3 * z, x - 0.5 * z, 23, waveFt)) * 0.7;
  if (theme === "smooth") return valueNoise((x + 0.4 * y) / waveFt, (z - 0.3 * y) / waveFt, 37) * 0.5;
  if (theme === "mined") return valueNoise((x + z) / (waveFt * 3), y / waveFt, 41) * 0.5;
  return 0;
}

// A grid cube's 12 edges, by its corners' indices (da + 2 db + 4 dc).
const CUBE_EDGES = [
  [0, 1], [2, 3], [4, 5], [6, 7], // along x
  [0, 2], [1, 3], [4, 6], [5, 7], // along z
  [0, 4], [1, 5], [2, 6], [3, 7], // up
];

// The edges of some meshes' triangles that only one triangle has: where the rock's surface ends,
// as at a cave's mouth. Each mesh is { positions, indices, offset: [x, y, z] }, and meshes that
// meet share their edges, so seams between tiles aren't ends. keep(a, b): whether to give the
// edge between continent feet points a and b. Gives segments, [x, y, z, x, y, z] after another.
export function openEdges(meshes, keep = () => true) {
  const key = (p) => p.map((v) => Math.round(v * 100)).join(",");
  const edges = new Map(); // "a|b", ends sorted -> { a, b, count }
  for (const { positions, indices, offset } of meshes) {
    const at = (i) => [positions[i * 3] + offset[0], positions[i * 3 + 1] + offset[1], positions[i * 3 + 2] + offset[2]];
    for (let t = 0; t < indices.length; t += 3) {
      for (let k = 0; k < 3; k++) {
        const [a, b] = [at(indices[t + k]), at(indices[t + ((k + 1) % 3)])];
        const [ka, kb] = [key(a), key(b)];
        if (ka === kb) continue;
        const id = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
        const found = edges.get(id);
        if (found) found.count++;
        else edges.set(id, { a, b, count: 1 });
      }
    }
  }
  const out = [];
  for (const { a, b, count } of edges.values()) if (count === 1 && keep(a, b)) out.push(...a, ...b);
  return out;
}
