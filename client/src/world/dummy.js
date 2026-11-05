import * as THREE from "three";

// A training dummy, drawn the same in /create and in play: a post on crossed feet, a straw-stuffed
// sack body and head bound with rope, and arms of straw on a crossbar. About 6ft tall, facing +z.

export const DUMMY_COLORS = { wood: 0x8a6440, straw: 0xc8a858, sack: 0xa88a5a, rope: 0x6a5234 };

// Materials for dummyMesh, see-through below an opacity of 1.
export function dummyMaterials(opacity = 1) {
  const make = (color) => new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity, side: THREE.DoubleSide, depthWrite: opacity === 1 });
  return Object.fromEntries(Object.entries(DUMMY_COLORS).map(([name, color]) => [name, make(color)]));
}

const part = (geometry, material, [x, y, z], [rx, ry, rz] = [0, 0, 0]) => {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  return mesh;
};

export function dummyMesh(material) {
  const group = new THREE.Group();
  const { wood, straw, sack, rope } = material;
  const flat = [Math.PI / 2, 0, 0];
  const across = [0, 0, Math.PI / 2];
  // Feet: two crossed planks the post stands in.
  for (const yaw of [Math.PI / 4, -Math.PI / 4]) group.add(part(new THREE.BoxGeometry(2.6, 0.25, 0.4), wood, [0, 0.12, 0], [0, yaw, 0]));
  group.add(part(new THREE.CylinderGeometry(0.2, 0.25, 5.2, 8), wood, [0, 2.6, 0]));
  // The body: a sack, wider at the shoulders, tied at the waist and neck, straw out of its bottom.
  group.add(part(new THREE.CylinderGeometry(0.85, 0.65, 2.3, 10), sack, [0, 3.35, 0]));
  group.add(part(new THREE.CylinderGeometry(0.55, 0.85, 0.4, 10), sack, [0, 4.7, 0]));
  group.add(part(new THREE.TorusGeometry(0.7, 0.08, 5, 14), rope, [0, 2.75, 0], flat));
  group.add(part(new THREE.TorusGeometry(0.28, 0.07, 5, 10), rope, [0, 5, 0], flat));
  group.add(part(new THREE.ConeGeometry(0.62, 0.5, 10, 1, true), straw, [0, 2, 0], [Math.PI, 0, 0]));
  // Arms: a crossbar wrapped in straw, bound at the ends.
  group.add(part(new THREE.CylinderGeometry(0.12, 0.12, 3.8, 6), wood, [0, 4.35, 0], across));
  for (const x of [-1, 1]) {
    group.add(part(new THREE.CylinderGeometry(0.28, 0.24, 1.1, 8), straw, [x * 1.35, 4.35, 0], across));
    group.add(part(new THREE.TorusGeometry(0.26, 0.06, 5, 10), rope, [x * 1.75, 4.35, 0], [0, Math.PI / 2, 0]));
  }
  // The head: a stuffed sack with stitched crosses for eyes and a stitched mouth.
  const head = part(new THREE.SphereGeometry(0.6, 12, 9), sack, [0, 5.55, 0]);
  head.scale.set(1, 1.1, 0.95);
  group.add(head);
  for (const x of [-0.2, 0.2])
    for (const tilt of [Math.PI / 4, -Math.PI / 4]) group.add(part(new THREE.BoxGeometry(0.22, 0.05, 0.05), rope, [x, 5.65, 0.56], [0, 0, tilt]));
  group.add(part(new THREE.BoxGeometry(0.4, 0.05, 0.05), rope, [0, 5.35, 0.56]));
  return group;
}

// Frees a dummyMesh's geometry; its materials are shared.
export function disposeDummy(group) {
  group.traverse((child) => child.geometry?.dispose());
}
