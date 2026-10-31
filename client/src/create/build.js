import * as THREE from "three";
import { objectMeshes } from "../editor/objectMeshes.js";
import { PlacePicker } from "../editor/placePicker.js";
import { slabMeshes } from "../editor/slabMeshes.js";
import { polygonPieces, roofPieces, rectanglePieces, roomPieces, wallPieces } from "../editor/slabTool.js";
import { mountSwatches, pickedSurface } from "../editor/swatches.js";
import { Thumbnails } from "../editor/thumbnailRenderer.js";
import { newObjectId, turnPoint } from "../world/builtObjects.js";
import { CELL_FT as TEMPLATE_CELL_FT } from "../world/constants.js";
import { makeObject, specOf } from "../world/objects.js";
import { MAX_STAIR_DEG, SLAB_REACH_FT, cutSlab, defaultSteps, inPolygon, rampSlab, slabBottom, slabProblems, slabTop, stairShape, stairSlab } from "../world/slabs.js";
import { pressing } from "./press.js";
import { captureTemplate, placedTemplate } from "../world/templates.js";
import { CLIPBOARD_PREFIX } from "./library.js";
import { homeOf, isSlab, readyObject } from "./placed.js";
import { footprint, templateDiff } from "./templateDiff.js";
import { drawable, slabSpace } from "./things.js";

// Build's tools, on the things placed by hand (placed.js, things.js):
// - object: places the object picked, from its recent ones or the library, where the pointer
//   meets the ground or a slab, at the size set, turned by C and V, or at random.
// - template: places the template picked as copies of its slabs and objects, its anchor on the
//   grid where the pointer is, at the ground's mean height under it, turned by C and V.
// - slab: dragging draws a floor, a wall, a room (a floor with four walls on it, and a roof, if
//   asked) or a roof, square to the way the camera looks. It starts on the ground or a slab, and
//   the rest lies level with where it started.
//   Polygon clicks a floor's corners in turn, level with where it started, and closes on its first
//   corner, or Enter.
//   Door and window click a slab to cut a hole in it: a door up from the floor or ground under
//   where it's clicked, a window round where it's clicked.
// - stairs: dragging draws a flight's bottom edge on the ground or a slab, level, then its top edge
//   goes to where the pointer meets a slab or the ground, and a click places it. The sliders set
//   its width, run and height instead, where there's nothing to point at.
// - ramp: dragging draws a ramp's bottom edge, level unless it snaps, then dragging again draws its
//   top edge: where that starts makes the ramp's plane, and where it ends is kept in it. Any four
//   corners in a plane make a ramp, so it can be a parallelogram or narrow.
// - pick: clicking an object or slab picks it out, shift picks more or fewer, and dragging a box
//   picks those in it. Dragging picked things moves them, C and V turn them about their middle,
//   the up and down arrows raise and lower them, and Delete deletes them. What's picked can be
//   made a template, or copied: a template kept in this browser, not the world, till the next
//   copy, that paste arms the template tool with.
// Corners drawn snap to slabs' corners near them on the screen, or else their edges, unless shift's
// held: a floor or room started from a floor's is level with it, and a wall drawn along a floor's
// edge from it stands outside it, its foot at the floor's bottom. Floors, walls and rooms can snap
// to a 2 ft grid instead, square to north.
// Ctrl+Z undoes the last change, ctrl+C copies and ctrl+V pastes.

const THUMB_PX = 56;
const TURN_DEG = 15;
const FINE_TURN_DEG = 2;
const SNAP_FT = 4; // the grid templates' anchors are on
const RAISE_FT = 0.5;
const FAR_RAISE_FT = 4;
const BOX_PX = 4;
const MOST_CELLS = 400; // how many of a template's cells are read for its height
const GHOST_OPACITY = 0.6;
const DOOR_FT = [4, 7]; // wide, tall
const WINDOW_FT = [3, 3];
const CLOSE_PX = 12; // how near a polygon's first corner a click closes it
const SNAP_CORNER_PX = 12; // how near a slab's corner, on the screen, a point snaps to it
const SNAP_EDGE_PX = 8; // and its edge
const SNAP_MARK = 0.012; // the snap mark's size, as a share of its distance from the camera
const GRID_FT = 2; // the grid floors and walls snap to, when asked
const HOME_TEMPLATES = "my templates"; // where keepTemplate keeps those given no collection
const NEW_COLLECTION = "new"; // the collection select's value for a new one
const WRONG = new THREE.MeshBasicMaterial({ color: 0xe04040, transparent: true, opacity: 0.6 });

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};
// The sizes an object can be: [least, most] feet, or a factor for a built object, and its first.
function sizesOf(type) {
  const spec = specOf(type);
  if (!spec) return null;
  if (spec.built) return { least: spec.size[0], most: spec.size[1], first: 1 };
  return { least: spec.size[0] * 0.5, most: spec.size[1] * 2, first: (spec.size[0] + spec.size[1]) / 2 };
}

