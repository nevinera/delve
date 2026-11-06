import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CLUTTER } from "../world/clutter.js";

// Ground clutter for the 3D view, as instanced meshes: one per part of each kind (world/clutter.js
// says what grows where). Shapes are about 1ft tall, or 1ft across for flat ones, standing on y = 0;
// each instance scales, turns and colors its shape.

const UP = new THREE.Vector3(0, 1, 0);
// Clutter fades away with distance from the focus (scene x, z), to nothing at the radius the
// graphics settings pick, so it doesn't stop at an edge. From FADE_FROM of the radius out, it gets
// sparser, each piece going at its own distance, picked from where it stands, and the pieces left
// get fainter, drawn with fewer of their pixels (dithered, so nothing needs sorting) and a little
// smaller.
const FADE_FROM = 0.55;
const SHRINK = 0.3; // how much smaller a piece is at the radius
const focus = { value: new THREE.Vector2() };
const fade = { value: new THREE.Vector2(130, 240) };

export function setClutterFocus(x, z) {
  focus.value.set(x, z);
}

export function setClutterRadius(radiusFt) {
  fade.value.set(radiusFt * FADE_FROM, radiusFt);
}

function fading(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.clutterFocus = focus;
    shader.uniforms.clutterFade = fade;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nuniform vec2 clutterFocus;\nuniform vec2 clutterFade;\nvarying float vClutterShown;").replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
        vec2 clutterAt = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
        float clutterOut = smoothstep(clutterFade.x, clutterFade.y, distance(clutterAt, clutterFocus));
        // A number for this piece, from where it stands: it goes once it's that far into the fade.
        vec3 clutterP = fract(vec3(clutterAt.xyx) * 0.1031);
        clutterP += dot(clutterP, clutterP.yzx + 33.33);
        float clutterOwn = fract((clutterP.x + clutterP.y) * clutterP.z);
        float clutterKept = clutterOwn > clutterOut ? 1.0 : 0.0;
        transformed *= clutterKept * (1.0 - ${SHRINK.toFixed(2)} * clutterOut);
        vClutterShown = 1.0 - clutterOut;`,
    );
    // The share of a piece's pixels drawn, by a fixed noise over the screen.
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vClutterShown;").replace(
      "#include <clipping_planes_fragment>",
      `#include <clipping_planes_fragment>
        if (vClutterShown < 1.0 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) > vClutterShown) discard;`,
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

// A vine along `points` (x, y, z), about 1ft long: a thin stem with small leaves along it, turned
// every which way.
function vineAlong(points, seed) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const parts = [new THREE.TubeGeometry(curve, 16, 0.012, 4, false)];
  const rand = random(seed);
  for (let t = 0.04; t < 1; t += 0.05 + rand() * 0.04) {
    const leaf = new THREE.PlaneGeometry(0.06, 0.04).rotateX(rand() * Math.PI).rotateY(rand() * Math.PI * 2).rotateZ(rand() * Math.PI);
    parts.push(leaf.translate(...curve.getPoint(t).toArray()));
  }
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}

// A vine hanging in a loop between two points 1ft apart, drawn upward, as it's turned to hang.
function vineLoop(seed) {
  const rand = random(seed);
  const sag = 0.4 + rand() * 0.3;
  return vineAlong([-0.5, -0.25, 0, 0.25, 0.5].map((x) => [x, sag * (1 - 4 * x * x), (rand() - 0.5) * 0.12]), seed);
}

// A strand of vine 1ft long, swaying a little, drawn upward, as it's turned to hang.
function vineStrand(seed) {
  const rand = random(seed);
  return vineAlong([0, 0.25, 0.5, 0.75, 1].map((y) => [(rand() - 0.5) * 0.12 * y, y, (rand() - 0.5) * 0.12 * y]), seed);
}

const SHAPES = {
  tuft: () => blades(9, { width: 0.12, spread: 0.12, seed: 1 }),
  stems: () => blades(3, { width: 0.04, height: [0.75, 1], lean: 0.15, seed: 2 }),
  blooms: () => mergeGeometries([0, 1, 2].map(bloomAt)),
  pebble: () => new THREE.IcosahedronGeometry(0.5, 0).scale(1, 0.45, 0.8).translate(0, 0.12, 0),
  stone: () => new THREE.DodecahedronGeometry(0.55, 0).scale(1, 0.9, 0.8).translate(0, 0.35, 0),
  // Rock jutting from a face: most of it out, the rest sunk in.
  crag: [() => new THREE.DodecahedronGeometry(0.5, 0).scale(1, 0.6, 0.75).rotateY(0.4).translate(0, 0.12, 0), () => new THREE.IcosahedronGeometry(0.5, 0).scale(0.8, 0.75, 0.6).translate(0, 0.15, 0)],
  vineLoop: [7, 8, 9].map((seed) => () => vineLoop(seed)),
  vine: [10, 11, 12].map((seed) => () => vineStrand(seed)),
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
        const solid = part.shape === "stone" || part.shape === "pebble" || part.shape === "crag";
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
        mesh.userData.all = { matrices: mesh.instanceMatrix.array.slice(), colors: mesh.instanceColor.array.slice(), count: placed.length };
        mesh.computeBoundingSphere();
        meshes.push(mesh);
      });
    });
  }
  return meshes;
}

// Draws only the instances within `radiusFt` of scene point (x, z): the rest have shrunk to
// nothing, but the GPU would still work through their shapes. Density (0-1) is the share of them
// drawn; the same ones are left out each time.
export function gatherClutter(meshes, x, z, radiusFt, density = 1) {
  const r2 = radiusFt * radiusFt;
  for (const mesh of meshes) {
    const { matrices, colors, count } = mesh.userData.all;
    const [toM, toC] = [mesh.instanceMatrix.array, mesh.instanceColor.array];
    let n = 0;
    for (let i = 0; i < count; i++) {
      const [dx, dz] = [matrices[i * 16 + 12] - x, matrices[i * 16 + 14] - z];
      if (dx * dx + dz * dz > r2 || (Math.imul(i + 1, 2654435761) >>> 0) / 4294967296 >= density) continue;
      if (n !== i) {
        toM.set(matrices.subarray(i * 16, i * 16 + 16), n * 16);
        toC.set(colors.subarray(i * 3, i * 3 + 3), n * 3);
      }
      n++;
    }
    mesh.count = n;
    mesh.visible = n > 0;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }
}

// A steady random sequence, so shapes look the same every load.
function random(seed) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
