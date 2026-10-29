import polygonClipping from "polygon-clipping";
import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { CELL_FT, CELLS } from "../world/constants.js";
import { MAX_SLAB_CORNERS, SLAB_REACH_FT, cutSlab, fitFloor, raiseWall, slabBottom, slabFace, slabHitsTrunk, slabProblems, slabTile, slabTop } from "../world/slabs.js";
import { slabAt, slabGeometry, slabMeshes } from "./slabMeshes.js";
import { repeatFt } from "./slabTextures.js";
import { treeHeight, trunkRadius } from "./treeMeshes.js";

// The detail step's slabs tool (world/slabs.js), working on a DetailView's tiles. Its mode is one
// of:
// - "pick": a click picks a slab, shift-click adds or takes away one, and dragging a box from
//   where there's none picks those whose middles are in it. A slab picked alone has handles:
//   arrows to move it along the world's axes, or rings to turn it in its own (setHandle), and a
//   dot on each top corner to drag across its face. Several picked together only move. A slab
//   picked alone can have a hole cut in it (startCut), drawn on its face as a rectangle or a
//   polygon, as slabs are drawn: a hole reaching its edge cuts a notch, as for a door, and one right
//   across splits it in two.
// - "floor": a slab lying on what's pressed first, the ground or a slab, the rest of its corners on
//   a level plane there. A rectangle goes from one corner to the other, square to the camera as it
//   was at the first: dragged, or clicked at each end. A polygon is a click for each corner,
//   finished by clicking the first again, or Enter.
// - "wall": a slab standing up from a line on that level plane. A rectangle is the line, dragged or
//   clicked at each end; it stands `height` feet over its start, its foot dropped to the lowest
//   ground under the line, and with keepWalling the next wall goes on from where it ended. A
//   polygon is the line's two clicks, then corners up its face, as for a gable end, finished as a
//   floor is.
// - "room": a rectangle floor, as drawn in "floor", with four walls standing round its edges on it,
//   `height` feet over its top. The walls' thickness goes inward, and the floor fits inside them.
// A rectangle up to MAX_RECTANGLE_FT a side is cut into as many slabs as it takes, each a whole
// number of its picture's repeats across where it can be, so the picture runs on over the joins.
// Copied slabs (copy) can be pasted (paste): they follow the pointer, their lowest point on what's
// under it, till a click puts them down.
// With conform, the ground under a new floor begun on the ground, and just past its edges, is set
// to its bottom, with no clutter.
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
const TREE_PROBLEM = "That slab would run into a tree.";

export class SlabTool {
  // detail: the DetailView. onPick(slabs) hears what's picked, and when it changes;
  // onProblem(message) when a slab can't be made or changed as asked, and onNote(message) to say
  // what it's done.
  constructor(detail, { onPick, onProblem, onNote } = {}) {
    this.detail = detail;
    this.onPick = onPick;
    this.onProblem = onProblem;
    this.onNote = onNote;
    this.settings = { mode: "pick", shape: "rectangle", thickness: 1, height: 10, keepWalling: false, conform: false, surface: "floorboards", roof: "gable", pitch: 30, overhang: 1 };
    this.drawing = null; // { points: [[x, y, z] continent feet], height, pressed: [x, y] while dragging }
    this.picks = []; // [{ slab, key }]: the slabs picked, and the tiles listing them
    this.box = null; // a box being dragged to pick slabs in: { from: [x, y] client pixels, adding }
    this.cutting = null; // a hole being drawn: { points: [[u, v]] on the picked slab, pressed }
    this.copied = []; // slabs copied, to paste
    this.pasting = null; // copied slabs following the pointer: { slabs, anchor: [x, y, z] }
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
    if (!on) this.drawing = this.cutting = this.pasting = null;
    this.showHandles();
    this.drawMarks();
  }

