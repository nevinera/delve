// Barriers for a map drawn in cells: walls where trees (a cave's rock) and
// water meet open ground, so they block and everything else is open.
// Trees' walls block sight; water's don't (you can see and shoot across
// it), and where trees meet water the trees' wall does. Walls follow the
// cells' edges (less the tree cells trails clear - see cellMap/scene.js),
// through the middle of each hex edge so a column's zigzag is a straight
// line, then smoothed so a row's is too, bent as the drawn edges are
// (see cellMap/regions.js's warp), then simplified. Where trees,
// water and open ground meet, their walls share that corner exactly, so
// nothing leaks between them.
//
// Walls stop at the map's edge - a patch reaching it is filled by the
// map's own rule (see game/mapFill.js) - and each patch of trees or water
// inside the map gets a fill point. A lone patch that's round - three
// cells around a corner, or a whole hex ball (one cell, or one and its six
// neighbors, ...) - with open ground all around gets a circle instead.
// Open ground reaching the edge would be filled too, so that's reported,
// not fixed.
//
// A bridge cuts the water's walls where its deck is, and gets a rail down
// each side (see cellMap/bridges.js), so it's open from bank to bank; a
// rail across an end too, if that end's over water.
//
// Works in map feet (y up); the scene is in cellmap feet (y down).
import {trailClearedCells} from "../../cellMap/scene";
import {latticeCorner, PAD, unwarp, warp} from "../../cellMap/regions";
import {CELL_SIZE, cellAt, cellCenter, cellPoint, hexDistance, hexRadius, mapSize, neighbor} from "../../cellMap/hexGrid";
import {terrainAt} from "../../cellMap/format";
import {bridgeCells, bridgeDeck} from "../../cellMap/bridges";
import {exitCells, exitEdge} from "../../cellMap/exits";

// See docs/schema/map.md (and MapValidator).
export const MAX_BARRIER_SEGMENTS = 3000;
export const MAX_FILL_POINTS = 100;
// A circle's radius is at most 30 ft, and counts as this many segments.
const MAX_CIRCLE_RADIUS = 30;
const CIRCLE_SEGMENTS = 6;

// The terrains that block, and whether their barriers block sight.
const BLOCKERS = {trees: true, water: false};

// How far, in feet, a wall may stray from the cells' edge - loose, so
// walls are long straight lines rather than following each cell;
// doubled until the walls fit MAX_BARRIER_SEGMENTS.
const START_TOLERANCE = 1.5;
const MAX_TOLERANCE = 6;

// Averaging passes over the outline: each halves a row's zigzag.
const SMOOTHING_PASSES = 3;

