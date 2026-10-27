import * as THREE from "three";
import { disposePreview, typePreview } from "./objectMeshes.js";
import { structureGroup } from "./structureMeshes.js";
import { imageOf, specOf } from "../world/objects.js";

// Rendered thumbnails of library entries ({ key, type, structure }: key is unique and changes when
// the thing does, type is what typePreview draws, a structure is drawn as itself), for galleries.
// One offscreen renderer, shared by every Thumbnails, draws them all into 2D canvases, a few per
// frame so a big gallery doesn't stall; the one under the pointer turns.

const PER_FRAME = 4;
const TURN_PER_MS = 0.0012;
const BACKGROUND = 0x20242a;

let shared = null; // { renderer, scene, camera }
function stage(px) {
  if (!shared) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BACKGROUND);
    scene.add(new THREE.HemisphereLight(0xdde8ff, 0x4a4030, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(3, 5, 2);
    scene.add(sun);
    shared = { renderer, scene, camera: new THREE.PerspectiveCamera(35, 1, 0.1, 2000) };
  }
  if (shared.renderer.domElement.width !== px) shared.renderer.setSize(px, px, false);
  return shared;
}

export class Thumbnails {
  constructor() {
    this.queue = [];
    this.previews = new Map(); // key -> group, kept while shown
  }

  preview(entry) {
    if (!this.previews.has(entry.key)) {
      const preview = entry.structure ? structureGroup(entry.structure, { imageOf, furnish: (o) => specOf(o.type)?.built && typePreview(o.type) }) : typePreview(entry.type);
      if (entry.structure) preview.traverse((mesh) => (mesh.userData.ownGeometry = true));
      this.previews.set(entry.key, preview);
    }
    return this.previews.get(entry.key);
  }

  // Draws one entry, turned `turn` radians, into a 2D canvas.
  draw(entry, canvas, turn = 0.6) {
    const { renderer, scene, camera } = stage(canvas.width);
    const group = this.preview(entry);
    group.rotation.y = turn;
    scene.add(group);
    const sphere = new THREE.Box3().setFromObject(group).getBoundingSphere(new THREE.Sphere());
    const reach = Math.max(sphere.radius, 0.5) / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.position.copy(sphere.center).add(new THREE.Vector3(0, 0.45, 1).normalize().multiplyScalar(reach));
    camera.lookAt(sphere.center);
    renderer.render(scene, camera);
    scene.remove(group);
    canvas.getContext("2d").drawImage(renderer.domElement, 0, 0, canvas.width, canvas.height);
  }

  // Draws [{ entry, canvas }] over the next frames, in place of any still waiting; then frees the
  // previews of entries whose keys aren't in `keep`.
  drawAll(list, keep) {
    this.stopTurning();
    this.queue = [...list];
    cancelAnimationFrame(this.drawing);
    const step = () => {
      for (const { entry, canvas } of this.queue.splice(0, PER_FRAME)) this.draw(entry, canvas);
      if (this.queue.length) this.drawing = requestAnimationFrame(step);
      else this.dropUnused(keep);
    };
    this.drawing = requestAnimationFrame(step);
  }

  dropUnused(keep) {
    for (const [key, group] of this.previews) {
      if (keep.has(key)) continue;
      disposePreview(group);
      this.previews.delete(key);
    }
  }

  startTurning(entry, canvas) {
    this.stopTurning();
    const start = performance.now();
    const loop = (now) => {
      this.draw(entry, canvas, 0.6 + (now - start) * TURN_PER_MS);
      this.turning = requestAnimationFrame(loop);
    };
    this.turning = requestAnimationFrame(loop);
  }

  stopTurning() {
    cancelAnimationFrame(this.turning);
    this.turning = null;
  }
}
