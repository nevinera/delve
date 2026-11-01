import * as THREE from "three";
import { bodyMesh } from "./body.js";
import { FRAMES, skeletonOf } from "./frames.js";
import { heldBy, sheathOf, weaponMesh } from "./weapons.js";

// A character as a three.js skinned mesh, built from a look (recipe.js's resolveRecipe). Its bones
// carry body.js's names, or their own skeleton's (frames.js), for animations to drive. Weapons,
// shields and off-hand items ride on the bones that hold them.

export { SKELETONS, skeletonOf } from "./frames.js";

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
// Spirits and shadows are see-through.
const ghostMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.55, depthWrite: false });
// Weapons have no mail mark.
const weaponMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

// Looks give colors as the screen shows them; lighting works in linear color.
const linear = (colors) => colors.map((v) => (v < 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));

export function characterMesh(look) {
  const skeleton = skeletonOf(look.body);
  const frame = FRAMES[skeleton];
  const { bones: joints, positions, colors, skinIndex, skinWeight, mail, scale } = frame ? frame.mesh(look) : bodyMesh(look);
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
  const mesh = new THREE.SkinnedMesh(geometry, look.flesh === "spirit" || look.flesh === "shadow" ? ghostMaterial : material);
  const root = bones.get("root");
  mesh.add(root);
  mesh.bind(new THREE.Skeleton([...bones.values()]));
  // How far clips move the pelvis: for a humanoid, as far as for a 6ft body in proportion to its
  // pelvis's height; for others, as their frame says.
  mesh.userData.skeleton = skeleton;
  mesh.userData.look = look;
  mesh.userData.scale = scale ?? joints.find((j) => j.name === "pelvis").at[1] / 3.15;
  mesh.userData.joints = joints;
  mesh.userData.held = skeleton === "humanoid" ? [hold(bones, look, look.weapon), hold(bones, look, look.offhand, true)].filter(Boolean) : [];
  return mesh;
}

// Puts an item on the bone that holds it, or where it's put away when the look's weapons are
// sheathed, or nothing for "none".
function hold(bones, look, type, offhand = false) {
  const held = heldBy(type, offhand);
  if (!held) return null;
  const s = look.height / 6;
  const data = weaponMesh(type, look.colors, offhand ? look.offhandStyle : look.weaponStyle);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(linear(data.colors), 3));
  geometry.computeBoundingSphere();
  const item = new THREE.Mesh(geometry, weaponMaterial);
  if (look.sheathed) {
    sheathe(item, bones, look, sheathOf(type, offhand), data.positions);
    return item;
  }
  item.position.set(...held.at.map((v) => v * s));
  item.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...held.toward).normalize());
  bones.get(held.bone).add(item);
  return item;
}

// Hangs an item at a hip, its grip just above the belt, or centered across the back, just clear
// of the body (sized as body.js sizes it).
function sheathe(item, bones, look, sheath, positions) {
  const s = look.height / 6;
  const thick = 0.85 + 0.4 * look.build;
  const y = new THREE.Vector3(...sheath.toward).normalize();
  const z = new THREE.Vector3(...sheath.front).projectOnPlane(y).normalize();
  item.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(y, z), y, z));
  if (sheath.place === "hip") {
    const out = (0.64 * (1 + 0.4 * (look.hips - 0.5)) * thick + 0.05) * (sheath.side === "l" ? 1 : -1);
    item.position.set(out * s, 0.3 * s, 0.12 * s);
    bones.get("pelvis").add(item);
    return;
  }
  // The item's middle, along its length, goes to the middle of the back.
  let [low, high] = [Infinity, -Infinity];
  for (let i = 1; i < positions.length; i += 3) [low, high] = [Math.min(low, positions[i]), Math.max(high, positions[i])];
  const back = new THREE.Vector3(0, -0.1 * s, -(0.43 * thick + 0.08) * s);
  item.position.copy(back).addScaledVector(y, -(low + high) / 2);
  bones.get("spine_03").add(item);
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
