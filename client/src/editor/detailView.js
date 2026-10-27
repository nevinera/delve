import * as THREE from "three";
import { gunzipSync } from "fflate";
import { CELL_FT, CELLS, TILE_FT } from "../world/constants.js";
import { SEA_FLOOR_FT } from "../world/landGrid.js";
import { decodeTile } from "../world/tileCodec.js";
import { detailBrush } from "./detailTools.js";
import { stampTrail } from "./detailTrails.js";
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
const CURSOR = { inner: 0xffffff, outer: 0x8fc4ff, trail: 0xe0a060, points: 48 };
const TRAIL_STEP_FT = 16; // between the points a drawn trail keeps
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
    this.cursor = new THREE.Group();
    this.view.scene.add(this.arrows, this.cursor);
    this.onMove = onMove;
    this.onEdit = onEdit;
    this.onPointer = onPointer;
    this.shown = false;
    this.brush = null;
    this.stroke = null; // a brush being dragged
    this.trail = null; // a trail being drawn: its points so far, continent feet
    this.edit = null; // the tiles an edit's changing, "tx,tz" -> their state before
    this.pointer = null;
    this.dirty = new Set(); // "tx,tz" of meshes to make again
    this.undos = [];
    this.redos = [];
    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const side = this.arrowAt(e);
      if (side) return this.onMove?.(...SIDES[side]);
      const at = this.pointAt(e);
      if (!at || !this.brush) return;
      canvas.setPointerCapture(e.pointerId);
      if (this.brush.tool === "trails") {
        this.trail = [at];
        return;
      }
      const from = this.cells().height(Math.floor(at[0] / CELL_FT), Math.floor(at[1] / CELL_FT));
      this.beginEdit();
      this.stroke = { from, last: performance.now() };
    });
    canvas.addEventListener("pointermove", (e) => {
      this.pointer = e;
      const over = Boolean(this.arrowAt(e));
      canvas.style.cursor = over ? "pointer" : "";
      const at = !over && this.pointAt(e);
      if (this.trail && at && Math.hypot(at[0] - this.trail.at(-1)[0], at[1] - this.trail.at(-1)[1]) >= TRAIL_STEP_FT) this.trail.push(at);
      this.hover(over ? null : this.groundAt(e));
    });
    canvas.addEventListener("pointerleave", () => this.stroke || this.trail || this.hover(null));
    for (const type of ["pointerup", "pointercancel"]) canvas.addEventListener(type, (e) => this.release(type === "pointercancel"));
  }

  // brush: { tool, radius, falloff, strength, erosion, talus } (detailTools.js), or for the trail
  // tool, { tool: "trails", kind, state, width } (detailTrails.js).
  setBrush(brush) {
    this.brush = brush;
    if (this.pointer) this.hover(this.groundAt(this.pointer));
  }

  // The cursor and the height readout, for the ground under the pointer.
  hover(hit) {
    this.drawCursor(hit);
    this.onPointer?.(hit && [hit.x + this.view.origin[0], hit.y, hit.z + this.view.origin[1]]);
  }

  // The left button's let go: a brush stroke ends, and a trail's stamped (or dropped, if `cancel`).
  release(cancel = false) {
    if (this.stroke) {
      this.stroke = null;
      this.endEdit();
    }
    const trail = this.trail;
    this.trail = null;
    if (trail && !cancel && trail.length >= 2) {
      this.beginEdit();
      const editable = new Set(this.keys());
      const { kind, state, width } = this.brush;
      // Snapshots every tile the trail could reach first, since stamping changes them in place.
      for (const key of editable) if (this.view.decoded.has(key)) this.touch(key);
      const changed = stampTrail(this.view.decoded, (key) => editable.has(key), { kind, state, width }, trail);
      for (const key of [...this.edit.keys()]) if (!changed.includes(key)) this.edit.delete(key);
      this.changed(changed);
      this.endEdit();
    }
    if (this.pointer) this.hover(this.groundAt(this.pointer));
  }

  // Drops a trail half drawn.
  cancel() {
    if (this.trail) this.release(true);
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
    this.release(true);
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

  // Sets cells' heights, [[ci, cj, h], ...], within the edit under way.
  setHeights(changes) {
    const touched = new Set();
    for (const [ci, cj, h] of changes) {
      const [tx, tz] = [Math.floor(ci / CELLS), Math.floor(cj / CELLS)];
      const key = `${tx},${tz}`;
      this.touch(key);
      this.view.decoded.get(key).layers.height[(cj - tz * CELLS) * CELLS + ci - tx * CELLS] = h;
      touched.add(key);
    }
    this.changed(touched);
  }

  // Marks the meshes changed tiles reach to be made again: a tile's own, and those west and north
  // of it, which reach over into it to close their seams.
  changed(keys) {
    const shown = new Set(this.keys());
    for (const key of keys) {
      const [tx, tz] = key.split(",").map(Number);
      for (const near of [key, `${tx - 1},${tz}`, `${tx},${tz - 1}`, `${tx - 1},${tz - 1}`]) {
        if (shown.has(near) && this.view.decoded.has(near)) this.dirty.add(near);
      }
    }
  }

  // One frame of the brush stroke under the pointer.
  work(now) {
    const { stroke } = this;
    const dt = Math.min(MAX_DT, (now - stroke.last) / 1000);
    stroke.last = now;
    const at = this.pointer && this.pointAt(this.pointer);
    if (!at || !dt) return;
    this.setHeights(detailBrush(this.cells(), this.brush, at, dt, stroke.from));
  }

  // Edits are kept for undoing as each changed tile's state before and after.
  beginEdit() {
    this.edit = new Map();
  }

  // Keeps a tile's state before the edit under way first changes it.
  touch(key) {
    if (this.edit && !this.edit.has(key)) this.edit.set(key, snapshot(this.view.decoded.get(key)));
  }

  endEdit() {
    const edit = this.edit;
    this.edit = null;
    if (!edit?.size) return;
    const after = new Map([...edit.keys()].map((key) => [key, snapshot(this.view.decoded.get(key))]));
    this.undos.push({ before: edit, after });
    if (this.undos.length > UNDO_KEEP) this.undos.shift();
    this.redos = [];
    this.onEdit?.([...edit.keys()]);
  }

  undo() {
    this.replay(this.undos, this.redos, "before");
  }

  redo() {
    this.replay(this.redos, this.undos, "after");
  }

  replay(from, to, side) {
    if (this.stroke || this.trail || !from.length) return;
    const entry = from.pop();
    to.push(entry);
    for (const [key, state] of entry[side]) restore(this.view.decoded.get(key), state);
    this.changed(entry[side].keys());
    this.onEdit?.([...entry[side].keys()]);
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

  // Where a pointer event meets the ground, [x, z] in continent feet, or null.
  pointAt(e) {
    const hit = this.groundAt(e);
    return hit && [hit.x + this.view.origin[0], hit.z + this.view.origin[1]];
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

  // Rings round the brush where it works fully and where its falloff ends; for the trail tool, a
  // ring as wide as the trail, and the trail drawn so far.
  drawCursor(hit) {
    for (const child of [...this.cursor.children]) {
      child.geometry.dispose();
      child.material.dispose();
      this.cursor.remove(child);
    }
    if (!this.brush) return;
    const { origin, ground } = this.view;
    const add = (points, color, closed = true) => {
      const line = boundary(points.map(([x, z]) => [x / TILE_FT, z / TILE_FT]), ground, origin, color, closed);
      line.material.depthTest = false;
      line.renderOrder = 4;
      this.cursor.add(line);
    };
    if (this.trail?.length >= 2) add(this.trail, CURSOR.trail, false);
    if (!hit) return;
    const ring = (radius) =>
      Array.from({ length: CURSOR.points }, (_, n) => {
        const a = (n / CURSOR.points) * Math.PI * 2;
        return [hit.x + origin[0] + Math.cos(a) * radius, hit.z + origin[1] + Math.sin(a) * radius];
      });
    const rings = this.brush.tool === "trails" ? [[Math.max(CELL_FT / 2, this.brush.width / 2), CURSOR.trail]] : [[this.brush.radius, CURSOR.inner], [this.brush.radius + this.brush.falloff, CURSOR.outer]];
    for (const [r, color] of rings) if (r > 0) add(ring(r), color);
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
      } else if (this.trail) this.drawCursor(this.pointer && this.groundAt(this.pointer));
      this.view.render();
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  hide() {
    this.release(true);
    this.shown = false;
  }
}

// A tile's changeable state, copied, for undoing.
function snapshot(tile) {
  return {
    layers: Object.fromEntries(Object.entries(tile.layers).map(([name, values]) => [name, values.slice()])),
    palettes: structuredClone(tile.palettes),
    objects: structuredClone(tile.objects ?? []),
    roads: structuredClone(tile.roads ?? []),
  };
}

function restore(tile, state) {
  const copy = snapshot(state);
  Object.assign(tile, { layers: copy.layers, palettes: copy.palettes, objects: copy.objects, roads: copy.roads });
}
