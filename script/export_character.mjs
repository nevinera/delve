// Exports a character as a GLB, mesh and skeleton, to pose in an animation tool such as Cascadeur:
// the default look, 6ft tall, holding a weapon (a greatsword unless given), in meters as glTF
// expects. Its bones carry body.js's names and stand unrotated, arms down.
//
//   node script/export_character.mjs [out.glb] [weapon]
import fs from "fs";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { characterMesh } from "../client/src/character/characterMesh.js";
import { resolveRecipe } from "../client/src/character/recipe.js";

const FT = 0.3048;
const [out = "tmp/character.glb", weapon = "greatsword"] = process.argv.slice(2);

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
for (const bone of mesh.skeleton.bones) {
  bone.position.multiplyScalar(FT);
  for (const item of bone.children.filter((child) => child.isMesh)) {
    item.position.multiplyScalar(FT);
    item.geometry.scale(FT, FT, FT);
    item.name = `held_${weapon}`;
  }
}
mesh.updateMatrixWorld(true);
mesh.skeleton.calculateInverses();
mesh.bind(mesh.skeleton, mesh.matrixWorld);

const scene = new THREE.Scene();
scene.add(mesh);
const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
fs.writeFileSync(out, Buffer.from(glb));
console.log(`wrote ${out}`);
