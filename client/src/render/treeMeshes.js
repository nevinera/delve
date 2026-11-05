import * as THREE from "three";

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

// A crown is three nested shells of a shape, textured with leaf clusters. Up close the outer two
// are cut out between the leaves (alpha test, so nothing needs sorting) and the innermost is
// opaque with dark gaps, so you see into the crown. Farther away a crown draws in stages: at each
// step its innermost shell drops and the next one out turns opaque, until only an opaque outer
// shell is left. Opaque shells have no cutout in their shader, so the last stage costs what a
// solid crown would. `repeat` sets how many leaf tiles go round and up the outer shell; `lift`
// raises each smaller shell to keep it centered.
const SHELLS = [1, 0.72, 0.45];
const HOLE = 0.22; // how bright an opaque shell's gaps are, against its leaves

function shell(shape, n, { repeat: [ru, rv], lift = 0 }) {
  const s = SHELLS[n];
  const g = shape.clone().scale(s, s, s).rotateY(n * 1.7).translate(0, lift * (1 - s), 0);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ru * (0.6 + 0.4 * s), uv.getY(i) * rv * (0.6 + 0.4 * s));
  return g;
}

// Far-ring stand-ins (renderView's far tiles): a few flat faces per crown, and a four-sided trunk.
// Fronds fanned out from a crown's top, each a strip that rises and droops: 1 wide each way from the
// middle, drooping about 0.5 below where it starts. Palms have these instead of shells of leaves.
function frondCrown(count, seed) {
  const positions = [];
  const indices = [];
  const SEGMENTS = 5;
  for (let f = 0; f < count; f++) {
    const angle = (f / count) * Math.PI * 2 + ((seed * (f + 1) * 0.37) % 0.5);
    const [dx, dz] = [Math.cos(angle), Math.sin(angle)];
    const base = positions.length / 3;
    for (let s = 0; s <= SEGMENTS; s++) {
      const t = s / SEGMENTS;
      const width = 0.2 * Math.sin(Math.PI * Math.min(1, t * 0.85 + 0.15));
      const [out, y] = [t, 0.35 * t - 0.85 * t * t];
      positions.push(dx * out - dz * width, y, dz * out + dx * width, dx * out + dz * width, y, dz * out - dx * width);
      if (s < SEGMENTS) indices.push(base + s * 2, base + s * 2 + 1, base + s * 2 + 2, base + s * 2 + 1, base + s * 2 + 3, base + s * 2 + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
const palmFronds = frondCrown(11, 3);
const fernFronds = frondCrown(15, 5);

const LOW_POLY = new Map([
  [blob, new THREE.IcosahedronGeometry(1, 0)],
  [cone, new THREE.ConeGeometry(1, 1, 6).translate(0, 0.5, 0)],
  [bowl, new THREE.ConeGeometry(1, 1, 6, 1, true).translate(0, 0.5, 0)],
]);
const farTrunk = new THREE.CylinderGeometry(0.7, 1, 1, 4, 1, true).translate(0, 0.5, 0);
// Darker than the leaves, about as dark as a lace shell with its gaps looks from afar.
const farLeaves = new THREE.MeshLambertMaterial({ color: 0xb8b8b8, flatShading: true, side: THREE.DoubleSide });

const bark = new THREE.MeshLambertMaterial({ color: 0x5a4430 });
const deadBark = new THREE.MeshLambertMaterial({ color: 0x6e6458 });
const paleBark = new THREE.MeshLambertMaterial({ color: 0xcfc6b4 });
const blackBark = new THREE.MeshLambertMaterial({ color: 0x24201e });
const sickBark = new THREE.MeshLambertMaterial({ color: 0x57503a });
const wineBark = new THREE.MeshLambertMaterial({ color: 0x4a2228 });
const silverBark = new THREE.MeshLambertMaterial({ color: 0xb6bcc8 });
const canes = new THREE.MeshLambertMaterial({ color: 0x7f9c4a });
const stalk = new THREE.MeshLambertMaterial({ color: 0xc8cdb8 });
// Caps and crystals are drawn solid, in each instance's color, and give a little light.
const capFlesh = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x0d3236, side: THREE.DoubleSide });
const frondFlesh = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
const crystalFlesh = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x2c1a4c, flatShading: true });

