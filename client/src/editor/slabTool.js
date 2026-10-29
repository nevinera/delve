import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { CELL_FT } from "../world/constants.js";
import { MAX_SLAB_CORNERS, SLAB_REACH_FT, slabBottom, slabProblems, slabTile, slabTop } from "../world/slabs.js";
import { slabAt, slabGeometry, slabMeshes } from "./slabMeshes.js";
import { repeatFt } from "./slabTextures.js";

// The detail step's slabs tool (world/slabs.js), working on a DetailView's tiles. Its mode is one
// of:
// - "pick": a click picks a slab, shift-click adds or takes away one, and dragging a box from
//   where there's none picks those whose middles are in it. A slab picked alone has handles:
//   arrows to move it along the world's axes, or rings to turn it in its own (setHandle), and a
//   dot on each top corner to drag across its face. Several picked together only move.
// - "floor": a slab lying on what's pressed first, the ground or a slab, the rest of its corners on
//   a level plane there. A rectangle goes from one corner to the other, square to the camera as it
//   was at the first: dragged, or clicked at each end. A polygon is a click for each corner,
//   finished by clicking the first again, or Enter.
// - "wall": a slab standing up from a line on that level plane. A rectangle is the line, dragged or
//   clicked at each end; it stands `height` feet over its start, its foot dropped to the lowest
//   ground under the line, and with keepWalling the next wall goes on from where it ended. A
//   polygon is the line's two clicks, then corners up its face, as for a gable end, finished as a
//   floor is.
// A rectangle up to MAX_RECTANGLE_FT a side is cut into as many slabs as it takes, each a whole
// number of its picture's repeats across where it can be, so the picture runs on over the joins.
// With conform, the ground under a new floor begun on the ground, and just past its edges, is set
// to its bottom.
// Corners on the level snap to other slabs' top corners nearby. What would be made shows as it's
// drawn, red where it can't be: too big, say, or belonging outside the window. Escape drops a slab
// half drawn, Backspace its last corner.

const MARK = { drawing: 0x3fb6ff, picked: 0xffe066, dot: 0xffe066, wrong: 0xe04040 };
const WRONG = new THREE.MeshBasicMaterial({ color: MARK.wrong, transparent: true, opacity: 0.6 });
const SNAP_SHARE = 0.012; // of the camera's distance: how near a corner snaps
const MIN_SNAP_FT = 0.5;
const DOT_SHARE = 0.006; // of the camera's distance: how big a corner dot is
const ROUND = 100; // positions to a hundredth of a foot
const TURN_STEP = 5; // degrees the turning rings snap to
const MOVE_STEP_FT = 0.25;
const MAX_RECTANGLE_FT = 2048;
const MAX_PIECE_FT = 40; // the most a piece of a cut-up rectangle is along each side
const CLICK_PX = 5; // a press moving less than this before it's let go is a click

export class SlabTool {
  // detail: the DetailView. onPick(slabs) hears what's picked, and when it changes;
  // onProblem(message) when a slab can't be made or changed as asked.
  constructor(detail, { onPick, onProblem } = {}) {
    this.detail = detail;
    this.onPick = onPick;
    this.onProblem = onProblem;
    this.settings = { mode: "pick", shape: "rectangle", thickness: 1, height: 10, keepWalling: false, conform: false, surface: "floorboards" };
    this.drawing = null; // { points: [[x, y, z] continent feet], height, pressed: [x, y] while dragging }
    this.picks = []; // [{ slab, key }]: the slabs picked, and the tiles listing them
    this.box = null; // a box being dragged to pick slabs in: { from: [x, y] client pixels, adding }
    this.corner = null; // the index of a corner being dragged
    this.handle = "move";
    const { view } = detail;
    this.marks = new THREE.Group();
    view.scene.add(this.marks);
    this.proxy = new THREE.Object3D();
    view.scene.add(this.proxy);
    this.transform = new TransformControls(view.camera, detail.canvas);
    this.transform.setSize(0.8);
    this.transform.setTranslationSnap(MOVE_STEP_FT);
    this.transform.setRotationSnap(THREE.MathUtils.degToRad(TURN_STEP));
    view.scene.add(this.transform.getHelper());
    this.transform.addEventListener("dragging-changed", (e) => {
      view.controls.enabled = !e.value;
      if (e.value) {
        this.keepBefore();
        this.dragFrom = this.proxy.position.clone();
        detail.beginEdit();
        for (const pick of this.picks) detail.touch(pick.key);
      } else detail.endEdit();
    });
    this.transform.addEventListener("objectChange", () => this.readHandles());
    this.transform.addEventListener("change", () => view.render());
    this.setHandle("move");
    this.active(false);
  }

