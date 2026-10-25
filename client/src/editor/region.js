// A zone's region is a multipolygon in continent tile units: a list of polygons, each a list of
// rings (the outline first, then any holes), each ring a list of [x, z] corners, implicitly
// closed. Holes appear where the region surrounds another zone, and a region can come out in
// pieces when another zone cuts across it.
//
// Corners snap to cell corners, so an edge drawn along the grid is exact to the cell.

import polygonClipping from "polygon-clipping";
import { CELLS } from "../world/constants.js";

const EPSILON = 1e-9;

export function snapToCell([x, z]) {
  return [Math.round(x * CELLS) / CELLS, Math.round(z * CELLS) / CELLS];
}

// Every ring with its address in the region: { poly, ring, points }.
export function rings(region) {
  return region.flatMap((polygon, poly) => polygon.map((points, ring) => ({ poly, ring, points })));
}

export function cornerCount(region) {
  return rings(region).reduce((sum, r) => sum + r.points.length, 0);
}

// The region drawn as `outline`, minus every other zone's region. Empty when nothing is left.
export function subtractZones(outline, others) {
  return resubtract([[outline]], others);
}

// Re-applies the subtraction to a region, for when a corner moved or went away. Overlapping
// pieces merge first.
export function resubtract(region, others) {
  if (!region.length) return [];
  const merged = region.length > 1 ? polygonClipping.union(...region.map((p) => [p])) : region;
  const clips = others.filter((r) => r.length);
  const result = clips.length ? polygonClipping.difference(merged, ...clips) : merged;
  return result
    .map((polygon) => polygon.map(openRing).filter((ring) => ring.length >= 3))
    .filter((polygon) => polygon.length && Math.abs(signedArea(polygon[0])) > EPSILON);
}

// polygon-clipping repeats each ring's first corner at the end.
function openRing(ring) {
  const [first, last] = [ring[0], ring[ring.length - 1]];
  return first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring;
}

export function pointInRing([x, z], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInRegion(point, region) {
  return region.some(([outline, ...holes]) => pointInRing(point, outline) && !holes.some((h) => pointInRing(point, h)));
}

// Every tile the region covers some area of: the tiles that can be regenerated or edited for the
// zone. Touching a tile only along an edge or at a corner doesn't count.
export function tilesTouched(region) {
  const all = rings(region).flatMap((r) => r.points);
  if (!all.length) return [];
  const xs = all.map((p) => p[0]);
  const zs = all.map((p) => p[1]);
  const tiles = [];
  for (let tx = Math.floor(Math.min(...xs)); tx < Math.ceil(Math.max(...xs)); tx++) {
    for (let tz = Math.floor(Math.min(...zs)); tz < Math.ceil(Math.max(...zs)); tz++) {
      if (areaInSquare(region, tx, tz) > EPSILON) tiles.push([tx, tz]);
    }
  }
  return tiles;
}

// The region's area inside the unit square at (tx, tz): each outline's clipped area minus its
// holes' clipped areas.
function areaInSquare(region, tx, tz) {
  let sum = 0;
  for (const [outline, ...holes] of region) {
    sum += Math.abs(signedArea(clipToSquare(outline, tx, tz)));
    for (const hole of holes) sum -= Math.abs(signedArea(clipToSquare(hole, tx, tz)));
  }
  return sum;
}

// Sutherland-Hodgman against the square's four sides. The square is convex, so the clipped area
// is right even for concave rings.
function clipToSquare(ring, tx, tz) {
  let pts = ring;
  const planes = [(p) => p[0] - tx, (p) => tx + 1 - p[0], (p) => p[1] - tz, (p) => tz + 1 - p[1]];
  for (const inside of planes) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const da = inside(a);
      const db = inside(b);
      if (da >= 0) out.push(a);
      if (da * db < 0) {
        const t = da / (da - db);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    pts = out;
    if (pts.length < 3) return [];
  }
  return pts;
}

function signedArea(pts) {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[(i + 1) % pts.length];
    sum += ax * bz - bx * az;
  }
  return sum / 2;
}

// The edge nearest a point, across every ring: its ring's address, the index of its first corner,
// the distance, and the nearest point on it.
export function nearestEdge(region, [x, z]) {
  let best = { poly: -1, ring: -1, index: -1, dist: Infinity, point: null };
  for (const { poly, ring, points } of rings(region)) {
    for (let i = 0; i < points.length; i++) {
      const [ax, az] = points[i];
      const [bx, bz] = points[(i + 1) % points.length];
      const dx = bx - ax;
      const dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      const point = [ax + t * dx, az + t * dz];
      const dist = Math.hypot(x - point[0], z - point[1]);
      if (dist < best.dist) best = { poly, ring, index: i, dist, point };
    }
  }
  return best;
}

// A spot well inside the region for its label: the point on a coarse grid over the region's
// bounds that's farthest from any edge.
export function labelPoint(region) {
  const all = rings(region).flatMap((r) => r.points);
  const xs = all.map((p) => p[0]);
  const zs = all.map((p) => p[1]);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const steps = 24;
  let best = { point: all[0], dist: -1 };
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const point = [x0 + ((x1 - x0) * i) / steps, z0 + ((z1 - z0) * j) / steps];
      if (!pointInRegion(point, region)) continue;
      const dist = nearestEdge(region, point).dist;
      if (dist > best.dist) best = { point, dist };
    }
  }
  return best.point;
}