// Returns {barriers, connections, places, fillPoints, segments, openEdge,
// error}: the new walls, a line connection for each of the cells' exits,
// the cells' places in map feet (bent as the walls are), and fill
// points (existingFillPoints, plus one per patch none of them is in), how
// many segments the walls use, whether open ground reaches the map's edge
// outside the exits, and why nothing could be made (or null).
export function autoBarriers(cellMap, existingFillPoints = []) {
  const {width, height} = mapSize(cellMap.grid);
  const toMap = ({x, y}) => [x, height - y];
  const cleared = trailClearedCells(cellMap);
  const blocking = (c, r) => {
    const terrain = terrainAt(cellMap, c, r);
    return terrain in BLOCKERS && !(terrain === "trees" && cleared(c, r)) ? terrain : null;
  };
  const bridges = cellMap.bridges ?? [];
  const onBridge = new Set(bridges.flatMap((bridge) => bridgeCells(bridge).map((cell) => cell.join(","))));
  const groves = roundPatches(cellMap, blocking).filter(({cells}) => !cells.some((cell) => onBridge.has(cell)));
  const inGrove = new Set(groves.flatMap(({cells}) => cells));
  const kindAt = (c, r) => (inGrove.has(`${c},${r}`) ? null : blocking(c, r));
  // Water under a bridge's middle splits the water into patches either
  // side of it, each needing its own fill point.
  const patchKindAt = (c, r) => (kindAt(c, r) === "water" && onBridge.has(`${c},${r}`) ? null : kindAt(c, r));
  const circles = groves.map(({kind, center, radius}) => ({kind, radius, ...warp(center, cellMap.seed)})).map(({kind, x, y, radius}) => barrier({type: "circle", location: roundPoint([x, height - y]), radius: round(radius)}, kind));

  const outlined = outlines(cellMap, kindAt).map((line) => ({...line, points: linePoints(line).map((p) => toMap(warp(p, cellMap.seed)))}));
  const decks = bridges.map((bridge) => {
    const {a, b, halfWidth} = bridgeDeck(bridge);
    return {a: toMap(a), b: toMap(b), halfWidth};
  });
  const runs = [...bridged(outlined, decks), ...decks.flatMap((deck) => rails(deck, outlined))].flatMap((line) =>
    (line.closed ? clipLoop(line.points, width, height) : clipRun(line.points, width, height)).map((run) => ({...run, kind: line.kind})));
  let tolerance = START_TOLERANCE;
  let walls = simplifyAll(runs, tolerance);
  const circleSegments = circles.length * CIRCLE_SEGMENTS;
  while (segmentCount(walls) + circleSegments > MAX_BARRIER_SEGMENTS && tolerance < MAX_TOLERANCE) {
    tolerance *= 2;
    walls = simplifyAll(runs, tolerance);
  }
  const segments = segmentCount(walls) + circleSegments;
  if (segments > MAX_BARRIER_SEGMENTS) {
    return {barriers: [], connections: [], places: [], fillPoints: existingFillPoints, segments, openEdge: false, error: `The trees' and water's edges need ${segments} wall segments, more than the ${MAX_BARRIER_SEGMENTS} a map can have. Simplify them and try again.`};
  }

  const fillPoints = [...existingFillPoints, ...newFillPoints(cellMap, patchKindAt, existingFillPoints, height)];
  if (fillPoints.length > MAX_FILL_POINTS) {
    return {barriers: [], connections: [], places: [], fillPoints: existingFillPoints, segments, openEdge: false, error: `There are ${fillPoints.length - existingFillPoints.length} separate patches of trees and water inside the map, more than the ${MAX_FILL_POINTS} fill points a map can have.`};
  }

  // Circles are always filled, so they need no fill points.
  const barriers = [...walls.map(({points, kind}) => barrier({type: "wall", locations: points.map(roundPoint)}, kind)), ...circles];
  const connections = (cellMap.exits ?? []).map((exit) => exitConnection(exit, cellMap.grid, barriers, toMap));
  const inExit = new Set((cellMap.exits ?? []).flatMap((exit) => exitCells(exit, cellMap.grid).map((cell) => cell.join(","))));
  const openEdge = borderCells(cellMap).some(([c, r]) => !kindAt(c, r) && !inExit.has(`${c},${r}`));
  const places = (cellMap.places ?? []).map(({identifier, polygon}) => ({identifier, polygon: polygon.map(([c, r]) => roundPoint(toMap(warp(cellPoint(c, r, CELL_SIZE), cellMap.seed))))}));
  return {barriers, connections, places, fillPoints, segments, openEdge, error: null};
}

// An exit's line connection, named for its side: along the map's edge,
// from the wall ending there on one side of the exit's gap to the one on
// the other, so it closes the gap and the map's fill stops at it. Where
// there's no wall ending by the gap, the line runs to the exit's cells' end.
function exitConnection(exit, grid, barriers, toMap) {
  const [a, b] = exitEdge(exit, grid).map(toMap);
  const along = exit.side === "north" || exit.side === "south" ? 0 : 1;
  const [lo, hi] = [Math.min(a[along], b[along]), Math.max(a[along], b[along])];
  const middle = (lo + hi) / 2;
  const ends = barriers
    .filter((b) => b.type === "wall")
    .flatMap(({locations}) => [locations[0], locations[locations.length - 1]])
    .map(({x, y}) => [x, y])
    .filter((p) => Math.abs(p[1 - along] - a[1 - along]) < 0.01);
  const reach = CELL_SIZE * 1.5;
  const below = ends.map((p) => p[along]).filter((v) => v <= middle && v >= lo - reach);
  const above = ends.map((p) => p[along]).filter((v) => v >= middle && v <= hi + reach);
  const [start, end] = [below.length ? Math.max(...below) : lo, above.length ? Math.min(...above) : hi];
  // On the edge exactly: rounded, the east edge could land past the map.
  const at = (v) => (along === 0 ? {x: round(v), y: a[1]} : {x: a[0], y: round(v)});
  return {identifier: exit.side, type: "line", start: at(start), end: at(end)};
}