  // Whether the tool's in use: its handles and marks show only then.
  active(on) {
    this.on = on;
    if (!on) this.drawing = null;
    this.showHandles();
    this.drawMarks();
  }

  // settings: any of { mode, shape, thickness, height, keepWalling, conform, surface }.
  setSettings(changes) {
    const { mode, shape } = this.settings;
    Object.assign(this.settings, changes);
    if (this.settings.mode !== mode || this.settings.shape !== shape) this.drawing = null;
    this.drawMarks();
  }

  // The slab picked alone, as { slab, key }, or null.
  get picked() {
    return this.picks.length === 1 ? this.picks[0] : null;
  }

  // Moves or turns with the handles; several slabs picked together only move.
  setHandle(name) {
    this.handle = name;
    const turning = name === "turn" && this.picks.length <= 1;
    this.transform.setMode(turning ? "rotate" : "translate");
    this.transform.setSpace(turning ? "local" : "world");
  }

  // --- pointer ---

  // A left button press; true when the tool's taken it.
  pointerDown(e) {
    if (this.transform.dragging || this.transform.axis) return true;
    const ray = this.ray(e);
    if (this.picked) {
      const dot = ray.intersectObjects(this.marks.children.filter((m) => m.userData.corner !== undefined), false)[0];
      if (dot) {
        this.corner = dot.object.userData.corner;
        this.keepBefore();
        this.detail.beginEdit();
        this.detail.touch(this.picked.key);
        return true;
      }
    }
    const { mode } = this.settings;
    if (mode === "pick") {
      const under = this.slabUnder(ray);
      if (!under) this.box = { from: [e.clientX, e.clientY], adding: e.shiftKey };
      else if (!e.shiftKey) this.pick([under]);
      else {
        const others = this.picks.filter((p) => p.slab !== under.slab);
        this.pick(others.length < this.picks.length ? others : [...this.picks, under]);
      }
      return true;
    }
    const rectangle = this.settings.shape === "rectangle";
    if (!this.drawing) {
      const hit = this.surfaceUnder(ray);
      if (hit) this.drawing = { points: [this.snap(hit.at, hit.at[1])], height: hit.at[1], onGround: hit.ground, pressed: rectangle ? [e.clientX, e.clientY] : null, yaw: this.cameraYaw() };
    } else if (rectangle) {
      const at = this.nextCorner(ray);
      if (at) this.endRectangle(at);
    } else {
      const at = this.nextCorner(ray);
      if (at) this.addCorner(at);
    }
    this.drawMarks(e);
    return true;
  }

  pointerMove(e) {
    if (this.box) return this.drawBox(e);
    if (this.corner !== null) return this.dragCorner(e);
    if (this.drawing) this.drawMarks(e);
  }

  // A rectangle dragged ends where it's let go; one only clicked follows the pointer till the
  // next click.
  pointerUp() {
    const pressed = this.drawing?.pressed;
    const pointer = this.detail.pointer;
    if (this.box) this.endBox(pointer);
    if (pressed) {
      this.drawing.pressed = null;
      const moved = pointer && Math.hypot(pointer.clientX - pressed[0], pointer.clientY - pressed[1]) > CLICK_PX;
      const end = moved && this.nextCorner(this.ray(pointer));
      if (end) this.endRectangle(end);
    }
    if (this.corner === null) return;
    this.corner = null;
    this.detail.endEdit();
  }

  // Enter finishes a floor, Backspace drops its last corner, Escape drops it; for a picked slab, G
  // and R pick its handles, Delete and Backspace take it away, Escape lets it go. True when the
  // key was one of them.
  key(e) {
    if (this.drawing) {
      if (e.key === "Enter") this.finish();
      else if (e.key === "Backspace") {
        this.drawing.points.pop();
        if (!this.drawing.points.length) this.drawing = null;
      }
      else if (e.key === "Escape") this.drawing = null;
      else return false;
      this.drawMarks();
      return true;
    }
    if (!this.picks.length) return false;
    if (e.key === "g" || e.key === "r") {
      this.setHandle(e.key === "g" ? "move" : "turn");
      this.told();
    }
    else if (e.key === "Delete" || e.key === "Backspace") this.remove();
    else if (e.key === "Escape") this.pick([]);
    else return false;
    return true;
  }

