// The parts of a map nobody can stand in: every region whose outline
// reaches the map's edge somewhere a wall doesn't cover it, and every
// region holding one of the map's fillPoints (see plans/map-fill.md, and
// docs/schema/map.md for the map's shape). Pure
// geometry in map feet (x east, y north); scene.js draws the result.
//
// The outlines are the walls, the line connections and the map edge. Near
// misses are closed first: endpoints within SNAP feet of each other, or of
// any outline, get a connector, and an endpoint within SNAP + radius of a
// circle connects to its center. Then every segment is split where it
// crosses another and the regions between them are traced.

const SNAP = 0.5; // feet
const MERGE = 1e-4; // feet; points closer than this are one vertex
const EPS = 1e-7;

// {filled: [{outer, holes}], edges: [{a, b, kind, left, right}]}, where
// outer and each hole are [[x, y], ...] (outer counterclockwise), kind is
// "wall", "connection", "connector" or "border", and left/right say what
// lies on each side of a→b: "filled", "open" or "outside" (off the map).
export function computeMapFill(map) {
  const { width, height } = map.feetDimensions;
  const raw = outlineSegments(map, width, height);
  const edges = splitAtCrossings(raw);
  const graph = buildGraph(edges);
  const cycles = traceCycles(graph);
  classify(graph, cycles, (map.fillPoints ?? []).map(point));
  return {
    filled: cycles
      .filter((c) => c.area > 0 && c.state === "filled")
      .map((c) => ({ outer: cleanRing(c.points), holes: c.holes.map((h) => cleanRing(h.points)).filter((h) => h.length >= 3) }))
      .filter((f) => f.outer.length >= 3),
    edges: graph.edges.map((e) => ({
      a: e.a, b: e.b, kind: e.kind,
      left: e.forward.cycle.side, right: e.backward.cycle.side,
    })),
  };
}

// ---------------------------------------------------------------------------
// Outline segments: walls, line connections, the map edge, and connectors
// ---------------------------------------------------------------------------

function outlineSegments(map, width, height) {
  const segments = [];
  const ends = [];
  const add = (a, b, kind) => {
    const clipped = clip(a, b, width, height);
    if (clipped && dist(clipped[0], clipped[1]) > EPS) segments.push({ a: clipped[0], b: clipped[1], kind });
  };

  for (const barrier of map.barriers ?? []) {
    if (barrier.type !== "wall") continue;
    const pts = (barrier.locations ?? []).map(point);
    for (let i = 0; i < pts.length - 1; i++) add(pts[i], pts[i + 1], "wall");
    if (pts.length >= 2 && dist(pts[0], pts[pts.length - 1]) > EPS) ends.push(pts[0], pts[pts.length - 1]);
  }
  for (const conn of map.connections ?? []) {
    if (conn.type !== "line" || !conn.start || !conn.end) continue;
    const [a, b] = [point(conn.start), point(conn.end)];
    add(a, b, "connection");
    ends.push(a, b);
  }
  const corners = [[0, 0], [width, 0], [width, height], [0, height]];
  for (let i = 0; i < 4; i++) add(corners[i], corners[(i + 1) % 4], "border");

  const circles = (map.barriers ?? [])
    .filter((b) => b.type === "circle" && b.location)
    .map((b) => ({ center: point(b.location), radius: b.radius ?? 0 }));
  const outlines = [...segments];
  ends.forEach((p, i) => {
    for (let j = i + 1; j < ends.length; j++) {
      const d = dist(p, ends[j]);
      if (d > EPS && d <= SNAP) add(p, ends[j], "connector");
    }
    for (const s of outlines) {
      const q = closestOnSegment(p, s.a, s.b);
      const d = dist(p, q);
      if (d > EPS && d <= SNAP) add(p, q, "connector");
    }
    for (const { center, radius } of circles) {
      if (dist(p, center) <= SNAP + radius) add(p, center, "connector");
    }
  });
  return segments;
}

const point = ({ x, y }) => [Number(x), Number(y)];