const barrier = (fields, kind) => (BLOCKERS[kind] ? fields : {...fields, blocksSight: false});

// Each joined patch of one blocking terrain on the grid: {kind, cells
// ([col, row]), edge (whether it touches the map's edge)}.
function patches(cellMap, kindAt) {
  const {cols, rows} = cellMap.grid;
  const seen = new Set();
  const found = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const kind = kindAt(col, row);
      if (!kind || seen.has(`${col},${row}`)) continue;
      const cells = [[col, row]];
      seen.add(`${col},${row}`);
      for (let i = 0; i < cells.length; i++) {
        for (let edge = 0; edge < 6; edge++) {
          const [c, r] = neighbor(...cells[i], edge);
          if (c < 0 || r < 0 || c >= cols || r >= rows || seen.has(`${c},${r}`) || kindAt(c, r) !== kind) continue;
          seen.add(`${c},${r}`);
          cells.push([c, r]);
        }
      }
      found.push({kind, cells, edge: cells.some(([c, r]) => c === 0 || r === 0 || c === cols - 1 || r === rows - 1)});
    }
  }
  return found;
}

// Round patches away from the map's edge, with open ground all around:
// {kind, center (cellmap feet), radius, cells ("col,row")}.
function roundPatches(cellMap, kindAt) {
  return patches(cellMap, kindAt).flatMap(({kind, cells, edge}) => {
    if (edge) return [];
    const keys = new Set(cells.map(([c, r]) => `${c},${r}`));
    const alone = cells.every(([c, r]) => [0, 1, 2, 3, 4, 5].every((e) => {
      const [nc, nr] = neighbor(c, r, e);
      return keys.has(`${nc},${nr}`) || !kindAt(nc, nr);
    }));
    const round = alone && (asTriad(cells) ?? asHexBall(cells));
    return round ? [{...round, kind, cells: [...keys]}] : [];
  });
}

// Three cells around a corner: a circle on the corner, as big as they are.
function asTriad(patch) {
  if (patch.length !== 3 || hexDistance(patch[0], patch[1]) + hexDistance(patch[1], patch[2]) + hexDistance(patch[0], patch[2]) !== 3) return null;
  const centers = patch.map(([c, r]) => cellCenter(c, r, CELL_SIZE));
  const center = {x: centers.reduce((sum, {x}) => sum + x, 0) / 3, y: centers.reduce((sum, {y}) => sum + y, 0) / 3};
  const hexArea = (3 * Math.sqrt(3) / 2) * hexRadius(CELL_SIZE) ** 2;
  return {center, radius: Math.sqrt((3 * hexArea) / Math.PI)};
}

// A ball of k steps has 3k(k+1)+1 cells; its center is the middle of its
// bounding columns and rows. Its circle runs through its edges' middles,
// like the walls do.
function asHexBall(patch) {
  const steps = Math.round((Math.sqrt(12 * patch.length - 3) - 3) / 6);
  if (3 * steps * (steps + 1) + 1 !== patch.length || (steps + 0.5) * CELL_SIZE > MAX_CIRCLE_RADIUS) return null;
  const colsOf = patch.map(([c]) => c);
  const col = (Math.min(...colsOf) + Math.max(...colsOf)) / 2;
  const rowsOf = patch.filter(([c]) => c === col).map(([, r]) => r);
  const center = [col, (Math.min(...rowsOf) + Math.max(...rowsOf)) / 2];
  if (!center.every(Number.isInteger) || !patch.every((cell) => hexDistance(cell, center) <= steps)) return null;
  return {center: cellCenter(...center, CELL_SIZE), radius: (steps + 0.5) * CELL_SIZE};
}