  // --- drawing ---

  // Where the next corner goes for a ray, [x, y, z] continent feet, or null: on the level plane,
  // or up a polygon wall's face once its line's drawn.
  nextCorner(ray) {
    const { points, height } = this.drawing;
    if (this.settings.mode === "wall" && this.settings.shape === "polygon" && points.length >= 2) {
      const [a, b] = points.map((p) => this.scene(p));
      const across = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3(0, 1, 0));
      if (across.lengthSq() < 1e-6) return null;
      const hit = ray.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(across.normalize(), a), new THREE.Vector3());
      const { origin } = this.detail.view;
      return hit ? [hit.x + origin[0], hit.y, hit.z + origin[1]].map(tidy) : null;
    }
    const at = this.onLevel(ray, height);
    return at && this.snap(at, height);
  }

  // A rectangle's far end: it's made, and with keepWalling, a wall's end starts the next.
  endRectangle(end) {
    const slabs = this.slabFrom([this.drawing.points[0], end]);
    if (!this.fits(slabs)) return;
    const { height, yaw, onGround } = this.drawing;
    this.drawing = this.settings.mode === "wall" && this.settings.keepWalling ? { points: [end], height, onGround, pressed: null, yaw } : null;
    this.add(slabs, { onGround });
  }

  // A polygon's next corner, or its first again to finish it.
  addCorner(at) {
    const { points } = this.drawing;
    const near = this.settings.mode === "wall" ? distance(at, points[0]) : flatDistance(at, points[0]);
    if (points.length >= 3 && near < this.snapFt()) return this.finish();
    if (points.length >= MAX_SLAB_CORNERS) return this.onProblem?.(`A slab has at most ${MAX_SLAB_CORNERS} corners.`);
    points.push(at);
  }

  // Makes the polygon drawn so far.
  finish() {
    const slabs = this.drawing && this.settings.shape === "polygon" ? this.slabFrom(this.drawing.points) : [];
    if (!this.fits(slabs)) return;
    const { onGround } = this.drawing;
    this.drawing = null;
    this.add(slabs, { onGround });
  }

  // The slabs the corners drawn so far would make ([x, y, z] continent feet each): none, one, or
  // a rectangle's pieces.
  slabFrom(points) {
    const { mode, shape, thickness, surface } = this.settings;
    const [a, b] = points;
    const one = (slab) => (slab ? [slab] : []);
    if (mode === "floor") {
      if (shape === "polygon") return points.length >= 3 ? [floorSlab(points, { thickness, surface })] : [];
      return points.length >= 2 ? rectanglePieces(a, b, this.drawing.yaw, { thickness, surface }) : [];
    }
    if (points.length < 2 || flatDistance(a, b) < 0.5) return [];
    if (shape === "rectangle") return wallPieces(a, b, { foot: this.footUnder(a, b), height: this.settings.height, thickness, surface });
    return points.length >= 3 ? one(faceSlab(points, { thickness, surface })) : [];
  }

  // The lowest ground under a line, to a quarter foot, and no higher than its start.
  footUnder(from, to) {
    const length = flatDistance(from, to);
    const [dx, dz] = [to[0] - from[0], to[2] - from[2]];
    let foot = from[1];
    const { ground, origin } = this.detail.view;
    for (let s = 0; s <= length; s += 2) {
      const h = ground(from[0] + (dx * s) / length - origin[0], from[2] + (dz * s) / length - origin[1]);
      if (Number.isFinite(h)) foot = Math.min(foot, h);
    }
    return Math.floor(foot * 4) / 4;
  }

  // Whether a slab can be made: nothing wrong with it, in a tile of the window.
  fits(slabs) {
    return slabs.length > 0 && slabs.every((slab) => !slabProblems(slab).length && this.detail.editable(slabTile(slab).join(",")));
  }

  // Which way the camera faces across the ground, as a slab's yaw: a slab turned so has its u
  // running to the right of the view and its v towards the camera.
  cameraYaw() {
    const { camera, controls } = this.detail.view;
    const [fx, fz] = [controls.target.x - camera.position.x, controls.target.z - camera.position.z];
    return Math.round(((Math.atan2(-fx, -fz) * 180) / Math.PI) * 10) / 10 + 0;
  }

  // Puts new slabs in the tiles they belong to, as one edit, and picks a lone one unless more's
  // being drawn. A floor begun `onGround` conforms the ground to it, when that's asked for.
  add(slabs, { onGround = false } = {}) {
    const { detail } = this;
    detail.beginEdit();
    for (const slab of slabs) {
      const key = slabTile(slab).join(",");
      detail.touch(key);
      const tile = detail.view.decoded.get(key);
      tile.slabs = [...(tile.slabs ?? []), slab];
      detail.dirtySlabs.add(key);
    }
    const conform = this.settings.mode === "floor" && this.settings.conform && onGround;
    if (conform) {
      const cells = detail.cells();
      detail.setHeights(conformedCells(slabs, CELL_FT).filter(([ci, cj]) => cells.editable(ci, cj)));
      detail.rework();
    }
    detail.endEdit({ reflow: conform });
    // A wall chained on from it isn't picked, so its handles don't get in the way.
    this.pick(slabs.length === 1 && !this.drawing ? [{ slab: slabs[0], key: slabTile(slabs[0]).join(",") }] : []);
  }

  // --- the picked slabs ---

  // Picks slabs, [{ slab, key }], or none.
  pick(picks) {
    this.picks = picks ?? [];
    this.setHandle(this.handle);
    this.showHandles();
    this.drawMarks();
    this.told();
  }

  told() {
    this.onPick?.(this.picks.map((p) => p.slab));
  }

  // Keeps the picked slabs as they are, to go back to if a change takes one out of the window.
  keepBefore() {
    this.before = new Map(this.picks.map((pick) => [pick, structuredClone(pick.slab)]));
  }

  // Changes the picked slabs: any of { at, turn, thickness, surface }. Undone together between
  // beginEdit and endEdit; without, each change is its own edit.
  change(changes) {
    const { picks, detail } = this;
    if (!picks.length) return;
    for (const { slab } of picks) {
      const problems = slabProblems({ ...slab, ...changes });
      if (problems.length) return this.onProblem?.(`That slab would ${problems[0].replace(/^has /, "have ").replace(/^needs /, "need ").replace(/^reaches /, "reach ")}.`);
    }
    const own = !detail.edit;
    if (own) detail.beginEdit();
    for (const pick of picks) detail.touch(pick.key);
    this.keepBefore();
    for (const { slab } of picks) Object.assign(slab, structuredClone(changes));
    this.rehome();
    if (own) detail.endEdit();
    this.showHandles();
    this.drawMarks();
    this.told();
  }

  remove() {
    const { picks, detail } = this;
    if (!picks.length) return;
    detail.beginEdit();
    for (const { slab, key } of picks) {
      detail.touch(key);
      const tile = detail.view.decoded.get(key);
      tile.slabs = tile.slabs.filter((s) => s !== slab);
      detail.dirtySlabs.add(key);
    }
    detail.endEdit();
    this.pick([]);
  }

  // Moves each picked slab into the tile its home corner's now in. If one would leave the window,
  // they all go back to how they were before.
  rehome() {
    const { picks, detail } = this;
    if (picks.some(({ slab }) => !detail.editable(slabTile(slab).join(",")))) {
      for (const pick of picks) if (this.before?.has(pick)) Object.assign(pick.slab, structuredClone(this.before.get(pick)));
      this.onProblem?.("A slab can't leave the window.");
      this.showHandles();
    }
    for (const pick of picks) {
      detail.dirtySlabs.add(pick.key);
      const key = slabTile(pick.slab).join(",");
      if (key === pick.key) continue;
      detail.touch(key);
      const from = detail.view.decoded.get(pick.key);
      from.slabs = from.slabs.filter((s) => s !== pick.slab);
      const to = detail.view.decoded.get(key);
      to.slabs = [...(to.slabs ?? []), pick.slab];
      pick.key = key;
      detail.dirtySlabs.add(key);
    }
  }

  // The handles moved: the slabs follow them. One alone turns with them too.
  readHandles() {
    const { picks, picked } = this;
    if (!picks.length) return;
    const { origin } = this.detail.view;
    const p = this.proxy.position;
    if (picked) {
      picked.slab.at = [p.x + origin[0], p.y, p.z + origin[1]].map(tidy);
      const r = new THREE.Euler().setFromQuaternion(this.proxy.quaternion, "YXZ");
      picked.slab.turn = [r.y, r.x, r.z].map((v) => Math.round(THREE.MathUtils.radToDeg(v) * 10) / 10 + 0);
    } else {
      const by = p.clone().sub(this.dragFrom);
      for (const pick of picks) pick.slab.at = this.before.get(pick).at.map((v, i) => tidy(v + by.getComponent(i)));
    }
    this.rehome();
    this.drawMarks();
    this.told();
  }

  // The box being dragged to pick slabs in, from where it started to the pointer.
  drawBox(e) {
    this.boxMark ??= Object.assign(document.createElement("div"), { className: "slab-box" });
    if (!this.boxMark.isConnected) document.body.append(this.boxMark);
    const [x0, y0] = this.box.from;
    Object.assign(this.boxMark.style, { left: `${Math.min(x0, e.clientX)}px`, top: `${Math.min(y0, e.clientY)}px`, width: `${Math.abs(e.clientX - x0)}px`, height: `${Math.abs(e.clientY - y0)}px` });
  }

  // The box let go: it picks the window's slabs whose middles are in it, with those picked before
  // when adding. A box hardly dragged is a click on nothing, and picks none.
  endBox(pointer) {
    const { from, adding } = this.box;
    this.box = null;
    this.boxMark?.remove();
    const [x1, y1] = pointer ? [pointer.clientX, pointer.clientY] : from;
    if (Math.hypot(x1 - from[0], y1 - from[1]) <= CLICK_PX) return adding || this.pick([]);
    const [left, right, top, bottom] = [Math.min(from[0], x1), Math.max(from[0], x1), Math.min(from[1], y1), Math.max(from[1], y1)];
    const r = this.detail.canvas.getBoundingClientRect();
    const { camera } = this.detail.view;
    const picks = adding ? [...this.picks] : [];
    for (const key of this.detail.keys()) {
      for (const slab of this.detail.view.decoded.get(key)?.slabs ?? []) {
        if (picks.some((p) => p.slab === slab)) continue;
        const corners = [...slabTop(slab), ...slabBottom(slab)].map((p) => this.scene(p));
        const middle = corners.reduce((m, p) => m.add(p), new THREE.Vector3()).divideScalar(corners.length).project(camera);
        if (middle.z > 1) continue;
        const [x, y] = [r.left + ((middle.x + 1) / 2) * r.width, r.top + ((1 - middle.y) / 2) * r.height];
        if (x >= left && x <= right && y >= top && y <= bottom) picks.push({ slab, key });
      }
    }
    this.pick(picks);
  }

  dragCorner(e) {
    const { slab } = this.picked;
    const normal = turned(slab, [0, 1, 0]);
    const point = this.scene(slab.at);
    const hit = this.ray(e).ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point), new THREE.Vector3());
    if (!hit) return;
    const { origin } = this.detail.view;
    const at = this.snap([hit.x + origin[0], hit.y, hit.z + origin[1]], null);
    const local = this.scene(at).sub(point).applyQuaternion(quaternionOf(slab.turn).invert());
    const outline = slab.outline.map((p, i) => (i === this.corner ? [tidy(local.x), tidy(local.z)] : p));
    if (slabProblems({ ...slab, outline }).length) return;
    slab.outline = outline;
    this.rehome();
    this.drawMarks();
  }

  // --- marks ---

  // The handles sit on a slab picked alone, or amid several, while the tool's in use.
  showHandles() {
    const { picks, picked } = this;
    if (!this.on || !picks.length) return this.transform.detach();
    if (picked) {
      this.proxy.position.copy(this.scene(picked.slab.at));
      this.proxy.quaternion.copy(quaternionOf(picked.slab.turn));
    } else {
      this.proxy.position.copy(picks.reduce((m, { slab }) => m.add(this.scene(slab.at)), new THREE.Vector3()).divideScalar(picks.length));
      this.proxy.quaternion.identity();
    }
    this.transform.attach(this.proxy);
  }

  // The slab being drawn, from its corners to the pointer, and the picked slab's edges and corner
  // dots.
  drawMarks(e) {
    for (const child of [...this.marks.children]) {
      child.geometry.dispose();
      // Previews wear the slabs' shared materials.
      if (!child.userData.preview) child.material.dispose();
      this.marks.remove(child);
    }
    if (!this.on) return;
    const line = (points, color, closed) => {
      const g = new THREE.BufferGeometry().setFromPoints(closed ? [...points, points[0]] : points);
      const mark = new THREE.Line(g, new THREE.LineBasicMaterial({ color, depthTest: false }));
      mark.renderOrder = 5;
      this.marks.add(mark);
    };
    if (this.drawing) {
      const pointer = e ?? this.detail.pointer;
      const next = pointer && this.nextCorner(this.ray(pointer));
      const corners = next ? [...this.drawing.points, next] : this.drawing.points;
      const slabs = this.slabFrom(corners);
      const { origin } = this.detail.view;
      const shown = !slabs.length ? [] : this.fits(slabs) ? slabMeshes(slabs, origin) : slabs.map((slab) => new THREE.Mesh(slabGeometry(slab, origin), WRONG));
      for (const mesh of shown) {
        mesh.userData.preview = true;
        this.marks.add(mesh);
      }
      if (this.settings.shape === "polygon" && corners.length >= 2) line(corners.map((p) => this.scene(p)), MARK.drawing, corners.length >= 3);
    }
    for (const { slab } of this.picks) {
      const top = slabTop(slab).map((p) => this.scene(p));
      const down = turned(slab, [0, -slab.thickness, 0]);
      line(top, MARK.picked, true);
      line(top.map((p) => p.clone().add(down)), MARK.picked, true);
    }
    if (this.picked) {
      const { slab } = this.picked;
      const top = slabTop(slab).map((p) => this.scene(p));
      const size = this.camera().distanceTo(top[0]) * DOT_SHARE;
      top.forEach((p, corner) => {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.15, size), 10, 8), new THREE.MeshBasicMaterial({ color: MARK.dot, depthTest: false }));
        dot.position.copy(p);
        dot.renderOrder = 6;
        dot.userData.corner = corner;
        this.marks.add(dot);
      });
    }
    this.detail.view.render();
  }

  // --- where things are ---

  camera() {
    return this.detail.view.camera.position;
  }

  ray(e) {
    const r = this.detail.canvas.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.detail.view.camera);
    return ray;
  }

  // The window's slab under a ray, as { slab, key }, or null.
  slabUnder(ray) {
    const shown = new Set(this.detail.keys());
    for (const hit of ray.intersectObjects(this.detail.view.slabs.children, false)) {
      const slab = slabAt(hit);
      const key = hit.object.userData.tile?.join(",");
      if (slab && shown.has(key)) return { slab, key };
    }
    return null;
  }

  // Where a ray first meets the ground or a slab, as { at: [x, y, z] continent feet, ground: true
  // for the ground }, or null.
  surfaceUnder(ray) {
    const { view } = this.detail;
    const ground = view.content.children.filter((child) => child.userData.ground);
    const hit = ray.intersectObjects([...ground, ...view.slabs.children], false)[0];
    return hit ? { at: [hit.point.x + view.origin[0], hit.point.y, hit.point.z + view.origin[1]].map(tidy), ground: Boolean(hit.object.userData.ground) } : null;
  }

  // Where a ray crosses the level plane at `height`, [x, y, z] continent feet, or null.
  onLevel(ray, height) {
    const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -height), new THREE.Vector3());
    const { origin } = this.detail.view;
    return hit ? [hit.x + origin[0], height, hit.z + origin[1]].map(tidy) : null;
  }

  // How near a corner has to be to snap to, in feet: further for a camera further off.
  snapFt() {
    return Math.max(MIN_SNAP_FT, this.camera().distanceTo(this.detail.view.controls.target) * SNAP_SHARE);
  }

  // A point moved onto the nearest other slab's top corner within snapping reach, across the
  // ground; kept at `height` when there is one.
  snap(at, height) {
    const reach = this.snapFt();
    let best = null;
    for (const key of this.detail.keys()) {
      for (const slab of this.detail.view.decoded.get(key)?.slabs ?? []) {
        if (this.picks.some((p) => p.slab === slab)) continue;
        for (const corner of slabTop(slab)) {
          const d = flatDistance(corner, at);
          if (d < reach && (!best || d < best.d)) best = { corner, d };
        }
      }
    }
    if (!best) return at;
    return [best.corner[0], height ?? best.corner[1], best.corner[2]].map(tidy);
  }

  // A continent point in scene feet.
  scene([x, y, z]) {
    const { origin } = this.detail.view;
    return new THREE.Vector3(x - origin[0], y, z - origin[1]);
  }
}

