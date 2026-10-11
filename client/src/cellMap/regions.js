// Outlines of the areas a terrain covers, as closed loops, then smoothed so
// the hexes they're made of don't show.
import {hexRadius, neighbor} from "./hexGrid";
import {hash01, pointHash01} from "./random";
import {terrainAt} from "./format";

// Regions run this many cells past the grid (copying its edge cells), so
// their outlines - and the smoothing's pull on them - stay off the map.
export const PAD = 2;

// Corners in a lattice of (r/2, s/2) steps, r the corner radius and s the
// cell size, so neighboring cells agree on them exactly.
const CORNER_STEPS = [[2, 0], [1, 1], [-1, 1], [-2, 0], [-1, -1], [1, -1]];

export function latticeCorner(col, row, i) {
  const [dx, dy] = CORNER_STEPS[i];
  return [2 + 3 * col + dx, 1 + 2 * row + (col & 1) + dy];
}

// Each loop is a list of lattice points, clockwise on screen around the
// terrain (counterclockwise around holes in it).
// Cells skip says yes to are left out of the region.
export function regionLoops(map, terrain, skip = () => false) {
  const {cols, rows} = map.grid;
  const inDomain = (c, r) => c >= -PAD && c < cols + PAD && r >= -PAD && r < rows + PAD;
  const isTerrain = (c, r) => inDomain(c, r) && terrainAt(map, c, r) === terrain && !skip(c, r);

  const next = new Map();
  for (let c = -PAD; c < cols + PAD; c++) {
    for (let r = -PAD; r < rows + PAD; r++) {
      if (!isTerrain(c, r)) continue;
      for (let i = 0; i < 6; i++) {
        if (isTerrain(...neighbor(c, r, i))) continue;
        const a = latticeCorner(c, r, i);
        next.set(a.join(","), latticeCorner(c, r, (i + 1) % 6));
      }
    }
  }

  const loops = [];
  for (const startKey of next.keys()) {
    if (!next.has(startKey)) continue;
    const loop = [];
    let key = startKey;
    while (next.has(key)) {
      const point = next.get(key);
      next.delete(key);
      loop.push(point);
      key = point.join(",");
    }
    loops.push(loop);
  }
  return loops;
}

// How far each smoothing pass moves points, in corner radii.
const IRREGULARITY = 0.32;
const ROUGHNESS = 0.12;
const CHAIKIN_PASSES = 2;

// A loop of lattice points as a smoothed loop of {x, y} in feet. Points are
// moved by a hash of where they are, so shared edits stay local.
export function smoothLoop(loop, cellSize, seed, {irregularity = IRREGULARITY, roughness = ROUGHNESS} = {}) {
  const r = hexRadius(cellSize);
  // ids are lattice points scaled by 4, so midpoints of midpoints stay integers.
  let points = loop.map(([lx, ly]) => ({id: [lx * 4, ly * 4], x: (lx * r) / 2, y: (ly * cellSize) / 2}));
  points = jitter(subdivide(points), r * irregularity, seed, 1);
  points = jitter(subdivide(points), r * roughness, seed, 2);
  let out = points.map(({x, y}) => ({x, y}));
  for (let i = 0; i < CHAIKIN_PASSES; i++) out = chaikin(out);
  return out.map((p) => warp(p, seed));
}

// A loop of lattice points as a round, gently wobbling curve of {x, y} in
// feet, for shores: through its edges' middles, averaged until the hexes
// are gone. Wobbles are hashed from where they are, as in smoothLoop.
export function softLoop(loop, cellSize, seed, {passes = 4, wobble = 0.3} = {}) {
  const r = hexRadius(cellSize);
  const n = loop.length;
  let points = loop.map(([ax, ay], i) => {
    const [bx, by] = loop[(i + 1) % n];
    const [x, y] = [((ax + bx) * r) / 4, ((ay + by) * cellSize) / 4];
    return {
      x: x + (pointHash01(seed, ax + bx, ay + by, 7) - 0.5) * 2 * wobble * r,
      y: y + (pointHash01(seed, ax + bx, ay + by, 8) - 0.5) * 2 * wobble * r,
    };
  });
  for (let pass = 0; pass < passes; pass++) {
    points = points.map((p, i) => {
      const a = points[(i + n - 1) % n];
      const b = points[(i + 1) % n];
      return {x: (a.x + 2 * p.x + b.x) / 4, y: (a.y + 2 * p.y + b.y) / 4};
    });
  }
  return chaikin(points).map((p) => warp(p, seed));
}

// A slow drift over the whole map, so edges along a row or column of
// cells (and long trails) bend rather than run ruler-straight. It's a
// function of where a point is, so lines that share points still meet.
// Two layers of smooth noise: wavelengths and amounts in feet.
const WARP = [
  {wavelength: 20, amount: 2},
  {wavelength: 7, amount: 0.7},
];

export function warp({x, y}, seed) {
  let dx = 0;
  let dy = 0;
  WARP.forEach(({wavelength, amount}, layer) => {
    dx += (noise(seed, x / wavelength, y / wavelength, 400 + layer * 2) - 0.5) * 2 * amount;
    dy += (noise(seed, x / wavelength, y / wavelength, 401 + layer * 2) - 0.5) * 2 * amount;
  });
  return {x: x + dx, y: y + dy};
}

// The point warp moves to p, found by stepping back from it (the warp
// bends gently enough for that to settle quickly).
export function unwarp(p, seed) {
  let q = p;
  for (let i = 0; i < 8; i++) {
    const w = warp(q, seed);
    q = {x: q.x + p.x - w.x, y: q.y + p.y - w.y};
  }
  return q;
}

// Value noise in [0, 1): hashed lattice values, smoothly blended.
export function noise(seed, u, v, salt) {
  const [i, j] = [Math.floor(u), Math.floor(v)];
  const ease = (t) => t * t * (3 - 2 * t);
  const [s, t] = [ease(u - i), ease(v - j)];
  const at = (a, b) => hash01(seed, i + a, j + b, salt);
  const top = at(0, 0) + (at(1, 0) - at(0, 0)) * s;
  const bottom = at(0, 1) + (at(1, 1) - at(0, 1)) * s;
  return top + (bottom - top) * t;
}

function subdivide(points) {
  return points.flatMap((p, i) => {
    const q = points[(i + 1) % points.length];
    return [p, {id: [(p.id[0] + q.id[0]) / 2, (p.id[1] + q.id[1]) / 2], x: (p.x + q.x) / 2, y: (p.y + q.y) / 2}];
  });
}

function jitter(points, amount, seed, salt) {
  return points.map(({id, x, y}) => ({
    id,
    x: x + (pointHash01(seed, id[0], id[1], salt) - 0.5) * 2 * amount,
    y: y + (pointHash01(seed, id[0], id[1], salt + 100) - 0.5) * 2 * amount,
  }));
}

export function chaikin(points) {
  return points.flatMap((p, i) => {
    const q = points[(i + 1) % points.length];
    return [
      {x: 0.75 * p.x + 0.25 * q.x, y: 0.75 * p.y + 0.25 * q.y},
      {x: 0.25 * p.x + 0.75 * q.x, y: 0.25 * p.y + 0.75 * q.y},
    ];
  });
}

// Moves each point of a loop toward the inside of its terrain - the right
// of its direction of travel, since loops go clockwise on screen.
export function insetLoop(loop, distance) {
  const n = loop.length;
  return loop.map((p, i) => {
    const a = loop[(i + n - 1) % n];
    const b = loop[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    return {x: p.x - (dy / l) * distance, y: p.y + (dx / l) * distance};
  });
}
