// The geometry a world's atlas is checked with (docs/schema/world.md#atlas),
// mirroring app/services/atlas_geometry.rb: zone outlines are simple
// quadrilaterals, maps axis-aligned rectangles, all in world feet, as {x, y}
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

// Whether four points make a simple quadrilateral: some area, and no edge
// meeting the one opposite it.
export function simpleQuad(quad) {
  if (quad.length !== 4 || Math.abs(signedArea(quad)) <= EPSILON) return false;
  return !segmentsTouch(quad[0], quad[1], quad[2], quad[3]) && !segmentsTouch(quad[1], quad[2], quad[3], quad[0]);
}

// A simple quad as two triangles, split along whichever diagonal is inside.
function triangles([a, b, c, d]) {
  return (cross(a, c, b) > 0) === (cross(a, c, d) > 0) ? [[b, c, d], [b, d, a]] : [[a, b, c], [a, c, d]];
}

function onBoundary(point, polygon) {
  return polygon.some((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    return Math.abs(cross(a, b, point)) <= EPSILON * Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)) && onSegment(a, b, point);
  });
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

// Whether the rect ({x, y, width, height}) lies inside quad: every corner
// inside it or on its edge, and none of quad's corners poking in.
export function rectInside(rect, quad) {
  const corners = rectCorners(rect);
  return corners.every((c) => inside(c, quad, {boundary: true})) && !quad.some((v) => inside(v, corners, {boundary: false}));
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

// Whether two simple quads overlap by some area.
export function quadsOverlap(a, b) {
  return triangles(a).some((s) => triangles(b).some((t) => convexOverlap(s, t)));
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
    if (!simpleQuad(entry.outline ?? [])) problems.push(`zone "${zone}"'s outline crosses itself or is flat`);
  }
  const rects = atlasRects(atlas, sizes);
  for (const rect of rects) {
    if (!rectInside(rect, atlas.zones[rect.zone].outline)) problems.push(`map "${rect.zone}/${rect.map}" isn't inside its zone's outline`);
  }
  rects.forEach((a, i) => rects.slice(i + 1).forEach((b) => {
    if (rectsOverlap(a, b)) problems.push(`map "${b.zone}/${b.map}" overlaps "${a.zone}/${a.map}"`);
  }));
  zones.forEach(([keyA, a], i) => zones.slice(i + 1).forEach(([keyB, b]) => {
    if (simpleQuad(a.outline) && simpleQuad(b.outline) && quadsOverlap(a.outline, b.outline)) problems.push(`zone "${keyB}"'s outline overlaps "${keyA}"'s`);
  }));
  return problems;
}
