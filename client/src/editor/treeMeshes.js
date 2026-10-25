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
const blob = new THREE.IcosahedronGeometry(1, 1);
const cone = new THREE.ConeGeometry(1, 1, 8).translate(0, 0.5, 0);
// An upside-down bowl, its rim drooping a little below its widest point: 1 tall, rim at 0.
const DROOP = 0.6; // share of a half turn the bowl runs down from its top
const bowl = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI * DROOP).translate(0, -Math.cos(Math.PI * DROOP), 0);
bowl.scale(1, 1 / (1 - Math.cos(Math.PI * DROOP)), 1);
const bark = new THREE.MeshLambertMaterial({ color: 0x5a4430 });
const deadBark = new THREE.MeshLambertMaterial({ color: 0x6e6458 });
const leaves = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
const drape = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, side: THREE.DoubleSide }); // seen from under it too

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
      { geometry: blob, material: leaves, color: 0x3d6b2e, at: (h, c, t, r, b) => [b + h * 0.32, null, [c, h * 0.32, c]] },
    ],
  },
  pine: {
    height: 1.15,
    clear: 0.18,
    parts: [
      { geometry: trunk, material: bark, at: (h, c, t, r, b) => [0, null, [t * 0.8, b + h * 0.32, t * 0.8]] },
      { geometry: cone, material: leaves, color: 0x2d5238, at: (h, c, t, r, b) => [b, null, [c * 0.6, h * 0.82, c * 0.6]] },
    ],
  },
  willow: {
    height: 0.9,
    clear: 0.3,
    parts: [
      { geometry: trunk, material: bark, at: (h, c, t, r, b) => [0, null, [t * 1.2, b + h * 0.4, t * 1.2]] },
      { geometry: bowl, material: drape, color: 0x6f8f45, at: (h, c, t, r, b) => [b, null, [c * 1.3, h * 0.5, c * 1.3]] },
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
    for (const part of parts) {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, list.length);
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

// A steady pseudo-random number in [0, 1) for a spot, so trees keep their looks between redraws.
function random(x, z) {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}
