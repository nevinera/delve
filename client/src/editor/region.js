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
  return Math.abs(signedArea(pts)) > 1e-9;
}

// The index of the edge (from vertex i to i + 1) nearest a point, its distance, and the nearest
// point on it.
export function nearestEdge(polygon, [x, z]) {
  let best = { index: -1, dist: Infinity, point: null };
  for (let i = 0; i < polygon.length; i++) {
    const [ax, az] = polygon[i];
    const [bx, bz] = polygon[(i + 1) % polygon.length];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    const point = [ax + t * dx, az + t * dz];
    const dist = Math.hypot(x - point[0], z - point[1]);
    if (dist < best.dist) best = { index: i, dist, point };
  }
  return best;
}

const EPSILON = 1e-6;

// True when two regions share some area. Regions may share edges and corners, including a corner
// that sits partway along the other region's edge.
export function overlaps(a, b) {
  if (a.length < 3 || b.length < 3) return false;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (segmentsCross(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return true;
    }
  }
  // With no crossings the boundaries only touch, so the regions overlap exactly when the ground
  // just inside one region's edge is inside the other.
  return insideNearEdges(a, b) || insideNearEdges(b, a);
}

function insideNearEdges(a, b) {
  // In (x, z) taken as plain math axes, a positive shoelace area means the interior is to the
  // left of each edge, which is (-dz, dx).
  const sign = Math.sign(signedArea(a));
  for (let i = 0; i < a.length; i++) {
    const [ax, az] = a[i];
    const [bx, bz] = a[(i + 1) % a.length];
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const nx = (-(bz - az) / len) * sign * 1e-4;
    const nz = ((bx - ax) / len) * sign * 1e-4;
    for (const t of [0.25, 0.5, 0.75]) {
      const p = [ax + (bx - ax) * t + nx, az + (bz - az) * t + nz];
      if (pointInPolygon(p, b) && nearestEdge(b, p).dist > EPSILON) return true;
    }
  }
  return false;
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

// Proper crossings only: segments that touch at an end or run along each other don't count.
function segmentsCross(a, b, c, d) {
  const side = (p, q, r) => {
    const v = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    return Math.abs(v) < EPSILON ? 0 : Math.sign(v);
  };
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}
