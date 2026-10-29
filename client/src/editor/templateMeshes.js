import * as THREE from "three";
import { specOf } from "../world/objects.js";
import { placedTemplate } from "../world/templates.js";
import { builtPreview, disposePreview, typePreview } from "./objectMeshes.js";
import { slabMeshes } from "./slabMeshes.js";

// A template (world/templates.js) drawn as itself, for thumbnails and for placing: its slabs, and
// its objects as previews, in feet from its anchor. Objects without a height stand on the anchor.

export function templateGroup(template) {
  const group = new THREE.Group();
  const { slabs, objects } = placedTemplate(template, [0, 0, 0]);
  for (const mesh of slabMeshes(slabs, [0, 0])) {
    // Slab meshes share their materials with the world's.
    mesh.userData.ownGeometry = true;
    mesh.userData.sharedMaterial = true;
    group.add(mesh);
  }
  for (const object of objects) {
    const spec = specOf(object.type);
    if (!spec) continue;
    const preview = spec.built ? builtPreview(object.type, object.colors, object.texts) : typePreview(object.type);
    preview.scale.setScalar(spec.built ? object.scale : object.scale / ((spec.size[0] + spec.size[1]) / 2));
    preview.position.set(object.at[0], object.y ?? 0, object.at[1]);
    preview.rotation.y = object.yaw;
    group.add(preview);
  }
  return group;
}

// Frees a templateGroup.
export function disposeTemplateGroup(group) {
  disposePreview(group);
}
