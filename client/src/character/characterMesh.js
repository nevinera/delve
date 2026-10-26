import * as THREE from "three";
import { bodyMesh } from "./body.js";
import { HELD, weaponMesh } from "./weapons.js";

// A character as a three.js skinned mesh, built from a look (recipe.js's resolveRecipe). Its bones
// carry body.js's names, for animations to drive. A weapon rides on the bone of the hand holding
// it.

const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

// Looks give colors as the screen shows them; lighting works in linear color.
const linear = (colors) => colors.map((v) => (v < 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));

export function characterMesh(look) {
  const { bones: joints, positions, colors, skinIndex, skinWeight } = bodyMesh(look);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(linear(colors), 3));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute("skinWeight", new THREE.BufferAttribute(skinWeight, 4));
  geometry.computeBoundingSphere();

  const bones = new Map();
  for (const { name, parent, at } of joints) {
    const bone = new THREE.Bone();
    bone.name = name;
    const base = parent ? joints.find((j) => j.name === parent).at : [0, 0, 0];
    bone.position.set(at[0] - base[0], at[1] - base[1], at[2] - base[2]);
    if (parent) bones.get(parent).add(bone);
    bones.set(name, bone);
  }
  const mesh = new THREE.SkinnedMesh(geometry, material);
  const root = bones.get("root");
  mesh.add(root);
  mesh.bind(new THREE.Skeleton([...bones.values()]));
  holdWeapon(mesh, bones, joints, look);
  return mesh;
}

// Puts the look's weapon in its hand, gripped partway down the hand bone.
function holdWeapon(mesh, bones, joints, look) {
  const held = HELD[look.weapon];
  if (!held) return;
  const s = look.height / 6;
  const hand = joints.find((j) => j.name === held.hand).at;
  const grip = [0, -0.3 * s, 0.02 * s];
  const data = weaponMesh(look.weapon, look.colors, { ground: hand[1] + grip[1] });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(linear(data.colors), 3));
  geometry.computeBoundingSphere();
  const weapon = new THREE.Mesh(geometry, material);
  weapon.position.set(...grip);
  weapon.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...held.toward).normalize());
  bones.get(held.hand).add(weapon);
  mesh.userData.weapon = weapon;
}

// Frees a character's geometry; the material is shared.
export function disposeCharacter(mesh) {
  mesh.geometry.dispose();
  mesh.userData.weapon?.geometry.dispose();
  mesh.skeleton.dispose();
}
