import { hash2, facets, valueNoise } from "../world/noise.js";
import { WALK_DEG } from "./growth.js";
import { CAVE_THEMES, TILE_COLUMNS, VOXEL_FT, floorAt, smoothFloor, stonePart, themeOf } from "../v2/caves.js";

// Mesh data for a tile's caves (v2/caves.js), without three.js, so it can be tested. The rock's
// surface runs between the air of the caves' spans and the rock round them, smoothed by surface
// nets: a grid of points at the columns' middles, every STEP_FT up, a vertex in each grid cube
// the surface passes through, at the mean of where it crosses the cube's edges, and a face across
// each grid edge it crosses. Up and down, a crossing is exactly at a floor or ceiling. Across,
// between an open column and a solid one, it's where the open column's height would run out,
// going by how it shrinks from the column behind it (wallAt), so walls aren't held to the
// columns' grid. A floor's vertex is on the smooth floor walked on (v2/caves.js's floorAt),
// not the voxels' steps, so feet meet it. Faces look into the air, so from outside a cave its rock
// isn't drawn.
//
// Floors that can be walked on, no steeper than WALK_DEG, are drawn lighter (THEME_LOOK's floor),
// and all else the rock's own color, so you can see where you can go; the colors blend across
// the faces between.
//
// Each theme draws the rock its own way (THEME_LOOK): vertices are drawn toward their
// neighbours', rounding off the columns' grid, then pushed in or out by noise along the way the
// rock faces. Both come from the tiles alone, never from the mesh, so tiles agree at seams.
//
// Round where a cave opens through the ground (a mouth: ground inside a span's air), the caves
// draw the ground too, in a band of the ground's cells (world.band), which the ground's full tiles
// leave out. There the ground is a face over each column that isn't open, on the ground's own
// heights at the columns' corners, and the cave's rim, its vertices in cubes that reach the sky,
// sits on those corners too, so the two are one surface. The band's columns nest in the ground's
// cells, so its edge lies on the ground's cells' edges and meets the ground drawn round it.
//
// The mesh covers the tile's grid edges, and reaches to its east and south neighbours' columns,
// so tiles meet without gaps. Positions are feet from the tile's northwest corner.
//
// world: what a mesh needs to know, by continent column (ci, cj), VOXEL_FT square: spans(ci, cj),
// lowest first; ground(ci, cj), the ground's height at its middle, -Infinity where it's not known;
// corner(ci, cj), at its northwest corner; band(ci, cj), whether the caves draw the ground there;
// groundLook(ci, cj), the ground's color and normal at the column's northwest corner, { color,
// normal }; and caved(tx, tz), whether a tile has any caves.

const STEP_FT = VOXEL_FT;
const ROCK = 0;
const CAVE = 1;
const SKY = 2;
// relax: how far toward its neighbours' a vertex is drawn (passes: how many times over); bumpFt:
// how far noise pushes it in or out, the noise's features about waveFt apart.
export const THEME_LOOK = {
  jagged: { rgb: [112, 104, 96], floor: [142, 132, 118], relax: 0.25, passes: 1, bumpFt: 2.4, waveFt: 5 },
  smooth: { rgb: [118, 110, 100], floor: [148, 138, 122], relax: 1, passes: 2, bumpFt: 0.4, waveFt: 12 },
  carved: { rgb: [146, 134, 114], floor: [176, 162, 136], relax: 1, passes: 1, bumpFt: 0, waveFt: 1 },
  mined: { rgb: [104, 96, 88], floor: [134, 124, 110], relax: 0.8, passes: 1, bumpFt: 0.7, waveFt: 3 },
};
const SHADE = 0.1; // how much each vertex's color varies, lighter or darker
const WALK_SLOPE = Math.tan((WALK_DEG * Math.PI) / 180);
const BLEND_FLOORS = true; // whether floor and rock colors blend across faces, or each face is one or the other

// Whether column (ci, cj)'s ground lies in a cave's air.
export function opensAt(world, ci, cj) {
  const h = world.ground(ci, cj);
  return world.spans(ci, cj).some((s) => s.floor < h && h < s.ceiling);
}