// A wall from `from` to `to` ([x, y, z] continent feet), standing `height` feet over `from`, its
// foot at `foot`.
export function wallSlab(from, to, { foot, height, thickness, surface }) {
  const [dx, dz] = [to[0] - from[0], to[2] - from[2]];
  const length = tidy(Math.hypot(dx, dz));
  const tall = tidy(from[1] + height - foot);
  // Pitched -90°, the outline's v points up; yawed, its u runs along the line.
  const yaw = Math.round(((Math.atan2(-dz, dx) * 180) / Math.PI) * 10) / 10 + 0;
  return { at: [from[0], foot, from[2]], turn: [yaw, -90, 0], outline: [[0, 0], [length, 0], [length, tall], [0, tall]], thickness, surface };
}

// The longest a piece of a cut-up rectangle can be along a side with `room` feet to spare: a whole
// number of `every` where that fits.
function pieceFt(room, every) {
  room = Math.min(MAX_PIECE_FT, room - 0.01);
  if (room < 1) return 0;
  return every <= room ? Math.floor(room / every) * every : room;
}

// Cuts 0 to `length` (either way) into pieces `step` long and what's left, as [start, size] each.
function cuts(length, step) {
  const out = [];
  const sign = Math.sign(length);
  for (let at = 0; at < Math.abs(length) - 1e-6; at += step) out.push([tidy(sign * at), tidy(sign * Math.min(step, Math.abs(length) - at))]);
  return out;
}

