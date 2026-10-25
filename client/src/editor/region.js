// Region polygons: [[x, z], ...] in continent tile units, implicitly closed. Vertices snap to
// cell corners, so a region's edge is exact to the cell.

import { CELLS } from "../world/constants.js";

export function snapToCell([x, z]) {
  return [Math.round(x * CELLS) / CELLS, Math.round(z * CELLS) / CELLS];
}

export function pointInPolygon([x, z], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i];
    const [xj, zj] = polygon[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// Every tile the region touches: the tiles that can be regenerated or edited for the zone.
export function tilesTouched(polygon) {
  if (polygon.length < 3) return [];
  const xs = polygon.map((p) => p[0]);
  const zs = polygon.map((p) => p[1]);
  const tiles = [];
  for (let tx = Math.floor(Math.min(...xs)); tx < Math.ceil(Math.max(...xs)); tx++) {
    for (let tz = Math.floor(Math.min(...zs)); tz < Math.ceil(Math.max(...zs)); tz++) {
      if (polygonTouchesSquare(polygon, tx, tz)) tiles.push([tx, tz]);
    }
  }
  return tiles;
}

// True when the polygon overlaps the unit square at (tx, tz) by some area. Touching only along an
// edge or at a corner doesn't count. Clips the polygon to the square and measures what's left.
function polygonTouchesSquare(polygon, tx, tz) {
  let pts = polygon;
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
    if (pts.length < 3) return false;
  }
  return Math.abs(area(pts)) > 1e-9;
}

function area(pts) {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[(i + 1) % pts.length];
    sum += ax * bz - bx * az;
  }
  return sum / 2;
}

// The index of the edge (from vertex i to i + 1) nearest a point, with its distance.
export function nearestEdge(polygon, [x, z]) {
  let best = { index: -1, dist: Infinity };
  for (let i = 0; i < polygon.length; i++) {
    const [ax, az] = polygon[i];
    const [bx, bz] = polygon[(i + 1) % polygon.length];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    const dist = Math.hypot(x - (ax + t * dx), z - (az + t * dz));
    if (dist < best.dist) best = { index: i, dist };
  }
  return best;
}
