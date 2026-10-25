import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { OBJECT_TYPES } from "../world/objects.js";
import { meshHeightAt } from "../world/clutter.js";

// Objects for the 3D view (world/objects.js says what they are and where), as instanced meshes:
// one per part shape and variant. Shapes are for scale 1, standing on y = 0 and matching their
// type's footprint and height; long ones (logs) lie along x.

const material = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, side: THREE.DoubleSide });
const UP = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

// Pushes each vertex in or out by up to `amount`, the same for every copy of a corner so the
// surface stays closed.
function lumpy(geometry, amount, seed) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    const r = random(seed + hashString(key))();
    v.multiplyScalar(1 + amount * (r * 2 - 1));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// A rounded stone `w` wide (x), `h` tall and `d` deep, standing on y = 0.
function stone(w, h, d, seed, { detail = 1, rough = 0.18 } = {}) {
  const base = detail ? new THREE.IcosahedronGeometry(0.5, detail) : new THREE.DodecahedronGeometry(0.5, 0);
  return lumpy(base, rough, seed).scale(w, h, d).translate(0, h * 0.42, 0);
}

function cylinderBetween(a, b, r0, r1, sides = 5) {
  const from = new THREE.Vector3(...a);
  const to = new THREE.Vector3(...b);
  const length = from.distanceTo(to);
  const g = new THREE.CylinderGeometry(r1, r0, length, sides).translate(0, length / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, to.clone().sub(from).normalize()));
  return g.translate(...a);
}

// Several stones scattered round a point, `count` of them within `spread`, up to `tall`.
function heap(count, spread, tall, seed) {
  const rand = random(seed);
  const parts = [];
  for (let s = 0; s < count; s++) {
    const a = rand() * Math.PI * 2;
    const r = spread * Math.sqrt(rand());
    const size = tall * (0.4 + 0.6 * rand());
    parts.push(stone(size * 1.3, size, size * 1.1, seed * 31 + s, { detail: 0, rough: 0.25 }).translate(Math.cos(a) * r, 0, Math.sin(a) * r));
  }
  return mergeGeometries(parts);
}

function log(radius) {
  return new THREE.CylinderGeometry(radius * 0.85, radius, 1, 7).rotateZ(Math.PI / 2).translate(0, radius * 0.9, 0);
}

const SHAPES = {
  boulder: [1, 2, 3].map((seed) => () => stone(0.95, 0.8, 0.85, seed)),
  rock: [4, 5, 6].map((seed) => () => stone(0.95, 0.8, 0.8, seed, { detail: 0, rough: 0.3 })),
  outcrop: [7, 8].map((seed) => () => mergeGeometries([stone(1.4, 1, 1.2, seed, { detail: 0, rough: 0.25 }).translate(-0.5, 0, 0), stone(1.2, 0.7, 1.1, seed + 10, { detail: 0, rough: 0.25 }).translate(0.55, 0, 0.1), stone(0.8, 0.45, 0.8, seed + 20, { detail: 0 }).translate(0.1, 0, -0.35)])),
  bush: [9, 10].map((seed) => () => stone(0.85, 0.95, 0.8, seed, { rough: 0.15 })),
  thicket: [11, 12].map((seed) => () => mergeGeometries([0, 1, 2, 3, 4].map((b) => { const a = b * 1.3 + seed; const r = b ? 0.45 : 0; return stone(0.75, 0.75 + 0.2 * Math.sin(a * 3), 0.7, seed * 7 + b, { rough: 0.15 }).translate(Math.cos(a) * r, 0, Math.sin(a) * r); }))),
  fencePosts: () => mergeGeometries([-1.2, 0, 1.2].map((x, n) => new THREE.BoxGeometry(0.12, n === 1 ? 0.7 : 1, 0.12).translate(x, n === 1 ? 0.35 : 0.5, 0))),
  fenceRail: () => mergeGeometries([new THREE.BoxGeometry(2.6, 0.08, 0.05).translate(0, 0.8, 0), new THREE.BoxGeometry(1.4, 0.08, 0.05).rotateZ(-0.35).translate(-0.6, 0.35, 0)]),
  log: () => log(0.05),
  trunk: () => log(0.08),
  roots: () => {
    const rand = random(13);
    const parts = [];
    for (let r = 0; r < 9; r++) {
      const a = (r / 9) * Math.PI * 2 + rand() * 0.4;
      const reach = 0.12 + 0.08 * rand();
      parts.push(cylinderBetween([0.5, 0.1, 0], [0.5 + 0.03 * rand(), 0.1 + Math.sin(a) * reach, Math.cos(a) * reach], 0.022, 0.006, 4));
    }
    parts.push(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 8).rotateZ(Math.PI / 2).translate(0.5, 0.1, 0));
    return mergeGeometries(parts);
  },
  stump: [14, 15].map((seed) => () => lumpy(new THREE.CylinderGeometry(0.3, 0.38, 1, 8, 2), 0.06, seed).translate(0, 0.5, 0)),
  hollowStump: () => lumpy(new THREE.CylinderGeometry(0.4, 0.5, 1, 9, 2, true), 0.08, 16).translate(0, 0.5, 0),
  mossCap: () => new THREE.SphereGeometry(0.4, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 0.9).translate(0, 0.55, 0),
  spire: [17, 18].map((seed) => () => lumpy(new THREE.CylinderGeometry(0.04, 0.15, 1, 6, 4), 0.15, seed).translate(0, 0.5, 0)),
  rubble: [19, 20].map((seed) => () => heap(9, 0.4, 0.3, seed)),
  rootArches: [21, 22].map((seed) => () => {
    const rand = random(seed);
    const parts = [];
    for (let r = 0; r < 6; r++) {
      const radius = 0.25 + 0.25 * rand();
      const arch = new THREE.TorusGeometry(radius, 0.04, 4, 8, Math.PI).scale(1, Math.min(1, 0.6 / radius), 1);
      parts.push(arch.rotateY(rand() * Math.PI).translate((rand() - 0.5) * 0.5, 0, (rand() - 0.5) * 0.5));
    }
    return mergeGeometries(parts);
  }),
  hummock: () => lumpy(new THREE.SphereGeometry(1.1, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0.08, 23).scale(1, 0.9, 1),
};