// A rectangle floor (rectangleSlab) as slabs, cut up as it needs to be. One too big to cut, or
// past MAX_RECTANGLE_FT, comes whole, to show what's wrong.
export function rectanglePieces(a, b, yaw, { thickness, surface }) {
  const whole = rectangleSlab(a, b, yaw, { thickness, surface });
  if (!whole) return [];
  const [, [w], [, d]] = whole.outline;
  // Square pieces, every corner within reach of every other.
  const side = pieceFt(Math.sqrt((SLAB_REACH_FT ** 2 - thickness ** 2) / 2), repeatFt(surface));
  if (Math.max(Math.abs(w), Math.abs(d)) > MAX_RECTANGLE_FT || side < 1) return [whole];
  const r = (yaw * Math.PI) / 180;
  const pieces = [];
  for (const [u, du] of cuts(w, side)) {
    for (const [v, dv] of cuts(d, side)) {
      const at = [whole.at[0] + u * Math.cos(r) + v * Math.sin(r), whole.at[1], whole.at[2] - u * Math.sin(r) + v * Math.cos(r)].map(tidy);
      pieces.push({ ...whole, at, outline: [[0, 0], [du, 0], [du, dv], [0, dv]] });
    }
  }
  return pieces;
}

// A rectangle wall (wallSlab) as slabs, cut along its length as it needs to be. One too tall to
// cut, or past MAX_RECTANGLE_FT, comes whole.
export function wallPieces(from, to, options) {
  const whole = wallSlab(from, to, options);
  const [, [length], [, tall]] = whole.outline;
  const step = pieceFt(Math.sqrt(Math.max(0, SLAB_REACH_FT ** 2 - tall ** 2 - options.thickness ** 2)), repeatFt(options.surface));
  if (length > MAX_RECTANGLE_FT || step < 1) return [whole];
  const [ux, uz] = [(to[0] - from[0]) / length, (to[2] - from[2]) / length];
  return cuts(length, step).map(([s, ds]) => ({ ...whole, at: [from[0] + ux * s, whole.at[1], from[2] + uz * s].map(tidy), outline: [[0, 0], [ds, 0], [ds, tall], [0, tall]] }));
}