export class Build {
  // ray(): the pointer's ray (a Raycaster), or null off the view. groundHit(): where it meets the
  // ground, [x, y, z], or null. say(text): tells the builder something.
  constructor({ scene, camera, canvas, placed, things, library, groundAt, ray, groundHit }) {
    Object.assign(this, { scene, camera, canvas, placed, things, library, groundAt, ray, groundHit });
    mountSwatches();
    this.tool = null;
    this.armed = { object: null, template: null }; // the type picked of each
    this.yaw = 0; // radians, objects' and templates' turn
    this.scale = null; // the object picked's size
    this.slab = { mode: "floor", surface: "floorboards", thickness: 1, height: 10, roof: "gable", pitch: 30, roomRoof: false };
    this.drawing = null; // a slab being dragged: { a: [x, y, z], yaw degrees, pieces }
    this.outlining = null; // a polygon floor being clicked out: { y, points: [[x, z], ...] }
    // A flight of stairs being drawn: its bottom edge from a to b ([x, y, z]), being dragged
    // ("base") or done ("top"), its top's run and rise, and whether the sliders set them (fixed).
    this.stair = null;
    // A ramp being drawn: its bottom edge from a to b, being dragged ("base"), drawn ("top"), then
    // its top edge from c to d being dragged ("topping"), each [x, y, z].
    this.ramp = null;
    this.moving = null; // picked things being dragged: { y, last: [x, z], moved }
    this.box = null; // a box being dragged to pick in: { x0, y0, x1, y1, add }
    this.ghost = new THREE.Group();
    this.ghost.renderOrder = 5;
    scene.add(this.ghost);
    this.ghostOf = ""; // what the ghost was made from
    this.free = false; // whether shift's held, so nothing snaps
    this.snapMark = new THREE.Mesh(new THREE.OctahedronGeometry(1), new THREE.MeshBasicMaterial({ color: 0x40e0ff, depthTest: false }));
    this.snapMark.renderOrder = 7;
    this.snapMark.visible = false;
    scene.add(this.snapMark);
    this.boxEl = el("div", { className: "create-box", hidden: true });
    document.body.append(this.boxEl);
    this.thumbs = new Thumbnails();
    this.makeThumbs = new Thumbnails(); // the template being made's, in its dialog
    this.making = null; // the template the dialog would make
    this.picker = new PlacePicker($("libraryPicker"), { onArm: (type) => type && this.arm(this.libraryKind, type) });
    this.libraryKind = "objects";

    for (const [kind, button] of [["objects", "objectLibrary"], ["templates", "templateLibrary"]]) {
      $(button).addEventListener("click", () => {
        this.libraryKind = kind;
        $("libraryTitle").textContent = kind;
        this.picker.armed = this.armed[kind === "objects" ? "object" : "template"];
        this.picker.show(this.library.collections(kind));
        $("library").showPopover();
      });
    }
    $("library").addEventListener("toggle", (e) => e.newState === "closed" && this.picker.hide());
    $("objectScale").addEventListener("input", () => this.readScale());
    for (const button of document.querySelectorAll("[data-build-undo]")) button.addEventListener("click", () => this.undo());
    $("pickedDelete").addEventListener("click", () => this.deletePicked());
    $("pickedScale").addEventListener("input", () => this.scalePicked());
    $("pickedScale").addEventListener("change", () => (this.scaling = false));
    $("makeTemplate").addEventListener("click", () => this.askTemplate());
    $("pickedCopy").addEventListener("click", () => this.copy());
    $("templatePaste").addEventListener("click", () => this.paste());
    $("templateMakeKeep").addEventListener("click", () => this.makeTemplate());
    $("templateMakeCancel").addEventListener("click", () => $("templateMake").hidePopover());
    $("templateName").addEventListener("keydown", (e) => e.key === "Enter" && this.makeTemplate());
    $("templateCollection").addEventListener("input", () => ($("templateCollectionName").hidden = $("templateCollection").value !== NEW_COLLECTION));
    for (const button of document.querySelectorAll("[data-template-mode]")) button.addEventListener("click", () => this.templateMode(button.dataset.templateMode));
    $("templateReplace").addEventListener("input", () => this.showDiff());
    $("templateMake").addEventListener("toggle", (e) => {
      if (e.newState !== "closed") return;
      this.makeThumbs.stopTurning();
      this.makeThumbs.dropUnused(new Set());
      this.making = null;
    });
    const modes = [...document.querySelectorAll("[data-slab-mode]")];
    for (const button of modes) {
      button.addEventListener("click", () => {
        this.slab.mode = button.dataset.slabMode;
        this.outlining = null;
        this.clearGhost();
        modes.forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
        this.showSlab();
      });
    }
    for (const id of ["slabSurface", "slabThickness", "slabHeight", "slabRoof", "slabPitch", "slabRoomRoof", "slabGrid"]) $(id).addEventListener("input", () => this.readSlab());
    for (const id of ["stairSurface", "stairRisers", "stairThickness", "stairSteps", "stairStepsAuto"]) $(id).addEventListener("input", () => this.showStair());
    for (const id of ["stairWidth", "stairRun", "stairRise"]) $(id).addEventListener("input", () => this.slideStair());
    $("stairPlace").addEventListener("click", () => this.placeStair());
    for (const id of ["rampSurface", "rampThickness"]) $(id).addEventListener("input", () => this.showRamp());
    this.readSlab();
    this.showRecent();
  }

  // Tells the builder something, in the tool's settings, till the tool's picked again.
  say(text) {
    for (const line of document.querySelectorAll("[data-build-say]")) line.textContent = text;
  }

  // Picks a build tool, or puts it down with null or another tool.
  setTool(tool) {
    this.tool = tool;
    this.say("");
    this.drawing = this.moving = this.box = this.outlining = this.stair = this.ramp = null;
    this.snapMark.visible = false;
    this.showStair();
    this.showRamp();
    this.boxEl.hidden = true;
    this.clearGhost();
    if (tool !== "pick") this.things.picked.clear();
    this.things.pickedDrawn = "";
    this.showPicked();
    this.showRecent();
  }

  // Arms `type` of `kind` ("objects" or "templates") to place, picking its tool.
  arm(kind, type) {
    const tool = kind === "objects" ? "object" : "template";
    this.armed[tool] = type;
    this.library.used(kind, type);
    $("library").hidePopover();
    if (tool === "object") {
      this.scale = sizesOf(type)?.first ?? 1;
      this.showScale();
    }
    this.showRecent();
    this.onPick?.(tool);
  }

  // The recent things of each kind, as thumbnails to click, the one armed marked.
  showRecent() {
    const queue = [];
    for (const [kind, tool, id] of [["objects", "object", "recentObjects"], ["templates", "template", "recentTemplates"]]) {
      const entries = this.library.recentEntries(kind);
      const tiles = entries.map((entry) => {
        const canvas = el("canvas", { width: THUMB_PX, height: THUMB_PX });
        const tile = el("button", { type: "button", className: "create-thumb", title: entry.name, onclick: () => this.arm(kind, entry.type) }, canvas);
        tile.setAttribute("aria-pressed", String(entry.type === this.armed[tool]));
        queue.push({ entry, canvas });
        return tile;
      });
      $(id).replaceChildren(...(tiles.length ? tiles : [el("p", { className: "create-note", textContent: "None used yet." })]));
    }
    this.thumbs.drawAll(queue, new Set(queue.map(({ entry }) => entry.key)));
    const pasting = this.library.clipboardType();
    $("templatePaste").disabled = !pasting;
    $("templatePaste").setAttribute("aria-pressed", String(!!pasting && this.armed.template === pasting));
  }

  // The object's size slider, on a log scale between its least and most.
  showScale() {
    const sizes = sizesOf(this.armed.object);
    $("objectScaleRow").hidden = !sizes;
    if (!sizes) return;
    $("objectScale").value = String(Math.round((1000 * Math.log(this.scale / sizes.least)) / Math.log(sizes.most / sizes.least)));
    $("objectScaleOut").textContent = specOf(this.armed.object).built ? `×${this.scale.toFixed(2)}` : `${this.scale.toFixed(1)} ft`;
  }

  readScale() {
    const sizes = sizesOf(this.armed.object);
    if (!sizes) return;
    this.scale = sizes.least * (sizes.most / sizes.least) ** (Number($("objectScale").value) / 1000);
    this.showScale();
  }

  readSlab() {
    Object.assign(this.slab, {
      surface: pickedSurface($("slabSurface")),
      thickness: Math.max(0.1, Math.min(16, Number($("slabThickness").value) || 1)),
      height: Math.max(1, Math.min(60, Number($("slabHeight").value) || 10)),
      roof: $("slabRoof").value,
      pitch: Math.max(0, Math.min(60, Number($("slabPitch").value) || 0)),
      roomRoof: $("slabRoomRoof").checked,
      grid: $("slabGrid").checked,
    });
    this.showSlab();
  }

