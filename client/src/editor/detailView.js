import * as THREE from "three";
import { gunzipSync } from "fflate";
import { CELL_FT, CELLS, TILE_FT } from "../world/constants.js";
import { SEA_FLOOR_FT } from "../world/landGrid.js";
import { decodeTile } from "../world/tileCodec.js";
import { detailBrush } from "./detailTools.js";
import { RenderView, boundary, groundSampler } from "./renderView.js";
import { tilePath } from "./thumbnails.js";

// The detail step's 3d view (plans/design.md, "Editor"): a window of generated tiles, `size` a side,
// drawn as the game draws them (renderView.js), for shaping local content cell by cell. An arrow
// off each side of the window moves it a strip of tiles that way. Right-drag turns, middle-drag
// pans and the wheel zooms; the left button is the tools'.
//
// Left-dragging works the brush (detailTools.js) on the window's tiles, a little each frame. Their
// meshes are made again as they change, and when a stroke ends onEdit hears which tiles it changed,
// to save them. Strokes can be undone and redone.
//
// Positions in the scene are feet from the window's middle, as RenderView keeps them.

export const WINDOW_SIZES = [3, 5, 7];
const ARROW = { lengthFt: 70, widthFt: 50, outFt: 70, color: 0xf0c850 };
const SIDES = { east: [1, 0], west: [-1, 0], south: [0, 1], north: [0, -1] };
const CURSOR = { inner: 0xffffff, outer: 0x8fc4ff, points: 48 };
const UNDO_KEEP = 50;
const MAX_DT = 0.1;