// Liang-Barsky: the part of a→b inside the map, or null.
function clip(a, b, width, height) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  let t0 = 0, t1 = 1;
  const edges = [[-dx, a[0]], [dx, width - a[0]], [-dy, a[1]], [dy, height - a[1]]];
  for (const [p, q] of edges) {
    if (Math.abs(p) < EPS) {
      if (q < -EPS) return null;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    }
  }
  if (t0 > t1) return null;
  const at = (t) => [Math.min(width, Math.max(0, a[0] + t * dx)), Math.min(height, Math.max(0, a[1] + t * dy))];
  return [at(t0), at(t1)];
}

// ---------------------------------------------------------------------------
// Splitting: every segment broken where another crosses or touches it
// ---------------------------------------------------------------------------

function splitAtCrossings(segments) {
  const cuts = segments.map(() => [0, 1]);
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      for (const [ti, tj] of crossings(segments[i], segments[j])) {
        cuts[i].push(ti);
        cuts[j].push(tj);
      }
    }
  }
  const pieces = [];
  segments.forEach((s, i) => {
    const ts = [...new Set(cuts[i])].sort((x, y) => x - y);
    for (let k = 0; k < ts.length - 1; k++) {
      const a = lerp(s.a, s.b, ts[k]), b = lerp(s.a, s.b, ts[k + 1]);
      if (dist(a, b) > MERGE) pieces.push({ a, b, kind: s.kind });
    }
  });
  return pieces;
}

// Parameter pairs [t on s, t on r] where the two meet: one crossing, or
// for overlapping collinear segments, each one's endpoints on the other.
function crossings(s, r) {
  const d1 = sub(s.b, s.a), d2 = sub(r.b, r.a);
  const denom = cross(d1, d2);
  const w = sub(r.a, s.a);
  const len1 = Math.hypot(...d1), len2 = Math.hypot(...d2);
  if (Math.abs(denom) <= 1e-9 * len1 * len2) {
    if (Math.abs(cross(w, d1)) > 1e-6 * len1) return [];
    const out = [];
    const onS = (p) => dot(sub(p, s.a), d1) / (len1 * len1);
    const onR = (p) => dot(sub(p, r.a), d2) / (len2 * len2);
    for (const p of [r.a, r.b]) { const t = onS(p); if (t > -EPS && t < 1 + EPS) out.push([clamp01(t), onR(p)]); }
    for (const p of [s.a, s.b]) { const t = onR(p); if (t > -EPS && t < 1 + EPS) out.push([onS(p), clamp01(t)]); }
    return out.map(([a, b]) => [clamp01(a), clamp01(b)]);
  }
  const t = cross(w, d2) / denom;
  const u = cross(w, d1) / denom;
  const tolS = 1e-6 / len1, tolR = 1e-6 / len2;
  if (t < -tolS || t > 1 + tolS || u < -tolR || u > 1 + tolR) return [];
  return [[clamp01(t), clamp01(u)]];
}

// ---------------------------------------------------------------------------
// The planar graph and its faces
// ---------------------------------------------------------------------------

const KIND_RANK = { wall: 3, connection: 3, connector: 2, border: 1 };