  showSlab() {
    const { mode } = this.slab;
    for (const part of document.querySelectorAll("[data-slab-only]")) part.hidden = !part.dataset.slabOnly.split(" ").includes(mode);
    const roofed = mode === "roof" || (mode === "room" && this.slab.roomRoof);
    for (const part of document.querySelectorAll("[data-slab-roof]")) part.hidden = !roofed;
  }

  // Where the pointer meets a slab or object, or the ground: { at: [x, y, z], thing }, or null.
  hit() {
    const ray = this.ray();
    if (!ray) return null;
    const on = this.things.pick(ray);
    const ground = this.groundHit();
    if (on && (!ground || on.point.distanceTo(ray.ray.origin) <= new THREE.Vector3(...ground).distanceTo(ray.ray.origin))) return { at: on.point.toArray(), thing: on.thing };
    return ground && { at: ground, thing: null };
  }

  // `at` ([x, y, z]) moved onto the slab corner nearest it on the screen, or else the nearest slab
  // edge, when one's near enough and shift isn't held, showing where with the snap mark; or, with
  // `grid`, onto the grid. Upright slabs' corners and edges are on both their faces. Kept at its
  // height with `level`. What it snapped to is left in this.snapped, { slab, edge: [p, q] } (an
  // edge, or a corner's two), or null. Null stays null.
  snap(at, level = false, grid = false) {
    this.snapMark.visible = false;
    this.snapped = null;
    if (!at || this.free) return at;
    const r = this.canvas.getBoundingClientRect();
    const screen = (p) => {
      const v = new THREE.Vector3(...p).project(this.camera);
      return v.z > 1 ? null : [((v.x + 1) / 2) * r.width, ((1 - v.y) / 2) * r.height];
    };
    const pointer = screen(at);
    if (!pointer) return at;
    const away = (p) => {
      const s = screen(p);
      return s ? Math.hypot(s[0] - pointer[0], s[1] - pointer[1]) : Infinity;
    };
    const { slabs } = this.placed.near(at[0], at[2], SLAB_REACH_FT * 2);
    const faces = slabs.flatMap((slab) => (pressing(slab) ? [{ slab, ring: slabTop(slab) }] : [{ slab, ring: slabTop(slab) }, { slab, ring: slabBottom(slab) }]));
    let best = null;
    for (const { slab, ring } of faces) {
      ring.forEach((corner, i) => {
        const d = away(corner);
        if (d <= SNAP_CORNER_PX && (!best || d < best.d)) best = { d, p: corner, slab, edge: [ring[(i + ring.length - 1) % ring.length], ring[(i + 1) % ring.length]] };
      });
    }
    if (!best) {
      const ray = new THREE.Ray(this.camera.position.clone(), new THREE.Vector3(...at).sub(this.camera.position).normalize());
      for (const { slab, ring } of faces) {
        ring.forEach((p, i) => {
          const q = ring[(i + 1) % ring.length];
          const onEdge = new THREE.Vector3();
          ray.distanceSqToSegment(new THREE.Vector3(...p), new THREE.Vector3(...q), undefined, onEdge);
          const d = away(onEdge.toArray());
          if (d <= SNAP_EDGE_PX && (!best || d < best.d)) best = { d, p: onEdge.toArray(), slab, edge: [p, q] };
        });
      }
    }
    if (!best) {
      if (!grid) return at;
      const round = (v) => Math.round(v / GRID_FT) * GRID_FT;
      return [round(at[0]), at[1], round(at[2])];
    }
    this.snapped = { slab: best.slab, edge: best.edge };
    const snapped = level ? [best.p[0], at[1], best.p[2]] : best.p;
    this.snapMark.position.set(...best.p);
    this.snapMark.scale.setScalar(this.camera.position.distanceTo(this.snapMark.position) * SNAP_MARK);
    this.snapMark.visible = true;
    return snapped;
  }

