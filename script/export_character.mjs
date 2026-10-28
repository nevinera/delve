// Exports a character as a GLB, mesh and skeleton, to pose in an animation tool such as Cascadeur:
// the default look, 6ft tall, holding a weapon (a greatsword unless given), in meters as glTF
// expects, or times `scale` for a tool that takes them for some other unit. Its bones carry
// body.js's names and stand unrotated, arms down. The skeleton sits beside the mesh rather than
// inside it, and the mesh has normals, as some tools need.
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

const mesh = characterMesh(resolveRecipe({ height: 6, weapon }));
mesh.name = "character";
// Feet to meters: the body, each bone's offset from its parent, and the items the bones hold.
mesh.geometry.deleteAttribute("mail");
mesh.geometry.scale(FT, FT, FT);
mesh.geometry.computeVertexNormals();
for (const bone of mesh.skeleton.bones) {
  bone.position.multiplyScalar(FT);
  for (const item of bone.children.filter((child) => child.isMesh)) {
    item.position.multiplyScalar(FT);
    item.geometry.scale(FT, FT, FT);
    item.geometry.computeVertexNormals();
    item.name = `held_${weapon}`;
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
const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
fs.writeFileSync(out, Buffer.from(glb));
console.log(`wrote ${out}`);
