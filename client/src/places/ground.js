// A map's open ground, sampled on a grid and labeled by place (see
// docs/schema/map.md#place): what zone-outline measures places with, and
// where the placer puts units. Pure.
import {computeMapFill} from "../game/mapFill";

// Feet between the points open ground is sampled at.
export const STEP = 2.5;

// {cols, rows, label, center(c, r)}: label[r * cols + c] is the index into
// map.places of the place the cell's center is in (the smallest around it),
// -1 for open ground in no place, -2 for filled ground or off the map.
export function placeGrid(map) {
  const places = map.places ?? [];
  const {width, height} = map.feetDimensions;
  const open = openGround(map);
  const sizes = places.map((p) => polygonArea(p.polygon));
  const boxes = places.map((p) => box(p.polygon));
  // The smallest place around a point is the one it's in.
  const placeAt = (x, y) => {
    let best = -1;
    for (let i = 0; i < places.length; i++) {
      const b = boxes[i];
      if (x < b.minX || x > b.maxX || y < b.minY || y > b.maxY) continue;
      if ((best < 0 || sizes[i] < sizes[best]) && inPolygon(x, y, places[i].polygon)) best = i;
    }
    return best;
  };

  const cols = Math.ceil(width / STEP);
  const rows = Math.ceil(height / STEP);
  const label = new Int32Array(cols * rows).fill(-2);
  const center = (c, r) => [(c + 0.5) * STEP, (r + 0.5) * STEP];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const [x, y] = center(c, r);
      if (open(x, y)) label[r * cols + c] = placeAt(x, y);
    }
  }
  return {cols, rows, label, center};
}

// Whether a point (feet) is open ground: on the map and not in its fill.
export function openGround(map) {
  const fill = computeMapFill(map);
  const regions = fill.filled.map(({outer, holes}) => ({outer, holes, box: box(outer.map(([x, y]) => ({x, y})))}));
  const inRing = (x, y, ring) => {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [[ax, ay], [bx, by]] = [ring[i], ring[j]];
      if ((ay > y) !== (by > y) && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) hit = !hit;
    }
    return hit;
  };
  return (x, y) => !regions.some(({outer, holes, box: b}) => x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY && inRing(x, y, outer) && !holes.some((h) => inRing(x, y, h)));
}

export function inPolygon(x, y, polygon) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [a, b] = [polygon[i], polygon[j]];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

export function polygonArea(polygon) {
  let sum = 0;
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    sum += a.x * b.y - b.x * a.y;
  });
  return Math.abs(sum) / 2;
}

function box(points) {
  return {
    minX: Math.min(...points.map((p) => p.x)), maxX: Math.max(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)), maxY: Math.max(...points.map((p) => p.y)),
  };
}
