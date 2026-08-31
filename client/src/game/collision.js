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

function cross(ax, ay, bx, by) {
  return ax * by - ay * bx;
}

// Assumes (px,py) is collinear with (ax,ay)-(bx,by); checks it falls within
// the segment's bounding box.
function onSegment(ax, ay, bx, by, px, py) {
  return px >= Math.min(ax, bx) && px <= Math.max(ax, bx) && py >= Math.min(ay, by) && py <= Math.max(ay, by);
}

// Reports whether segments (x1,y1)-(x2,y2) and (x3,y3)-(x4,y4) cross, using
// the standard orientation test. Endpoint-touching counts as crossing.
// Mirrors instanceconfig.segmentsIntersect on the server.
function segmentsIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
  const d1 = cross(x4 - x3, y4 - y3, x1 - x3, y1 - y3);
  const d2 = cross(x4 - x3, y4 - y3, x2 - x3, y2 - y3);
  const d3 = cross(x2 - x1, y2 - y1, x3 - x1, y3 - y1);
  const d4 = cross(x2 - x1, y2 - y1, x4 - x1, y4 - y1);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  if (d1 === 0 && onSegment(x3, y3, x4, y4, x1, y1)) return true;
  if (d2 === 0 && onSegment(x3, y3, x4, y4, x2, y2)) return true;
  if (d3 === 0 && onSegment(x1, y1, x2, y2, x3, y3)) return true;
  if (d4 === 0 && onSegment(x1, y1, x2, y2, x4, y4)) return true;
  return false;
}

// Reports whether the segment (x1,y1)-(x2,y2) passes within radius of (cx,cy).
// Mirrors instanceconfig.segmentIntersectsCircle on the server.
function segmentIntersectsCircle(x1, y1, x2, y2, cx, cy, radius) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ex = cx - x1, ey = cy - y1;
    return ex * ex + ey * ey <= radius * radius;
  }
  let t = ((cx - x1) * dx + (cy - y1) * dy) / lenSq;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const nearX = x1 + t * dx, nearY = y1 + t * dy;
  const ex = nearX - cx, ey = nearY - cy;
  return ex * ex + ey * ey <= radius * radius;
}

// Reports whether the straight line between (x1,y1) and (x2,y2) is
// unobstructed by any of the given barriers. Mirrors
// instanceconfig.LineOfSightClear on the server.
export function hasLineOfSight(x1, y1, x2, y2, barriers) {
  for (const barrier of barriers) {
    if (barrier.type === "wall") {
      const locs = barrier.locations;
      if (!locs || locs.length < 2) continue;
      for (let i = 0; i < locs.length - 1; i++) {
        if (segmentsIntersect(x1, y1, x2, y2, locs[i].x, locs[i].y, locs[i + 1].x, locs[i + 1].y)) return false;
      }
    } else if (barrier.type === "circle") {
      if (!barrier.location) continue;
      if (segmentIntersectsCircle(x1, y1, x2, y2, barrier.location.x, barrier.location.y, barrier.radius ?? 0)) return false;
    }
  }
  return true;
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
