import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CLUTTER } from "../world/clutter.js";

// Ground clutter for the 3D view, as instanced meshes: one per part of each kind (world/clutter.js
// says what grows where). Shapes are about 1ft tall, or 1ft across for flat ones, standing on y = 0;
// each instance scales, turns and colors its shape.

const UP = new THREE.Vector3(0, 1, 0);
// Clutter shrinks away with distance from the focus (scene x, z), from `startFt` to nothing at
// `endFt`, so it thins out instead of stopping at the edge of the tiles it's drawn on. endFt stays
// inside a tile, the least distance from the focus to that edge.
const FADE = { startFt: 250, endFt: 480 };
const focus = { value: new THREE.Vector2() };

export function setClutterFocus(x, z) {
  focus.value.set(x, z);
}

function fading(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.clutterFocus = focus;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform vec2 clutterFocus;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vec2 clutterAt = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
        transformed *= 1.0 - smoothstep(${FADE.startFt.toFixed(1)}, ${FADE.endFt.toFixed(1)}, distance(clutterAt, clutterFocus));`,
      );
  };
  return material;
}

const material = fading(new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
const flat = fading(new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }));

// Thin blades fanned out round a point: count of them, each `width` wide at the foot, reaching
// `height` (0-1 each, varied) and leaning out by `lean`. Segments bend each blade over.
function blades(count, { width = 0.08, height = [0.7, 1], lean = 0.3, segments = 2, spread = 0.08, seed = 1 }) {
  const positions = [];
  const rand = random(seed);
  for (let b = 0; b < count; b++) {
    const angle = (b / count) * Math.PI * 2 + rand() * 0.8;
    const top = height[0] + (height[1] - height[0]) * rand();
    const [dx, dz] = [Math.cos(angle), Math.sin(angle)];
    const [sx, sz] = [-dz * width * 0.5, dx * width * 0.5];
    const base = [dx * spread * rand(), 0, dz * spread * rand()];
    let prev = [base[0] - sx, 0, base[2] - sz, base[0] + sx, 0, base[2] + sz];
    for (let s = 1; s <= segments; s++) {
      const t = s / segments;
      const out = lean * t * t * top;
      const narrow = 1 - t;
      const c = [base[0] + dx * out, top * t, base[2] + dz * out];
      const next = [c[0] - sx * narrow, c[1], c[2] - sz * narrow, c[0] + sx * narrow, c[1], c[2] + sz * narrow];
      positions.push(...prev.slice(0, 3), ...prev.slice(3), ...next.slice(3), ...prev.slice(0, 3), ...next.slice(3), ...next.slice(0, 3));
      prev = next;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}

// Copies of a geometry at points [[x, y, z, scale], ...], merged into one.
function at(geometry, points) {
  return mergeGeometries(points.map(([x, y, z, s = 1]) => geometry.clone().scale(s, s, s).translate(x, y, z)));
}

// A flat ring of `sides` points with ragged radii, lying on y = lift.
function patch(sides, lift, seed) {
  const rand = random(seed);
  const shape = new THREE.Shape();
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const r = 0.5 * (0.7 + 0.3 * rand());
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).translate(0, lift, 0);
}

const stalkTops = [[0, 0.55, 0, 1], [0.15, 0.4, 0.08, 0.8], [-0.1, 0.32, -0.12, 0.7]];
const thistleTips = [0.2, 1.9, 3.6, 5.2].map((a, i) => [Math.cos(a) * 0.25, 0.75 + 0.08 * i, Math.sin(a) * 0.25]);
const reedTops = [[0.05, 0.92, 0.02], [-0.08, 0.85, 0.06]];

const SHAPES = {
  tuft: () => blades(9, { width: 0.12, spread: 0.12, seed: 1 }),
  stems: () => blades(3, { width: 0.04, height: [0.75, 1], lean: 0.15, seed: 2 }),
  blooms: () => mergeGeometries([0, 1, 2].map(bloomAt)),
  pebble: () => new THREE.IcosahedronGeometry(0.5, 0).scale(1, 0.45, 0.8).translate(0, 0.12, 0),
  stone: () => new THREE.DodecahedronGeometry(0.55, 0).scale(1, 0.9, 0.8).translate(0, 0.35, 0),
  bush: () => new THREE.IcosahedronGeometry(0.5, 1).scale(1, 0.8, 1).translate(0, 0.38, 0),
  fern: () => blades(7, { width: 0.18, height: [0.6, 0.8], lean: 1.1, segments: 3, spread: 0.02, seed: 3 }),
  stalks: () => mergeGeometries(stalkTops.map(([x, y, z, s]) => new THREE.CylinderGeometry(0.035, 0.05, y, 5).translate(x, y / 2, z).scale(s, 1, s))),
  caps: () => at(new THREE.SphereGeometry(0.16, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), stalkTops.map(([x, y, z, s]) => [x * s, y, z * s, s])),
  patch: () => patch(9, 0.04, 4),
  twig: () => new THREE.CylinderGeometry(0.025, 0.035, 1, 4).rotateZ(Math.PI / 2).translate(0, 0.04, 0),
  thistle: () => mergeGeometries(thistleTips.map(([x, y, z]) => cylinderBetween([0, 0, 0], [x, y, z], 0.04))),
  thistleDots: () => at(new THREE.IcosahedronGeometry(0.07, 0), thistleTips),
  mound: () => new THREE.IcosahedronGeometry(0.5, 1).scale(1, 0.35, 1).translate(0, 0.04, 0),
  reeds: () => blades(8, { width: 0.05, height: [0.6, 1], lean: 0.12, segments: 3, spread: 0.15, seed: 5 }),
  cattails: () => at(new THREE.CylinderGeometry(0.035, 0.035, 0.14, 6), reedTops),
  lily: () => new THREE.CircleGeometry(0.5, 12, 0.3, Math.PI * 2 - 0.6).rotateX(-Math.PI / 2).translate(0, 0.05, 0),
  lilyFlower: () => new THREE.ConeGeometry(0.1, 0.1, 6).translate(0.1, 0.1, 0.05),
  shell: () => new THREE.ConeGeometry(0.5, 0.3, 7).scale(1, 1, 0.7).translate(0, 0.1, 0),
  log: () => new THREE.CylinderGeometry(0.1, 0.13, 1, 6).rotateZ(Math.PI / 2).translate(0, 0.1, 0),
  weed: () => blades(5, { width: 0.1, height: [0.6, 1], lean: 0.25, segments: 4, spread: 0.2, seed: 6 }),
};

// A flower head on the tip of stem b (the stems shape's blades: 2 segments of 6 vertices each,
// ending at the tip).
function bloomAt(b) {
  const p = SHAPES.stems().attributes.position;
  const last = (b + 1) * 12 - 1;
  return new THREE.IcosahedronGeometry(0.09, 0).translate(p.getX(last), p.getY(last), p.getZ(last));
}

function cylinderBetween(a, b, radius) {
  const from = new THREE.Vector3(...a);
  const to = new THREE.Vector3(...b);
  const length = from.distanceTo(to);
  const g = new THREE.CylinderGeometry(radius * 0.3, radius, length, 4).translate(0, length / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, to.clone().sub(from).normalize()));
  return g.translate(...a);
}

const geometries = new Map();
function shape(name) {
  if (!geometries.has(name)) {
    const g = SHAPES[name]();
    geometries.set(name, g.index ? g.toNonIndexed() : g);
  }
  return geometries.get(name);
}

// instances: from clutterForTile. origin: the continent position of the scene's origin.
export function clutterMeshes(instances, origin) {
  const byKind = new Map();
  for (const item of instances) {
    if (!byKind.has(item.kind)) byKind.set(item.kind, []);
    byKind.get(item.kind).push(item);
  }
  const meshes = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const turn = new THREE.Quaternion();
  const normal = new THREE.Vector3();
  const color = new THREE.Color();
  for (const [kind, list] of byKind) {
    CLUTTER[kind].parts.forEach((part, p) => {
      const placed = list.filter((item) => item.colors[p]);
      if (!placed.length) return;
      const solid = part.shape === "stone" || part.shape === "pebble";
      const mesh = new THREE.InstancedMesh(shape(part.shape), solid ? flat : material, placed.length);
      placed.forEach((item, n) => {
        q.setFromUnitVectors(UP, normal.set(...item.normal)).multiply(turn.setFromAxisAngle(UP, item.yaw));
        m.compose(new THREE.Vector3(item.x - origin[0], item.y, item.z - origin[1]), q, new THREE.Vector3(item.scale, item.scale, item.scale));
        mesh.setMatrixAt(n, m);
        mesh.setColorAt(n, color.setRGB(...item.colors[p], THREE.SRGBColorSpace));
      });
      mesh.computeBoundingSphere();
      meshes.push(mesh);
    });
  }
  return meshes;
}

// A steady random sequence, so shapes look the same every load.
function random(seed) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