// The ground cells a floor's slabs sit on, [[ci, cj, height], ...] continent cells: those whose
// middles are under one, or within a cell of its edge, at the lowest bottom over them.
export function conformedCells(slabs, cellFt) {
  const out = new Map(); // "ci,cj" -> [ci, cj, height]
  for (const slab of slabs) {
    const outline = slabTop(slab).map(([x, , z]) => [x, z]);
    const bottom = Math.min(...slabBottom(slab).map((p) => p[1]));
    const xs = outline.map((p) => p[0]);
    const zs = outline.map((p) => p[1]);
    const [ci0, ci1] = [Math.floor(Math.min(...xs) / cellFt) - 1, Math.floor(Math.max(...xs) / cellFt) + 1];
    const [cj0, cj1] = [Math.floor(Math.min(...zs) / cellFt) - 1, Math.floor(Math.max(...zs) / cellFt) + 1];
    for (let cj = cj0; cj <= cj1; cj++) {
      for (let ci = ci0; ci <= ci1; ci++) {
        const middle = [(ci + 0.5) * cellFt, (cj + 0.5) * cellFt];
        if (!inside(outline, middle) && edgeDistance(outline, middle) > cellFt) continue;
        const key = `${ci},${cj}`;
        if (!out.has(key) || out.get(key)[2] > bottom) out.set(key, [ci, cj, bottom]);
      }
    }
  }
  return [...out.values()];
}