// Tile (tx, tz)'s cave rock as { positions, colors, themes, indices }, or null where there's none.
export function caveMesh(tx, tz, world) {
  let near = false;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) near ||= world.caved(tx + dx, tz + dz);
  if (!near) return null;
  const [ci0, cj0] = [tx * TILE_COLUMNS, tz * TILE_COLUMNS];
  // Each column's answers, kept for the tile and a border round it.
  const PAD = 3;
  const SIDE = TILE_COLUMNS + 2 * PAD;
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
  const bandAt = kept((ci, cj) => world.band(ci, cj));
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
  // lowest floor to over the highest ceiling, or the ground, in the band round a mouth.
  const own = kept((ci, cj) => {
    let [lo, hi] = [Infinity, -Infinity];
    for (const s of spans(ci, cj)) [lo, hi] = [Math.min(lo, s.floor), Math.max(hi, s.ceiling)];
    if (bandAt(ci, cj)) {
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
  const rockColors = []; // each vertex's color as rock, and whether it's on a floor walked on
  const walkable = [];
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
  // continent feet, toward: the way to the air, theme, floor, rim }, or null where it
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
    let floor = null; // the span whose floor the vertex is on, if it's on one
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
          if (sv === CAVE && y === span.floor) floor = span;
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
    }
    let found = null;
    if (n) {
      let [x, y, z] = [sx / n, sy / n, sz / n];
      const length = Math.hypot(toward[0] * VOXEL_FT, toward[1] * STEP_FT, toward[2] * VOXEL_FT) || 1;
      const way = [(toward[0] * VOXEL_FT) / length, (toward[1] * STEP_FT) / length, (toward[2] * VOXEL_FT) / length];
      // The stone of the floor, wall or ceiling, as the rock faces.
      const part = stonePart(way[1]);
      const theme = touched.length ? CAVE_THEMES[themeOf(touched[0].stone[part])] : null;
      // The rim, where the cave reaches the sky in the band round a mouth: on the ground's own
      // corner, where the ground drawn with it has its corner.
      const rim = states.includes(SKY) && corners.some(([ci, cj]) => bandAt(ci, cj));
      if (rim) [x, y, z] = [a + 0.5, world.corner(a + 1, b + 1), b + 0.5];
      found = { at: [(x + 0.5) * VOXEL_FT, y, (z + 0.5) * VOXEL_FT], toward: way, theme: THEME_LOOK[theme] ? theme : CAVE_THEMES[0], floor, rim };
    }
    crossings.set(key, found);
    return found;
  };
  // A crossing drawn toward its neighbours', `passes` times over. The rim stays where it is.
  const relaxedBy = [new Map()];
  const relaxed = (a, b, c, passes) => {
    const here = crossing(a, b, c);
    if (!passes || here.rim) return here.at;
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
  // Floors smoothed, kept by column and floor.
  const smoothed = new Map();
  const smoothOf = (at, ci, cj, span) => {
    const key = `${ci},${cj},${span.floor}`;
    if (!smoothed.has(key)) smoothed.set(key, smoothFloor(at, ci, cj, span));
    return smoothed.get(key);
  };
  const [ox, oz] = [ci0 * VOXEL_FT, cj0 * VOXEL_FT];
  // The vertex in grid cube (a, b, c), drawn as its theme draws it.
  const vertex = (a, b, c) => {
    const key = cubeKey(a, b, c);
    const found = vertices.get(key);
    if (found !== undefined) return found;
    const here = crossing(a, b, c);
    const look = THEME_LOOK[here.theme];
    let at = here.at;
    if (!here.rim) {
      const smooth = relaxed(a, b, c, look.passes);
      at = at.map((v, i) => v + (smooth[i] - v) * look.relax);
      const bump = themeBump(here.theme, at, look) * look.bumpFt;
      at = at.map((v, i) => v + here.toward[i] * bump);
      // A floor's on the floor walked on.
      if (here.floor) at = [at[0], floorAt(spans, at[0], at[2], here.floor, smoothOf), at[2]];
    }
    const index = positions.length / 3;
    positions.push(at[0] - ox, at[1], at[2] - oz);
    themes.push(CAVE_THEMES.indexOf(here.theme));
    const walked = (x, z) => floorAt(spans, x, z, here.floor, smoothOf);
    const steep = here.floor && Math.hypot(walked(at[0] + 1, at[2]) - walked(at[0] - 1, at[2]), walked(at[0], at[2] + 1) - walked(at[0], at[2] - 1)) / 2 > WALK_SLOPE;
    const rgb = here.floor && !steep ? look.floor : look.rgb;
    const shade = 1 + (hash2(a * 3 + c, b * 5 - c) * 2 - 1) * SHADE;
    colors.push(...rgb.map((v) => Math.min(1, (v / 255) * shade)));
    rockColors.push(...look.rgb.map((v) => Math.min(1, (v / 255) * shade)));
    walkable.push(here.floor && !steep);
    vertices.set(key, index);
    return index;
  };
  // A face across a grid edge, from the four cubes round it, facing `way` along the edge, but for
  // one lying on the ground.
  const quad = (cubes, way) => {
    // A face all on the rim lies on the ground, which is drawn there already.
    if (cubes.every((cube) => crossing(...cube).rim)) return;
    const [v0, v1, v2, v3] = cubes.map((cube) => vertex(...cube));
    // The cubes run round the edge so that this order faces back along it.
    if (way > 0) indices.push(v0, v2, v1, v0, v3, v2);
    else indices.push(v0, v1, v2, v0, v2, v3);
  };

  for (let j = 0; j < TILE_COLUMNS; j++) {
    for (let i = 0; i < TILE_COLUMNS; i++) {
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
  const surface = bandGround(tx, tz, world);
  if (!indices.length && !surface) return null;
  const mesh = { positions: Float32Array.from(positions), colors: Float32Array.from(colors), themes: Float32Array.from(themes), indices: Uint32Array.from(indices), ground: surface };
  return BLEND_FLOORS ? mesh : unblended(mesh, rockColors, walkable);
}

// A mesh with each face floor or rock, not blending: floor where its corners are all on floor
// walked on and it's no steeper than WALK_DEG itself, and rock otherwise. Its faces keep their own
// corners, with the normals the shared corners had, so it's lit as smoothly.
function unblended({ positions, colors, themes, indices, ground }, rockColors, walkable) {
  const normals = new Float32Array(positions.length);
  const corner = (i) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
  const faceNormal = (t) => {
    const [p, q, r] = [0, 1, 2].map((k) => corner(indices[t + k]));
    const [u, v] = [q.map((x, k) => x - p[k]), r.map((x, k) => x - p[k])];
    return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  };
  for (let t = 0; t < indices.length; t += 3) {
    const n = faceNormal(t);
    for (let k = 0; k < 3; k++) for (let m = 0; m < 3; m++) normals[indices[t + k] * 3 + m] += n[m];
  }
  const walkCos = Math.cos((WALK_DEG * Math.PI) / 180);
  const out = { positions: new Float32Array(indices.length * 3), colors: new Float32Array(indices.length * 3), normals: new Float32Array(indices.length * 3), themes: new Float32Array(indices.length), indices: Uint32Array.from(indices.keys()), ground };
  for (let t = 0; t < indices.length; t += 3) {
    const n = faceNormal(t);
    const floor = [0, 1, 2].every((k) => walkable[indices[t + k]]) && n[1] / (Math.hypot(...n) || 1) >= walkCos;
    for (let k = 0; k < 3; k++) {
      const i = indices[t + k];
      const length = Math.hypot(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]) || 1;
      for (let m = 0; m < 3; m++) {
        out.positions[(t + k) * 3 + m] = positions[i * 3 + m];
        out.colors[(t + k) * 3 + m] = (floor ? colors : rockColors)[i * 3 + m];
        out.normals[(t + k) * 3 + m] = normals[i * 3 + m] / length;
      }
      out.themes[t + k] = themes[i];
    }
  }
  return out;
}

// The ground the caves draw in tile (tx, tz), in the band round mouths, as { positions, colors,
// normals, indices }, or null where there's none: a face over each column whose ground isn't in a
// cave's air, its corners on the ground's own heights.
export function bandGround(tx, tz, world) {
  const [ci0, cj0] = [tx * TILE_COLUMNS, tz * TILE_COLUMNS];
  const [positions, colors, normals, indices] = [[], [], [], []];
  for (let j = 0; j < TILE_COLUMNS; j++) {
    for (let i = 0; i < TILE_COLUMNS; i++) {
      const [ci, cj] = [ci0 + i, cj0 + j];
      if (!world.band(ci, cj) || opensAt(world, ci, cj)) continue;
      const n = positions.length / 3;
      for (const [di, dj] of [[0, 0], [0, 1], [1, 1], [1, 0]]) {
        const { color, normal } = world.groundLook(ci + di, cj + dj);
        positions.push((i + di) * VOXEL_FT, world.corner(ci + di, cj + dj), (j + dj) * VOXEL_FT);
        colors.push(...color);
        normals.push(...normal);
      }
      indices.push(n, n + 1, n + 2, n, n + 2, n + 3);
    }
  }
  if (!indices.length) return null;
  return { positions: Float32Array.from(positions), colors: Float32Array.from(colors), normals: Float32Array.from(normals), indices: Uint32Array.from(indices) };
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

// Tile (tx, tz)'s cave rock as its voxels, as caveMesh gives it but blocky: a face on each side of
// each VOXEL_FT cube of air whose neighbour is rock, runs of faces up a column's side joined into
// one. Air over the ground isn't the caves', so it has no faces against it. Each face is flat,
// shaded a little lighter or darker than its neighbours so the blocks show. The ground in the band
// round mouths is drawn as caveMesh draws it (bandGround).
export function caveBlocks(tx, tz, world) {
  const surface = bandGround(tx, tz, world);
  if (!world.caved(tx, tz)) return surface && { positions: new Float32Array(), colors: new Float32Array(), themes: new Float32Array(), indices: new Uint32Array(), ground: surface };
  const [ci0, cj0] = [tx * TILE_COLUMNS, tz * TILE_COLUMNS];
  const positions = [];
  const colors = [];
  const themes = [];
  const indices = [];
  // Whether the voxel whose middle is at height y in column (ci, cj) is open: air or sky.
  const open = (ci, cj, y) => y > world.ground(ci, cj) || world.spans(ci, cj).some((s) => s.floor < y && y < s.ceiling);
  const face = (corners, span, part, shade) => {
    const theme = CAVE_THEMES[themeOf(span.stone[part])];
    const look = THEME_LOOK[theme] ?? THEME_LOOK[CAVE_THEMES[0]];
    const rgb = (part === 2 ? look.floor : look.rgb).map((v) => Math.min(1, (v / 255) * (1 + shade * SHADE)));
    const n = positions.length / 3;
    for (const [x, y, z] of corners) {
      positions.push(x * VOXEL_FT, y, z * VOXEL_FT);
      colors.push(...rgb);
      themes.push(CAVE_THEMES.indexOf(theme));
    }
    indices.push(n, n + 1, n + 2, n, n + 2, n + 3);
  };
  const SIDES = [
    [1, 0, (i, j) => [[i + 1, j], [i + 1, j + 1]]],
    [-1, 0, (i, j) => [[i, j + 1], [i, j]]],
    [0, 1, (i, j) => [[i + 1, j + 1], [i, j + 1]]],
    [0, -1, (i, j) => [[i, j], [i + 1, j]]],
  ];
  for (let j = 0; j < TILE_COLUMNS; j++) {
    for (let i = 0; i < TILE_COLUMNS; i++) {
      const [ci, cj] = [ci0 + i, cj0 + j];
      const ground = world.ground(ci, cj);
      const shade = (k) => hash2(ci * 7 + k, cj * 13 - k) * 2 - 1;
      for (const span of world.spans(ci, cj)) {
        // The floor, facing up, and the ceiling, facing down, under the ground.
        if (!open(ci, cj, span.floor - VOXEL_FT / 2)) face([[i, span.floor, j], [i, span.floor, j + 1], [i + 1, span.floor, j + 1], [i + 1, span.floor, j]], span, 2, shade(span.floor));
        if (span.ceiling < ground && !open(ci, cj, span.ceiling + VOXEL_FT / 2)) face([[i, span.ceiling, j], [i + 1, span.ceiling, j], [i + 1, span.ceiling, j + 1], [i, span.ceiling, j + 1]], span, 0, shade(span.ceiling));
        // Each side, in runs of voxels whose neighbour that way is rock.
        for (const [di, dj, edge] of SIDES) {
          const [[ax, az], [bx, bz]] = edge(i, j);
          let start = null;
          const top = Math.min(span.ceiling, Math.max(span.floor, Math.ceil(ground / VOXEL_FT) * VOXEL_FT));
          for (let y = span.floor; y <= top; y += VOXEL_FT) {
            const shut = y < top && !open(ci + di, cj + dj, y + VOXEL_FT / 2);
            if (shut && start === null) start = y;
            if (!shut && start !== null) {
              face([[ax, start, az], [bx, start, bz], [bx, y, bz], [ax, y, az]], span, 1, shade(start + di * 3 + dj * 5));
              start = null;
            }
          }
        }
      }
    }
  }
  if (!indices.length && !surface) return null;
  return { positions: Float32Array.from(positions), colors: Float32Array.from(colors), themes: Float32Array.from(themes), indices: Uint32Array.from(indices), ground: surface };
}
