// The geometry a world's atlas is checked with (docs/schema/world.md#atlas),
// mirroring app/services/atlas_geometry.rb: zone outlines are simple
// polygons, maps axis-aligned rectangles, all in world feet, as {x, y}
// points. Touching (a shared edge or corner) never counts as overlapping.

const EPSILON = 1e-6;

const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

export function signedArea(polygon) {
  return polygon.reduce((sum, a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    return sum + a.x * b.y - b.x * a.y;
  }, 0) / 2;
}

const between = (v, a, b) => v >= Math.min(a, b) - EPSILON && v <= Math.max(a, b) + EPSILON;
const onSegment = (p, q, r) => between(r.x, p.x, q.x) && between(r.y, p.y, q.y);
const opposite = (a, b) => (a > EPSILON && b < -EPSILON) || (a < -EPSILON && b > EPSILON);

// Whether segments ab and cd meet at all, endpoints included.
export function segmentsTouch(a, b, c, d) {
  const [d1, d2, d3, d4] = [cross(c, d, a), cross(c, d, b), cross(a, b, c), cross(a, b, d)];
  if (opposite(d1, d2) && opposite(d3, d4)) return true;
  return [[d1, c, d, a], [d2, c, d, b], [d3, a, b, c], [d4, a, b, d]].some(([o, p, q, r]) => Math.abs(o) <= EPSILON && onSegment(p, q, r));
}

// Whether r lies on segment pq.
function pointOnSegment(p, q, r) {
  return Math.abs(cross(p, q, r)) <= EPSILON * Math.max(1, Math.hypot(q.x - p.x, q.y - p.y)) && onSegment(p, q, r);
}

// Whether the points make a simple polygon: at least three, some area, no
// edge of no length, no edge meeting another except where neighbors share
// a corner, and no neighbors doubling back along each other.
export function simplePolygon(polygon) {
  const n = polygon.length;
  if (n < 3 || Math.abs(signedArea(polygon)) <= EPSILON) return false;
  const edges = polygon.map((p, i) => [p, polygon[(i + 1) % n]]);
  if (edges.some(([a, b]) => Math.hypot(b.x - a.x, b.y - a.y) <= EPSILON)) return false;
  return edges.every(([a, b], i) => edges.slice(i + 1).every(([c, d], k) => {
    const j = i + 1 + k;
    if (j === i + 1) return !pointOnSegment(a, b, d) && !pointOnSegment(c, d, a);
    if (i === 0 && j === n - 1) return !pointOnSegment(a, b, c) && !pointOnSegment(c, d, b);
    return !segmentsTouch(a, b, c, d);
  }));
}

// Whether vertex i of a counterclockwise polygon can be cut off: it turns
// left (or goes straight on, which cuts off nothing), and no other vertex
// is in the triangle it makes with its neighbors.
function isEar(points, i) {
  const n = points.length;
  const [prev, cur, next] = [points[(i + n - 1) % n], points[i], points[(i + 1) % n]];
  const turn = cross(prev, cur, next);
  if (Math.abs(turn) <= EPSILON) return true;
  if (turn < 0) return false;
  const own = new Set([(i + n - 1) % n, i, (i + 1) % n]);
  return !points.some((p, j) => !own.has(j) && inside(p, [prev, cur, next], {boundary: true}));
}

// A simple polygon as triangles, by ear clipping.
export function triangles(polygon) {
  const points = signedArea(polygon) < 0 ? [...polygon].reverse() : [...polygon];
  const result = [];
  while (points.length > 3) {
    const ear = points.findIndex((_, i) => isEar(points, i));
    if (ear === -1) break; // only collinear runs left: nothing more with area
    const n = points.length;
    const [prev, cur, next] = [points[(ear + n - 1) % n], points[ear], points[(ear + 1) % n]];
    if (cross(prev, cur, next) > EPSILON) result.push([prev, cur, next]);
    points.splice(ear, 1);
  }
  if (points.length === 3 && Math.abs(cross(points[0], points[1], points[2])) > EPSILON) result.push(points);
  return result;
}

