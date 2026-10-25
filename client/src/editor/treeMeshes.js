import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Tree models for the 3D view, as instanced meshes: one per part (trunk, crown, branch) per kind.
// Each kind's parts are placed from its height `h`, crown radius `c` and the clearance `b` under
// its canopy, in feet. Trees are very tall on purpose.

const SIZES = {
  1: { height: 60, trunk: 2.5, crown: 18 },
  2: { height: 90, trunk: 4, crown: 28 },
  3: { height: 120, trunk: 6, crown: 38 },
};

const LIFT = 1.6; // canopies sit this much higher than the kinds' `clear` says

const trunk = new THREE.CylinderGeometry(0.7, 1, 1, 7).translate(0, 0.5, 0);
const blob = new THREE.SphereGeometry(1, 14, 9);
const cone = new THREE.ConeGeometry(1, 1, 10, 3).translate(0, 0.5, 0);
// An upside-down bowl, its rim drooping a little below its widest point: 1 tall, rim at 0.
const DROOP = 0.6; // share of a half turn the bowl runs down from its top
const bowl = new THREE.SphereGeometry(1, 14, 7, 0, Math.PI * 2, 0, Math.PI * DROOP).translate(0, -Math.cos(Math.PI * DROOP), 0);
bowl.scale(1, 1 / (1 - Math.cos(Math.PI * DROOP)), 1);

// A crown is a few nested shells of a shape, each textured with leaf clusters and cut out
// between them (alpha test, so nothing needs sorting), so you see into it and through its edges.
// A dark core keeps the middle from looking hollow. `repeat` sets how many leaf tiles go round
// and up the outer shell; `lift` raises each smaller shell to keep it centered.
function crown(shape, { repeat: [ru, rv], lift = 0 }) {
  const shells = [1, 0.78, 0.56].map((s, n) => {
    const g = shape.clone().scale(s, s, s).rotateY(n * 1.7).translate(0, lift * (1 - s), 0);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ru * (0.6 + 0.4 * s), uv.getY(i) * rv * (0.6 + 0.4 * s));
    return g;
  });
  return mergeGeometries(shells);
}
const core = (shape, lift = 0) => shape.clone().scale(0.42, 0.42, 0.42).translate(0, lift * 0.58, 0);

const bark = new THREE.MeshLambertMaterial({ color: 0x5a4430 });
const deadBark = new THREE.MeshLambertMaterial({ color: 0x6e6458 });
// Crowns near the focus (scene x, z) are cutout shells; past `range` feet they're drawn solid,
// which is far cheaper. Each crown has both meshes, and each draws only its own side of the range.
const sight = { focus: { value: new THREE.Vector2() }, range: { value: 1e9 } };

export function setTreeSight(x, z, rangeFt) {
  sight.focus.value.set(x, z);
  sight.range.value = Math.min(rangeFt, 1e9);
}

