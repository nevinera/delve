import * as THREE from "three";
import { bodyMesh } from "./body.js";
import { heldBy, weaponMesh } from "./weapons.js";

// A character as a three.js skinned mesh, built from a look (recipe.js's resolveRecipe). Its bones
// carry body.js's names, for animations to drive. Weapons, shields and off-hand items ride on the
// bones that hold them.

// Chain mail faces (body.js's mail mark) are patterned with rows of rings, laid on the body as it
// stands at rest, so the pattern moves with it. Each face takes the pattern from the side it
// faces most.
const MAIL_TILE_FT = 0.35;
let mailMap = null;
const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
material.onBeforeCompile = (shader) => {
  mailMap ??= mailTexture();
  shader.uniforms.mailMap = { value: mailMap };
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nattribute float mail;\nvarying float vMail;\nvarying vec3 vBind;")
    .replace("#include <begin_vertex>", "#include <begin_vertex>\nvMail = mail;\nvBind = position;");
  shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nuniform sampler2D mailMap;\nvarying float vMail;\nvarying vec3 vBind;").replace(
    "#include <color_fragment>",
    `#include <color_fragment>
    if (vMail > 0.5) {
      vec3 facing = abs(normalize(cross(dFdx(vBind), dFdy(vBind))));
      vec2 uv = facing.x > facing.y && facing.x > facing.z ? vBind.zy : facing.y > facing.z ? vBind.xz : vBind.xy;
      diffuseColor.rgb *= 0.4 + 1.1 * texture2D(mailMap, uv / ${MAIL_TILE_FT.toFixed(2)}).r;
    }`,
  );
};
// Weapons have no mail mark.
const weaponMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

// Looks give colors as the screen shows them; lighting works in linear color.
const linear = (colors) => colors.map((v) => (v < 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));

export function characterMesh(look) {
  const { bones: joints, positions, colors, skinIndex, skinWeight, mail } = bodyMesh(look);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(linear(colors), 3));
  geometry.setAttribute("mail", new THREE.BufferAttribute(mail, 1));
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
  mesh.userData.scale = look.height / 6;
  mesh.userData.held = [hold(bones, look, look.weapon), hold(bones, look, look.offhand, true)].filter(Boolean);
  return mesh;
}

// Puts an item on the bone that holds it, or nothing for "none".
function hold(bones, look, type, offhand = false) {
  const held = heldBy(type, offhand);
  if (!held) return null;
  const s = look.height / 6;
  const data = weaponMesh(type, look.colors);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(linear(data.colors), 3));
  geometry.computeBoundingSphere();
  const item = new THREE.Mesh(geometry, weaponMaterial);
  item.position.set(...held.at.map((v) => v * s));
  item.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...held.toward).normalize());
  bones.get(held.bone).add(item);
  return item;
}

// Frees a character's geometry; the material is shared.
export function disposeCharacter(mesh) {
  mesh.geometry.dispose();
  for (const item of mesh.userData.held) item.geometry.dispose();
  mesh.skeleton.dispose();
}

// Rows of interlocking rings, every other row shifted half a ring, light on a dark ground: 0-1 in
// red, about 0.55 on average.
function mailTexture() {
  const size = 64;
  const [across, down, radius, wire] = [16, 8, 6.5, 1.6];
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0.15;
      for (let row = -1; row <= size / down; row++) {
        for (let col = -1; col <= size / across; col++) {
          const [cx, cy] = [col * across + (row % 2 ? across / 2 : 0), row * down];
          const [dx, dy] = [((x - cx + size * 1.5) % size) - size / 2, ((y - cy + size * 1.5) % size) - size / 2];
          const off = Math.abs(Math.hypot(dx, dy) - radius);
          // Lit from above, shaded below.
          if (off < wire) v = Math.max(v, (1 - off / wire) * (dy < 0 ? 1 : 0.7));
        }
      }
      data.set([v * 255, v * 255, v * 255, 255], (y * size + x) * 4);
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