// Uprooted trees lie on a thicker trunk than plain logs.
const SHAPE_FOR = { uprooted: { log: "trunk" } };

const geometries = new Map();
function variants(name) {
  if (!geometries.has(name)) {
    geometries.set(name, [SHAPES[name]].flat().map((build) => {
      const g = build();
      return g.index ? g.toNonIndexed() : g;
    }));
  }
  return geometries.get(name);
}

// objects: from tiles' objects lists. tileAt(tx, tz): a decoded tile, for the ground under them.
// origin: the continent position of the scene's origin.
export function objectMeshes(objects, tileAt, origin) {
  const groups = new Map(); // "shape/variant" -> [{ object, part }]
  for (const object of objects) {
    const spec = OBJECT_TYPES[object.type];
    if (!spec) continue;
    spec.parts.forEach((part, p) => {
      const shape = SHAPE_FOR[object.type]?.[part.shape] ?? part.shape;
      const v = Math.floor(object.yaw * 1000) % variants(shape).length;
      const key = `${shape}/${v}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ object, p });
    });
  }
  const meshes = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const tilt = new THREE.Quaternion();
  const color = new THREE.Color();
  for (const [key, list] of groups) {
    const [shape, v] = key.split("/");
    const mesh = new THREE.InstancedMesh(variants(shape)[Number(v)], material, list.length);
    list.forEach(({ object, p }, n) => {
      const { y, pitch } = seat(object, tileAt);
      q.setFromAxisAngle(UP, object.yaw).multiply(tilt.setFromAxisAngle(AXIS_Z, pitch));
      m.compose(new THREE.Vector3(object.at[0] - origin[0], y, object.at[1] - origin[1]), q, new THREE.Vector3(object.scale, object.scale, object.scale));
      mesh.setMatrixAt(n, m);
      mesh.setColorAt(n, color.setRGB(...object.colors[p], THREE.SRGBColorSpace));
    });
    mesh.computeBoundingSphere();
    mesh.userData.objects = list.map(({ object }) => object);
    meshes.push(mesh);
  }
  return meshes;
}

// Where an object sits: long ones rest on the ground at both ends and tilt between them, others
// on the lowest ground under them, so nothing floats. Each sinks in a little.
function seat(object, tileAt) {
  const spec = OBJECT_TYPES[object.type];
  const [x, z] = object.at;
  const ground = (dx, dz) => meshHeightAt(tileAt, x + dx, z + dz) ?? 0;
  const sink = (spec.sink ?? 0.1) * object.height;
  const { footprint } = object;
  if (footprint.capsule) {
    const half = footprint.capsule[1];
    const [c, s] = [Math.cos(object.yaw), Math.sin(object.yaw)];
    // The object's +x points at (cos yaw, -sin yaw) in x, z.
    const a = ground(-c * half, s * half);
    const b = ground(c * half, -s * half);
    return { y: (a + b) / 2 - sink, pitch: Math.atan2(b - a, half * 2) };
  }
  const r = footprint.circle ?? Math.min(...footprint.rect) / 2;
  const low = Math.min(ground(0, 0), ground(r, 0), ground(-r, 0), ground(0, r), ground(0, -r));
  return { y: low - sink, pitch: 0 };
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % 100000;
}

// A steady random sequence, so shapes look the same every load.
function random(seed) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
