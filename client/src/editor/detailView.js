import * as THREE from "three";
import { gunzipSync } from "fflate";
import { TILE_FT } from "../world/constants.js";
import { decodeTile } from "../world/tileCodec.js";
import { RenderView, boundary, groundSampler } from "./renderView.js";
import { tilePath } from "./thumbnails.js";

// The detail step's 3d view (plans/design.md, "Editor"): a window of generated tiles, `size` a side,
// drawn as the game draws them (renderView.js), for shaping local content cell by cell. An arrow
// off each side of the window moves it a strip of tiles that way. Right-drag turns, middle-drag
// pans and the wheel zooms; the left button is the tools'.
//
// Positions in the scene are feet from the window's middle, as RenderView keeps them.

export const WINDOW_SIZES = [3, 5, 7];
const ARROW = { lengthFt: 70, widthFt: 50, outFt: 70, color: 0xf0c850 };
const SIDES = { east: [1, 0], west: [-1, 0], south: [0, 1], north: [0, -1] };

export class DetailView {
  // onMove(dx, dz) hears when an arrow's clicked.
  constructor(canvas, { onMove } = {}) {
    this.canvas = canvas;
    this.view = new RenderView(canvas);
    const { controls } = this.view;
    controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    controls.screenSpacePanning = false;
    this.arrows = new THREE.Group();
    this.view.scene.add(this.arrows);
    this.onMove = onMove;
    this.shown = false;
    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const side = this.arrowAt(e);
      if (side) this.onMove?.(...SIDES[side]);
    });
    canvas.addEventListener("pointermove", (e) => {
      const over = Boolean(this.arrowAt(e));
      canvas.style.cursor = over ? "pointer" : "";
    });
  }

  // Loads the window of tiles whose north-west tile is (tx0, tz0), `size` a side, from
  // state.world's files, keeping the camera where it was over the ground.
  show(state, [tx0, tz0], size) {
    const view = this.view;
    const before = view.origin;
    view.stopWalk();
    view.streaming = null;
    view.clear();
    view.decoded = new Map();
    view.clutterTiles.clear();
    view.clutterAround = null;
    view.sightTile = null;
    view.origin = [(tx0 + size / 2) * TILE_FT, (tz0 + size / 2) * TILE_FT];
    view.ground = groundSampler(view.decoded, view.origin);
    this.window = { tx0, tz0, size, world: state.world, continent: state.continent };

    // The window's tiles, and a ring round it so the seams at its edge close.
    for (let tz = tz0 - 1; tz <= tz0 + size; tz++) {
      for (let tx = tx0 - 1; tx <= tx0 + size; tx++) {
        const bytes = state.world.files.get(tilePath(state.continent, tx, tz));
        if (!bytes) continue;
        try {
          view.decoded.set(`${tx},${tz}`, decodeTile(gunzipSync(bytes)));
        } catch (err) {
          console.warn(`couldn't read tile ${tx},${tz}: ${err.message}`);
        }
      }
    }
    const keys = this.keys().filter((key) => view.decoded.has(key));
    for (const key of keys) {
      view.buildGround(key);
      view.addTrees(view.decoded.get(key));
      view.addObjects(view.decoded.get(key));
    }
    view.buildOcean(keys);
    this.drawFrame();

    const { controls, camera } = view;
    if (!before) {
      const y = view.ground(0, 0) || 0;
      controls.target.set(0, y, 0);
      // Far enough back that the whole window and its arrows show.
      camera.position.set(0, y + size * TILE_FT * 1.1, size * TILE_FT * 1.0);
    } else {
      // Same place in the world as before, now nearer the middle by however far the window moved.
      const [dx, dz] = [before[0] - view.origin[0], before[1] - view.origin[1]];
      controls.target.x += dx;
      controls.target.z += dz;
      camera.position.x += dx;
      camera.position.z += dz;
    }
    controls.update();
    view.resize();
    this.start();
  }

  // The window's tiles, as "tx,tz" keys.
  keys() {
    const { tx0, tz0, size } = this.window;
    const keys = [];
    for (let tz = tz0; tz < tz0 + size; tz++) for (let tx = tx0; tx < tx0 + size; tx++) keys.push(`${tx},${tz}`);
    return keys;
  }

  // The window's edge on the ground, and an arrow off each side.
  drawFrame() {
    const { view } = this;
    const { tx0, tz0, size } = this.window;
    for (const child of [...view.marks.children]) {
      child.geometry.dispose();
      child.material.dispose();
      view.marks.remove(child);
    }
    const corners = [[tx0, tz0], [tx0 + size, tz0], [tx0 + size, tz0 + size], [tx0, tz0 + size]];
    view.marks.add(boundary(corners, view.ground, view.origin, ARROW.color));

    for (const child of [...this.arrows.children]) {
      child.geometry.dispose();
      this.arrows.remove(child);
    }
    this.arrowMaterial ??= new THREE.MeshBasicMaterial({ color: ARROW.color, side: THREE.DoubleSide, depthTest: false, transparent: true, opacity: 0.9 });
    const half = (size * TILE_FT) / 2;
    // Bigger for bigger windows, which are seen from further off.
    const scale = size / 3;
    for (const [side, [dx, dz]] of Object.entries(SIDES)) {
      const shape = new THREE.Shape();
      shape.moveTo(0, ARROW.lengthFt);
      shape.lineTo(-ARROW.widthFt / 2, 0);
      shape.lineTo(ARROW.widthFt / 2, 0);
      shape.closePath();
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), this.arrowMaterial);
      // Flat on the ground, pointing out of the window.
      const out = ARROW.outFt * scale;
      const [x, z] = [dx * (half + out), dz * (half + out)];
      mesh.rotation.set(-Math.PI / 2, 0, Math.atan2(-dx, -dz));
      mesh.position.set(x, Math.max(0, view.ground(x - dx * out, z - dz * out) || 0) + 8, z);
      mesh.scale.setScalar(scale);
      mesh.renderOrder = 3;
      mesh.userData.side = side;
      this.arrows.add(mesh);
    }
  }

  // The side whose arrow is under a pointer event, or null.
  arrowAt(e) {
    if (!this.window) return null;
    const r = this.canvas.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.view.camera);
    return ray.intersectObjects(this.arrows.children)[0]?.object.userData.side ?? null;
  }

  // Draws every frame while shown, so water moves and the sky turns.
  start() {
    this.shown = true;
    if (this.frame) return;
    const loop = () => {
      if (!this.shown) {
        this.frame = null;
        return;
      }
      this.view.render();
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  hide() {
    this.shown = false;
  }
}
