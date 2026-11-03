import * as THREE from "three";
import { ConvexHull } from "three/addons/math/ConvexHull.js";

// The convex hull of points with at most `limit` corners, made the way PhysX's cooking makes one
// when the exact hull has too many (its default, not plane shifting: QuickHullConvexHullLib::
// expandHullOBB, with ConvexHull::findCandidatePlane, convexHullCrop and computeOBBFromConvex in
// GuCookingConvexHullUtils.cpp):
//
// 1. Build the exact hull.
// 2. Fit a box around it: the hull's principal axes from its volume's inertia, then each of the
//    world's axes turned in 18° steps about each principal axis, keeping the box of least volume.
// 3. Crop the box by the exact hull's planes, one at a time, each time taking the plane the shape
//    pokes out of farthest for its width across that plane, and not one within 3° of a face
//    already there that would cut into that face.
// 4. Stop before a crop that would leave more than `limit` corners, or when nothing pokes out.
//
// Every crop is by a plane of the exact hull, so the result holds every point. When the exact hull
// has few enough corners it's the result as it is, which may leave a point outside it by up to
// PhysX's plane tolerance where faces within MIN_ADJACENT_DEG were joined.
//
// Returns { points: [[x, y, z], ...], faces: [[i, ...], ...] }, each face a loop of point indices
// counterclockwise seen from outside, or null when the points don't enclose a volume.

const MIN_ADJACENT_DEG = 3;
const MAX_DOT_MIN_ANGLE = Math.cos((MIN_ADJACENT_DEG * Math.PI) / 180);
const FLOAT_EPSILON = 2 ** -23;
const PLANE_THICKNESS = 3 * FLOAT_EPSILON; // points within this distance are on a plane
const PLANE_TOLERANCE = 0.0007; // PhysX's default cooking planeTolerance
const MAX_PLANES = 256;
const BOX_STEPS = 20;

export function limitedHull(points, limit) {
  if (points.length < 4) return null;
  // Tolerances scale with the points' size, as PhysX's do.
  const lo = [0, 1, 2].map((a) => Math.min(...points.map((p) => p[a])));
  const hi = [0, 1, 2].map((a) => Math.max(...points.map((p) => p[a])));
  const size = (hi[0] - lo[0] + hi[1] - lo[1] + hi[2] - lo[2]) / 2;
  const epsilon = Math.max(PLANE_THICKNESS * size, PLANE_THICKNESS);
  const planeTolerance = Math.max(PLANE_TOLERANCE * size, PLANE_TOLERANCE);

  const exact = exactHull(points);
  if (!exact || volumeOf(exact) < 1e-9) return null;
  if (exact.vertices.length <= limit) return output(exact);

  const planes = exact.faces.map((f) => f.plane);
  let shape = boxShape(fitBox(exact));
  for (let left = Math.min(MAX_PLANES, planes.length); left > 0; left--) {
    const k = candidatePlane(shape, planes, planeTolerance, epsilon);
    if (k < 0) break;
    const cropped = crop(shape, planes[k], k, planeTolerance);
    if (!cropped || cropped.vertices.length > limit) break;
    shape = cropped;
  }
  return output(shape);
}

// A shape is { vertices: [[x, y, z], ...], faces: [{ plane, source, loop }] }: plane is { n, d }
// with n·p <= d inside; source the index of the exact hull's plane it came from, or -1; loop its
// corners' indices, counterclockwise seen from outside.

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a) => scale(a, 1 / Math.hypot(...a));
const distance = (plane, p) => dot(plane.n, p) - plane.d;

// The exact hull, from three.js's quickhull, as a shape. Like PhysX's, it has no two neighbouring
// faces within MIN_ADJACENT_DEG of each other: a corner where fewer than three faces that far
// apart meet (one float rounding left on an edge or a face) is dropped, and neighbouring triangles
// that close are joined into one face.
function exactHull(points) {
  const first = quickhull(points.map((p) => new THREE.Vector3(...p)));
  if (!first) return null;
  const corners = new Map(); // vertex -> its faces' normals
  for (const face of first.faces) {
    for (const point of loopOf(face)) {
      if (!corners.has(point)) corners.set(point, []);
      corners.get(point).push(face.normal);
    }
  }
  const all = [...corners.keys()].map((v) => v.toArray());
  const real = [...corners].filter(([, normals]) => distinct(normals) >= 3).map(([point]) => point);
  const hull = quickhull(real);
  if (!hull) return null;

  const vertices = [];
  const index = new Map();
  const at = (v) => {
    if (!index.has(v)) {
      index.set(v, vertices.length);
      vertices.push([v.x, v.y, v.z]);
    }
    return index.get(v);
  };
  const faces = [];
  const done = new Set();
  for (const seed of hull.faces) {
    if (done.has(seed)) continue;
    // The triangles reached from this one across edges, keeping within the angle.
    const group = new Set([seed]);
    const queue = [seed];
    done.add(seed);
    while (queue.length) {
      const face = queue.pop();
      let edge = face.edge;
      do {
        const other = edge.twin.face;
        if (!done.has(other) && other.normal.dot(seed.normal) > MAX_DOT_MIN_ANGLE) {
          done.add(other);
          group.add(other);
          queue.push(other);
        }
        edge = edge.next;
      } while (edge !== face.edge);
    }
    // Its outline: the edges not shared within the group, chained.
    const next = new Map();
    for (const face of group) {
      let edge = face.edge;
      do {
        if (!group.has(edge.twin.face)) next.set(edge.tail().point, edge.head().point);
        edge = edge.next;
      } while (edge !== face.edge);
    }
    const [start] = next.keys();
    const loop = [start];
    for (let p = next.get(start); p !== start && loop.length <= next.size; p = next.get(p)) loop.push(p);
    const normal = [...group].reduce((sum, f) => sum.addScaledVector(f.normal, f.area), new THREE.Vector3()).normalize().toArray();
    const indices = loop.map(at);
    // Out far enough to hold every corner, dropped ones too, as PhysX moves its planes out.
    faces.push({ plane: { n: normal, d: Math.max(...all.map((p) => dot(normal, p))) }, source: faces.length, loop: indices });
  }
  return { vertices, faces };
}

