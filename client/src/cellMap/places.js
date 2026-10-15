// A cellMap's places (see docs/schema/map.md#cellmap): areas of the map,
// each a polygon in cell coordinates, which Auto Barriers (mapEditor/cells/
// autoBarriers.js) turns into the map's places. The generator makes them
// by labelling every cell with a place and tracing the labels' outlines.
import {CELL_SIZE, geometryOf} from "./grid";

// How far, in feet, an outline may stray from the cells' edges.
const TOLERANCE = 1;

const IDENTIFIER = /^[a-z0-9][a-z0-9_-]*$/;

// Error messages for a cellMap's places, empty when they're fine.
export function validateCellPlaces(places) {
  if (places === undefined) return [];
  if (!Array.isArray(places)) return ["places must be a list"];
  const seen = new Set();
  return places.flatMap((place, i) => {
    const errors = [];
    if (typeof place?.identifier !== "string" || !IDENTIFIER.test(place.identifier)) errors.push(`places[${i}].identifier must be lowercase letters, digits, - and _`);
    else if (seen.has(place.identifier)) errors.push(`places[${i}] is a second place named ${JSON.stringify(place.identifier)}`);
    else seen.add(place.identifier);
    const polygon = place?.polygon;
    if (!Array.isArray(polygon) || polygon.length < 3) errors.push(`places[${i}].polygon must list at least three points`);
    else if (!polygon.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))) errors.push(`places[${i}].polygon points must each be [col, row]`);
    return errors;
  });
}

// A map's places with Auto Barriers' outlines in: a place outlined keeps
// what's known about it (name, tags, annotations) and takes the new polygon;
// others stay as they are.
export function mergePlaces(places, outlined) {
  const known = new Map(places.map((p) => [p.identifier, p]));
  const fresh = new Set(outlined.map((p) => p.identifier));
  return [...places.filter((p) => !fresh.has(p.identifier)), ...outlined.map((p) => ({...known.get(p.identifier), ...p}))];
}

// The outline of each label's cells, as a Map of label to a polygon in
// cell coordinates. labelAt(col, row) is a cell's label (a number, or
// null for none); off the grid is none. A label in pieces, or with holes,
// gets its biggest outline: what's inside it that's another label's is
// that label's (the smallest place around a point is the one it's in).
// Where two labels meet, both outlines share the same simplified line.
export function traceLabels(grid, labelAt) {
  const {cols, rows} = grid;
  const g = geometryOf(grid);
  const label = (c, r) => (c >= 0 && r >= 0 && c < cols && r < rows ? labelAt(c, r) : null);
  // Boundary edges, by the corner each starts at, for each label: [from,
  // to, the label across].
  const next = new Map();
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const own = label(c, r);
      if (own === null) continue;
      for (let i = 0; i < g.edges; i++) {
        const other = label(...g.neighbor(c, r, i));
        if (other === own) continue;
        if (!next.has(own)) next.set(own, new Map());
        next.get(own).set(g.corner(c, r, i).join(","), {to: g.corner(c, r, (i + 1) % g.edges), other});
      }
    }
  }

  const simplified = new Map();
  const outlines = new Map();
  for (const [own, edges] of next) {
    let best = null;
    for (const loop of loopsOf(edges)) {
      const polygon = assemble(loop, own, simplified, g);
      const area = Math.abs(signedArea(polygon));
      if (!best || area > best.area) best = {polygon, area};
    }
    if (best) outlines.set(own, best.polygon.map(({x, y}) => g.pointAt(x, y, CELL_SIZE).map((n) => Number(n.toFixed(2)))));
  }
  return outlines;
}

// The closed loops of a label's boundary edges, each a list of
// {corner, other}: the corner an edge starts at, and the label across it.
function loopsOf(edges) {
  const left = new Map(edges);
  const loops = [];
  for (const start of edges.keys()) {
    if (!left.has(start)) continue;
    const loop = [];
    for (let key = start; left.has(key);) {
      const {to, other} = left.get(key);
      left.delete(key);
      loop.push({corner: key, other});
      key = to.join(",");
    }
    loops.push(loop);
  }
  return loops;
}

// A loop as a polygon in feet: split where the label across changes, each
// stretch simplified once for both labels either side of it.
function assemble(loop, own, simplified, g) {
  const n = loop.length;
  const cuts = loop.map((edge, i) => edge.other !== loop[(i + n - 1) % n].other).map((cut, i) => (cut ? i : -1)).filter((i) => i >= 0);
  if (!cuts.length) return closedStretch(loop.map((e) => e.corner), own, loop[0].other, simplified, g);
  const points = [];
  cuts.forEach((at, k) => {
    const end = cuts[(k + 1) % cuts.length];
    const corners = [];
    for (let i = at; ; i = (i + 1) % n) {
      corners.push(loop[i].corner);
      if (i === (end + n - 1) % n) break;
    }
    corners.push(loop[end].corner);
    const stretch = openStretch(corners, own, loop[at].other, simplified, g);
    points.push(...stretch.slice(0, -1));
  });
  return points;
}

// A stretch between two junctions, simplified the same from either side:
// the label lower in order (none, null, last) walks it forwards.
function openStretch(corners, own, other, simplified, g) {
  const mine = other === null || own < other;
  const forward = mine ? corners : [...corners].reverse();
  const key = forward.join(";");
  if (!simplified.has(key)) simplified.set(key, simplify(forward.map((k) => toFeet(k, g)), TOLERANCE));
  const points = simplified.get(key);
  return mine ? points : [...points].reverse();
}

// A whole loop around one other label (or the map's edge), started at its
// lowest corner, so both sides simplify it alike.
function closedStretch(corners, own, other, simplified, g) {
  const mine = other === null || own < other;
  const forward = mine ? corners : [...corners].reverse();
  const start = forward.reduce((best, key, i) => (key < forward[best] ? i : best), 0);
  const rotated = [...forward.slice(start), ...forward.slice(0, start)];
  const key = `loop:${rotated.join(";")}`;
  if (!simplified.has(key)) simplified.set(key, simplify([...rotated, rotated[0]].map((k) => toFeet(k, g)), TOLERANCE).slice(0, -1));
  const points = simplified.get(key);
  return mine ? points : [...points].reverse();
}

function toFeet(key, g) {
  return g.latticeFeet(key.split(",").map(Number), CELL_SIZE);
}

// Douglas-Peucker, keeping the ends.
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    let worst = -1;
    let worstD = tolerance;
    for (let k = i + 1; k < j; k++) {
      const d = segmentDistance(points[k], points[i], points[j]);
      if (d > worstD) [worst, worstD] = [k, d];
    }
    if (worst < 0) continue;
    keep[worst] = 1;
    stack.push([i, worst], [worst, j]);
  }
  return points.filter((_, i) => keep[i]);
}

function segmentDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

function signedArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [a, b] = [points[i], points[(i + 1) % points.length]];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}
