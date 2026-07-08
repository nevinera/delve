const WALL_HALF_THICKNESS = 0.2; // feet; matches server wallHalfThickness and visual rendering

function pushOutOfSegment(px, py, r, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return [px, py];
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const cx = ax + t * dx, cy = ay + t * dy;
  const ex = px - cx, ey = py - cy;
  const dist = Math.sqrt(ex * ex + ey * ey);
  if (dist >= r) return [px, py];
  if (dist === 0) {
    const len = Math.sqrt(lenSq);
    return [px + (-dy / len) * r, py + (dx / len) * r];
  }
  const overlap = r - dist;
  return [px + (ex / dist) * overlap, py + (ey / dist) * overlap];
}

function pushOutOfCircle(px, py, r, cx, cy, barrierR) {
  const dx = px - cx, dy = py - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const minDist = r + barrierR;
  if (dist >= minDist) return [px, py];
  if (dist === 0) return [px, py + minDist];
  const overlap = minDist - dist;
  return [px + (dx / dist) * overlap, py + (dy / dist) * overlap];
}

// Apply all barrier collisions for a unit at (px, py) with collision radius r.
// barriers is the array from the zone config for the unit's current map.
export function resolveBarrierCollisions(px, py, r, barriers) {
  for (const barrier of barriers) {
    if (barrier.type === "wall") {
      const locs = barrier.locations;
      if (!locs || locs.length < 2) continue;
      for (let i = 0; i < locs.length - 1; i++) {
        [px, py] = pushOutOfSegment(
          px, py, r + WALL_HALF_THICKNESS,
          locs[i].x, locs[i].y,
          locs[i + 1].x, locs[i + 1].y
        );
      }
    } else if (barrier.type === "circle") {
      if (!barrier.location) continue;
      [px, py] = pushOutOfCircle(px, py, r, barrier.location.x, barrier.location.y, barrier.radius ?? 0);
    }
  }
  return [px, py];
}