function onBoundary(point, polygon) {
  return polygon.some((a, i) => pointOnSegment(a, polygon[(i + 1) % polygon.length], point));
}

// Whether point is inside polygon (even-odd), its boundary counting as
// inside only when boundary is true.
export function inside(point, polygon, {boundary}) {
  if (onBoundary(point, polygon)) return boundary;
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [a, b] = [polygon[i], polygon[j]];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}

export const rectCorners = ({x, y, width, height}) => [{x, y}, {x: x + width, y}, {x: x + width, y: y + height}, {x, y: y + height}];

// Whether the rect ({x, y, width, height}) lies inside polygon: every
// corner inside it or on its edge, and none of polygon's vertices poking in.
export function rectInside(rect, polygon) {
  const corners = rectCorners(rect);
  return corners.every((c) => inside(c, polygon, {boundary: true})) && !polygon.some((v) => inside(v, corners, {boundary: false}));
}

export function rectsOverlap(a, b) {
  return a.x < b.x + b.width - EPSILON && b.x < a.x + a.width - EPSILON && a.y < b.y + b.height - EPSILON && b.y < a.y + a.height - EPSILON;
}

function convexOverlap(a, b) {
  return [a, b].every((polygon) => polygon.every((p, i) => {
    const q = polygon[(i + 1) % polygon.length];
    const axis = {x: p.y - q.y, y: q.x - p.x};
    const project = (poly) => poly.map((v) => v.x * axis.x + v.y * axis.y);
    const [pa, pb] = [project(a), project(b)];
    return Math.min(...pa) < Math.max(...pb) - EPSILON && Math.min(...pb) < Math.max(...pa) - EPSILON;
  }));
}

// Whether two simple polygons overlap by some area: whether any of their
// triangles do, by separating axes.
export function polygonsOverlap(a, b) {
  const trianglesB = triangles(b);
  return triangles(a).some((s) => trianglesB.some((t) => convexOverlap(s, t)));
}

// The rects of an atlas's placed maps: [{zone, map, x, y, width, height}].
// sizes is {zone: {map: {width, height}}}; maps it doesn't know are left
// out.
export function atlasRects(atlas, sizes) {
  return Object.entries(atlas?.zones ?? {}).flatMap(([zone, entry]) => Object.entries(entry.maps ?? {}).flatMap(([map, at]) => {
    const size = sizes[zone]?.[map];
    return size ? [{zone, map, x: at.x, y: at.y, width: size.width, height: size.height}] : [];
  }));
}

// What's wrong with an atlas, as the server's checks would say it (see
// Validators::WorldReferences): [] when nothing. sizes as atlasRects.
export function atlasProblems(atlas, sizes) {
  const problems = [];
  const zones = Object.entries(atlas?.zones ?? {});
  for (const [zone, entry] of zones) {
    if (!simplePolygon(entry.outline ?? [])) problems.push(`zone "${zone}"'s outline crosses itself or is flat`);
  }
  const rects = atlasRects(atlas, sizes);
  for (const rect of rects) {
    if (!rectInside(rect, atlas.zones[rect.zone].outline)) problems.push(`map "${rect.zone}/${rect.map}" isn't inside its zone's outline`);
  }
  rects.forEach((a, i) => rects.slice(i + 1).forEach((b) => {
    if (rectsOverlap(a, b)) problems.push(`map "${b.zone}/${b.map}" overlaps "${a.zone}/${a.map}"`);
  }));
  zones.forEach(([keyA, a], i) => zones.slice(i + 1).forEach(([keyB, b]) => {
    if (simplePolygon(a.outline) && simplePolygon(b.outline) && polygonsOverlap(a.outline, b.outline)) problems.push(`zone "${keyB}"'s outline overlaps "${keyA}"'s`);
  }));
  return problems;
}
