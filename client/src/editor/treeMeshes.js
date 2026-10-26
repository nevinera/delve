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
function crownParts(shape, opts, color, at) {
  const last = SHELLS.length - 1;
  return SHELLS.flatMap((_, n) => {
    const geometry = () => shell(shape, n, opts);
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

// kind: { height, clear, parts }, with clear the share of the height below the canopy.
// part: { geometry, material, color?, at(h, c, t, r, b) -> [y, quaternion, [sx, sy, sz]] }, with
// `t` the trunk radius and `r` a steady random number per tree.
const KINDS = {
  oak: {
    height: 1,
    clear: 0.36,
    parts: [
      { geometry: trunk, material: bark, at: (h, c, t, r, b) => [0, null, [t, b + h * 0.26, t]] },
      ...crownParts(blob, { repeat: [7, 4] }, 0x4a7a36, (h, c, t, r, b) => [b + h * 0.32, null, [c, h * 0.32, c]]),
    ],
  },
  pine: {
    height: 1.15,
    clear: 0.18,
    parts: [
      { geometry: trunk, material: bark, at: (h, c, t, r, b) => [0, null, [t * 0.8, b + h * 0.32, t * 0.8]] },
      ...crownParts(cone, { repeat: [6, 7], lift: 0.25 }, 0x356146, (h, c, t, r, b) => [b, null, [c * 0.6, h * 0.82, c * 0.6]]),
    ],
  },
  willow: {
    height: 0.9,
    clear: 0.3,
    parts: [
      { geometry: trunk, material: bark, at: (h, c, t, r, b) => [0, null, [t * 1.2, b + h * 0.4, t * 1.2]] },
      ...crownParts(bowl, { repeat: [9, 3], lift: 0.3 }, 0x7a9a4c, (h, c, t, r, b) => [b, null, [c * 1.3, h * 0.5, c * 1.3]]),
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
        const [y, q, scale] = part.at(h, c, s.trunk, r, clear * h * LIFT);
        // Every tree gets its own turn, so crowns don't line up.
        const turn = new THREE.Quaternion().setFromAxisAngle(UP, r * 6.28).multiply(q ?? none);
        m.compose(new THREE.Vector3(x, ground + y, z), turn, new THREE.Vector3(...scale));
        mesh.setMatrixAt(n, m);
        if (part.color) mesh.setColorAt(n, color.set(part.color).offsetHSL(0.03 * (r - 0.5), 0, 0.08 * (random(x + 1, z) - 0.5)));
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
