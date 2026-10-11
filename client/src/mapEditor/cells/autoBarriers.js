// Barriers for a map drawn in cells: walls along the forest's edge, so
// trees block and everything else is open. The edge is the tree cells'
// outline (less the cells trails clear - see cellMap/scene.js), through
// the middle of each hex edge so a column's zigzag is a straight line,
// then smoothed so a row's is too, then simplified. Walls stop at the
// map's edge - forest reaching it is filled by the map's own rule (see
// game/mapFill.js) - and each patch of forest
// inside the map gets a fill point. Open ground reaching the edge would be
// filled too, so that's reported, not fixed.
//
// Works in map feet (y up); the scene is in cellmap feet (y down).
import {trailClearedCells} from "../../cellMap/scene";
import {regionLoops} from "../../cellMap/regions";
import {CELL_SIZE, cellCenter, hexRadius, mapSize} from "../../cellMap/hexGrid";
import {terrainsOf} from "../../cellMap/format";

// See docs/schema/map.md (and MapValidator).
export const MAX_BARRIER_SEGMENTS = 3000;
export const MAX_FILL_POINTS = 100;

// How far, in feet, a wall may stray from the forest's edge - loose, so
// walls are long straight lines rather than following each cell;
// doubled until the walls fit MAX_BARRIER_SEGMENTS.
const START_TOLERANCE = 1.5;
const MAX_TOLERANCE = 6;

// Averaging passes over the outline: each halves a row's zigzag.
const SMOOTHING_PASSES = 3;

// Returns {barriers, fillPoints, segments, openEdge, error}: the new walls
// and fill points (existingFillPoints, plus one per forest patch none of
// them is in), how many segments the walls use, whether open ground
// reaches the map's edge, and why nothing could be made (or null).
export function autoBarriers(cellMap, existingFillPoints = []) {
  const {width, height} = mapSize(cellMap.grid);
  const toMap = ({x, y}) => [x, height - y];
  const forest = regionLoops(cellMap, "trees", trailClearedCells(cellMap)).map((loop) => smoothOutline(loop).map(toMap));
  const forestBoxes = forest.map(bounds);
  const isForest = (p) => forest.filter((loop, i) => inBounds(p, forestBoxes[i]) && insidePolygon(p, loop)).length % 2 === 1;

  const runs = forest.flatMap((loop) => clipLoop(loop, width, height));
  let tolerance = START_TOLERANCE;
  let walls = simplifyAll(runs, tolerance);
  while (segmentCount(walls) > MAX_BARRIER_SEGMENTS && tolerance < MAX_TOLERANCE) {
    tolerance *= 2;
    walls = simplifyAll(runs, tolerance);
  }
  const segments = segmentCount(walls);
  if (segments > MAX_BARRIER_SEGMENTS) {
    return {barriers: [], fillPoints: existingFillPoints, segments, openEdge: false, error: `The forest's edge needs ${segments} wall segments, more than the ${MAX_BARRIER_SEGMENTS} a map can have. Simplify the forest and try again.`};
  }

  // Each closed wall around forest (not a clearing) gets a fill point at a
  // tree cell's center inside it, unless one is already there. Nested
  // walls (a grove in a clearing) are their own regions, so a point inside
  // one doesn't count for the wall around it.
  const treeCenters = forestCellCenters(cellMap, height);
  const closed = walls.filter((w) => w.closed).map((wall) => ({...wall, box: bounds(wall.points)}));
  const fillPoints = [...existingFillPoints];
  for (const wall of closed) {
    const inside = (p) => inBounds(p, wall.box) && insidePolygon(p, wall.points);
    if (fillPoints.some(({x, y}) => inside([x, y]))) continue;
    const nested = closed.filter((other) => other !== wall && inside(other.points[0]));
    const center = treeCenters.find((p) => inside(p) && !nested.some((other) => inBounds(p, other.box) && insidePolygon(p, other.points)) && isForest(p));
    if (center) fillPoints.push({x: round(center[0]), y: round(center[1])});
  }
  if (fillPoints.length > MAX_FILL_POINTS) {
    return {barriers: [], fillPoints: existingFillPoints, segments, openEdge: false, error: `The forest has ${fillPoints.length - existingFillPoints.length} separate patches inside the map, more than the ${MAX_FILL_POINTS} fill points a map can have.`};
  }

  const barriers = walls.map(({points}) => ({type: "wall", locations: points.map(([x, y]) => ({x: round(x), y: round(y)}))}));
  return {barriers, fillPoints, segments, openEdge: edgeCellCenters(cellMap, height).some((p) => !isForest(p)), error: null};
}