function inside(polygon, [x, z]) {
  let into = false;
  polygon.forEach(([x0, z0], i) => {
    const [x1, z1] = polygon[(i + 1) % polygon.length];
    if (z0 > z !== z1 > z && x < x0 + ((z - z0) * (x1 - x0)) / (z1 - z0)) into = !into;
  });
  return into;
}

function edgeDistance(polygon, [x, z]) {
  return Math.min(
    ...polygon.map(([x0, z0], i) => {
      const [x1, z1] = polygon[(i + 1) % polygon.length];
      const [dx, dz] = [x1 - x0, z1 - z0];
      const t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / (dx * dx + dz * dz || 1)));
      return Math.hypot(x - x0 - dx * t, z - z0 - dz * t);
    }),
  );
}

// A floor lying on the level its corners are on: its top `thickness` over them.
export function floorSlab(corners, { thickness, surface }) {
  const [x0, y0, z0] = corners[0];
  return { at: [x0, y0 + thickness, z0].map(tidy), turn: [0, 0, 0], outline: corners.map(([x, , z]) => [tidy(x - x0), tidy(z - z0)]), thickness, surface };
}

// A slab standing up along the line from its first corner to its second, its face through all its
// corners.
export function faceSlab(corners, { thickness, surface }) {
  const [a, b] = corners;
  const [dx, dz] = [b[0] - a[0], b[2] - a[2]];
  const length = Math.hypot(dx, dz);
  const [ux, uz] = [dx / length, dz / length];
  const yaw = Math.round(((Math.atan2(-dz, dx) * 180) / Math.PI) * 10) / 10 + 0;
  const outline = corners.map(([x, y, z]) => [tidy((x - a[0]) * ux + (z - a[2]) * uz), tidy(y - a[1])]);
  return { at: a.map(tidy), turn: [yaw, -90, 0], outline, thickness, surface };
}

