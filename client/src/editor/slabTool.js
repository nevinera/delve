import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { MAX_SLAB_CORNERS, slabProblems, slabTile, slabTop } from "../world/slabs.js";
import { slabAt } from "./slabMeshes.js";

// The detail step's slabs tool (world/slabs.js), working on a DetailView's tiles. Its mode is one
// of:
// - "pick": a click picks a slab. A picked one has handles: arrows to move it along the world's
//   axes, or rings to turn it in its own (setHandle), and a dot on each top corner to drag across
//   its face.
// - "floor": clicks put down corners. The first lands on the ground or a slab, and sets the height;
//   the rest land on a level plane there. Clicking the first corner again, or Enter, finishes it.
// - "wall": two clicks draw a line, at the height of the first; the wall stands `height` feet over
//   that, its foot dropped to the lowest ground under the line. With keepWalling, the next wall
//   starts where it ended.
// Corners snap to other slabs' top corners nearby. Escape drops a slab half drawn, Backspace its
// last corner.

const MARK = { drawing: 0x3fb6ff, picked: 0xffe066, dot: 0xffe066 };
const SNAP_SHARE = 0.012; // of the camera's distance: how near a corner snaps
const MIN_SNAP_FT = 0.5;
const DOT_SHARE = 0.006; // of the camera's distance: how big a corner dot is
const ROUND = 100; // positions to a hundredth of a foot
const TURN_STEP = 5; // degrees the turning rings snap to
const MOVE_STEP_FT = 0.25;