// The edges between a blocking cell and a cell that isn't its kind, joined
// into lines of lattice corners (see regions.js): {corners, closed, kind}.
// A line runs between corners where three kinds meet, or is a loop. The
// grid runs PAD cells past the map (copying its edge cells), so lines
// reaching the edge carry on past it and get clipped.
function outlines(cellMap, kindAt) {
  const {cols, rows} = cellMap.grid;
  const kind = (c, r) => (c >= -PAD && c < cols + PAD && r >= -PAD && r < rows + PAD ? kindAt(c, r) : null);
  const edges = [];
  for (let c = -PAD; c < cols + PAD; c++) {
    for (let r = -PAD; r < rows + PAD; r++) {
      const here = kind(c, r);
      if (!here) continue;
      for (let i = 0; i < 6; i++) {
        const there = kind(...neighbor(c, r, i));
        // Where two blocking kinds meet, the wall is the one blocking sight.
        if (there === here || (there && !BLOCKERS[here])) continue;
        edges.push({a: latticeCorner(c, r, i), b: latticeCorner(c, r, (i + 1) % 6), kind: here});
      }
    }
  }

  const key = ([x, y]) => `${x},${y}`;
  const from = new Map();
  const into = new Map();
  for (const edge of edges) {
    if (!from.has(key(edge.a))) from.set(key(edge.a), []);
    from.get(key(edge.a)).push(edge);
    into.set(key(edge.b), (into.get(key(edge.b)) ?? 0) + 1);
  }
  const junction = (p) => from.get(key(p))?.length !== 1 || into.get(key(p)) !== 1;
  const used = new Set();
  const lines = [];
  for (const start of edges) {
    if (used.has(start) || !junction(start.a)) continue;
    const corners = [start.a];
    for (let edge = start; ; edge = from.get(key(edge.b))[0]) {
      used.add(edge);
      corners.push(edge.b);
      if (junction(edge.b)) break;
    }
    lines.push({corners, closed: false, kind: start.kind});
  }
  for (const start of edges) {
    if (used.has(start)) continue;
    const corners = [];
    for (let edge = start; !used.has(edge); edge = from.get(key(edge.b))[0]) {
      used.add(edge);
      corners.push(edge.a);
    }
    lines.push({corners, closed: true, kind: start.kind});
  }
  return lines;
}

// A line of lattice corners as the midpoints of its edges, in feet,
// smoothed. A line between junctions keeps its ends on them.
function linePoints({corners, closed}) {
  const r = hexRadius(CELL_SIZE);
  const feet = corners.map(([lx, ly]) => ({x: (lx * r) / 2, y: (ly * CELL_SIZE) / 2}));
  const mid = (p, q) => ({x: (p.x + q.x) / 2, y: (p.y + q.y) / 2});
  const n = feet.length;
  let points = closed ? feet.map((p, i) => mid(p, feet[(i + 1) % n])) : [feet[0], ...feet.slice(1).map((q, i) => mid(feet[i], q)), feet[n - 1]];
  const m = points.length;
  for (let pass = 0; pass < SMOOTHING_PASSES; pass++) {
    points = points.map((p, i) => {
      if (!closed && (i === 0 || i === m - 1)) return p;
      const a = points[(i + m - 1) % m];
      const b = points[(i + 1) % m];
      return {x: (a.x + 2 * p.x + b.x) / 4, y: (a.y + 2 * p.y + b.y) / 4};
    });
  }
  return points;
}

// The lines with the water's cut out of each bridge's deck: the parts
// outside it, as open lines (or the whole line, if it misses the decks).
function bridged(lines, decks) {
  if (!decks.length) return lines;
  return lines.flatMap((line) => {
    if (line.kind !== "water") return [line];
    const whole = line.closed ? [...line.points, line.points[0]] : line.points;
    let pieces = [whole];
    for (const deck of decks) pieces = pieces.flatMap((points) => outsideDeck(points, deck));
    return pieces.length === 1 && pieces[0] === whole ? [line] : pieces.map((points) => ({points, closed: false, kind: line.kind}));
  });
}