// A floor from one corner to the opposite, `a` to `b` ([x, y, z] continent feet), its sides square
// to `yaw`, lying on a's level.
export function rectangleSlab(a, b, yaw, { thickness, surface }) {
  const r = (yaw * Math.PI) / 180;
  // Turned by yaw, u points along (cos, -sin) and v along (sin, cos), across the ground.
  const [dx, dz] = [b[0] - a[0], b[2] - a[2]];
  const [w, d] = [tidy(dx * Math.cos(r) - dz * Math.sin(r)), tidy(dx * Math.sin(r) + dz * Math.cos(r))];
  if (Math.abs(w) < 0.1 || Math.abs(d) < 0.1) return null;
  return { at: [a[0], a[1] + thickness, a[2]].map(tidy), turn: [yaw, 0, 0], outline: [[0, 0], [w, 0], [w, d], [0, d]], thickness, surface };
}

const tidy = (v) => Math.round(v * ROUND) / ROUND + 0;
const flatDistance = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// A slab's turn as a quaternion: roll, then pitch, then yaw, as object pieces turn.
function quaternionOf([yaw, pitch, roll]) {
  const deg = Math.PI / 180;
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch * deg, yaw * deg, roll * deg, "YXZ"));
}

const turned = (slab, v) => new THREE.Vector3(...v).applyQuaternion(quaternionOf(slab.turn));
