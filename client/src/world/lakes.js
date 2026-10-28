import { TILE_FT } from "./constants.js";

// Lakes, pools and ponds as the sketch keeps them (plans/water.md): a seed and a water level. A
// lake's shape isn't kept: it's the ground below its level that joins up with the seed, found on a
// lattice LAKE_STEP_FT apart, so it follows the land as the land changes.

export const LAKE_STEP_FT = 16;
const STEP_FT = LAKE_STEP_FT;
// A lake is cut short at this many lattice points (about 15 million square feet), and counts as
// spilling. A seed just above the water, on the shore, finds it within SEED_REACH points.
const MAX_POINTS = 60000;
const SEED_REACH = 4;
const AROUND = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// The ground under a lake, { cells, region, status }. cells are lattice points [i, j], each the
// STEP_FT square round (i, j) * STEP_FT; region is their outline as polygons of rings in tile
// units (outline). status is "ok", "spills" (it reaches the sea or its size limit) or "dry" (the
// ground round its seed is above its level). heightAt(xFt, zFt) is the ground, below 0 at sea.
// lake: { seed: [x, z] tile units, level ft }.
export function fillLake(heightAt, { seed, level }) {
  const ground = ([i, j]) => heightAt(i * STEP_FT, j * STEP_FT);
  const [si, sj] = seed.map((v) => Math.round((v * TILE_FT) / STEP_FT));
  // The seed itself, or else the lowest point of the nearest ring round it with ground below the
  // level, so the fill never hops past nearer ground into another hollow.
  let start = [si, sj];
  for (let r = 1; r <= SEED_REACH && !(ground(start) < level); r++) {
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const c = [si + di, sj + dj];
        if (ground(c) < ground(start)) start = c;
      }
    }
  }
  if (!(ground(start) < level)) return { cells: [], region: [], status: "dry" };
  const key = ([i, j]) => `${i},${j}`;
  const seen = new Set([key(start)]);
  const cells = [];
  // Breadth first, so a lake cut short at its limit is a round patch about its seed.
  const queue = [start];
  let status = "ok";
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q];
    const h = ground(c);
    if (h < 0) {
      status = "spills";
      continue;
    }
    cells.push(c);
    if (cells.length >= MAX_POINTS) {
      status = "spills";
      break;
    }
    for (const [di, dj] of AROUND) {
      const n = [c[0] + di, c[1] + dj];
      if (seen.has(key(n))) continue;
      seen.add(key(n));
      if (ground(n) < level) queue.push(n);
    }
  }
  return { cells, region: outline(cells), status };
}

// A point well inside a region (polygons of rings), for a lake's seed: of a grid of points across
// it, the one inside that's furthest from its edges.
export function interiorPoint(region) {
  const points = region.flat(2);
  const xs = points.map(([x]) => x);
  const zs = points.map(([, z]) => z);
  const [x0, z0, x1, z1] = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
  const edges = region.flat().flatMap((ring) => ring.map((a, k) => [a, ring[(k + 1) % ring.length]]));
  let best = null;
  let bestDist = -1;
  const n = 24;
  for (let b = 0; b <= n; b++) {
    for (let a = 0; a <= n; a++) {
      const p = [x0 + ((x1 - x0) * a) / n, z0 + ((z1 - z0) * b) / n];
      if (!region.some(([outer, ...holes]) => inRing(p, outer) && !holes.some((h) => inRing(p, h)))) continue;
      const dist = Math.min(...edges.map(([a, b]) => toSegment(p, a, b)));
      if (dist > bestDist) [best, bestDist] = [p, dist];
    }
  }
  return (best ?? [(x0 + x1) / 2, (z0 + z1) / 2]).map(round);
}

function toSegment([x, z], [ax, az], [bx, bz]) {
  const [dx, dz] = [bx - ax, bz - az];
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - (ax + t * dx), z - (az + t * dz));
}

// The outline of a set of lattice cells (each a STEP_FT square round its point), as polygons of
// rings in tile units: an outer ring, then any islands, each rounded off a little.
export function outline(cells) {
  const key = (i, j) => `${i},${j}`;
  const inside = new Set(cells.map(([i, j]) => key(i, j)));
  // Each cell side with open ground beyond it, running clockwise round the cells (x east, z
  // south), from corner to corner. Corner (i, j) is the cell's top-left.
  const edges = new Map();
  const add = (a, b) => {
    const k = key(...a);
    if (!edges.has(k)) edges.set(k, []);
    edges.get(k).push(b);
  };
  for (const [i, j] of cells) {
    if (!inside.has(key(i, j - 1))) add([i, j], [i + 1, j]);
    if (!inside.has(key(i + 1, j))) add([i + 1, j], [i + 1, j + 1]);
    if (!inside.has(key(i, j + 1))) add([i + 1, j + 1], [i, j + 1]);
    if (!inside.has(key(i - 1, j))) add([i, j + 1], [i, j]);
  }
  const rings = [];
  for (const [start, ends] of edges) {
    while (ends.length) {
      const ring = [];
      let at = start.split(",").map(Number);
      do {
        ring.push(at);
        const out = edges.get(key(...at));
        at = out.pop();
      } while (key(...at) !== start);
      rings.push(ring);
    }
  }
  const toTiles = (ring) => smoothRing(dropStraights(ring)).map(([x, z]) => [round(((x - 0.5) * STEP_FT) / TILE_FT), round(((z - 0.5) * STEP_FT) / TILE_FT)]);
  // Clockwise on screen (positive area with z south) goes round the outside of the cells.
  const outers = rings.filter((r) => area(r) > 0);
  const holes = rings.filter((r) => area(r) < 0);
  return outers.map((outer) => [toTiles(outer), ...holes.filter((h) => inRing(h[0], outer)).map(toTiles)]);
}

function dropStraights(ring) {
  return ring.filter((p, k) => {
    const a = ring[(k + ring.length - 1) % ring.length];
    const b = ring[(k + 1) % ring.length];
    return (p[0] - a[0]) * (b[1] - p[1]) !== (p[1] - a[1]) * (b[0] - p[0]);
  });
}

function smoothRing(ring) {
  return ring.flatMap((a, k) => {
    const b = ring[(k + 1) % ring.length];
    return [[0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]];
  });
}

function area(ring) {
  let sum = 0;
  ring.forEach(([x0, z0], k) => {
    const [x1, z1] = ring[(k + 1) % ring.length];
    sum += x0 * z1 - x1 * z0;
  });
  return sum / 2;
}

// Whether a point is inside a region, polygons of rings as outline gives them.
export function inRegion(p, region) {
  return region.some(([outer, ...holes]) => inRing(p, outer) && !holes.some((h) => inRing(p, h)));
}

function inRing([x, z], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

const round = (v) => Math.round(v * 1000) / 1000;