export class DetailView {
  // onMove(dx, dz) hears when an arrow's clicked; onEdit(keys) when tiles ("tx,tz") change;
  // onPointer([x, y, z]) where the pointer's over the ground, in continent feet, or null.
  constructor(canvas, { onMove, onEdit, onPointer } = {}) {
    this.canvas = canvas;
    this.view = new RenderView(canvas);
    const { controls } = this.view;
    controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    controls.screenSpacePanning = false;
    this.arrows = new THREE.Group();
    this.view.scene.add(this.arrows);
    this.cursor = new THREE.Group();
    this.view.scene.add(this.cursor);
    this.onMove = onMove;
    this.onEdit = onEdit;
    this.onPointer = onPointer;
    this.shown = false;
    this.brush = null;
    this.stroke = null;
    this.pointer = null;
    this.dirty = new Set(); // "tx,tz" of meshes to make again
    this.undos = [];
    this.redos = [];
    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const side = this.arrowAt(e);
      if (side) return this.onMove?.(...SIDES[side]);
      const hit = this.groundAt(e);
      if (!hit || !this.brush) return;
      canvas.setPointerCapture(e.pointerId);
      const from = this.cells().height(Math.floor((hit.x + this.view.origin[0]) / CELL_FT), Math.floor((hit.z + this.view.origin[1]) / CELL_FT));
      this.stroke = { from, before: new Map(), last: performance.now() };
    });
    canvas.addEventListener("pointermove", (e) => {
      this.pointer = e;
      const over = Boolean(this.arrowAt(e));
      canvas.style.cursor = over ? "pointer" : "";
      this.hover(over ? null : this.groundAt(e));
    });
    canvas.addEventListener("pointerleave", () => this.stroke || this.hover(null));
    for (const type of ["pointerup", "pointercancel"]) canvas.addEventListener(type, () => this.endStroke());
  }

  // brush: { tool, radius, falloff, strength, erosion, talus } (detailTools.js).
  setBrush(brush) {
    this.brush = brush;
    if (this.pointer) this.hover(this.groundAt(this.pointer));
  }

  // The brush's rings and the height readout, for the ground under the pointer.
  hover(hit) {
    this.drawCursor(hit);
    this.onPointer?.(hit && [hit.x + this.view.origin[0], hit.y, hit.z + this.view.origin[1]]);
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
    this.endStroke();
    this.dirty.clear();
    // Undoing reaches only tiles still loaded, so moving the window starts afresh.
    this.undos = [];
    this.redos = [];

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

  // The loaded tiles' cells as detailTools.js takes them, in continent cells. Only the window's
  // generated tiles can be edited; ground past what's loaded reads as sea floor.
  cells() {
    const { decoded } = this.view;
    const { tx0, tz0, size } = this.window;
    const tileOf = (ci, cj) => [Math.floor(ci / CELLS), Math.floor(cj / CELLS)];
    return {
      height: (ci, cj) => {
        const [tx, tz] = tileOf(ci, cj);
        const tile = decoded.get(`${tx},${tz}`);
        return tile ? tile.layers.height[(cj - tz * CELLS) * CELLS + ci - tx * CELLS] : SEA_FLOOR_FT;
      },
      editable: (ci, cj) => {
        const [tx, tz] = tileOf(ci, cj);
        return tx >= tx0 && tz >= tz0 && tx < tx0 + size && tz < tz0 + size && decoded.has(`${tx},${tz}`);
      },
    };
  }

  // Sets cells' heights, [[ci, cj, h], ...], and marks the meshes they reach to be made again: a
  // tile's own, and those west and north of it, which reach over into it to close their seams.
  // Returns the tiles changed.
  setHeights(changes) {
    const touched = new Set();
    for (const [ci, cj, h] of changes) {
      const [tx, tz] = [Math.floor(ci / CELLS), Math.floor(cj / CELLS)];
      const tile = this.view.decoded.get(`${tx},${tz}`);
      tile.layers.height[(cj - tz * CELLS) * CELLS + ci - tx * CELLS] = h;
      touched.add(`${tx},${tz}`);
    }
    const shown = new Set(this.keys());
    for (const key of touched) {
      const [tx, tz] = key.split(",").map(Number);
      for (const near of [key, `${tx - 1},${tz}`, `${tx},${tz - 1}`, `${tx - 1},${tz - 1}`]) {
        if (shown.has(near) && this.view.decoded.has(near)) this.dirty.add(near);
      }
    }
    return touched;
  }

  // One frame of the stroke under the pointer.
  work(now) {
    const { stroke } = this;
    const dt = Math.min(MAX_DT, (now - stroke.last) / 1000);
    stroke.last = now;
    const hit = this.pointer && this.groundAt(this.pointer);
    if (!hit || !dt) return;
    const cells = this.cells();
    const at = [hit.x + this.view.origin[0], hit.z + this.view.origin[1]];
    const changes = detailBrush(cells, this.brush, at, dt, stroke.from);
    for (const [ci, cj] of changes) {
      const key = `${ci},${cj}`;
      if (!stroke.before.has(key)) stroke.before.set(key, cells.height(ci, cj));
    }
    this.setHeights(changes);
  }

  endStroke() {
    const stroke = this.stroke;
    this.stroke = null;
    if (!stroke?.before.size) return;
    const cells = this.cells();
    const after = new Map([...stroke.before.keys()].map((key) => [key, cells.height(...key.split(",").map(Number))]));
    this.undos.push({ before: stroke.before, after });
    if (this.undos.length > UNDO_KEEP) this.undos.shift();
    this.redos = [];
    this.onEdit?.(this.tilesOf(after));
  }

  undo() {
    this.replay(this.undos, this.redos, "before");
  }

  redo() {
    this.replay(this.redos, this.undos, "after");
  }

  replay(from, to, side) {
    if (this.stroke || !from.length) return;
    const entry = from.pop();
    to.push(entry);
    const touched = this.setHeights([...entry[side]].map(([key, h]) => [...key.split(",").map(Number), h]));
    this.onEdit?.([...touched]);
  }

  // The tiles holding a map of "ci,cj" cells.
  tilesOf(cells) {
    const tiles = new Set();
    for (const key of cells.keys()) {
      const [ci, cj] = key.split(",").map(Number);
      tiles.add(`${Math.floor(ci / CELLS)},${Math.floor(cj / CELLS)}`);
    }
    return [...tiles];
  }

  // Makes the changed tiles' meshes again.
  rebuild() {
    const { view } = this;
    for (const key of this.dirty) {
      view.dropTile(key);
      view.buildGround(key);
      view.addTrees(view.decoded.get(key));
      view.addObjects(view.decoded.get(key));
    }
    this.dirty.clear();
  }

  // Where a pointer event meets the window's ground, in scene feet, or null.
  groundAt(e) {
    if (!this.window) return null;
    const r = this.canvas.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.view.camera);
    const ground = this.view.content.children.filter((child) => child.userData.ground);
    return ray.intersectObjects(ground, false)[0]?.point ?? null;
  }

  // Rings round the brush where it works fully and where its falloff ends, or none.
  drawCursor(hit) {
    for (const child of [...this.cursor.children]) {
      child.geometry.dispose();
      child.material.dispose();
      this.cursor.remove(child);
    }
    if (!hit || !this.brush) return;
    const { origin, ground } = this.view;
    const ring = (radius) =>
      Array.from({ length: CURSOR.points }, (_, n) => {
        const a = (n / CURSOR.points) * Math.PI * 2;
        return [(hit.x + origin[0] + Math.cos(a) * radius) / TILE_FT, (hit.z + origin[1] + Math.sin(a) * radius) / TILE_FT];
      });
    const { radius, falloff } = this.brush;
    for (const [r, color] of [[radius, CURSOR.inner], [radius + falloff, CURSOR.outer]]) {
      if (r <= 0) continue;
      const line = boundary(ring(r), ground, origin, color);
      line.material.depthTest = false;
      line.renderOrder = 4;
      this.cursor.add(line);
    }
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
      const now = performance.now();
      if (this.stroke) this.work(now);
      if (this.dirty.size) {
        this.rebuild();
        if (this.pointer) this.hover(this.groundAt(this.pointer));
      }
      this.view.render();
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  hide() {
    this.endStroke();
    this.shown = false;
  }
}