// Each crown's stage comes from its distance to the focus (scene x, z): one step past each of
// `stages` (feet), taken gradually across a band `band` feet wide, so it's a number like 1.4
// partway through. `solid` puts every crown in the last stage, for slower machines.
const sight = {
  focus: { value: new THREE.Vector2() },
  stages: { value: new THREE.Vector3(1e9, 1e9, 1e9) },
  band: { value: 40 },
  least: { value: 0 },
};

// The stage a crown at `away` feet from the focus is in, as the shaders work it out.
export function treeStage(away) {
  const { stages, band, least } = sight;
  const steps = stages.value.toArray().reduce((sum, at) => sum + Math.min(1, Math.max(0, (away - at) / band.value + 0.5)), 0);
  return Math.max(least.value, steps);
}

export function setTreeSight(x, z, stages, { band = 40, solid = false } = {}) {
  sight.focus.value.set(x, z);
  sight.stages.value.set(...[0, 1, 2].map((i) => Math.min(stages[i] ?? Infinity, 1e9)));
  sight.band.value = band;
  sight.least.value = solid ? SHELLS.length - 1 : 0;
}

// A shell's material: `cutout` or opaque, drawn for crowns at stages lo to hi. Across the band
// either side, the shell dissolves in or out with a 4×4 dither: each pixel has a fixed threshold,
// and a shell fading out keeps the pixels below its share while one fading in takes the ones
// above, so a shell's cutout and opaque versions trade pixels without overlapping.
const leafMaterials = new Map();
function leafMaterial(cutout, lo, hi) {
  const key = `${cutout ? "cutout" : "opaque"}${lo}-${hi}`;
  if (leafMaterials.has(key)) return leafMaterials.get(key);
  leafTextureOnce ??= leafTexture();
  const material = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    map: leafTextureOnce,
    alphaTest: cutout ? 0.5 : 0,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { treeFocus: sight.focus, treeStages: sight.stages, treeBand: sight.band, treeLeast: sight.least });
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform vec2 treeFocus;\nuniform vec3 treeStages;\nuniform float treeBand;\nuniform float treeLeast;\nvarying float vTreeShow;\nvarying float vTreeIn;",
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float treeAway = distance((modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz, treeFocus);
        vec3 treeSteps = clamp((vec3(treeAway) - treeStages) / treeBand + 0.5, 0.0, 1.0);
        float treeStage = max(treeLeast, treeSteps.x + treeSteps.y + treeSteps.z);
        // How much of this shell shows: rising from stage lo - 1 to lo, falling from hi to hi + 1.
        vTreeIn = step(treeStage, ${lo.toFixed(1)});
        vTreeShow = clamp(min(${lo === 0 ? "1.0" : `treeStage - ${(lo - 1).toFixed(1)}`}, ${(hi + 1).toFixed(1)} - treeStage), 0.0, 1.0);
        transformed *= step(0.001, vTreeShow);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vTreeShow;\nvarying float vTreeIn;")
      .replace(
        "#include <alphatest_fragment>",
        `#include <alphatest_fragment>
        if (vTreeShow < 0.999) {
          const float BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
          ivec2 cell = ivec2(mod(gl_FragCoord.xy, 4.0));
          float threshold = (BAYER[cell.y * 4 + cell.x] + 0.5) / 16.0;
          if (vTreeIn > 0.5 ? threshold < 1.0 - vTreeShow : threshold >= vTreeShow) discard;
        }`,
      );
    if (!cutout) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        diffuseColor.rgb = mix(vColor.rgb * ${HOLE.toFixed(2)}, diffuseColor.rgb, step(0.5, diffuseColor.a));
        diffuseColor.a = 1.0;`,
      );
    }
  };
  material.customProgramCacheKey = () => `tree-${key}`;
  leafMaterials.set(key, material);
  return material;
}
let leafTextureOnce;

// A crown's parts: each shell (0 outer) cut out while the stage is at most last - 1 - n, and opaque
// at stage last - n. The innermost shell is never cut out.
function crownParts(shape, opts, colors, at) {
  const last = SHELLS.length - 1;
  return SHELLS.flatMap((_, n) => {
    const geometry = () => shell(shape, n, opts);
    // One color, a function of a tree's random number, or [outer shell's, the others'].
    const color = Array.isArray(colors) ? colors[n ? 1 : 0] : colors;
    const parts = [{ geometry, material: () => leafMaterial(false, last - n, last - n), stages: [last - n, last - n], color, at }];
    // The outer shell stands in for the whole crown in the far ring, as a few flat faces.
    if (n === 0) parts[0].far = LOW_POLY.get(shape);
    if (n < last) parts.push({ geometry, material: () => leafMaterial(true, 0, last - 1 - n), stages: [0, last - 1 - n], color, at });
    return parts;
  });
}

const UP = new THREE.Vector3(0, 1, 0);
const tilt = (angle, spin) =>
  new THREE.Quaternion().setFromAxisAngle(UP, spin).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), angle));

// kind: { height, trunk, clear, parts }, with trunk scaling the size's trunk radius and clear the
// share of the height below the canopy.
// part: { geometry, material, color?, at(h, c, t, r, b) -> [y, quaternion, [sx, sy, sz]] }, with
// `t` the trunk radius and `r` a steady random number per tree.
const KINDS = {
  oak: {
    height: 1,
    trunk: 1,
    clear: 0.36,
    parts: [
      { geometry: trunk, material: bark, at: (h, c, t, r, b) => [0, null, [t, b + h * 0.26, t]] },
      ...crownParts(blob, { repeat: [7, 4] }, 0x4a7a36, (h, c, t, r, b) => [b + h * 0.32, null, [c, h * 0.32, c]]),
    ],
  },
  pine: {
    height: 1.15,
    trunk: 0.8,
    clear: 0.18,
    parts: [
      { geometry: trunk, material: bark, at: (h, c, t, r, b) => [0, null, [t, b + h * 0.32, t]] },
      ...crownParts(cone, { repeat: [6, 7], lift: 0.25 }, 0x356146, (h, c, t, r, b) => [b, null, [c * 0.6, h * 0.82, c * 0.6]]),
    ],
  },
  willow: {
    height: 0.9,
    trunk: 1.2,
    clear: 0.3,
    parts: [
      { geometry: trunk, material: bark, at: (h, c, t, r, b) => [0, null, [t, b + h * 0.4, t]] },
      ...crownParts(bowl, { repeat: [9, 3], lift: 0.3 }, 0x7a9a4c, (h, c, t, r, b) => [b, null, [c * 1.3, h * 0.5, c * 1.3]]),
    ],
  },
  dead: {
    height: 0.85,
    trunk: 0.8,
    parts: [
      { geometry: trunk, material: deadBark, at: (h, c, t) => [0, null, [t, h * 0.9, t]] },
      { geometry: trunk, material: deadBark, at: (h, c, t, r) => [h * 0.45, tilt(0.8, r * 6.28), [t * 0.5, h * 0.35, t * 0.5]] },
      { geometry: trunk, material: deadBark, at: (h, c, t, r) => [h * 0.6, tilt(0.7, r * 6.28 + 2.6), [t * 0.44, h * 0.28, t * 0.44]] },
    ],
  },
  autumn: {
    height: 1,
    trunk: 1,
    clear: 0.36,
    parts: [
      { geometry: trunk, material: bark, at: (h, c, t, r, b) => [0, null, [t, b + h * 0.26, t]] },
      ...crownParts(blob, { repeat: [7, 4] }, (r) => [0xc8862a, 0xb8501f, 0xd4a42c, 0x9c3a22][Math.floor(r * 4)], (h, c, t, r, b) => [b + h * 0.32, null, [c, h * 0.32, c]]),
    ],
  },
  giant: {
    height: 1.35,
    trunk: 2,
    clear: 0.42,
    parts: [
      { geometry: trunk, material: bark, at: (h, c, t, r, b) => [0, null, [t, b + h * 0.2, t]] },
      ...crownParts(blob, { repeat: [9, 4] }, 0x2f6330, (h, c, t, r, b) => [b + h * 0.28, null, [c * 1.25, h * 0.28, c * 1.25]]),
    ],
  },
  spruce: {
    height: 1.2,
    trunk: 0.8,
    clear: 0.12,
    parts: [
      { geometry: trunk, material: bark, at: (h, c, t, r, b) => [0, null, [t, b + h * 0.3, t]] },
      ...crownParts(cone, { repeat: [6, 7], lift: 0.25 }, 0x2f6450, (h, c, t, r, b) => [b, null, [c * 0.5, h * 0.9, c * 0.5]]),
    ],
  },
  snowpine: {
    height: 1.15,
    trunk: 0.8,
    clear: 0.12,
    parts: [
      { geometry: trunk, material: bark, at: (h, c, t, r, b) => [0, null, [t, b + h * 0.3, t]] },
      // Snow on the outer shell, dark needles showing through it.
      ...crownParts(cone, { repeat: [6, 7], lift: 0.25 }, [0xffffff, 0x47746a], (h, c, t, r, b) => [b, null, [c * 0.55, h * 0.88, c * 0.55]]),
    ],
  },
  blossom: {
    height: 0.8,
    trunk: 0.9,
    clear: 0.3,
    parts: [
      { geometry: trunk, material: sickBark, at: (h, c, t, r, b) => [0, null, [t, b + h * 0.24, t]] },
      ...crownParts(blob, { repeat: [7, 4] }, (r) => [0xffa8cc, 0xff94c0, 0xffc4dc][Math.floor(r * 3)], (h, c, t, r, b) => [b + h * 0.28, null, [c * 1.05, h * 0.28, c * 1.05]]),
    ],
  },
  bamboo: {
    height: 0.7,
    trunk: 0.5,
    parts: [
      { geometry: trunk, material: canes, at: (h, c, t) => [0, null, [t * 0.3, h * 0.92, t * 0.3], [0, 0]] },
      ...[0, 1, 2, 3].map((k) => ({ geometry: trunk, material: canes, at: (h, c, t, r) => [0, null, [t * 0.24, h * (0.72 + 0.05 * k), t * 0.24], [Math.cos(k * 1.57 + r * 6) * t * 1.1, Math.sin(k * 1.57 + r * 6) * t * 1.1]] })),
      ...crownParts(cone, { repeat: [8, 7], lift: 0.25 }, 0x86b84e, (h, c) => [h * 0.3, null, [c * 0.36, h * 0.72, c * 0.36]]),
    ],
  },
  acacia: {
    height: 0.8,
    trunk: 0.7,
    parts: [
      { geometry: trunk, material: sickBark, at: (h, c, t) => [0, null, [t, h * 0.82, t]] },
      { geometry: trunk, material: sickBark, at: (h, c, t, r) => [h * 0.5, tilt(0.7, r * 6.28), [t * 0.5, h * 0.38, t * 0.5]] },
      { geometry: trunk, material: sickBark, at: (h, c, t, r) => [h * 0.5, tilt(0.7, r * 6.28 + 3.1), [t * 0.5, h * 0.38, t * 0.5]] },
      ...crownParts(bowl, { repeat: [9, 3], lift: 0.1 }, 0x7c8a3e, (h, c) => [h * 0.76, null, [c * 1.25, h * 0.2, c * 1.25]]),
    ],
  },
  palm: {
    height: 1,
    trunk: 0.45,
    parts: [
      { geometry: trunk, material: bark, at: (h, c, t) => [0, null, [t, h * 0.86, t]] },
      { geometry: palmFronds, material: frondFlesh, color: 0x4f9e42, far: LOW_POLY.get(bowl), at: (h, c) => [h * 0.88, null, [c * 0.7, h * 0.3, c * 0.7]] },
    ],
  },
  treefern: {
    height: 0.55,
    trunk: 0.6,
    parts: [
      { geometry: trunk, material: sickBark, at: (h, c, t) => [0, null, [t, h * 0.74, t]] },
      { geometry: fernFronds, material: frondFlesh, color: 0x45a040, far: LOW_POLY.get(bowl), at: (h, c) => [h * 0.76, null, [c * 0.75, h * 0.42, c * 0.75]] },
    ],
  },
  jungle: {
    height: 1.2,
    trunk: 1.1,
    parts: [
      { geometry: trunk, material: bark, at: (h, c, t) => [0, null, [t, h * 0.72, t]] },
      ...crownParts(blob, { repeat: [8, 3] }, 0x2c7236, (h, c) => [h * 0.8, null, [c * 1.15, h * 0.22, c * 1.15]]),
    ],
  },
  mangrove: {
    height: 0.6,
    trunk: 0.7,
    parts: [
      { geometry: trunk, material: sickBark, at: (h, c, t) => [h * 0.18, null, [t, h * 0.42, t]] },
      // Roots arching down and out from the trunk.
      ...[0, 1, 2, 3, 4].map((k) => ({ geometry: trunk, material: sickBark, at: (h, c, t, r) => [h * 0.3, tilt(2.35, r * 6.28 + k * 1.26), [t * 0.42, h * 0.42, t * 0.42]] })),
      ...crownParts(blob, { repeat: [7, 4] }, 0x3c6e38, (h, c) => [h * 0.62, null, [c * 1.1, h * 0.26, c * 1.1]]),
    ],
  },
  giantcap: {
    height: 0.55,
    trunk: 1.3,
    parts: [
      { geometry: trunk, material: stalk, at: (h, c, t) => [0, null, [t, h * 0.72, t]] },
      { geometry: bowl, material: capFlesh, color: (r) => [0x3fa7a0, 0x5a78b4, 0x7a5aa8][Math.floor(r * 3)], far: LOW_POLY.get(bowl), at: (h, c) => [h * 0.6, null, [c * 0.9, h * 0.4, c * 0.9]] },
    ],
  },
  gnarled: {
    height: 0.8,
    trunk: 1,
    parts: [
      { geometry: trunk, material: blackBark, at: (h, c, t) => [0, null, [t, h * 0.74, t]] },
      { geometry: trunk, material: blackBark, at: (h, c, t, r) => [h * 0.42, tilt(0.9, r * 6.28), [t * 0.5, h * 0.42, t * 0.5]] },
      { geometry: trunk, material: blackBark, at: (h, c, t, r) => [h * 0.55, tilt(0.8, r * 6.28 + 2.4), [t * 0.42, h * 0.34, t * 0.42]] },
      ...crownParts(blob, { repeat: [5, 3] }, 0x41523f, (h, c) => [h * 0.72, null, [c * 0.7, h * 0.22, c * 0.7]]),
    ],
  },
  blighted: {
    height: 0.8,
    trunk: 0.9,
    parts: [
      { geometry: trunk, material: sickBark, at: (h, c, t) => [0, null, [t, h * 0.74, t]] },
      { geometry: trunk, material: sickBark, at: (h, c, t, r) => [h * 0.42, tilt(0.9, r * 6.28), [t * 0.5, h * 0.42, t * 0.5]] },
      ...crownParts(blob, { repeat: [4, 3] }, 0x8a8434, (h, c) => [h * 0.72, null, [c * 0.7, h * 0.22, c * 0.7]]),
    ],
  },
  charred: {
    height: 0.7,
    trunk: 0.8,
    parts: [
      { geometry: trunk, material: blackBark, at: (h, c, t) => [0, null, [t, h * 0.9, t]] },
      { geometry: trunk, material: blackBark, at: (h, c, t, r) => [h * 0.45, tilt(0.8, r * 6.28), [t * 0.45, h * 0.3, t * 0.45]] },
    ],
  },
  thorn: {
    height: 0.75,
    trunk: 0.9,
    parts: [
      { geometry: trunk, material: wineBark, at: (h, c, t) => [0, null, [t, h * 0.9, t]] },
      ...[0, 1, 2, 3].map((k) => ({ geometry: trunk, material: wineBark, at: (h, c, t, r) => [h * (0.3 + 0.14 * k), tilt(1 - 0.1 * k, r * 6.28 + k * 2.2), [t * 0.34, h * (0.42 - 0.05 * k), t * 0.34]] })),
    ],
  },
  silverleaf: {
    height: 1.05,
    trunk: 0.85,
    parts: [
      { geometry: trunk, material: silverBark, at: (h, c, t) => [0, null, [t, h * 0.62, t]] },
      ...crownParts(blob, { repeat: [7, 4] }, (r) => [0xd0e8ff, 0xe0d4ff, 0xf0f8ff][Math.floor(r * 3)], (h, c) => [h * 0.72, null, [c * 0.95, h * 0.3, c * 0.95]]),
    ],
  },
  crystal: {
    height: 0.6,
    trunk: 1,
    parts: [
      { geometry: cone, material: crystalFlesh, color: (r) => [0xa98ae8, 0x8fb4ec, 0xc89ae4][Math.floor(r * 3)], at: (h, c, t) => [0, null, [t * 1.8, h * 0.95, t * 1.8]] },
      ...[0, 1, 2].map((k) => ({ geometry: cone, material: crystalFlesh, color: (r) => [0xa98ae8, 0x8fb4ec, 0xc89ae4][Math.floor(r * 3)], at: (h, c, t, r) => [0, tilt(0.42, r * 6.28 + k * 2.1), [t, h * (0.62 - 0.1 * k), t]] })),
    ],
  },
};

// The radius of a tree's trunk at the ground, in feet. Unknown kinds are oaks.
export function trunkRadius(kind, size) {
  return SIZES[size].trunk * (KINDS[kind] ?? KINDS.oak).trunk;
}

// How tall a tree stands over its ground, in feet.
export function treeHeight(kind, size) {
  return SIZES[size].height * (KINDS[kind] ?? KINDS.oak).height;
}

// A tree's crown as line of sight has it, a rough egg: { from, to, radius } in feet, from and to
// over its ground, or null for a kind without one. Unknown kinds are oaks. The game server keeps
// these too (game-server/internal/worlds/fill.go treeCrowns).
const CROWNS = {
  oak: [0.576, 1.216, 1],
  pine: [0.288, 1.108, 0.45],
  willow: [0.48, 0.98, 1.3],
  autumn: [0.576, 1.216, 1],
  giant: [0.672, 1.232, 1.25],
  spruce: [0.192, 1.092, 0.4],
  snowpine: [0.192, 1.072, 0.45],
  blossom: [0.48, 1.04, 1.05],
  bamboo: [0.3, 1.02, 0.36],
  acacia: [0.76, 0.96, 1.25],
  jungle: [0.58, 1.02, 1.15],
  mangrove: [0.36, 0.88, 1.1],
  giantcap: [0.6, 1, 0.9],
  gnarled: [0.5, 0.94, 0.7],
  blighted: [0.5, 0.94, 0.7],
  silverleaf: [0.42, 1.02, 0.95],
};

export function treeCrown(kind, size) {
  const crown = KINDS[kind] ? CROWNS[kind] : CROWNS.oak;
  if (!crown) return null;
  const h = treeHeight(kind, size);
  return { from: crown[0] * h, to: crown[1] * h, radius: crown[2] * SIZES[size].crown };
}

// trees: [{ x, z, ground, size, kind }] in scene feet. Unknown kinds draw as oaks. `far` draws
// them as cheap stand-ins: a trunk and a crown of a few flat faces each.
export function treeMeshes(trees, { far = false } = {}) {
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
    const { height, clear = 0 } = KINDS[kind];
    const parts = far
      ? [{ ...KINDS[kind].parts[0], geometry: farTrunk }, ...KINDS[kind].parts.filter((p) => p.far).map((p) => ({ ...p, geometry: p.far, material: farLeaves, stages: undefined }))]
      : KINDS[kind].parts;
    for (const part of parts) {
      const mesh = new THREE.InstancedMesh(built(part), typeof part.material === "function" ? part.material() : part.material, list.length);
      list.forEach(({ x, z, ground, size }, n) => {
        const r = random(x, z);
        const s = SIZES[size];
        const h = s.height * height * (0.85 + 0.3 * r);
        const c = s.crown * (0.9 + 0.2 * random(z, x));
        const [y, q, scale, [dx, dz] = [0, 0]] = part.at(h, c, trunkRadius(kind, size), r, clear * h * LIFT);
        // Every tree gets its own turn, so crowns don't line up.
        const turn = new THREE.Quaternion().setFromAxisAngle(UP, r * 6.28).multiply(q ?? none);
        m.compose(new THREE.Vector3(x + dx, ground + y, z + dz), turn, new THREE.Vector3(...scale));
        mesh.setMatrixAt(n, m);
        if (part.color) mesh.setColorAt(n, color.set(typeof part.color === "function" ? part.color(random(z + 1, x)) : part.color).offsetHSL(0.03 * (r - 0.5), 0, 0.08 * (random(x + 1, z) - 0.5)));
      });
      mesh.userData.stages = part.stages;
      mesh.computeBoundingSphere();
      meshes.push(mesh);
    }
  }
  return meshes;
}

// Crown geometries are built on first use and kept, shared by a shell's cutout and opaque parts.
const builtGeometries = new Map();
function built({ geometry }) {
  if (typeof geometry !== "function") return geometry;
  if (!builtGeometries.has(geometry)) builtGeometries.set(geometry, geometry());
  return builtGeometries.get(geometry);
}

// Clusters of leaves, white on clear so instance colors tint them, covering most of the tile. It wraps, so clusters carry across tile edges.
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
  for (let cluster = 0; cluster < 44; cluster++) {
    const [cx, cy] = [rand() * SIZE, rand() * SIZE];
    for (let leaf = 0; leaf < 18; leaf++) {
      const a = rand() * Math.PI * 2;
      const d = rand() * 24;
      const v = 150 + Math.floor(rand() * 105);
      const turn = rand() * Math.PI;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      for (const [ox, oy] of [[0, 0], [SIZE, 0], [-SIZE, 0], [0, SIZE], [0, -SIZE]]) {
        ctx.beginPath();
        ctx.ellipse(cx + Math.cos(a) * d + ox, cy + Math.sin(a) * d + oy, 11, 5, turn, 0, Math.PI * 2);
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