  // Where the pointer's ray meets the level at height y, [x, y, z], or null.
  onLevel(y) {
    const ray = this.ray();
    const p = ray && ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), new THREE.Vector3());
    return p && [p.x, y, p.z];
  }

  // The way the camera looks, as a slab's yaw in degrees putting its u to the camera's right,
  // to the nearest 5°.
  cameraYaw() {
    const d = this.camera.getWorldDirection(new THREE.Vector3());
    const [rx, rz] = [-d.z, d.x];
    return Math.round((Math.atan2(-rz, rx) * 180) / Math.PI / 5) * 5;
  }

  down(e) {
    this.free = e.shiftKey;
    const hit = this.hit();
    if (this.tool === "object" && hit && this.armed.object) return this.placeObject(hit);
    if (this.tool === "template" && hit && this.armed.template) return this.placeTemplate(hit);
    if (this.tool === "slab" && (this.slab.mode === "door" || this.slab.mode === "window")) return this.cut(hit);
    if (this.tool === "slab" && this.slab.mode === "polygon") return this.outline(hit);
    if (this.tool === "stairs") return this.stairDown(hit);
    if (this.tool === "ramp") return this.rampDown(hit);
    if (this.tool === "slab" && hit) {
      const grid = this.slab.grid && this.slab.mode !== "roof";
      const a = this.snap(hit.at, false, grid);
      this.drawing = { a, from: this.snapped, yaw: grid ? Math.round(this.cameraYaw() / 90) * 90 : this.cameraYaw(), pieces: [] };
      return;
    }
    if (this.tool !== "pick") return;
    const picked = this.things.picked;
    if (hit?.thing) {
      if (e.shiftKey) {
        if (picked.has(hit.thing)) picked.delete(hit.thing);
        else picked.add(hit.thing);
      } else if (!picked.has(hit.thing)) {
        picked.clear();
        picked.add(hit.thing);
      }
      this.things.pickedDrawn = "";
      this.showPicked();
      if (picked.has(hit.thing)) this.moving = { y: hit.at[1], last: [hit.at[0], hit.at[2]], moved: false };
      return;
    }
    if (!e.shiftKey && picked.size) {
      picked.clear();
      this.things.pickedDrawn = "";
      this.showPicked();
    }
    const r = this.canvas.getBoundingClientRect();
    this.box = { x0: e.clientX - r.left, y0: e.clientY - r.top, x1: e.clientX - r.left, y1: e.clientY - r.top, add: e.shiftKey };
  }

  move(e) {
    this.free = e.shiftKey;
    // Where a slab or stairs would start snaps, shown before it's started.
    const starting = (this.tool === "slab" && !["door", "window"].includes(this.slab.mode) && !this.drawing && !this.outlining) || (this.tool === "stairs" && !this.stair) || (this.tool === "ramp" && (!this.ramp || this.ramp.phase === "top"));
    if (starting) this.snap(this.hit()?.at ?? null, false, this.tool === "slab" && this.slab.grid && this.slab.mode !== "roof");
    if (this.outlining) this.showOutline();
    if (this.stair) this.stairMove();
    if (this.ramp && this.ramp.phase !== "top") this.rampMove();
    if (this.drawing) {
      const b = this.snap(this.onLevel(this.drawing.a[1]), true, this.slab.grid && this.slab.mode !== "roof");
      if (b) this.drawing.pieces = this.pieces(this.drawing.a, b, this.drawing.yaw);
      this.showPieces();
    }
    if (this.moving) {
      const at = this.onLevel(this.moving.y);
      if (!at) return;
      const [dx, dz] = [at[0] - this.moving.last[0], at[2] - this.moving.last[1]];
      if (!this.moving.moved && Math.hypot(dx, dz) < 0.25) return;
      this.placed.alter([...this.things.picked], (thing) => shift(thing, dx, dz, 0), this.moving.moved);
      this.moving.moved = true;
      this.moving.last = [at[0], at[2]];
    }
    if (this.box) {
      const r = this.canvas.getBoundingClientRect();
      [this.box.x1, this.box.y1] = [e.clientX - r.left, e.clientY - r.top];
      const { x0, y0, x1, y1 } = this.box;
      Object.assign(this.boxEl.style, { left: `${r.left + Math.min(x0, x1)}px`, top: `${r.top + Math.min(y0, y1)}px`, width: `${Math.abs(x1 - x0)}px`, height: `${Math.abs(y1 - y0)}px` });
      this.boxEl.hidden = Math.hypot(x1 - x0, y1 - y0) < BOX_PX;
    }
  }

  up() {
    if (this.ramp) this.rampUp();
    if (this.stair?.phase === "base") {
      const { a, b } = this.stair;
      if (Math.hypot(b[0] - a[0], b[2] - a[2]) < 0.5) this.stair = null;
      else this.stair.phase = "top";
      this.showStair();
    }
    if (this.drawing) {
      const { pieces } = this.drawing;
      this.drawing = null;
      this.clearGhost();
      if (pieces.length && pieces.every((slab) => !slabProblems(slab).length)) this.placed.put(pieces);
      else if (pieces.length) this.say("That slab can't be made: it's too big or too small.");
    }
    if (this.moving) this.moving = null;
    if (this.box) {
      const { x0, y0, x1, y1, add } = this.box;
      this.box = null;
      this.boxEl.hidden = true;
      if (Math.hypot(x1 - x0, y1 - y0) >= BOX_PX) this.pickIn(Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1), add);
    }
  }

  // Picks the things whose homes are inside a box on the canvas, in pixels.
  pickIn(x0, y0, x1, y1, add) {
    const r = this.canvas.getBoundingClientRect();
    const { x, z } = this.camera.position;
    const { objects, slabs } = this.placed.near(x, z, 4000);
    if (!add) this.things.picked.clear();
    for (const thing of [...objects, ...slabs]) {
      const [hx, hz] = isSlab(thing) ? middleOf(slabTop(thing)) : thing.at;
      const y = isSlab(thing) ? thing.at[1] : this.things.objectY(thing);
      const v = new THREE.Vector3(hx, y, hz).project(this.camera);
      if (v.z > 1 || v.z < -1) continue;
      const [px, py] = [((v.x + 1) / 2) * r.width, ((1 - v.y) / 2) * r.height];
      if (px >= x0 && px <= x1 && py >= y0 && py <= y1) this.things.picked.add(thing);
    }
    this.things.pickedDrawn = "";
    this.showPicked();
  }

  // Keys while a build tool's picked. Gives whether it used the key.
  key(e) {
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === "z") {
      this.undo();
      return true;
    }
    if ((e.ctrlKey || e.metaKey) && k === "c" && this.tool === "pick") return this.copy();
    if ((e.ctrlKey || e.metaKey) && k === "v") return this.paste();
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (k === "c" || k === "v") {
      const step = (e.shiftKey ? FINE_TURN_DEG : TURN_DEG) * (k === "c" ? 1 : -1);
      if (this.tool === "pick") this.turnPicked(step);
      else this.yaw += (step * Math.PI) / 180;
      return true;
    }
    if (this.stair?.phase === "top" && e.key === "Enter") {
      this.placeStair();
      return true;
    }
    if (this.outlining && e.key === "Enter") {
      if (this.outlining.points.length >= 3) this.closeOutline();
      return true;
    }
    if (this.outlining && e.key === "Backspace") {
      this.outlining.points.pop();
      if (!this.outlining.points.length) {
        this.outlining = null;
        this.clearGhost();
      } else this.showOutline();
      return true;
    }
    if (this.tool === "pick" && (e.key === "Delete" || e.key === "Backspace")) {
      this.deletePicked();
      return true;
    }
    if (this.tool === "pick" && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      const d = (e.shiftKey ? FAR_RAISE_FT : RAISE_FT) * (e.key === "ArrowUp" ? 1 : -1);
      this.placed.alter([...this.things.picked], (thing) => shift(thing, 0, 0, d, isSlab(thing) ? 0 : this.things.objectY(thing)));
      return true;
    }
    if ((k === "[" || k === "]") && this.tool === "object") {
      const scale = $("objectScale");
      scale.value = String(Number(scale.value) + (k === "]" ? 50 : -50));
      this.readScale();
      return true;
    }
    return false;
  }

  undo() {
    if (!this.placed.undo()) return;
    // What's picked may have been taken away.
    const all = new Set(Object.values(this.placed.near(this.camera.position.x, this.camera.position.z, 1e6)).flat());
    for (const thing of this.things.picked) if (!all.has(thing)) this.things.picked.delete(thing);
    this.things.pickedDrawn = "";
    this.showPicked();
  }

  placeObject(hit) {
    const type = this.armed.object;
    const [x, y, z] = hit.at;
    // In the ghost's colors.
    const { id: _, ...made } = makeObject(type, [x, z], this.yaw, this.scale);
    const colors = this.ghostObject?.type === type ? this.ghostObject.colors : made.colors;
    const object = readyObject({ ...made, ...(colors ? { colors } : {}), ...(hit.thing ? { y } : {}) });
    if (!object) return;
    this.placed.put([object]);
    this.library.used("objects", type);
    if ($("objectRandom").checked) this.yaw = Math.random() * Math.PI * 2;
    this.ghostOf = "";
  }

  // Where the armed template would be placed with the pointer at `hit`: its anchor, [x, y, z].
  anchor(template, hit) {
    const [x, z] = [Math.round(hit.at[0] / SNAP_FT) * SNAP_FT, Math.round(hit.at[2] / SNAP_FT) * SNAP_FT];
    if (hit.thing) return [x, hit.at[1], z];
    const { cells } = placedTemplate(template, [x, 0, z], (this.yaw * 180) / Math.PI);
    const every = Math.max(1, Math.ceil(cells.length / MOST_CELLS));
    const heights = cells.filter((_, n) => n % every === 0).map(([ci, cj]) => this.groundAt((ci + 0.5) * TEMPLATE_CELL_FT, (cj + 0.5) * TEMPLATE_CELL_FT));
    return [x, heights.length ? heights.reduce((s, h) => s + h, 0) / heights.length : hit.at[1], z];
  }

  placeTemplate(hit) {
    const template = this.library.template(this.armed.template);
    if (!template) return;
    const { slabs, objects } = placedTemplate(template, this.anchor(template, hit), (this.yaw * 180) / Math.PI);
    // What's pasted names no template.
    if (this.armed.template.startsWith(CLIPBOARD_PREFIX)) for (const thing of [...slabs, ...objects]) delete thing.template;
    this.placed.put([...slabs, ...objects.map(readyObject).filter(Boolean)]);
    this.library.used("templates", this.armed.template);
  }

  // Cuts a door or window in the slab hit.
  cut(hit) {
    const slab = hit?.thing;
    if (!slab || !isSlab(slab)) return this.say("Click a slab to cut a hole in.");
    if (slab.kind) return this.say("Holes can't be cut in stairs.");
    const [u, , v] = slabSpace(slab, hit.at);
    const door = this.slab.mode === "door";
    const [w, h] = door ? DOOR_FT : WINDOW_FT;
    let [low, high] = [v - h / 2, v + h / 2];
    if (door) {
      // Up from the floor or ground under where it's clicked, or from its foot, cut as a notch.
      // The higher either side of it, so a door in a room's wall starts at its floor.
      const [x, y, z] = hit.at;
      const foot = Math.min(...slab.outline.map((p) => p[1]));
      const n = turnPoint([0, 1, 0], slab.turn);
      const out = (slab.thickness + 0.5) / (Math.hypot(n[0], n[2]) || 1);
      const under = Math.max(this.things.standAt(x + n[0] * out, z + n[2] * out, y), this.things.standAt(x - n[0] * out, z - n[2] * out, y));
      low = slabSpace(slab, [x, under, z])[2];
      high = low + h;
      if (low - foot < 0.5) low = foot - 1;
    }
    const pieces = cutSlab(slab, [[u - w / 2, low], [u + w / 2, low], [u + w / 2, high], [u - w / 2, high]]);
    if (!pieces.length || pieces.some((piece) => slabProblems(piece).length)) return this.say("That hole can't be cut there.");
    this.placed.swap([slab], pieces);
  }

  // The slabs dragging from `a` to `b` would make.
  pieces(a, b, yaw) {
    const { mode, surface, thickness, height, roof, pitch, roomRoof } = this.slab;
    const footUnder = (from, to) => {
      const n = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[2] - from[2]) / 2));
      let low = Infinity;
      for (let k = 0; k <= n; k++) low = Math.min(low, this.things.standAt(from[0] + ((to[0] - from[0]) * k) / n, from[2] + ((to[2] - from[2]) * k) / n, from[1] + 0.01));
      return Math.min(low, from[1]);
    };
    const roofing = { style: roof, pitch, overhang: 1 };
    // Started from a floor's corner or edge: a floor or room level with it, a wall along its edge
    // outside it, its foot at the floor's bottom.
    const floor = this.drawing?.from && pressing(this.drawing.from.slab) ? this.drawing.from.slab : null;
    const flush = floor ? [a[0], a[1] - thickness, a[2]] : a;
    if (mode === "floor") return rectanglePieces(flush, b, yaw, { thickness, surface });
    if (mode === "wall") {
      if (Math.hypot(b[0] - a[0], b[2] - a[2]) < 0.5) return [];
      const outside = floor && besideEdge(floor, a, b);
      if (!outside) return wallPieces(a, b, { foot: footUnder(a, b), height, thickness, surface });
      // A wall's thickness goes to the right of its line: away from the floor.
      const [from, to] = outside === "right" ? [b, a] : [a, b];
      return wallPieces(from, to, { foot: a[1] - floor.thickness, height, thickness, surface });
    }
    if (mode === "room") return roomPieces(flush, b, yaw, { height, thickness, surface, footUnder, roof: roomRoof ? roofing : undefined });
    return roofPieces(a, b, yaw, { ...roofing, thickness, surface });
  }

  // The slabs being drawn, red where they can't be made.
  showPieces() {
    this.clearGhost();
    const { pieces } = this.drawing;
    const wrong = pieces.some((slab) => slabProblems(slab).length);
    for (const mesh of slabMeshes(pieces, [0, 0])) {
      if (wrong) mesh.material = WRONG;
      this.ghost.add(mesh);
    }
  }

  // A click drawing a polygon floor: its first corner where `hit` is, then each next one level with
  // it, closing it on the first again.
  outline(hit) {
    if (!this.outlining) {
      if (!hit) return;
      const at = this.snap(hit.at, false, this.slab.grid);
      // Started from a floor, it's level with it.
      const y = this.snapped && pressing(this.snapped.slab) ? at[1] - this.slab.thickness : at[1];
      this.outlining = { y, points: [[at[0], at[2]]] };
      return this.showOutline();
    }
    const at = this.snap(this.onLevel(this.outlining.y), true, this.slab.grid);
    if (!at) return;
    const { points } = this.outlining;
    if (points.length >= 3 && this.nearFirst(at)) return this.closeOutline();
    points.push([at[0], at[2]]);
    this.showOutline();
  }

  // Whether `at` is on the screen near the polygon's first corner.
  nearFirst(at) {
    const [x, z] = this.outlining.points[0];
    const r = this.canvas.getBoundingClientRect();
    const px = (p) => {
      const v = new THREE.Vector3(...p).project(this.camera);
      return [((v.x + 1) / 2) * r.width, ((1 - v.y) / 2) * r.height];
    };
    const [a, b] = [px([x, this.outlining.y, z]), px(at)];
    return Math.hypot(a[0] - b[0], a[1] - b[1]) <= CLOSE_PX;
  }

  // Makes the polygon clicked out a floor, if it can be.
  closeOutline() {
    const { y, points } = this.outlining;
    this.outlining = null;
    this.clearGhost();
    const { thickness, surface } = this.slab;
    const pieces = polygonPieces(points, y + thickness, { thickness, surface });
    if (pieces.length && pieces.every((slab) => !slabProblems(slab).length)) this.placed.put(pieces);
    else this.say("That floor can't be made: its edges cross, or it's too small or has too many corners.");
  }

  // The polygon being clicked out, to the pointer: its edges, and the floor it would make, red
  // where it can't be made.
  showOutline() {
    this.clearGhost();
    const { y, points } = this.outlining;
    const at = this.snap(this.onLevel(y), true, this.slab.grid);
    const corners = at ? [...points, [at[0], at[2]]] : points;
    const { thickness, surface } = this.slab;
    const pieces = corners.length >= 3 ? polygonPieces(corners, y + thickness, { thickness, surface }) : [];
    const wrong = corners.length >= 3 && (!pieces.length || pieces.some((slab) => slabProblems(slab).length));
    for (const mesh of slabMeshes(pieces, [0, 0])) {
      if (wrong) mesh.material = WRONG;
      this.ghost.add(mesh);
    }
    const line = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(corners.map(([x, z]) => new THREE.Vector3(x, y + thickness + 0.05, z))),
      new THREE.LineBasicMaterial({ color: wrong ? 0xe04040 : 0xffe080, depthTest: false }),
    );
    line.renderOrder = 6;
    this.ghost.add(line);
  }

  // Starts a flight's bottom edge where `hit` is, or places the one being drawn.
  stairDown(hit) {
    if (this.stair?.phase === "top") return this.placeStair();
    if (!hit) return;
    const a = this.snap(hit.at);
    this.stair = { phase: "base", a, b: a, run: 0, rise: 0, fixed: false };
    this.showStair();
  }

  // The pointer moved: the bottom edge being dragged follows it, level; or the top edge goes to
  // where it meets a slab or the ground.
  stairMove() {
    const stair = this.stair;
    if (stair.phase === "base") {
      const b = this.snap(this.onLevel(stair.a[1]), true);
      if (b) stair.b = b;
      return this.showStair();
    }
    if (stair.fixed) return;
    const hit = this.hit();
    if (!hit) return;
    hit.at = this.snap(hit.at);
    const { a, b } = stair;
    const width = Math.hypot(b[0] - a[0], b[2] - a[2]);
    // How far the point is across the edge, to the right looking from a to b.
    let across = ((hit.at[0] - a[0]) * -(b[2] - a[2]) + (hit.at[2] - a[2]) * (b[0] - a[0])) / width;
    if (across < 0) {
      // To the left: the edge turns round, so the flight goes that way.
      [stair.a, stair.b] = [b, a];
      across = -across;
    }
    stair.run = across;
    stair.rise = hit.at[1] - a[1];
    this.showStair();
  }

  // The sliders set the flight being drawn, and pointing no longer does.
  slideStair() {
    const stair = this.stair;
    if (stair?.phase !== "top") return;
    const { a, b } = stair;
    const width = Number($("stairWidth").value);
    const length = Math.hypot(b[0] - a[0], b[2] - a[2]);
    stair.b = [a[0] + ((b[0] - a[0]) * width) / length, a[1], a[2] + ((b[2] - a[2]) * width) / length];
    stair.run = Number($("stairRun").value);
    stair.rise = Number($("stairRise").value);
    stair.fixed = true;
    this.showStair();
  }

  // The flight being drawn as a slab, as the settings have it, or null.
  stairNow() {
    const stair = this.stair;
    if (stair?.phase !== "top") return null;
    const risers = $("stairRisers").value;
    const auto = $("stairStepsAuto").checked;
    const steps = auto ? defaultSteps(stair.rise) : Math.max(1, Math.round(Number($("stairSteps").value) || 1));
    return stairSlab(stair.a, stair.b, stair.run, stair.rise, {
      thickness: Math.max(0.1, Math.min(16, Number($("stairThickness").value) || 1)),
      surface: pickedSurface($("stairSurface")),
      ...(risers === "same" ? {} : { risers: risers === "open" ? null : pickedSurface($("stairRisers")) }),
      steps,
    });
  }

  // The flight being drawn, red where it can't be made, and its numbers in the settings.
  showStair() {
    this.clearGhost();
    const stair = this.stair;
    const topping = stair?.phase === "top";
    for (const id of ["stairWidth", "stairRun", "stairRise", "stairPlace"]) $(id).disabled = !topping;
    $("stairSteps").disabled = $("stairStepsAuto").checked;
    const slab = this.stairNow();
    if (slab) {
      const { width, run, rise, steps } = stairShape(slab);
      $("stairWidth").value = String(width);
      $("stairRun").value = String(run);
      $("stairRise").value = String(rise);
      if ($("stairStepsAuto").checked) $("stairSteps").value = String(steps);
    }
    const feet = (id) => ($(`${id}Out`).textContent = `${Number($(id).value).toFixed(1)} ft`);
    ["stairWidth", "stairRun", "stairRise"].forEach(feet);
    if (stair?.phase === "base") {
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([stair.a, stair.b].map((p) => new THREE.Vector3(p[0], p[1] + 0.05, p[2]))), new THREE.LineBasicMaterial({ color: 0xffe080, depthTest: false }));
      line.renderOrder = 6;
      this.ghost.add(line);
    }
    if (!slab) return;
    const wrong = slabProblems(slab).length > 0;
    for (const mesh of slabMeshes([slab], [0, 0])) {
      if (wrong) mesh.material = WRONG;
      this.ghost.add(mesh);
    }
  }

  // Makes the flight being drawn, if it can be.
  placeStair() {
    const slab = this.stairNow();
    if (!slab) return;
    if (this.stair.rise <= 0) return this.say("The top of the stairs has to be higher than the bottom.");
    const problem = slabProblems(slab)[0];
    if (problem) return this.say(problem.includes("pitch") ? "Those stairs are too steep to walk up." : problem.includes("reaches") ? "Those stairs are too long: one flight reaches at most 64 ft." : `Those stairs can't be made: it ${problem}.`);
    this.placed.put([slab]);
    this.stair = null;
    // A ramp being drawn: its bottom edge from a to b, being dragged ("base"), drawn ("top"), then
    // its top edge from c to d being dragged ("topping"), each [x, y, z].
    this.ramp = null;
    this.say("");
    this.showStair();
  }

  // Starts a ramp's bottom edge where `hit` is, or its top edge once the bottom's drawn.
  rampDown(hit) {
    if (!hit) return;
    const at = this.snap(hit.at);
    if (this.ramp?.phase === "top") Object.assign(this.ramp, { phase: "topping", c: at, d: at });
    else this.ramp = { phase: "base", a: at, b: at };
    this.showRamp();
  }

  // The pointer moved: the bottom edge being dragged follows it, level unless it snaps to a slab's
  // corner or edge, or the top edge's end follows it in the ramp's plane.
  rampMove() {
    const ramp = this.ramp;
    if (ramp.phase === "base") {
      const b = this.snap(this.onLevel(ramp.a[1]));
      if (b) ramp.b = b;
      return this.showRamp();
    }
    const plane = new THREE.Plane().setFromCoplanarPoints(...[ramp.a, ramp.b, ramp.c].map((p) => new THREE.Vector3(...p)));
    const ray = this.ray();
    const on = plane.normal.lengthSq() > 0.5 && ray?.ray.intersectPlane(plane, new THREE.Vector3());
    if (on) ramp.d = this.snap(on.toArray());
    this.showRamp();
  }

  // The bottom edge is drawn, or the ramp is made, if it can be.
  rampUp() {
    const ramp = this.ramp;
    const length = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    if (ramp.phase === "base") {
      if (length(ramp.a, ramp.b) < 0.5) this.ramp = null;
      else ramp.phase = "top";
      return this.showRamp();
    }
    if (ramp.phase !== "topping") return;
    const slab = this.rampNow();
    ramp.phase = "top";
    if (length(ramp.c, ramp.d) < 0.5) this.say("Drag the top edge, from one end to the other.");
    else if (!slab) this.say("That ramp can't be made: it stands upright, or its corners are in a line.");
    else if (slabProblems(slab).length) this.say(slabProblems(slab)[0].includes("reaches") ? "That ramp is too big: it reaches at most 64 ft from its first corner." : `That ramp can't be made: it ${slabProblems(slab)[0]}.`);
    else {
      this.placed.put([slab]);
      this.ramp = null;
      const steep = (Math.acos(Math.min(1, turnPoint([0, 1, 0], slab.turn)[1])) * 180) / Math.PI;
      this.say(steep > MAX_STAIR_DEG ? `That ramp is ${Math.round(steep)}°, too steep to walk up.` : "");
    }
    this.showRamp();
  }

  // The ramp being drawn as a slab, or null.
  rampNow() {
    const ramp = this.ramp;
    if (ramp?.phase !== "topping") return null;
    return rampSlab(ramp.a, ramp.b, ramp.c, ramp.d, { thickness: Math.max(0.1, Math.min(16, Number($("rampThickness").value) || 1)), surface: pickedSurface($("rampSurface")) });
  }

  // The ramp being drawn: its bottom edge, then the ramp, red where it can't be made.
  showRamp() {
    this.clearGhost();
    const ramp = this.ramp;
    if (!ramp) return;
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([ramp.a, ramp.b].map((p) => new THREE.Vector3(p[0], p[1] + 0.05, p[2]))), new THREE.LineBasicMaterial({ color: 0xffe080, depthTest: false }));
    line.renderOrder = 6;
    this.ghost.add(line);
    const slab = this.rampNow();
    if (!slab) return;
    const wrong = slabProblems(slab).length > 0;
    for (const mesh of slabMeshes([slab], [0, 0])) {
      if (wrong) mesh.material = WRONG;
      this.ghost.add(mesh);
    }
  }

  // Each frame: the thing armed follows the pointer.
  tick() {
    if (this.drawing || this.outlining || this.stair || this.ramp) return;
    const type = this.tool === "object" ? this.armed.object : this.tool === "template" ? this.armed.template : null;
    const hit = type && this.hit();
    if (!hit) {
      if (!this.drawing) this.clearGhost();
      return;
    }
    const made = `${type}:${this.yaw}:${this.scale}`;
    if (made !== this.ghostOf) {
      this.clearGhost();
      this.ghostOf = made;
      if (this.tool === "object") {
        const object = readyObject(makeObject(type, [0, 0], this.yaw, this.scale));
        this.ghostObject = object;
        if (object) this.addGhost(objectMeshes([drawable(object, 0)], null, [0, 0]));
      } else {
        const template = this.library.template(type);
        if (template) {
          const { slabs, objects } = placedTemplate(template, [0, 0, 0], (this.yaw * 180) / Math.PI);
          this.addGhost([...slabMeshes(slabs, [0, 0]), ...objectMeshes(objects.map(readyObject).filter(Boolean).map((o) => drawable(o, o.y ?? 0)), null, [0, 0])]);
        }
      }
    }
    if (this.tool === "object") this.ghost.position.set(...hit.at);
    else {
      const template = this.library.template(type);
      if (template) this.ghost.position.set(...this.anchor(template, hit));
    }
  }

  addGhost(meshes) {
    for (const mesh of meshes) {
      mesh.frustumCulled = false;
      this.ghost.add(mesh);
    }
    this.ghost.visible = true;
  }

  clearGhost() {
    for (const mesh of this.ghost.children) {
      mesh.dispose?.();
      if (!mesh.isInstancedMesh) mesh.geometry.dispose();
    }
    this.ghost.clear();
    this.ghost.position.set(0, 0, 0);
    this.ghostOf = "";
  }

  // What's picked: how many, an object's size when it's one alone, and making a template.
  showPicked() {
    const picked = [...this.things.picked];
    $("pickedCount").textContent = picked.length ? `${picked.length} picked` : "Nothing picked.";
    $("pickedDelete").disabled = !picked.length;
    $("makeTemplate").disabled = !picked.length;
    $("pickedCopy").disabled = !picked.length;
    const one = picked.length === 1 && !isSlab(picked[0]) ? picked[0] : null;
    $("pickedScaleRow").hidden = !one;
    if (!one) return;
    const sizes = sizesOf(one.type);
    if (!sizes) return;
    if (!this.scaling) $("pickedScale").value = String(Math.round((1000 * Math.log(one.scale / sizes.least)) / Math.log(sizes.most / sizes.least)));
    $("pickedScaleOut").textContent = specOf(one.type).built ? `×${one.scale.toFixed(2)}` : `${one.scale.toFixed(1)} ft`;
  }

  scalePicked() {
    const [one] = this.things.picked;
    const sizes = one && sizesOf(one.type);
    if (!sizes) return;
    const scale = sizes.least * (sizes.most / sizes.least) ** (Number($("pickedScale").value) / 1000);
    this.placed.alter([one], (thing) => Object.assign(thing, readyObject({ ...thing, scale })), this.scaling);
    this.scaling = true;
    this.showPicked();
  }

  deletePicked() {
    this.placed.take([...this.things.picked]);
    this.things.picked.clear();
    this.things.pickedDrawn = "";
    this.showPicked();
  }

  // Turns what's picked `degrees` about the middle of their homes.
  turnPicked(degrees) {
    const picked = [...this.things.picked];
    if (!picked.length) return;
    const [cx, cz] = middleOf(picked.map(homeOf));
    const r = (degrees * Math.PI) / 180;
    const [c, s] = [Math.cos(r), Math.sin(r)];
    const about = ([x, z]) => [cx + (x - cx) * c + (z - cz) * s, cz - (x - cx) * s + (z - cz) * c];
    this.placed.alter(picked, (thing) => {
      if (isSlab(thing)) {
        const [x, z] = about([thing.at[0], thing.at[2]]);
        thing.at = [x, thing.at[1], z];
        thing.turn = [thing.turn[0] + degrees, thing.turn[1], thing.turn[2]];
      } else {
        thing.at = about(thing.at);
        thing.yaw += r;
      }
    });
  }

  // What's picked as a template, standing on the ground under it, named `name`.
  capture(picked, name) {
    const objects = picked.filter((t) => !isSlab(t));
    return captureTemplate({
      id: newObjectId(),
      name,
      slabs: picked.filter(isSlab),
      objects: objects.map((o) => ({ ...o, y: Number.isFinite(o.y) ? o.y : undefined })),
      height: (ci, cj) => this.groundAt((ci + 0.5) * TEMPLATE_CELL_FT, (cj + 0.5) * TEMPLATE_CELL_FT),
    });
  }

  // Copies what's picked, in place of what was copied before. Says whether there was anything.
  copy() {
    const picked = [...this.things.picked];
    if (!picked.length) return false;
    this.setClipboard(this.capture(picked, "copied"));
    this.say(`Copied ${picked.length}. Paste with the template tool, or ctrl+V.`);
    return true;
  }

  // Makes `template` what was copied, keeping it in this browser unless `keep` is false.
  setClipboard(template, keep = true) {
    this.library.clipboard = template;
    if (keep) this.library.keepClipboard(template);
    this.showRecent();
  }

  // Arms the template tool with what was copied. Says whether there was anything.
  paste() {
    const type = this.library.clipboardType();
    if (!type) return false;
    this.armed.template = type;
    this.showRecent();
    this.onPick?.("template");
    return true;
  }

  // Opens the dialog for making what's picked a template: what it holds, how big it is, and how
  // it looks, asking its name and collection.
  askTemplate() {
    const picked = [...this.things.picked];
    if (!picked.length) return;
    const slabs = picked.filter(isSlab);
    const objects = picked.filter((t) => !isSlab(t));
    this.making = this.capture(picked, "");
    const { cells, across, deep } = footprint(this.making);
    const count = (n, one) => `${n} ${one}${n === 1 ? "" : "s"}`;
    $("templateMakeFacts").textContent = `${count(objects.length, "object")} and ${count(slabs.length, "slab")}, over ${count(cells, "cell")}: ${across} × ${deep} ft.`;

    const own = this.library.templateCollections();
    const options = own.map((c) => el("option", { value: c.id, textContent: c.name }));
    if (!own.some((c) => c.name === HOME_TEMPLATES)) options.unshift(el("option", { value: "", textContent: HOME_TEMPLATES }));
    options.push(el("option", { value: NEW_COLLECTION, textContent: "new collection…" }));
    const select = $("templateCollection");
    const last = select.value;
    select.replaceChildren(...options);
    if (options.some((o) => o.value === last && last !== NEW_COLLECTION)) select.value = last;
    $("templateCollectionName").hidden = true;
    $("templateCollectionName").value = "";
    $("templateName").value = "";

    // The world's own templates, to replace one; or, armed, the one placed last.
    const replaceable = this.library.collections("templates").filter((c) => c.kind === "own").flatMap((c) => c.entries.map((e) => ({ ...e, collection: c.name })));
    $("templateReplace").replaceChildren(...replaceable.map((e) => el("option", { value: e.type, textContent: `${e.name} (${e.collection})` })));
    if (replaceable.some((e) => e.type === this.armed.template)) $("templateReplace").value = this.armed.template;
    document.querySelector("[data-template-mode=replace]").disabled = !replaceable.length;

    $("templateMake").showPopover();
    this.templateMode("new");
    const entry = { key: `making:${this.making.id}`, template: this.making };
    this.makeThumbs.startTurning(entry, $("templateMakeView"));
  }

  // Shows the dialog making a new template, or replacing one.
  templateMode(mode) {
    this.replacing = mode === "replace";
    for (const button of document.querySelectorAll("[data-template-mode]")) button.setAttribute("aria-pressed", String(button.dataset.templateMode === mode));
    for (const part of document.querySelectorAll("[data-template-shown]")) part.hidden = part.dataset.templateShown !== mode;
    $("templateMakeKeep").textContent = this.replacing ? "replace it" : "make it";
    $("templateMakeKeep").disabled = false;
    if (this.replacing) this.showDiff();
    else $("templateName").focus();
  }

  // How what's picked differs from the template it would replace.
  showDiff() {
    const old = this.library.template($("templateReplace").value);
    $("templateMakeKeep").disabled = !old;
    if (!old) return $("templateDiff").replaceChildren();
    const nameOf = (type) => this.library.entry("objects", type)?.name ?? type;
    const { changes, before, after } = templateDiff(old, this.making, nameOf);
    const rows = changes.map(({ label, before: was, after: now }) => {
      const d = now - was;
      return el("li", { className: d > 0 ? "added" : "taken", textContent: `${d > 0 ? "+" : "−"}${Math.abs(d)} ${label} (${was} → ${now})` });
    });
    if (!changes.length) rows.push(el("li", { textContent: "The same things, though some may have moved or turned." }));
    if (before.across !== after.across || before.deep !== after.deep) rows.push(el("li", { textContent: `${before.across} × ${before.deep} ft → ${after.across} × ${after.deep} ft` }));
    $("templateDiff").replaceChildren(...rows);
  }

  // Keeps the template the dialog shows, named and filed as asked or in place of the one picked
  // to replace, and arms it.
  makeTemplate() {
    if (!this.making) return;
    if (this.replacing) {
      const type = $("templateReplace").value;
      const old = this.library.template(type);
      if (!old) return;
      this.library.replaceTemplate(old, this.making);
      $("templateMake").hidePopover();
      this.armed.template = type;
      this.ghostOf = "";
      this.say(`Replaced the template "${old.name}".`);
      this.showRecent();
      return;
    }
    const name = $("templateName").value.trim() || "new template";
    const collection = $("templateCollection").value;
    const newName = collection === NEW_COLLECTION ? $("templateCollectionName").value.trim() || "new collection" : null;
    const type = this.library.keepTemplate({ ...this.making, name }, newName ? { newName } : { collection: collection || undefined });
    $("templateMake").hidePopover();
    this.library.used("templates", type);
    this.armed.template = type;
    this.say(`Made the template "${name}".`);
    this.showRecent();
  }
}