export class SlabTool {
  // detail: the DetailView. onPick(slab or null) hears what's picked, and when it changes;
  // onProblem(message) when a slab can't be made or changed as asked.
  constructor(detail, { onPick, onProblem } = {}) {
    this.detail = detail;
    this.onPick = onPick;
    this.onProblem = onProblem;
    this.settings = { mode: "pick", thickness: 1, height: 10, keepWalling: false, surface: "floorboards" };
    this.drawing = null; // { points: [[x, y, z] continent feet], height }
    this.picked = null; // { slab, key }
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
        this.before = structuredClone(this.picked.slab);
        detail.beginEdit();
        detail.touch(this.picked.key);
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

  // settings: any of { mode, thickness, height, keepWalling, surface }.
  setSettings(changes) {
    Object.assign(this.settings, changes);
    if (changes.mode && changes.mode !== "pick") this.drawing = null;
    this.drawMarks();
  }

  setHandle(name) {
    this.handle = name;
    this.transform.setMode(name === "turn" ? "rotate" : "translate");
    this.transform.setSpace(name === "turn" ? "local" : "world");
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
        this.before = structuredClone(this.picked.slab);
        this.detail.beginEdit();
        this.detail.touch(this.picked.key);
        return true;
      }
    }
    const { mode } = this.settings;
    if (mode === "pick") {
      this.pick(this.slabUnder(ray));
      return true;
    }
    if (!this.drawing) {
      const hit = this.surfaceUnder(ray);
      if (hit) this.drawing = { points: [this.snap(hit, hit[1])], height: hit[1] };
    } else {
      const at = this.onLevel(ray, this.drawing.height);
      if (at) this.addCorner(at);
    }
    this.drawMarks(e);
    return true;
  }

  pointerMove(e) {
    if (this.corner !== null) return this.dragCorner(e);
    if (this.drawing) this.drawMarks(e);
  }

  pointerUp() {
    if (this.corner === null) return;
    this.corner = null;
    this.detail.endEdit();
  }

  // Enter finishes a floor, Backspace drops its last corner, Escape drops it; for a picked slab, G
  // and R pick its handles, Delete and Backspace take it away, Escape lets it go. True when the
  // key was one of them.
  key(e) {
    if (this.drawing) {
      if (e.key === "Enter") this.finishFloor();
      else if (e.key === "Backspace") {
        this.drawing.points.pop();
        if (!this.drawing.points.length) this.drawing = null;
      }
      else if (e.key === "Escape") this.drawing = null;
      else return false;
      this.drawMarks();
      return true;
    }
    if (!this.picked) return false;
    if (e.key === "g" || e.key === "r") this.setHandle(e.key === "g" ? "move" : "turn");
    else if (e.key === "Delete" || e.key === "Backspace") this.remove();
    else if (e.key === "Escape") this.pick(null);
    else return false;
    return true;
  }

  // --- drawing ---

  addCorner(at) {
    const { points, height } = this.drawing;
    const snapped = this.snap(at, height);
    if (this.settings.mode === "wall") {
      this.makeWall(points[0], snapped);
      this.drawing = this.settings.keepWalling ? { points: [snapped], height } : null;
      return;
    }
    if (points.length >= 3 && flatDistance(snapped, points[0]) < this.snapFt()) return this.finishFloor();
    if (points.length >= MAX_SLAB_CORNERS) return this.onProblem?.(`A slab has at most ${MAX_SLAB_CORNERS} corners.`);
    points.push(snapped);
  }

  finishFloor() {
    const { points } = this.drawing ?? {};
    if (!points || points.length < 3) return;
    const [x0, y0, z0] = points[0];
    this.drawing = null;
    this.add({ at: [x0, y0, z0], turn: [0, 0, 0], outline: points.map(([x, , z]) => [tidy(x - x0), tidy(z - z0)]), thickness: this.settings.thickness, surface: this.settings.surface });
  }

  // A wall from `from` to `to`, at `from`'s height, its foot on the lowest ground under the line.
  makeWall(from, to) {
    const length = flatDistance(from, to);
    if (length < 0.5) return;
    const [dx, dz] = [to[0] - from[0], to[2] - from[2]];
    let foot = from[1];
    const { ground, origin } = this.detail.view;
    for (let s = 0; s <= length; s += 2) {
      const h = ground(from[0] + (dx * s) / length - origin[0], from[2] + (dz * s) / length - origin[1]);
      if (Number.isFinite(h)) foot = Math.min(foot, h);
    }
    const { height, thickness, surface } = this.settings;
    this.add(wallSlab(from, to, { foot: Math.floor(foot * 4) / 4, height, thickness, surface }));
  }

  // Puts a new slab in the tile it belongs to, and picks it.
  add(slab) {
    slab.at = slab.at.map(tidy);
    const problems = slabProblems(slab);
    if (problems.length) return this.onProblem?.(`That slab ${problems[0]}.`);
    const key = slabTile(slab).join(",");
    if (!this.detail.editable(key)) return this.onProblem?.("That slab belongs to a tile outside the window.");
    const { detail } = this;
    detail.beginEdit();
    detail.touch(key);
    const tile = detail.view.decoded.get(key);
    tile.slabs = [...(tile.slabs ?? []), slab];
    detail.dirtySlabs.add(key);
    detail.endEdit();
    this.pick({ slab, key });
  }

  // --- the picked slab ---

  pick(picked) {
    this.picked = picked;
    this.showHandles();
    this.drawMarks();
    this.onPick?.(picked?.slab ?? null);
  }

  // Changes the picked slab: any of { at, turn, thickness, surface }. Undone together between
  // beginEdit and endEdit; without, each change is its own edit.
  change(changes) {
    const { picked, detail } = this;
    if (!picked) return;
    const next = { ...picked.slab, ...changes };
    const problems = slabProblems(next);
    if (problems.length) return this.onProblem?.(`That slab would ${problems[0].replace(/^has /, "have ").replace(/^needs /, "need ").replace(/^reaches /, "reach ")}.`);
    const own = !detail.edit;
    if (own) detail.beginEdit();
    detail.touch(picked.key);
    this.before = structuredClone(picked.slab);
    Object.assign(picked.slab, changes);
    this.rehome();
    if (own) detail.endEdit();
    this.showHandles();
    this.drawMarks();
    this.onPick?.(picked.slab);
  }

  remove() {
    const { picked, detail } = this;
    if (!picked) return;
    detail.beginEdit();
    detail.touch(picked.key);
    const tile = detail.view.decoded.get(picked.key);
    tile.slabs = tile.slabs.filter((s) => s !== picked.slab);
    detail.dirtySlabs.add(picked.key);
    detail.endEdit();
    this.pick(null);
  }

  // Moves the picked slab into the tile its home corner's now in. If that's outside the window, it
  // goes back to where it was before the drag.
  rehome() {
    const { picked, detail } = this;
    detail.dirtySlabs.add(picked.key);
    const key = slabTile(picked.slab).join(",");
    if (key === picked.key) return;
    if (!detail.editable(key)) {
      if (this.before) Object.assign(picked.slab, structuredClone(this.before));
      this.onProblem?.("A slab can't leave the window.");
      this.showHandles();
      return this.rehome();
    }
    detail.touch(key);
    const from = detail.view.decoded.get(picked.key);
    from.slabs = from.slabs.filter((s) => s !== picked.slab);
    const to = detail.view.decoded.get(key);
    to.slabs = [...(to.slabs ?? []), picked.slab];
    picked.key = key;
    detail.dirtySlabs.add(key);
  }

  // The handles moved: the slab follows them.
  readHandles() {
    const { picked } = this;
    if (!picked) return;
    const { origin } = this.detail.view;
    const p = this.proxy.position;
    picked.slab.at = [p.x + origin[0], p.y, p.z + origin[1]].map(tidy);
    const r = new THREE.Euler().setFromQuaternion(this.proxy.quaternion, "YXZ");
    picked.slab.turn = [r.y, r.x, r.z].map((v) => Math.round(THREE.MathUtils.radToDeg(v) * 10) / 10 + 0);
    this.rehome();
    this.drawMarks();
    this.onPick?.(picked.slab);
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

  // The handles sit on the picked slab while the tool's in use.
  showHandles() {
    const { picked } = this;
    if (!this.on || !picked) return this.transform.detach();
    this.proxy.position.copy(this.scene(picked.slab.at));
    this.proxy.quaternion.copy(quaternionOf(picked.slab.turn));
    this.transform.attach(this.proxy);
  }

  // The slab being drawn, from its corners to the pointer, and the picked slab's edges and corner
  // dots.
  drawMarks(e) {
    for (const child of [...this.marks.children]) {
      child.geometry.dispose();
      child.material.dispose();
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
      const points = this.drawing.points.map((p) => this.scene(p));
      const pointer = e ?? this.detail.pointer;
      const next = pointer && this.onLevel(this.ray(pointer), this.drawing.height);
      if (next) points.push(this.scene(this.snap(next, this.drawing.height)));
      if (points.length >= 2) line(points, MARK.drawing, this.settings.mode === "floor" && points.length >= 3);
    }
    if (this.picked) {
      const { slab } = this.picked;
      const top = slabTop(slab).map((p) => this.scene(p));
      const down = turned(slab, [0, -slab.thickness, 0]);
      line(top, MARK.picked, true);
      line(top.map((p) => p.clone().add(down)), MARK.picked, true);
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

  // Where a ray first meets the ground or a slab, [x, y, z] continent feet, or null.
  surfaceUnder(ray) {
    const { view } = this.detail;
    const ground = view.content.children.filter((child) => child.userData.ground);
    const hit = ray.intersectObjects([...ground, ...view.slabs.children], false)[0];
    return hit ? [hit.point.x + view.origin[0], hit.point.y, hit.point.z + view.origin[1]].map(tidy) : null;
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
        if (slab === this.picked?.slab) continue;
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

const tidy = (v) => Math.round(v * ROUND) / ROUND + 0;
const flatDistance = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

// A slab's turn as a quaternion: roll, then pitch, then yaw, as object pieces turn.
function quaternionOf([yaw, pitch, roll]) {
  const deg = Math.PI / 180;
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch * deg, yaw * deg, roll * deg, "YXZ"));
}

const turned = (slab, v) => new THREE.Vector3(...v).applyQuaternion(quaternionOf(slab.turn));
