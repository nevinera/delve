import * as THREE from "three";

// A rest point, drawn the same in /create and in play: a campfire in a ring of stones, with a log to
// sit on. About 8ft across, facing +z.

export const REST_COLORS = { stone: 0x8a8580, wood: 0x6e4c2e, char: 0x2e2420, flame: 0xffa030, core: 0xffe080 };

// Materials for restPointMesh, see-through below an opacity of 1. Flames aren't lit.
export function restPointMaterials(opacity = 1) {
  const options = { transparent: opacity < 1, opacity, side: THREE.DoubleSide, depthWrite: opacity === 1 };
  const lit = (color) => new THREE.MeshLambertMaterial({ color, ...options });
  const glow = (color) => new THREE.MeshBasicMaterial({ color, ...options });
  return { stone: lit(REST_COLORS.stone), wood: lit(REST_COLORS.wood), char: lit(REST_COLORS.char), flame: glow(REST_COLORS.flame), core: glow(REST_COLORS.core) };
}

const part = (geometry, material, [x, y, z], [rx, ry, rz] = [0, 0, 0]) => {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  return mesh;
};

export function restPointMesh(material) {
  const group = new THREE.Group();
  const { stone, wood, char, flame, core } = material;
  // Stones in a ring, each a little different.
  const stones = 9;
  for (let i = 0; i < stones; i++) {
    const a = (Math.PI * 2 * i) / stones;
    const rock = part(new THREE.DodecahedronGeometry(0.32 + 0.06 * Math.sin(i * 2.7), 0), stone, [1.25 * Math.cos(a), 0.2, 1.25 * Math.sin(a)], [i, i * 1.3, 0]);
    rock.scale.set(1, 0.7, 1);
    group.add(rock);
  }
  // Logs leant together in the middle, charred where they meet.
  for (let i = 0; i < 3; i++) {
    const a = (Math.PI * 2 * i) / 3 + 0.4;
    const log = part(new THREE.CylinderGeometry(0.11, 0.14, 1.6, 6), wood, [0.35 * Math.cos(a), 0.45, 0.35 * Math.sin(a)]);
    log.rotation.set(0, -a, 0, "YXZ");
    log.rotateZ(0.9);
    group.add(log);
  }
  group.add(part(new THREE.CylinderGeometry(0.75, 0.8, 0.08, 10), char, [0, 0.04, 0]));
  // The fire: a wide flame and a bright one inside it.
  group.add(part(new THREE.ConeGeometry(0.5, 1.4, 7), flame, [0, 0.75, 0]));
  group.add(part(new THREE.ConeGeometry(0.26, 0.9, 6), core, [0.05, 0.55, -0.03]));
  // A log to sit on, behind the fire.
  group.add(part(new THREE.CylinderGeometry(0.3, 0.32, 3.2, 8), wood, [0, 0.3, -2.6], [0, 0, Math.PI / 2]));
  group.scale.setScalar(1.4);
  return group;
}

// Frees a restPointMesh's geometry; its materials are shared.
export function disposeRestPoint(group) {
  group.traverse((child) => child.geometry?.dispose());
}
