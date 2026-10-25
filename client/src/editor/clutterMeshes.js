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
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nuniform vec2 clutterFocus;").replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
        vec2 clutterAt = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
        transformed *= 1.0 - smoothstep(${FADE.startFt.toFixed(1)}, ${FADE.endFt.toFixed(1)}, distance(clutterAt, clutterFocus));`,
    );
  };
  return material;
}

const material = fading(new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
// Fronds are mostly see-through: a leaflet texture, cut out by alpha test rather than blended, so
// nothing needs sorting.
const leafy = fading(
  new THREE.MeshLambertMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    map: frondTexture(),
    alphaTest: 0.5,
  }),
);
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

// A fern: `count` fronds round a point, each a strip that rises at a slant and droops toward its
// tip, textured with leaflets (frondTexture). Unit size: fronds about 1 long, standing about 0.6
// tall.
function fronds(count, seed) {
  const rand = random(seed);
  const SEGMENTS = 6;
  const parts = [];
  for (let f = 0; f < count; f++) {
    const angle = (f / count) * Math.PI * 2 + rand() * 0.6;
    const [dx, dz] = [Math.cos(angle), Math.sin(angle)];
    const length = 0.65 + 0.35 * rand();
    const rise = 1.3 - 0.25 * rand(); // the frond's angle up from flat at its foot
    const droop = 0.9 + 0.4 * rand(); // how far it bends down by the tip
    const halfWidth = 0.17 * length;
    const positions = [];
    const uvs = [];
    let [x, y, z] = [dx * 0.03, 0, dz * 0.03];
    for (let s = 0; s <= SEGMENTS; s++) {
      const t = s / SEGMENTS;
      positions.push(x - dz * halfWidth, y, z + dx * halfWidth, x + dz * halfWidth, y, z - dx * halfWidth);
      uvs.push(0, t, 1, t);
      const pitch = rise - droop * t;
      const step = length / SEGMENTS;
      x += dx * Math.cos(pitch) * step;
      z += dz * Math.cos(pitch) * step;
      y += Math.sin(pitch) * step;
    }
    const indices = [];
    for (let s = 0; s < SEGMENTS; s++) {
      const v = s * 2;
      indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    parts.push(g);
  }
  return mergeGeometries(parts);
}

// A fern frond's leaflets, white on clear so instance colors tint them: a stem up the middle and
// pairs of narrow leaflets angled toward the tip, longest a third of the way up. u runs across
// the frond, v from foot (0) to tip (1).
function frondTexture() {
  const W = 128;
  const H = 512;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const rand = random(11);
  ctx.strokeStyle = "#d8d8d8";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(W / 2, H);
  ctx.lineTo(W / 2, 4);
  ctx.stroke();
  const PAIRS = 22;
  for (let p = 0; p < PAIRS; p++) {
    const t = (p + 0.5) / PAIRS; // 0 at the foot
    const y = H * (1 - t);
    const reach = (W / 2 - 4) * Math.min(1, 1.6 * Math.sin(Math.PI * Math.min(1, t * 1.25 + 0.05)));
    for (const side of [-1, 1]) {
      const shade = 200 + Math.floor(rand() * 55);
      ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
      ctx.beginPath();
      // A narrow leaflet from the stem out and up toward the tip.
      const tipX = W / 2 + side * reach;
      const tipY = y - reach * 0.45;
      const width = 5 + 4 * (1 - t);
      ctx.moveTo(W / 2, y + width);
      ctx.quadraticCurveTo(W / 2 + side * reach * 0.5, y - reach * 0.1 + width, tipX, tipY);
      ctx.quadraticCurveTo(W / 2 + side * reach * 0.5, y - reach * 0.3 - width, W / 2, y - width);
      ctx.closePath();
      ctx.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
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

const stalkTops = [
  [0, 0.55, 0, 1],
  [0.15, 0.4, 0.08, 0.8],
  [-0.1, 0.32, -0.12, 0.7],
];
const thistleTips = [0.2, 1.9, 3.6, 5.2].map((a, i) => [Math.cos(a) * 0.25, 0.75 + 0.08 * i, Math.sin(a) * 0.25]);
const reedTops = [
  [0.05, 0.92, 0.02],
  [-0.08, 0.85, 0.06],
];

const SHAPES = {
  tuft: () => blades(9, { width: 0.12, spread: 0.12, seed: 1 }),
  stems: () => blades(3, { width: 0.04, height: [0.75, 1], lean: 0.15, seed: 2 }),
  blooms: () => mergeGeometries([0, 1, 2].map(bloomAt)),
  pebble: () => new THREE.IcosahedronGeometry(0.5, 0).scale(1, 0.45, 0.8).translate(0, 0.12, 0),
  stone: () => new THREE.DodecahedronGeometry(0.55, 0).scale(1, 0.9, 0.8).translate(0, 0.35, 0),
  bush: () => new THREE.IcosahedronGeometry(0.5, 1).scale(1, 0.8, 1).translate(0, 0.38, 0),
  fern: [3, 4, 5, 6].map((seed) => () => fronds(6 + (seed % 3), seed)),
  stalks: () =>
    mergeGeometries(stalkTops.map(([x, y, z, s]) => new THREE.CylinderGeometry(0.035, 0.05, y, 5).translate(x, y / 2, z).scale(s, 1, s))),
  caps: () =>
    at(
      new THREE.SphereGeometry(0.16, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2),
      stalkTops.map(([x, y, z, s]) => [x * s, y, z * s, s]),
    ),
  patch: () => patch(9, 0.04, 4),
  twig: () => new THREE.CylinderGeometry(0.025, 0.035, 1, 4).rotateZ(Math.PI / 2).translate(0, 0.04, 0),
  thistle: () => mergeGeometries(thistleTips.map(([x, y, z]) => cylinderBetween([0, 0, 0], [x, y, z], 0.04))),
  thistleDots: () => at(new THREE.IcosahedronGeometry(0.07, 0), thistleTips),
  reeds: () =>
    blades(8, {
      width: 0.05,
      height: [0.6, 1],
      lean: 0.12,
      segments: 3,
      spread: 0.15,
      seed: 5,
    }),
  cattails: () => at(new THREE.CylinderGeometry(0.035, 0.035, 0.14, 6), reedTops),
  lily: () => new THREE.CircleGeometry(0.5, 12, 0.3, Math.PI * 2 - 0.6).rotateX(-Math.PI / 2).translate(0, 0.05, 0),
  lilyFlower: () => new THREE.ConeGeometry(0.1, 0.1, 6).translate(0.1, 0.1, 0.05),
  shell: () => new THREE.ConeGeometry(0.5, 0.3, 7).scale(1, 1, 0.7).translate(0, 0.1, 0),
  log: () => new THREE.CylinderGeometry(0.1, 0.13, 1, 6).rotateZ(Math.PI / 2).translate(0, 0.1, 0),
  weed: () =>
    blades(5, {
      width: 0.1,
      height: [0.6, 1],
      lean: 0.25,
      segments: 4,
      spread: 0.2,
      seed: 6,
    }),
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

// A shape's geometries: one, or several variants for shapes listed as an array of builders.
const geometries = new Map();
function variants(name) {
  if (!geometries.has(name)) {
    const builders = [SHAPES[name]].flat();
    geometries.set(
      name,
      builders.map((build) => {
        const g = build();
        return g.index ? g.toNonIndexed() : g;
      }),
    );
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
      const shapes = variants(part.shape);
      shapes.forEach((geometry, v) => {
        // Each instance takes a variant from its turn, which is already random.
        const placed = list.filter((item) => item.colors[p] && Math.floor(item.yaw * 1000) % shapes.length === v);
        if (!placed.length) return;
        const solid = part.shape === "stone" || part.shape === "pebble";
        const mesh = new THREE.InstancedMesh(geometry, solid ? flat : part.shape === "fern" ? leafy : material, placed.length);
        placed.forEach((item, n) => {
          q.setFromUnitVectors(UP, normal.set(...item.normal)).multiply(turn.setFromAxisAngle(UP, item.yaw));
          m.compose(
            new THREE.Vector3(item.x - origin[0], item.y, item.z - origin[1]),
            q,
            new THREE.Vector3(item.scale, item.scale, item.scale),
          );
          mesh.setMatrixAt(n, m);
          mesh.setColorAt(n, color.setRGB(...item.colors[p], THREE.SRGBColorSpace));
        });
        mesh.computeBoundingSphere();
        meshes.push(mesh);
      });
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