  // settings: any of { mode, shape, thickness, height, keepWalling, conform, surface }.
  setSettings(changes) {
    const { mode, shape } = this.settings;
    Object.assign(this.settings, changes);
    if (this.settings.mode !== mode || this.settings.shape !== shape) this.drawing = null;
    if (this.settings.mode !== mode && this.cutting) this.stopCut();
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
    if (this.pasting) return this.putDown(e);
    if (this.cutting) return this.cutDown(e);
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
    const { rectangle } = this;
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
    if (this.cutting || this.pasting) return this.drawMarks(e);
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
    const cutPressed = this.cutting?.pressed;
    if (cutPressed) {
      this.cutting.pressed = null;
      const moved = pointer && Math.hypot(pointer.clientX - cutPressed[0], pointer.clientY - cutPressed[1]) > CLICK_PX;
      const end = moved && this.faceAt(this.ray(pointer));
      if (end) this.endCut(boxOf(this.cutting.points[0], end));
    }
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
    if (this.pasting && e.key === "Escape") {
      this.pasting = null;
      this.showHandles();
      this.drawMarks();
      return true;
    }
    if (this.cutting) {
      if (e.key === "Enter" && this.cutting.points.length >= 3) this.endCut(this.cutting.points);
      else if (e.key === "Backspace") this.cutting.points.pop();
      else if (e.key === "Escape") this.stopCut();
      else return false;
      this.drawMarks();
      return true;
    }
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

  // Whether what's drawn is a rectangle: a room always is.
  get rectangle() {
    return this.settings.mode === "room" || this.settings.mode === "roof" || this.settings.shape === "rectangle";
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
    const slabs = this.drawing && !this.rectangle ? this.slabFrom(this.drawing.points) : [];
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
    if (mode === "roof") {
      const { roof, pitch, overhang } = this.settings;
      return points.length >= 2 ? roofPieces(a, b, this.drawing.yaw, { style: roof, pitch, overhang, thickness, surface }) : [];
    }
    if (mode === "room") {
      return points.length >= 2 ? roomPieces(a, b, this.drawing.yaw, { height: this.settings.height, thickness, surface, footUnder: (p, q) => this.footUnder(p, q) }) : [];
    }
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

  // Whether a slab can be made: nothing wrong with it, in a tile of the window, clear of trees.
  fits(slabs) {
    return slabs.length > 0 && slabs.every((slab) => !slabProblems(slab).length && this.detail.editable(slabTile(slab).join(",")) && !this.hitsTree(slab));
  }

  // Whether the slab runs into a tree's trunk, in its tile or the tiles around.
  hitsTree(slab) {
    const { decoded, origin } = this.detail.view;
    const [tx, tz] = slabTile(slab);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tile = decoded.get(`${tx + dx},${tz + dz}`);
        if (!tile) continue;
        for (const { x, z, ground, size, kind } of this.detail.view.treesOf(tile)) {
          const trunk = { x: x + origin[0], z: z + origin[1], ground, top: ground + treeHeight(kind, size), radius: trunkRadius(kind, size) };
          if (slabHitsTrunk(slab, trunk)) return true;
        }
      }
    }
    return false;
  }

  // Which way the camera faces across the ground, as a slab's yaw: a slab turned so has its u
  // running to the right of the view and its v towards the camera.
  cameraYaw() {
    const { camera, controls } = this.detail.view;
    const [fx, fz] = [controls.target.x - camera.position.x, controls.target.z - camera.position.z];
    return Math.round(((Math.atan2(-fx, -fz) * 180) / Math.PI) * 10) / 10 + 0;
  }

  // Puts new slabs in the tiles they belong to, as one edit, and picks a lone one unless more's
  // being drawn. Floors fit inside the walls they run into, new or old. A floor begun `onGround`
  // conforms the ground to it, when that's asked for. Returns the new slabs as they ended up.
  add(slabs, { onGround = false } = {}) {
    const { detail } = this;
    detail.beginEdit();
    for (const slab of slabs) this.put(slab);
    const added = this.fitFloors(slabs);
    if (this.settings.mode === "roof") this.raiseUnder(added);
    const conform = ["floor", "room"].includes(this.settings.mode) && this.settings.conform && onGround;
    if (conform) {
      const cells = detail.cells();
      const under = conformedCells(slabs.filter((slab) => !slab.turn[1] && !slab.turn[2]), CELL_FT).filter(([ci, cj]) => cells.editable(ci, cj));
      detail.setHeights(under);
      // Nothing grows there either.
      for (const [ci, cj] of under) {
        const tile = detail.view.decoded.get(`${Math.floor(ci / CELLS)},${Math.floor(cj / CELLS)}`);
        tile.layers.clutter ??= new Uint8Array(CELLS * CELLS).fill(100);
        tile.layers.clutter[(cj - tile.coords[1] * CELLS) * CELLS + ci - tile.coords[0] * CELLS] = 0;
      }
      detail.rework();
    }
    detail.endEdit({ reflow: conform });
    // A wall chained on from it isn't picked, so its handles don't get in the way.
    this.pick(added.length === 1 && !this.drawing ? [{ slab: added[0], key: slabTile(added[0]).join(",") }] : []);
    return added;
  }

