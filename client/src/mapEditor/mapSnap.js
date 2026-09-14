// Snap-to-point: when placing or dragging a barrier/connection point within
// SNAP_RADIUS_FEET of another point already on the map, treat it as the
// same point rather than a near-miss - two barriers/connections meant to
// share a corner are far more common than ones that are almost, but not
// quite, touching. Holding Shift while clicking/dragging disables this for
// that gesture (see MapCanvas's snapFeet).
export const SNAP_RADIUS_FEET = 2;

// Every point-like coordinate currently on the map: wall vertices, circle
// centers, connection positions, and line connection endpoints - the full
// set of candidates a click/drag could snap to. `exclude` identifies the
// one point currently being placed/dragged, if it already exists in
// mapData, so a point never snaps to itself (which would otherwise make it
// impossible to drag a point away from its own starting position, since
// every drag frame's current value is itself a candidate).
export function collectSnapPoints(mapData, exclude) {
  const points = [];

  mapData.barriers.forEach((barrier, barrierIndex) => {
    if (barrier.type === "wall") {
      barrier.locations.forEach((loc, pointIndex) => {
        if (exclude?.kind === "wall-point" && exclude.barrierIndex === barrierIndex && exclude.pointIndex === pointIndex) return;
        points.push(loc);
      });
    } else if (barrier.type === "circle") {
      if (exclude?.kind === "circle" && exclude.barrierIndex === barrierIndex) return;
      points.push(barrier.location);
    }
  });

  mapData.connections.forEach((connection, connectionIndex) => {
    if (connection.type === "point") {
      if (exclude?.kind === "connection-point" && exclude.connectionIndex === connectionIndex) return;
      points.push(connection.position);
    } else if (connection.type === "line") {
      if (!(exclude?.kind === "connection-endpoint" && exclude.connectionIndex === connectionIndex && exclude.endpoint === "start")) {
        points.push(connection.start);
      }
      if (!(exclude?.kind === "connection-endpoint" && exclude.connectionIndex === connectionIndex && exclude.endpoint === "end")) {
        points.push(connection.end);
      }
    }
  });

  return points;
}

// The closest candidate within SNAP_RADIUS_FEET of `feet`, or null if none
// qualifies - compares squared distance, so no sqrt needed to just compare.
export function nearestSnapPoint(candidates, feet) {
  let best = null;
  let bestDistSq = SNAP_RADIUS_FEET * SNAP_RADIUS_FEET;
  for (const candidate of candidates) {
    const dx = candidate.x - feet.x;
    const dy = candidate.y - feet.y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= bestDistSq) {
      bestDistSq = distSq;
      best = candidate;
    }
  }
  return best;
}