function quickhull(points) {
  if (points.length < 4) return null;
  const hull = new ConvexHull().setFromPoints(points);
  return hull.faces.length ? hull : null;
}

function loopOf(face) {
  const points = [];
  let edge = face.edge;
  do {
    points.push(edge.head().point);
    edge = edge.next;
  } while (edge !== face.edge);
  return points;
}

// How many directions the normals point in, counting those within MIN_ADJACENT_DEG as one.
function distinct(normals) {
  const kept = [];
  for (const n of normals) if (kept.every((k) => k.dot(n) <= MAX_DOT_MIN_ANGLE)) kept.push(n);
  return kept.length;
}

function volumeOf({ vertices, faces }) {
  let sum = 0;
  for (const { loop } of faces) {
    for (let i = 1; i + 1 < loop.length; i++) sum += dot(vertices[loop[0]], cross(vertices[loop[i]], vertices[loop[i + 1]]));
  }
  return sum / 6;
}

// The least box around the hull: { center, axes: [x, y, z], half: [x, y, z] }.
function fitBox(hull) {
  const { vertices } = hull;
  const mean = scale(vertices.reduce(add, [0, 0, 0]), 1 / vertices.length);
  const principal = eigenvectors(secondMoment(hull, mean));
  let best = null;
  for (const axis of principal) {
    for (let step = 0; step < BOX_STEPS; step++) {
      const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...axis), (step * 2 * Math.PI) / BOX_STEPS);
      const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((a) => new THREE.Vector3(...a).applyQuaternion(turn).toArray());
      const lo = axes.map((a) => Math.min(...vertices.map((v) => dot(a, v))));
      const hi = axes.map((a) => Math.max(...vertices.map((v) => dot(a, v))));
      const sides = hi.map((h, i) => h - lo[i]);
      const volume = sides[0] * sides[1] * sides[2];
      if (!best || volume <= best.volume) {
        const middle = hi.map((h, i) => (h + lo[i]) / 2);
        best = { volume, axes, half: sides.map((s) => s / 2), center: axes.reduce((c, a, i) => add(c, scale(a, middle[i])), [0, 0, 0]) };
      }
    }
  }
  return best;
}

// The second moment of the hull's volume about `origin`, as a 3×3 matrix: its principal axes are
// its inertia tensor's.
function secondMoment({ vertices, faces }, origin) {
  const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const { loop } of faces) {
    const [a, ...rest] = loop.map((v) => sub(vertices[v], origin));
    for (let i = 0; i + 1 < rest.length; i++) {
      // A tetrahedron from the origin: det / 120 × (s sᵀ + a aᵀ + b bᵀ + c cᵀ), s = a + b + c.
      const [b, c] = [rest[i], rest[i + 1]];
      const det = dot(a, cross(b, c));
      const s = add(add(a, b), c);
      for (let r = 0; r < 3; r++) {
        for (let q = 0; q < 3; q++) m[r][q] += (det / 120) * (s[r] * s[q] + a[r] * a[q] + b[r] * b[q] + c[r] * c[q]);
      }
    }
  }
  return m;
}

// A symmetric 3×3 matrix's eigenvectors, by Jacobi rotations.
function eigenvectors(matrix) {
  const a = matrix.map((row) => [...row]);
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) {
    const off = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]);
    if (off < 1e-15) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1);
      const s = t * c;
      for (let k = 0; k < 3; k++) {
        const [akp, akq] = [a[k][p], a[k][q]];
        a[k][p] = c * akp - s * akq;
        a[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < 3; k++) {
        const [apk, aqk] = [a[p][k], a[q][k]];
        a[p][k] = c * apk - s * aqk;
        a[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < 3; k++) {
        const [vkp, vkq] = [v[k][p], v[k][q]];
        v[k][p] = c * vkp - s * vkq;
        v[k][q] = s * vkp + c * vkq;
      }
    }
  }
  return [0, 1, 2].map((col) => normalize([v[0][col], v[1][col], v[2][col]]));
}