  // Puts a slab in the tile it belongs to.
  put(slab) {
    const { detail } = this;
    const key = slabTile(slab).join(",");
    detail.touch(key);
    const tile = detail.view.decoded.get(key);
    tile.slabs = [...(tile.slabs ?? []), slab];
    detail.dirtySlabs.add(key);
  }

  // Fits the new floors inside the walls near them, and the floors near new walls inside those.
  // Returns the new slabs, with each fitted floor's pieces in its place.
  fitFloors(slabs) {
    const { detail } = this;
    const fresh = new Set(slabs);
    const added = [...slabs];
    const floors = new Set(slabs);
    for (const slab of slabs) for (const near of this.nearSlabs(slab)) if (!fresh.has(near)) floors.add(near);
    for (const floor of floors) {
      const walls = fresh.has(floor) ? this.nearSlabs(floor) : slabs;
      const pieces = fitFloor(floor, walls.filter((wall) => wall !== floor));
      const key = slabTile(floor).join(",");
      if (!pieces || ![key, ...pieces.map((piece) => slabTile(piece).join(","))].every((k) => detail.editable(k))) continue;
      detail.touch(key);
      const tile = detail.view.decoded.get(key);
      tile.slabs = tile.slabs.filter((s) => s !== floor);
      detail.dirtySlabs.add(key);
      for (const piece of pieces) this.put(piece);
      if (fresh.has(floor)) added.splice(added.indexOf(floor), 1, ...pieces);
    }
    return added;
  }

  // Raises the walls under a new roof to meet it: those whose tops reach its lowest edge or higher.
  raiseUnder(roofs) {
    const { detail } = this;
    const eaves = Math.min(...roofs.flatMap((roof) => slabBottom(roof).map((p) => p[1])));
    const upright = (slab) => Math.abs(turned(slab, [0, 1, 0]).y) < 0.05;
    const walls = new Set(roofs.flatMap((roof) => this.nearSlabs(roof)).filter((slab) => upright(slab) && Math.max(...slabTop(slab).map((p) => p[1])) >= eaves - 0.5));
    for (const wall of walls) {
      const { wall: raised } = raiseWall(wall, roofs);
      const key = slabTile(wall).join(",");
      if (!raised || this.hitsTree(raised) || !detail.editable(slabTile(raised).join(","))) continue;
      detail.touch(key);
      detail.dirtySlabs.add(key);
      const tile = detail.view.decoded.get(key);
      tile.slabs = tile.slabs.filter((s) => s !== wall);
      delete wall.holes;
      Object.assign(wall, raised);
      this.put(wall);
    }
  }