// A loop of lattice corners (see regions.js) as the midpoints of its edges,
// in feet, smoothed.
export function smoothOutline(loop) {
  const r = hexRadius(CELL_SIZE);
  const corners = loop.map(([lx, ly]) => ({x: (lx * r) / 2, y: (ly * CELL_SIZE) / 2}));
  let points = corners.map((p, i) => {
    const q = corners[(i + 1) % corners.length];
    return {x: (p.x + q.x) / 2, y: (p.y + q.y) / 2};
  });
  for (let pass = 0; pass < SMOOTHING_PASSES; pass++) {
    const n = points.length;
    points = points.map((p, i) => {
      const a = points[(i + n - 1) % n];
      const b = points[(i + 1) % n];
      return {x: (a.x + 2 * p.x + b.x) / 4, y: (a.y + 2 * p.y + b.y) / 4};
    });
  }
  return points;
}

// The parts of a closed loop inside the map: {points, closed}. A loop that
// never leaves the map stays closed (its first point repeated at the end);
// one that does becomes runs that start and end on the map's edge.
export function clipLoop(loop, width, height) {
  const n = loop.length;
  const runs = [];
  let run = null;
  for (let i = 0; i < n; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % n];
    const clipped = clipSegment(a, b, width, height);
    if (!clipped) {
      run = null;
      continue;
    }
    const [t0, t1] = clipped;
    if (!run || t0 > 0) {
      run = {points: [lerp(a, b, t0)], startsAtVertex: t0 === 0, index: i};
      runs.push(run);
    }
    run.points.push(lerp(a, b, t1));
    if (t1 < 1) run = null;
  }
  if (runs.length === 1 && runs[0].startsAtVertex && runs[0].index === 0 && run === runs[0]) {
    return [{points: runs[0].points, closed: true}];
  }
  // A run still open at the end carries on into the first one.
  if (run && runs.length > 1 && runs[0].startsAtVertex && runs[0].index === 0) {
    run.points.push(...runs[0].points.slice(1));
    runs.shift();
  }
  return runs.map(({points}) => ({points, closed: false}));
}

// Liang-Barsky: the [t0, t1] of a→b inside the map, or null.
function clipSegment([ax, ay], [bx, by], width, height) {
  const dx = bx - ax;
  const dy = by - ay;
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of [[-dx, ax], [dx, width - ax], [-dy, ay], [dy, height - ay]]) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return t0 === t1 ? null : [t0, t1];
}

function simplifyAll(runs, tolerance) {
  return runs.map(({points, closed}) => ({points: simplify(points, tolerance), closed})).filter(({points}) => points.length >= (2));
}

// Douglas-Peucker, keeping both ends (so a closed run stays closed).
export function simplify(points, tolerance) {
  if (points.length <= 2) return points;
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let farthest = -1;
    let distance = tolerance;
    for (let i = first + 1; i < last; i++) {
      const d = segmentDistance(points[i], points[first], points[last]);
      if (d > distance) {
        distance = d;
        farthest = i;
      }
    }
    if (farthest !== -1) {
      keep[farthest] = true;
      stack.push([first, farthest], [farthest, last]);
    }
  }
  // A closed loop simplified to a sliver: keep its farthest point too.
  const kept = points.filter((_, i) => keep[i]);
  return kept.length === 2 && samePoint(kept[0], kept[1]) ? [points[0], points[Math.floor(points.length / 2)], points[0]] : kept;
}

const segmentCount = (walls) => walls.reduce((sum, {points}) => sum + points.length - 1, 0);

// Tree cells' centers, in map feet: the forest's deepest points.
function forestCellCenters(cellMap, height) {
  const terrains = terrainsOf(cellMap);
  const centers = [];
  cellMap.cells.forEach((line, row) => [...line].forEach((ch, col) => {
    if (terrains[ch] === "trees") centers.push(mapPoint(col, row, height));
  }));
  return centers;
}

function edgeCellCenters({grid}, height) {
  const centers = [];
  for (let col = 0; col < grid.cols; col++) centers.push(mapPoint(col, 0, height), mapPoint(col, grid.rows - 1, height));
  for (let row = 0; row < grid.rows; row++) centers.push(mapPoint(0, row, height), mapPoint(grid.cols - 1, row, height));
  return centers;
}

function mapPoint(col, row, height) {
  const {x, y} = cellCenter(col, row, CELL_SIZE);
  return [x, height - y];
}

export function insidePolygon([x, y], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function bounds(points) {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return {minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys)};
}

const inBounds = ([x, y], box) => x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY;

function segmentDistance([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const lerp = ([ax, ay], [bx, by], t) => [ax + (bx - ax) * t, ay + (by - ay) * t];
const samePoint = (a, b) => a[0] === b[0] && a[1] === b[1];
const round = (n) => Math.round(n * 100) / 100;