// The box as a shape.
function boxShape({ center, axes, half }) {
  const vertices = [];
  for (const sz of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sx of [-1, 1]) vertices.push([sx, sy, sz].reduce((p, s, i) => add(p, scale(axes[i], s * half[i])), center));
    }
  }
  const faces = [];
  for (let i = 0; i < 3; i++) {
    for (const sign of [-1, 1]) {
      const n = scale(axes[i], sign);
      const corners = vertices.map((_, k) => k).filter((k) => [k & 1, (k >> 1) & 1, (k >> 2) & 1][i] === (sign > 0 ? 1 : 0));
      faces.push({ plane: { n, d: dot(n, center) + half[i] }, source: -1, loop: wind(corners, vertices, n) });
    }
  }
  return { vertices, faces };
}

// The best plane to crop by next, as ConvexHull::findCandidatePlane picks it, or -1.
function candidatePlane(shape, planes, planeTolerance, epsilon) {
  let best = -1;
  let most = 0;
  planes.forEach((plane, i) => {
    let dmax = 0;
    let dmin = 0;
    for (const v of shape.vertices) {
      const d = distance(plane, v);
      dmax = Math.max(dmax, d);
      dmin = Math.min(dmin, d);
    }
    let range = dmax - dmin;
    if (range < planeTolerance) range = 1;
    let d = dmax / range;
    if (d <= most) return;
    for (const face of shape.faces) {
      if (face.source === i) {
        d = 0;
        continue;
      }
      if (dot(plane.n, face.plane.n) > MAX_DOT_MIN_ANGLE && face.loop.some((v) => distance(plane, shape.vertices[v]) < 0)) d = 0;
    }
    if (d > most) {
      best = i;
      most = d;
    }
  });
  return most > epsilon ? best : -1;
}

// The shape cut by a plane, keeping what's inside it, as convexHullCrop does; null when nothing's
// left or the cut doesn't close.
function crop(shape, plane, source, planeTolerance) {
  const side = shape.vertices.map((v) => {
    const d = distance(plane, v);
    return d > planeTolerance ? 1 : d < -planeTolerance ? -1 : 0;
  });
  if (!side.includes(1)) return shape;
  if (!side.includes(-1)) return null;
  const vertices = [];
  const kept = new Map(); // old index or edge "a,b" -> new index
  const keep = (key, point) => {
    if (!kept.has(key)) {
      kept.set(key, vertices.length);
      vertices.push(point);
    }
    return kept.get(key);
  };
  const onCut = new Set();
  const faces = [];
  for (const face of shape.faces) {
    const loop = [];
    face.loop.forEach((a, i) => {
      const b = face.loop[(i + 1) % face.loop.length];
      if (side[a] <= 0) {
        loop.push(keep(a, shape.vertices[a]));
        if (side[a] === 0) onCut.add(kept.get(a));
      }
      if ((side[a] < 0 && side[b] > 0) || (side[a] > 0 && side[b] < 0)) {
        // The same point from both faces that share the edge.
        const [p, q] = a < b ? [a, b] : [b, a];
        const [dp, dq] = [distance(plane, shape.vertices[p]), distance(plane, shape.vertices[q])];
        const point = add(shape.vertices[p], scale(sub(shape.vertices[q], shape.vertices[p]), dp / (dp - dq)));
        const v = keep(`${p},${q}`, point);
        onCut.add(v);
        loop.push(v);
      }
    });
    if (loop.length >= 3) faces.push({ ...face, loop });
  }
  if (onCut.size < 3) return null;
  faces.push({ plane, source, loop: wind([...onCut], vertices, plane.n) });
  // Drop corners no face uses any more.
  const used = [...new Set(faces.flatMap((f) => f.loop))].sort((a, b) => a - b);
  const renumber = new Map(used.map((v, i) => [v, i]));
  return { vertices: used.map((v) => vertices[v]), faces: faces.map((f) => ({ ...f, loop: f.loop.map((v) => renumber.get(v)) })) };
}

// Points on a plane in order counterclockwise about its normal, seen from outside.
function wind(indices, vertices, n) {
  const middle = scale(indices.reduce((s, v) => add(s, vertices[v]), [0, 0, 0]), 1 / indices.length);
  const u = normalize(Math.abs(n[0]) < 0.9 ? cross(n, [1, 0, 0]) : cross(n, [0, 1, 0]));
  const w = cross(n, u);
  const angle = (v) => {
    const r = sub(vertices[v], middle);
    return Math.atan2(dot(r, w), dot(r, u));
  };
  return [...indices].sort((a, b) => angle(a) - angle(b));
}

function output({ vertices, faces }) {
  return { points: vertices.map((p) => p.map((v) => v + 0)), faces: faces.map((f) => [...f.loop]) };
}