// A deck's corners, in map feet: the a end's right and left, then the b
// end's left and right (so its long sides are 0-1 and 2-3).
function deckCorners({a, b, halfWidth}) {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const [nx, ny] = [(-(b[1] - a[1]) / l) * halfWidth, ((b[0] - a[0]) / l) * halfWidth];
  return [[a[0] - nx, a[1] - ny], [b[0] - nx, b[1] - ny], [b[0] + nx, b[1] + ny], [a[0] + nx, a[1] + ny]];
}

// The [t0, t1] of p→q inside a deck, or null (Liang-Barsky, along and
// across the deck).
function deckClip(p, q, {a, b, halfWidth}) {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const [ux, uy] = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  const along = ([x, y]) => (x - a[0]) * ux + (y - a[1]) * uy;
  const across = ([x, y]) => (y - a[1]) * ux - (x - a[0]) * uy;
  const [u0, v0] = [along(p), across(p)];
  const [du, dv] = [along(q) - u0, across(q) - v0];
  let t0 = 0;
  let t1 = 1;
  for (const [d, room] of [[-du, u0], [du, l - u0], [-dv, v0 + halfWidth], [dv, halfWidth - v0]]) {
    if (d === 0) {
      if (room < 0) return null;
      continue;
    }
    const t = room / d;
    if (d < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 >= t1) return null;
  }
  return [t0, t1];
}

// The parts of a line outside a deck.
function outsideDeck(points, deck) {
  const pieces = [];
  let piece = null;
  let cut = false;
  for (let i = 0; i + 1 < points.length; i++) {
    const [p, q] = [points[i], points[i + 1]];
    const inside = deckClip(p, q, deck);
    if (!inside) {
      if (!piece) pieces.push((piece = [p]));
      piece.push(q);
      continue;
    }
    cut = true;
    const [t0, t1] = inside;
    if (t0 > 0) {
      if (!piece) pieces.push((piece = [p]));
      piece.push(lerp(p, q, t0));
    }
    piece = null;
    if (t1 < 1) pieces.push((piece = [lerp(p, q, t1), q]));
  }
  return cut ? pieces.filter((piece) => piece.length >= 2) : [points];
}

// A deck's rails: its long sides, and an end any water wall crosses.
function rails(deck, lines) {
  const [c0, c1, c2, c3] = deckCorners(deck);
  const water = lines.filter((line) => line.kind === "water");
  const crossed = (p, q) => water.some(({points, closed}) => {
    const n = closed ? points.length : points.length - 1;
    for (let i = 0; i < n; i++) if (segmentsCross(p, q, points[i], points[(i + 1) % points.length])) return true;
    return false;
  });
  const sides = [[c0, c1], [c2, c3]];
  if (crossed(c1, c2)) sides.push([c1, c2]);
  if (crossed(c3, c0)) sides.push([c3, c0]);
  return sides.map((points) => ({points, closed: false, kind: "water"}));
}