function buildGraph(pieces) {
  // Bucketed by MERGE-sized cells; a point joins any vertex within MERGE
  // in its own or a neighboring bucket.
  const buckets = new Map();
  const vertices = [];
  const vertex = (p) => {
    const bx = Math.floor(p[0] / MERGE), by = Math.floor(p[1] / MERGE);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const v of buckets.get(`${bx + dx}:${by + dy}`) ?? []) if (dist(v.p, p) <= MERGE) return v;
      }
    }
    const v = { key: vertices.length, p, out: [] };
    vertices.push(v);
    const key = `${bx}:${by}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(v);
    return v;
  };
  const byPair = new Map();
  for (const piece of pieces) {
    const u = vertex(piece.a), v = vertex(piece.b);
    if (u === v) continue;
    const pair = u.key < v.key ? `${u.key}|${v.key}` : `${v.key}|${u.key}`;
    const existing = byPair.get(pair);
    if (existing) {
      // A wall along the map's edge seals it: the barrier wins.
      if (KIND_RANK[piece.kind] > KIND_RANK[existing.kind]) existing.kind = piece.kind;
      continue;
    }
    const edge = { a: u.p, b: v.p, kind: piece.kind };
    edge.forward = { from: u, to: v, edge };
    edge.backward = { from: v, to: u, edge };
    edge.forward.twin = edge.backward;
    edge.backward.twin = edge.forward;
    u.out.push(edge.forward);
    v.out.push(edge.backward);
    byPair.set(pair, edge);
  }
  for (const v of vertices) {
    for (const h of v.out) h.angle = Math.atan2(h.to.p[1] - v.p[1], h.to.p[0] - v.p[0]);
    v.out.sort((x, y) => x.angle - y.angle);
    v.out.forEach((h, i) => { h.index = i; });
  }
  return { vertices, edges: [...byPair.values()] };
}

// Each half-edge's face lies on its left: from u→v, turn to the next edge
// clockwise from v→u. Bounded faces come out counterclockwise (positive
// area); each connected piece's outside comes out clockwise.
function traceCycles(graph) {
  const cycles = [];
  for (const v of graph.vertices) {
    for (const start of v.out) {
      if (start.cycle) continue;
      const cycle = { halfEdges: [], points: [] };
      let h = start;
      while (!h.cycle) {
        h.cycle = cycle;
        cycle.halfEdges.push(h);
        cycle.points.push(h.from.p);
        const around = h.to.out;
        h = around[(h.twin.index - 1 + around.length) % around.length];
      }
      cycle.area = ringArea(cycle.points);
      cycle.holes = [];
      cycles.push(cycle);
    }
  }
  return cycles;
}

// Marks each cycle's state ("filled"/"open" for faces, the containing
// face's for a hole) and side (what a half-edge on it has to its left).
function classify(graph, cycles, fillPoints) {
  const component = connectedPieces(graph);
  const faces = cycles.filter((c) => c.area > 0);
  for (const face of faces) {
    face.state = face.halfEdges.some((h) => h.edge.kind === "border") ? "filled" : "open";
  }
  // A fill point fills the innermost region around it.
  for (const p of fillPoints) {
    const face = faces.filter((f) => pointInRing(p, f.points)).reduce((best, f) => (!best || f.area < best.area ? f : best), null);
    if (face) face.state = "filled";
  }
  for (const face of faces) face.side = face.state;
  for (const ring of cycles.filter((c) => c.area <= 0)) {
    const piece = component.get(ring.halfEdges[0].from);
    if (ring.halfEdges.some((h) => h.edge.kind === "border")) {
      ring.side = "outside"; // the map edge's own outside
      continue;
    }
    const probe = ring.points[0];
    const container = faces
      .filter((f) => component.get(f.halfEdges[0].from) !== piece && pointInRing(probe, f.points))
      .reduce((best, f) => (!best || f.area < best.area ? f : best), null);
    ring.side = container?.state ?? "open";
    container?.holes.push(ring);
  }
}

function connectedPieces(graph) {
  const parent = new Map(graph.vertices.map((v) => [v, v]));
  const find = (v) => { while (parent.get(v) !== v) { parent.set(v, parent.get(parent.get(v))); v = parent.get(v); } return v; };
  for (const e of graph.edges) parent.set(find(e.forward.from), find(e.forward.to));
  return new Map(graph.vertices.map((v) => [v, find(v)]));
}

// ---------------------------------------------------------------------------
// Small geometry
// ---------------------------------------------------------------------------

// Drops spikes (a→b→a, from walls dangling into a face) and repeats.
function cleanRing(points) {
  let ring = points.slice();
  let changed = true;
  while (changed && ring.length >= 3) {
    changed = false;
    for (let i = 0; i < ring.length; i++) {
      const prev = ring[(i - 1 + ring.length) % ring.length], next = ring[(i + 1) % ring.length];
      if (dist(prev, next) <= MERGE) {
        ring.splice(i, 1);
        ring.splice(i < ring.length ? i : 0, 1);
        changed = true;
        break;
      }
    }
  }
  return ring.length >= 3 ? ring : [];
}

function ringArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i], [x2, y2] = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

function pointInRing([px, py], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function closestOnSegment(p, a, b) {
  const d = sub(b, a);
  const lenSq = dot(d, d);
  if (lenSq === 0) return a;
  return lerp(a, b, clamp01(dot(sub(p, a), d) / lenSq));
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const clamp01 = (t) => Math.min(1, Math.max(0, t));
