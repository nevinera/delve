// Exports a character as a GLB, mesh and skeleton, to pose in an animation tool such as Cascadeur:
// the default look, 6ft tall, holding a weapon (a greatsword unless given), in meters as glTF
// expects, or times `scale` for a tool that takes them for some other unit. Its bones carry
// body.js's names and stand unrotated, arms down. The skeleton sits beside the mesh rather than
// inside it, each joint's place is given as a translation rather than a matrix, and each mesh
// has normals, triangle indices and texture coordinates (all zero), as some tools need.
//
//   node script/export_character.mjs [out.glb] [weapon] [scale]
import fs from "fs";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { characterMesh } from "../client/src/character/characterMesh.js";
import { resolveRecipe } from "../client/src/character/recipe.js";

const [out = "tmp/character.glb", weapon = "greatsword", scale = "1"] = process.argv.slice(2);
const FT = 0.3048 * Number(scale);

// The exporter reads blobs the browser's way.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type || "application/octet-stream"};base64,${Buffer.from(buffer).toString("base64")}`;
      this.onloadend?.();
    });
  }
};

// Normals, indices and texture coordinates for a mesh of loose triangles.
function complete(geometry) {
  const { count } = geometry.attributes.position;
  geometry.computeVertexNormals();
  geometry.setIndex([...Array(count).keys()]);
  geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(count * 2), 2));
}

const mesh = characterMesh(resolveRecipe({ height: 6, weapon }));
mesh.name = "character";
// Feet to meters: the body, each bone's offset from its parent, and the items the bones hold.
mesh.geometry.deleteAttribute("mail");
mesh.geometry.scale(FT, FT, FT);
complete(mesh.geometry);
// Each held item gets a joint of its own at its grip, on the bone that holds it, pointing along
// it, as animation tools rig a weapon: weapon_r in the right hand, weapon_l in the left.
const held = [];
for (const bone of [...mesh.skeleton.bones]) {
  bone.position.multiplyScalar(FT);
  for (const item of bone.children.filter((child) => child.isMesh)) {
    item.position.multiplyScalar(FT);
    item.geometry.scale(FT, FT, FT);
    const grip = new THREE.Bone();
    grip.name = bone.name.endsWith("_r") ? "weapon_r" : "weapon_l";
    grip.position.copy(item.position);
    grip.quaternion.copy(item.quaternion);
    bone.remove(item);
    bone.add(grip);
    held.push({ item, grip });
  }
}
const skeleton = new THREE.Skeleton([...mesh.skeleton.bones, ...held.map(({ grip }) => grip)]);
const scene = new THREE.Scene();
const armature = new THREE.Group();
armature.name = "armature";
armature.add(skeleton.bones.find((bone) => bone.name === "root"));
scene.add(armature, mesh);
scene.updateMatrixWorld(true);
skeleton.calculateInverses();
mesh.bind(skeleton, mesh.matrixWorld);
// Each held item as a mesh of its own skinned wholly to its joint: some tools drop a mesh hung on
// a joint.
for (const { item, grip } of held) {
  const geometry = item.geometry.clone().applyMatrix4(grip.matrixWorld);
  const { count } = geometry.attributes.position;
  const joint = skeleton.bones.indexOf(grip);
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Uint16Array(count * 4).map((_, i) => (i % 4 ? 0 : joint)), 4));
  geometry.setAttribute("skinWeight", new THREE.BufferAttribute(new Float32Array(count * 4).map((_, i) => (i % 4 ? 0 : 1)), 4));
  complete(geometry);
  const skinned = new THREE.SkinnedMesh(geometry, item.material);
  skinned.name = `held_${weapon}`;
  scene.add(skinned);
  skinned.bind(skeleton, skinned.matrixWorld);
}
const glb = await new GLTFExporter().parseAsync(scene, { binary: true, trs: true });
fs.writeFileSync(out, Buffer.from(glb));
console.log(`wrote ${out}`);