function bySight(material, far) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.treeFocus = sight.focus;
    shader.uniforms.treeRange = sight.range;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nuniform vec2 treeFocus;\nuniform float treeRange;").replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
        float treeOut = step(treeRange, distance((modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz, treeFocus));
        transformed *= ${far ? "treeOut" : "1.0 - treeOut"};`,
    );
  };
  material.customProgramCacheKey = () => (far ? "treeFar" : "treeNear");
  return material;
}

// Leaves are seen from both sides, since you look into and up through crowns.
let leaves;
function leafMaterial() {
  leaves ??= bySight(new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide, map: leafTexture(), alphaTest: 0.5 }), false);
  return leaves;
}
const solidLeaves = bySight(new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, side: THREE.DoubleSide }), true);
const shade = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });

const UP = new THREE.Vector3(0, 1, 0);
const tilt = (angle, spin) =>
  new THREE.Quaternion().setFromAxisAngle(UP, spin).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), angle));

// kind: { height, clear, parts }, with clear the share of the height below the canopy.
// part: { geometry, material, color?, at(h, c, t, r, b) -> [y, quaternion, [sx, sy, sz]] }, with
// `t` the trunk radius and `r` a steady random number per tree.
const KINDS = {
  oak: {
    height: 1,
    clear: 0.36,
    parts: [
      { geometry: trunk, material: bark, at: (h, c, t, r, b) => [0, null, [t, b + h * 0.26, t]] },
      { geometry: () => crown(blob, { repeat: [7, 4] }), far: blob, material: leafMaterial, color: 0x4a7a36, at: (h, c, t, r, b) => [b + h * 0.32, null, [c, h * 0.32, c]] },
      { geometry: () => core(blob), material: () => shade, color: 0x1f3a18, at: (h, c, t, r, b) => [b + h * 0.32, null, [c, h * 0.32, c]] },
    ],
  },
  pine: {
    height: 1.15,
    clear: 0.18,
    parts: [
      { geometry: trunk, material: bark, at: (h, c, t, r, b) => [0, null, [t * 0.8, b + h * 0.32, t * 0.8]] },
      { geometry: () => crown(cone, { repeat: [6, 7], lift: 0.25 }), far: cone, material: leafMaterial, color: 0x356146, at: (h, c, t, r, b) => [b, null, [c * 0.6, h * 0.82, c * 0.6]] },
      { geometry: () => core(cone, 0.25), material: () => shade, color: 0x16301f, at: (h, c, t, r, b) => [b, null, [c * 0.6, h * 0.82, c * 0.6]] },
    ],
  },
  willow: {
    height: 0.9,
    clear: 0.3,
    parts: [
      { geometry: trunk, material: bark, at: (h, c, t, r, b) => [0, null, [t * 1.2, b + h * 0.4, t * 1.2]] },
      { geometry: () => crown(bowl, { repeat: [9, 3], lift: 0.3 }), far: bowl, material: leafMaterial, color: 0x7a9a4c, at: (h, c, t, r, b) => [b, null, [c * 1.3, h * 0.5, c * 1.3]] },
    ],
  },
  dead: {
    height: 0.85,
    parts: [
      { geometry: trunk, material: deadBark, at: (h, c, t) => [0, null, [t * 0.8, h * 0.9, t * 0.8]] },
      { geometry: trunk, material: deadBark, at: (h, c, t, r) => [h * 0.45, tilt(0.8, r * 6.28), [t * 0.4, h * 0.35, t * 0.4]] },
      { geometry: trunk, material: deadBark, at: (h, c, t, r) => [h * 0.6, tilt(0.7, r * 6.28 + 2.6), [t * 0.35, h * 0.28, t * 0.35]] },
    ],
  },
};

// trees: [{ x, z, ground, size, kind }] in scene feet. Unknown kinds draw as oaks.
export function treeMeshes(trees) {
  const byKind = new Map();
  for (const tree of trees) {
    const kind = KINDS[tree.kind] ? tree.kind : "oak";
    if (!byKind.has(kind)) byKind.set(kind, []);
    byKind.get(kind).push(tree);
  }

  const meshes = [];
  const m = new THREE.Matrix4();
  const none = new THREE.Quaternion();
  const color = new THREE.Color();
  for (const [kind, list] of byKind) {
    const { height, clear = 0, parts } = KINDS[kind];
    // Crowns with a solid stand-in get it as one more part, with the same place and color.
    const all = parts.flatMap((part) => (part.far ? [part, { ...part, geometry: part.far, material: solidLeaves }] : [part]));
    for (const part of all) {
      const mesh = new THREE.InstancedMesh(built(part.geometry), typeof part.material === "function" ? part.material() : part.material, list.length);
      list.forEach(({ x, z, ground, size }, n) => {
        const r = random(x, z);
        const s = SIZES[size];
        const h = s.height * height * (0.85 + 0.3 * r);
        const c = s.crown * (0.9 + 0.2 * random(z, x));
        const [y, q, scale] = part.at(h, c, s.trunk, r, clear * h * LIFT);
        // Every tree gets its own turn, so crowns don't line up.
        const turn = new THREE.Quaternion().setFromAxisAngle(UP, r * 6.28).multiply(q ?? none);
        m.compose(new THREE.Vector3(x, ground + y, z), turn, new THREE.Vector3(...scale));
        mesh.setMatrixAt(n, m);
        if (part.color) mesh.setColorAt(n, color.set(part.color).offsetHSL(0.03 * (r - 0.5), 0, 0.08 * (random(x + 1, z) - 0.5)));
      });
      meshes.push(mesh);
    }
  }
  return meshes;
}

// Crown geometries are built on first use and kept.
const builtGeometries = new Map();
function built(geometry) {
  if (typeof geometry !== "function") return geometry;
  if (!builtGeometries.has(geometry)) builtGeometries.set(geometry, geometry());
  return builtGeometries.get(geometry);
}

// Clusters of leaves, white on clear so instance colors tint them, covering a bit over half the
// tile. It wraps, so clusters carry across tile edges.
function leafTexture() {
  const SIZE = 256;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  let seed = 7;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let cluster = 0; cluster < 26; cluster++) {
    const [cx, cy] = [rand() * SIZE, rand() * SIZE];
    for (let leaf = 0; leaf < 14; leaf++) {
      const a = rand() * Math.PI * 2;
      const d = rand() * 22;
      const v = 150 + Math.floor(rand() * 105);
      const turn = rand() * Math.PI;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      for (const [ox, oy] of [[0, 0], [SIZE, 0], [-SIZE, 0], [0, SIZE], [0, -SIZE]]) {
        ctx.beginPath();
        ctx.ellipse(cx + Math.cos(a) * d + ox, cy + Math.sin(a) * d + oy, 9, 4, turn, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// A steady pseudo-random number in [0, 1) for a spot, so trees keep their looks between redraws.
function random(x, z) {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}