  // The slabs in the slab's tile and the tiles around it.
  nearSlabs(slab) {
    const [tx, tz] = slabTile(slab);
    const near = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) near.push(...(this.detail.view.decoded.get(`${tx + dx},${tz + dz}`)?.slabs ?? []));
    }
    return near;
  }

  // --- the picked slabs ---

  // Picks slabs, [{ slab, key }], or none.
  pick(picks) {
    this.picks = picks ?? [];
    if (this.picks.length !== 1) this.cutting = null;
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
      if (this.hitsTree({ ...slab, ...changes })) return this.onProblem?.(TREE_PROBLEM);
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
    const last = picks.map((pick) => structuredClone(pick.slab));
    if (picked) {
      picked.slab.at = [p.x + origin[0], p.y, p.z + origin[1]].map(tidy);
      const r = new THREE.Euler().setFromQuaternion(this.proxy.quaternion, "YXZ");
      picked.slab.turn = [r.y, r.x, r.z].map((v) => Math.round(THREE.MathUtils.radToDeg(v) * 10) / 10 + 0);
    } else {
      const by = p.clone().sub(this.dragFrom);
      for (const pick of picks) pick.slab.at = this.before.get(pick).at.map((v, i) => tidy(v + by.getComponent(i)));
    }
    // Trees stop them where they were.
    if (picks.some((pick) => this.hitsTree(pick.slab))) {
      picks.forEach((pick, i) => Object.assign(pick.slab, last[i]));
      this.showHandles();
      return;
    }
    this.rehome();
    this.drawMarks();
    this.told();
  }

  // --- copying ---

  copy() {
    if (!this.picks.length) return;
    this.copied = this.picks.map(({ slab }) => structuredClone(slab));
    this.onNote?.(`Copied ${this.copied.length === 1 ? "a slab" : `${this.copied.length} slabs`}; paste to put ${this.copied.length === 1 ? "it" : "them"} down.`);
  }

  // The copied slabs follow the pointer: their middle across the ground, and their lowest point,
  // go to what's under it.
  paste() {
    if (!this.copied.length) return;
    this.drawing = this.cutting = null;
    const corners = this.copied.flatMap((slab) => [...slabTop(slab), ...slabBottom(slab)]);
    const middle = (i) => (Math.min(...corners.map((p) => p[i])) + Math.max(...corners.map((p) => p[i]))) / 2;
    this.pasting = { slabs: this.copied, anchor: [middle(0), Math.min(...corners.map((p) => p[1])), middle(2)] };
    this.transform.detach();
    this.drawMarks();
  }

  // The copied slabs moved to where a ray meets the ground or a slab, or none.
  pasted(ray) {
    const hit = this.surfaceUnder(ray);
    if (!hit) return [];
    const by = hit.at.map((v, i) => v - this.pasting.anchor[i]);
    return this.pasting.slabs.map((slab) => ({ ...structuredClone(slab), at: slab.at.map((v, i) => tidy(v + by[i])) }));
  }

  // A click while pasting puts the copies down, and picks them.
  putDown(e) {
    const slabs = this.pasted(this.ray(e));
    if (!this.fits(slabs)) return true;
    this.pasting = null;
    const added = this.add(slabs);
    this.pick(added.map((slab) => ({ slab, key: slabTile(slab).join(",") })));
    return true;
  }

  // --- holes ---

  // Starts drawing a hole in the slab picked alone.
  startCut() {
    if (!this.picked) return;
    this.transform.detach();
    this.cutting = { points: [], pressed: null };
    this.drawMarks();
    this.told();
  }

  stopCut() {
    this.cutting = null;
    this.showHandles();
    this.drawMarks();
    this.told();
  }

  // A press while cutting: a rectangle's corners, dragged or clicked, or a polygon's next corner.
  cutDown(e) {
    const at = this.faceAt(this.ray(e));
    if (!at) return true;
    const { points } = this.cutting;
    if (this.settings.shape === "rectangle") {
      if (!points.length) Object.assign(this.cutting, { points: [at], pressed: [e.clientX, e.clientY] });
      else this.endCut(boxOf(points[0], at));
    } else if (points.length >= 3 && Math.hypot(at[0] - points[0][0], at[1] - points[0][1]) < this.snapFt()) this.endCut(points);
    else if (points.length < MAX_SLAB_CORNERS) points.push(at);
    this.drawMarks(e);
    return true;
  }

  // Cuts the hole out of the picked slab, which becomes what's left of it, picked.
  endCut(hole) {
    const { picked, detail } = this;
    const pieces = cutSlab(picked.slab, hole);
    const problem = pieces.flatMap((slab) => slabProblems(slab))[0];
    if (problem) return this.onProblem?.(`That cut would leave a slab that ${problem}.`);
    if (pieces.some((slab) => !detail.editable(slabTile(slab).join(",")))) return this.onProblem?.("That cut would leave a slab outside the window.");
    detail.beginEdit();
    detail.touch(picked.key);
    const tile = detail.view.decoded.get(picked.key);
    tile.slabs = [...tile.slabs.filter((s) => s !== picked.slab), ...pieces];
    this.picks = pieces.map((slab) => ({ slab, key: picked.key }));
    this.before = null;
    this.rehome();
    detail.endEdit();
    this.cutting = null;
    this.pick(this.picks);
  }

  // Takes every hole out of the slab picked alone.
  // The picked walls and the picked roofs they'd rise to: slabs standing up, and the others whose
  // highest corner is over a wall's lowest top. No walls without a roof.
  raising() {
    const upright = (slab) => Math.abs(turned(slab, [0, 1, 0]).y) < 0.05;
    const walls = this.picks.filter((pick) => upright(pick.slab));
    const roofs = this.picks.filter((pick) => !upright(pick.slab)).map((pick) => pick.slab);
    const lowestTop = Math.min(...walls.map(({ slab }) => Math.min(...slabTop(slab).map((p) => p[1]))));
    const over = roofs.filter((roof) => Math.max(...slabTop(roof).map((p) => p[1])) > lowestTop);
    return over.length ? { walls, roofs: over } : { walls: [], roofs: [] };
  }

  // Raises or cuts down each picked wall to meet the picked roofs, as one edit. A wall that can't
  // stays as it was.
  raiseToRoof() {
    const { walls, roofs } = this.raising();
    if (!walls.length) return;
    const raised = walls.map((pick) => ({ pick, ...raiseWall(pick.slab, roofs) }));
    const problems = raised.filter(({ wall }) => !wall).map(({ problem }) => problem);
    const done = raised.filter(({ wall }) => wall && !this.hitsTree(wall));
    if (done.length < raised.length - problems.length) problems.push("would run into a tree");
    const { detail } = this;
    detail.beginEdit();
    for (const pick of this.picks) detail.touch(pick.key);
    this.keepBefore();
    for (const { pick, wall } of done) {
      delete pick.slab.holes;
      Object.assign(pick.slab, wall);
    }
    this.rehome();
    detail.endEdit();
    this.pick(this.picks);
    const which = problems.length === walls.length ? "None of the walls could" : `${problems.length} of the walls couldn't`;
    if (problems.length) this.onProblem?.(`${which} be raised: one ${problems[0]}.`);
  }

  clearHoles() {
    const { picked, detail } = this;
    if (!picked?.slab.holes) return;
    detail.beginEdit();
    detail.touch(picked.key);
    delete picked.slab.holes;
    detail.dirtySlabs.add(picked.key);
    detail.endEdit();
    this.pick(this.picks);
  }

  // Where a ray meets the picked slab's top face, as [u, v], or null.
  faceAt(ray) {
    const { slab } = this.picked;
    const point = this.scene(slab.at);
    const hit = ray.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(turned(slab, [0, 1, 0]), point), new THREE.Vector3());
    if (!hit) return null;
    const local = hit.sub(point).applyQuaternion(quaternionOf(slab.turn).invert());
    return [tidy(local.x), tidy(local.z)];
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
    if (slabProblems({ ...slab, outline }).length || this.hitsTree({ ...slab, outline })) return;
    slab.outline = outline;
    this.rehome();
    this.drawMarks();
  }

  // --- marks ---

  // The handles sit on a slab picked alone, or amid several, while the tool's in use.
  showHandles() {
    const { picks, picked } = this;
    if (!this.on || !picks.length || this.cutting || this.pasting) return this.transform.detach();
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
      if (!this.rectangle && corners.length >= 2) line(corners.map((p) => this.scene(p)), MARK.drawing, corners.length >= 3);
    }
    if (this.pasting) {
      const pointer = e ?? this.detail.pointer;
      const slabs = pointer ? this.pasted(this.ray(pointer)) : [];
      const { origin } = this.detail.view;
      const shown = !slabs.length ? [] : this.fits(slabs) ? slabMeshes(slabs, origin) : slabs.map((slab) => new THREE.Mesh(slabGeometry(slab, origin), WRONG));
      for (const mesh of shown) {
        mesh.userData.preview = true;
        this.marks.add(mesh);
      }
    }
    if (this.cutting && this.picked) {
      const { slab } = this.picked;
      const pointer = e ?? this.detail.pointer;
      const next = pointer && this.faceAt(this.ray(pointer));
      const { points } = this.cutting;
      const hole = this.settings.shape === "rectangle" ? (points.length && next ? boxOf(points[0], next) : []) : next ? [...points, next] : points;
      if (hole.length >= 2) line(slabFace(slab, hole).map((p) => this.scene(p)), MARK.drawing, hole.length >= 3);
    }
    for (const { slab } of this.picks) {
      const top = slabTop(slab).map((p) => this.scene(p));
      const down = turned(slab, [0, -slab.thickness, 0]);
      line(top, MARK.picked, true);
      line(top.map((p) => p.clone().add(down)), MARK.picked, true);
    }
    if (this.picked && !this.cutting) {
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

// A room from one corner of its floor to the opposite (as rectanglePieces): the floor's pieces,
// then a wall along each edge, standing `height` over the floor's top, its thickness inward. The
// walls along the first and third edges run the whole length; the others fit between them.
// footUnder(from, to) gives a wall's foot.
export function roomPieces(a, b, yaw, { height, thickness, surface, footUnder }) {
  const floor = rectanglePieces(a, b, yaw, { thickness, surface });
  if (!floor.length) return [];
  const r = (yaw * Math.PI) / 180;
  const [w, d] = [(b[0] - a[0]) * Math.cos(r) - (b[2] - a[2]) * Math.sin(r), (b[0] - a[0]) * Math.sin(r) + (b[2] - a[2]) * Math.cos(r)];
  const top = a[1] + thickness;
  const corner = (u, v) => [a[0] + u * Math.cos(r) + v * Math.sin(r), top, a[2] - u * Math.sin(r) + v * Math.cos(r)].map(tidy);
  let ring = [corner(0, 0), corner(w, 0), corner(w, d), corner(0, d)];
  // A wall's thickness goes to the right of its line, seen from above with north up: round the
  // ring the way that puts the middle there.
  const [p, q] = ring;
  const middle = corner(w / 2, d / 2);
  if ((middle[0] - p[0]) * -(q[2] - p[2]) + (middle[2] - p[2]) * (q[0] - p[0]) < 0) ring = ring.reverse();
  const walls = ring.flatMap((from, i) => {
    let to = ring[(i + 1) % 4];
    if (i % 2) {
      // Short of the long walls at each end.
      const length = flatDistance(from, to);
      if (length <= 2 * thickness + 0.1) return [];
      const [ux, uz] = [(to[0] - from[0]) / length, (to[2] - from[2]) / length];
      [from, to] = [[from[0] + ux * thickness, top, from[2] + uz * thickness].map(tidy), [to[0] - ux * thickness, top, to[2] - uz * thickness].map(tidy)];
    }
    return wallPieces(from, to, { foot: footUnder(from, to), height, thickness, surface });
  });
  return [...floor, ...walls];
}

export const ROOF_STYLES = ["flat", "shed", "gable", "hip"];

// A roof over a rectangle from corner `a` to the opposite `b` ([x, y, z] continent feet), square
// to `yaw`, as slabs: its underside at a's level along the rectangle's edges, sloping up `pitch`
// degrees, and running on `overhang` feet past them. A gable's ridge and a hip's run along the
// longer side; a shed rises across the shorter one. Slopes too big for one slab are cut up, their
// pieces sharing an `at`, so their pictures run on over the joins.
export function roofPieces(a, b, yaw, { style, pitch, overhang, thickness, surface }) {
  const r = (yaw * Math.PI) / 180;
  const axes = [[Math.cos(r), -Math.sin(r)], [Math.sin(r), Math.cos(r)]];
  const [dx, dz] = [b[0] - a[0], b[2] - a[2]];
  const [w, d] = axes.map(([x, z]) => dx * x + dz * z);
  if (Math.abs(w) < 1 || Math.abs(d) < 1) return [];
  // The rectangle's own frame: x along the longer side, from its corner, y up.
  const corner = [a[0] + Math.min(0, w) * axes[0][0] + Math.min(0, d) * axes[1][0], a[2] + Math.min(0, w) * axes[0][1] + Math.min(0, d) * axes[1][1]];
  const [along, across] = Math.abs(w) >= Math.abs(d) ? axes : [axes[1], axes[0]];
  const [W, D] = Math.abs(w) >= Math.abs(d) ? [Math.abs(w), Math.abs(d)] : [Math.abs(d), Math.abs(w)];
  const world = ([x, z]) => [corner[0] + x * along[0] + z * across[0], corner[1] + x * along[1] + z * across[1]];
  const o = overhang;
  const h = D / 2;
  const angle = style === "flat" ? 0 : (pitch * Math.PI) / 180;
  // Each slope: its outline across the ground in the frame, which way it rises, and a point on
  // the edge it rises from.
  const n = [0, 1];
  const s = [0, -1];
  const facets = {
    flat: [{ plan: [[-o, -o], [W + o, -o], [W + o, D + o], [-o, D + o]], up: n, eave: [0, 0] }],
    shed: [{ plan: [[-o, -o], [W + o, -o], [W + o, D + o], [-o, D + o]], up: n, eave: [0, 0] }],
    gable: [
      { plan: [[-o, -o], [W + o, -o], [W + o, h], [-o, h]], up: n, eave: [0, 0] },
      { plan: [[-o, h], [W + o, h], [W + o, D + o], [-o, D + o]], up: s, eave: [0, D] },
    ],
    hip: [
      { plan: [[-o, -o], [W + o, -o], [W - h, h], [h, h]], up: n, eave: [0, 0] },
      { plan: [[-o, D + o], [h, h], [W - h, h], [W + o, D + o]], up: s, eave: [0, D] },
      { plan: [[-o, -o], [h, h], [-o, D + o]], up: [1, 0], eave: [0, 0] },
      { plan: [[W + o, -o], [W + o, D + o], [W - h, h]], up: [-1, 0], eave: [W, 0] },
    ],
  }[style];
  if (!facets) return [];
  // Square pieces, small enough that every corner's within reach of every other.
  const side = Math.min(MAX_PIECE_FT, (SLAB_REACH_FT - thickness - 1) / Math.sqrt(2 + Math.tan(angle) ** 2));
  const pieces = [];
  for (const { plan, up, eave } of facets) {
    const ring = plan.filter((p, i) => i === 0 || Math.hypot(p[0] - plan[i - 1][0], p[1] - plan[i - 1][1]) > 1e-6);
    if (ring.length < 3) continue;
    // Up the slope across the ground, in the world, and the slab's yaw that way.
    const [ux, uz] = [up[0] * along[0] + up[1] * across[0], up[0] * along[1] + up[1] * across[1]];
    const turn = [tidy((Math.atan2(ux, uz) * 180) / Math.PI), tidy((-angle * 180) / Math.PI), 0];
    const height = ([x, z]) => a[1] + thickness / Math.cos(angle) + Math.tan(angle) * ((x - eave[0]) * up[0] + (z - eave[1]) * up[1]);
    const start = ring[0];
    const at = [...world(start)];
    const top = [at[0], height(start), at[1]].map(tidy);
    const outlineOf = (points) =>
      points.map((p) => {
        const [x, z] = world(p);
        const [ex, ez] = [x - at[0], z - at[1]];
        return [tidy(ex * uz - ez * ux), tidy((ex * ux + ez * uz) / Math.cos(angle))];
      });
    const xs = ring.map((p) => p[0]);
    const zs = ring.map((p) => p[1]);
    for (let x0 = Math.min(...xs); x0 < Math.max(...xs) - 1e-6; x0 += side) {
      for (let z0 = Math.min(...zs); z0 < Math.max(...zs) - 1e-6; z0 += side) {
        const cell = [[x0, z0], [x0 + side, z0], [x0 + side, z0 + side], [x0, z0 + side], [x0, z0]];
        for (const [part] of polygonClipping.intersection([[...ring, ring[0]]], [cell])) {
          const outline = outlineOf(part.slice(0, -1));
          if (Math.abs(ringArea(outline)) > 0.01) pieces.push({ at: top, turn, outline, thickness, surface });
        }
      }
    }
  }
  return pieces;
}

function ringArea(points) {
  return points.reduce((sum, [x0, z0], i) => {
    const [x1, z1] = points[(i + 1) % points.length];
    return sum + (x0 * z1 - x1 * z0) / 2;
  }, 0);
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

// The rectangle from one [u, v] corner to the other, along the slab's own axes.
const boxOf = ([u0, v0], [u1, v1]) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];

const tidy = (v) => Math.round(v * ROUND) / ROUND + 0;
const flatDistance = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// A slab's turn as a quaternion: roll, then pitch, then yaw, as object pieces turn.
function quaternionOf([yaw, pitch, roll]) {
  const deg = Math.PI / 180;
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch * deg, yaw * deg, roll * deg, "YXZ"));
}

const turned = (slab, v) => new THREE.Vector3(...v).applyQuaternion(quaternionOf(slab.turn));
