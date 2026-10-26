// Distance queries against sketch strokes. Points are [x, z] in feet.

export function makePolyline(points) {
  const segments = [];
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1];
    const [bx, bz] = points[i];
    const len = Math.hypot(bx - ax, bz - az);
    if (len === 0) continue;
    segments.push({ ax, az, dx: (bx - ax) / len, dz: (bz - az) / len, len, start: length });
    length += len;
  }
  const xs = points.map((p) => p[0]);
  const zs = points.map((p) => p[1]);
  const bounds = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
  return { segments, length, bounds };
}

// The nearest point on the polyline: its distance, how far along the line it is, and which side
// the query point is on (+1 left of the drawing direction, -1 right). With x east and z south, the
// left of direction (dx, dz) is (dz, -dx).
export function nearest(line, x, z) {
  let best = { dist: Infinity, along: 0, side: 1 };
  for (const s of line.segments) {
    const px = x - s.ax;
    const pz = z - s.az;
    const t = Math.max(0, Math.min(s.len, px * s.dx + pz * s.dz));
    const dist = Math.hypot(px - t * s.dx, pz - t * s.dz);
    if (dist < best.dist) {
      const side = px * s.dz - pz * s.dx >= 0 ? 1 : -1;
      best = { dist, along: s.start + t, side };
    }
  }
  return best;
}

// The point at a distance along the polyline.
export function pointAt(line, along) {
  for (const s of line.segments) {
    if (along <= s.start + s.len) {
      const t = Math.max(0, along - s.start);
      return [s.ax + s.dx * t, s.az + s.dz * t];
    }
  }
  const s = line.segments[line.segments.length - 1];
  return [s.ax + s.dx * s.len, s.az + s.dz * s.len];
}

// True when (x, z) is within reach of the polyline's bounding box.
export function nearBounds(line, x, z, reach) {
  const [x0, z0, x1, z1] = line.bounds;
  return x > x0 - reach && x < x1 + reach && z > z0 - reach && z < z1 + reach;
}

// Douglas-Peucker: drops points within `tolerance` of the line between those kept.
export function simplify(pts, tolerance) {
  if (pts.length <= 2) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let worst = 0;
  let at = 0;
  for (let k = 1; k < pts.length - 1; k++) {
    const d = distToSegment(pts[k], a, b);
    if (d > worst) [worst, at] = [d, k];
  }
  if (worst <= tolerance) return [a, b];
  return [...simplify(pts.slice(0, at + 1), tolerance).slice(0, -1), ...simplify(pts.slice(at), tolerance)];
}

function distToSegment([x, z], [ax, az], [bx, bz]) {
  const [dx, dz] = [bx - ax, bz - az];
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - (ax + t * dx), z - (az + t * dz));
}
