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
const held = [];
for (const bone of mesh.skeleton.bones) {
  bone.position.multiplyScalar(FT);
  for (const item of bone.children.filter((child) => child.isMesh)) {
    item.position.multiplyScalar(FT);
    item.geometry.scale(FT, FT, FT);
    held.push({ item, bone });
  }
}
const scene = new THREE.Scene();
const armature = new THREE.Group();
armature.name = "armature";
armature.add(mesh.skeleton.bones.find((bone) => bone.name === "root"));
scene.add(armature, mesh);
scene.updateMatrixWorld(true);
mesh.skeleton.calculateInverses();
mesh.bind(mesh.skeleton, mesh.matrixWorld);
// Each held item as a mesh of its own skinned wholly to the bone that holds it: some tools drop a
// mesh hung on a joint.
for (const { item, bone } of held) {
  const geometry = item.geometry.clone().applyMatrix4(item.matrixWorld);
  const { count } = geometry.attributes.position;
  const joint = mesh.skeleton.bones.indexOf(bone);
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Uint16Array(count * 4).map((_, i) => (i % 4 ? 0 : joint)), 4));
  geometry.setAttribute("skinWeight", new THREE.BufferAttribute(new Float32Array(count * 4).map((_, i) => (i % 4 ? 0 : 1)), 4));
  complete(geometry);
  const skinned = new THREE.SkinnedMesh(geometry, item.material);
  skinned.name = `held_${weapon}`;
  bone.remove(item);
  scene.add(skinned);
  skinned.bind(mesh.skeleton, skinned.matrixWorld);
}
const glb = await new GLTFExporter().parseAsync(scene, { binary: true, trs: true });
fs.writeFileSync(out, Buffer.from(glb));
console.log(`wrote ${out}`);