function segmentsCross(p1, p2, p3, p4) {
  const side = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  return side(p1, p2, p3) !== side(p1, p2, p4) && side(p3, p4, p1) !== side(p3, p4, p2);
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

// The parts of an open line inside the map.
export function clipRun(points, width, height) {
  const runs = [];
  let run = null;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const clipped = clipSegment(a, b, width, height);
    if (!clipped) {
      run = null;
      continue;
    }
    const [t0, t1] = clipped;
    if (!run || t0 > 0) {
      run = [lerp(a, b, t0)];
      runs.push(run);
    }
    run.push(lerp(a, b, t1));
    if (t1 < 1) run = null;
  }
  return runs.map((run) => ({points: run, closed: false}));
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

// Small loops are simplified less (to a tolerance of at most
// SMALL_LOOP_SHARE of their length), so a little copse keeps its shape -
// cut to a sliver, it could leave its own fill point outside it, which
// would fill the open ground instead.
const SMALL_LOOP_SHARE = 1 / 40;

function simplifyAll(runs, tolerance) {
  return runs.map((run) => {
    const closed = run.points.length > 2 && distance(run.points[0], run.points[run.points.length - 1]) < 1e-6;
    const limit = closed ? Math.min(tolerance, pathLength(run.points) * SMALL_LOOP_SHARE) : tolerance;
    return {...run, points: simplify(run.points, limit)};
  }).filter(({points}) => points.length >= 2);
}

const distance = ([ax, ay], [bx, by]) => Math.hypot(bx - ax, by - ay);
const pathLength = (points) => points.reduce((sum, p, i) => (i ? sum + distance(points[i - 1], p) : 0), 0);

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

// A fill point for each patch inside the map that none of existing is in,
// at its deepest cell's center (in map feet).
// Fill points are where the cells are drawn, bent as the walls are.
function newFillPoints(cellMap, kindAt, existing, height) {
  const marked = new Set(existing.map(({x, y}) => {
    const p = unwarp({x, y: height - y}, cellMap.seed);
    return cellAt(p.x, p.y, CELL_SIZE).join(",");
  }));
  return patches(cellMap, kindAt).flatMap(({cells, edge}) => {
    const keys = new Set(cells.map(([c, r]) => `${c},${r}`));
    if (edge || [...keys].some((k) => marked.has(k))) return [];
    const [col, row] = deepest(cells, keys);
    const {x, y} = warp(cellCenter(col, row, CELL_SIZE), cellMap.seed);
    return [{x: round(x), y: round(height - y)}];
  });
}

// The patch's most inward cell, where the walls' smoothing can't have cut
// it off: the farthest in steps from the patch's edge, then the one with
// the most of the patch around it, then the nearest its middle.
function deepest(cells, keys) {
  const around = ([c, r]) => [0, 1, 2, 3, 4, 5].filter((e) => keys.has(neighbor(c, r, e).join(","))).length;
  const depth = new Map();
  let frontier = cells.filter((cell) => around(cell) < 6);
  for (let d = 1; frontier.length; d++) {
    for (const cell of frontier) depth.set(cell.join(","), d);
    frontier = frontier.flatMap(([c, r]) => [0, 1, 2, 3, 4, 5].map((e) => neighbor(c, r, e))).filter((cell) => keys.has(cell.join(",")) && !depth.has(cell.join(",")));
    frontier = [...new Map(frontier.map((cell) => [cell.join(","), cell])).values()];
  }
  const centers = cells.map(([c, r]) => cellCenter(c, r, CELL_SIZE));
  const middle = {x: centers.reduce((sum, {x}) => sum + x, 0) / cells.length, y: centers.reduce((sum, {y}) => sum + y, 0) / cells.length};
  const score = (cell, i) => [depth.get(cell.join(",")) ?? 1, around(cell), -Math.hypot(centers[i].x - middle.x, centers[i].y - middle.y)];
  let best = 0;
  let bestScore = score(cells[0], 0);
  cells.forEach((cell, i) => {
    const s = score(cell, i);
    const better = s[0] !== bestScore[0] ? s[0] > bestScore[0] : s[1] !== bestScore[1] ? s[1] > bestScore[1] : s[2] > bestScore[2];
    if (better) [best, bestScore] = [i, s];
  });
  return cells[best];
}

function borderCells({grid}) {
  const cells = [];
  for (let col = 0; col < grid.cols; col++) cells.push([col, 0], [col, grid.rows - 1]);
  for (let row = 0; row < grid.rows; row++) cells.push([0, row], [grid.cols - 1, row]);
  return cells;
}

function segmentDistance([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const lerp = ([ax, ay], [bx, by], t) => [ax + (bx - ax) * t, ay + (by - ay) * t];
const samePoint = (a, b) => a[0] === b[0] && a[1] === b[1];
// (Never -0, which reads as a different number to some.)
const round = (n) => Math.round(n * 100) / 100 || 0;
const roundPoint = ([x, y]) => ({x: round(x), y: round(y)});
