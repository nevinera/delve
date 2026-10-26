import * as THREE from "three";
import { bodyMesh } from "./body.js";

// A character as a three.js skinned mesh, built from a look (recipe.js's resolveRecipe). Its bones
// carry body.js's names, for animations to drive.

const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

export function characterMesh(look) {
  const { bones: joints, positions, colors, skinIndex, skinWeight } = bodyMesh(look);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  // Looks give colors as the screen shows them; lighting works in linear color.
  const linear = colors.map((v) => (v < 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  geometry.setAttribute("color", new THREE.BufferAttribute(linear, 3));
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
  return mesh;
}

// Frees a character's geometry; the material is shared.
export function disposeCharacter(mesh) {
  mesh.geometry.dispose();
  mesh.skeleton.dispose();
}