// Whether the line from a to b ([x, y, z]) runs along an edge of the level slab `floor`: "left" or
// "right" for the side of it the floor's on, looking from a to b with north up; or null.
function besideEdge(floor, a, b) {
  const ring = slabTop(floor).map(([x, , z]) => [x, z]);
  const [dx, dz] = [b[0] - a[0], b[2] - a[2]];
  const length = Math.hypot(dx, dz);
  const [mx, mz] = [(a[0] + b[0]) / 2, (a[2] + b[2]) / 2];
  const along = ring.some((p, i) => {
    const q = ring[(i + 1) % ring.length];
    const [ex, ez] = [q[0] - p[0], q[1] - p[1]];
    const edge = Math.hypot(ex, ez);
    const parallel = Math.abs(dx * ez - dz * ex) / (length * edge) < 0.02;
    const t = Math.max(0, Math.min(1, ((mx - p[0]) * ex + (mz - p[1]) * ez) / (edge * edge)));
    return parallel && Math.hypot(mx - (p[0] + ex * t), mz - (p[1] + ez * t)) < 0.1;
  });
  if (!along) return null;
  const [rx, rz] = [-dz / length, dx / length];
  return inPolygon(ring, [mx + rx * 0.5, mz + rz * 0.5]) ? "right" : "left";
}

// Moves a thing dx, dz across and dy up; an object without its own height gets one, standing at
// `y` before.
function shift(thing, dx, dz, dy, y) {
  if (isSlab(thing)) {
    thing.at = [thing.at[0] + dx, thing.at[1] + dy, thing.at[2] + dz];
    return;
  }
  thing.at = [thing.at[0] + dx, thing.at[1] + dz];
  if (dy) thing.y = (Number.isFinite(thing.y) ? thing.y : y) + dy;
}

const middleOf = (points) => [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + (p.length === 3 ? p[2] : p[1]), 0) / points.length];
