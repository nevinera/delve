import * as THREE from "three";
import { objectMeshes } from "../editor/objectMeshes.js";
import { PlacePicker } from "../editor/placePicker.js";
import { slabMeshes } from "../editor/slabMeshes.js";
import { roofPieces, rectanglePieces, roomPieces, wallPieces } from "../editor/slabTool.js";
import { Thumbnails } from "../editor/thumbnailRenderer.js";
import { newObjectId } from "../world/builtObjects.js";
import { CELL_FT as TEMPLATE_CELL_FT } from "../world/constants.js";
import { makeObject, specOf } from "../world/objects.js";
import { slabProblems, slabTop } from "../world/slabs.js";
import { captureTemplate, placedTemplate } from "../world/templates.js";
import { homeOf, isSlab, readyObject } from "./placed.js";
import { drawable } from "./things.js";

// Build's tools, on the things placed by hand (placed.js, things.js):
// - object: places the object picked, from its recent ones or the library, where the pointer
//   meets the ground or a slab, at the size set, turned by C and V, or at random.
// - template: places the template picked as copies of its slabs and objects, its anchor on the
//   grid where the pointer is, at the ground's mean height under it, turned by C and V.
// - slab: dragging draws a floor, a wall, a room (a floor with four walls on it, and a roof, if
//   asked) or a roof, square to the way the camera looks. It starts on the ground or a slab, and
//   the rest lies level with where it started.
// - pick: clicking an object or slab picks it out, shift picks more or fewer, and dragging a box
//   picks those in it. Dragging picked things moves them, C and V turn them about their middle,
//   the up and down arrows raise and lower them, and Delete deletes them. What's picked can be
//   made a template.
// Ctrl+Z undoes the last change.

const THUMB_PX = 56;
const TURN_DEG = 15;
const FINE_TURN_DEG = 2;
const SNAP_FT = 4; // the grid templates' anchors are on
const RAISE_FT = 0.5;
const FAR_RAISE_FT = 4;
const BOX_PX = 4;
const MOST_CELLS = 400; // how many of a template's cells are read for its height
const GHOST_OPACITY = 0.6;
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
    this.tool = null;
    this.armed = { object: null, template: null }; // the type picked of each
    this.yaw = 0; // radians, objects' and templates' turn
    this.scale = null; // the object picked's size
    this.slab = { mode: "floor", surface: "floorboards", thickness: 1, height: 10, roof: "gable", pitch: 30, roomRoof: false };
    this.drawing = null; // a slab being dragged: { a: [x, y, z], yaw degrees, pieces }
    this.moving = null; // picked things being dragged: { y, last: [x, z], moved }
    this.box = null; // a box being dragged to pick in: { x0, y0, x1, y1, add }
    this.ghost = new THREE.Group();
    this.ghost.renderOrder = 5;
    scene.add(this.ghost);
    this.ghostOf = ""; // what the ghost was made from
    this.boxEl = el("div", { className: "create-box", hidden: true });
    document.body.append(this.boxEl);
    this.thumbs = new Thumbnails();
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
    $("makeTemplate").addEventListener("click", () => this.makeTemplate());
    const modes = [...document.querySelectorAll("[data-slab-mode]")];
    for (const button of modes) {
      button.addEventListener("click", () => {
        this.slab.mode = button.dataset.slabMode;
        modes.forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
        this.showSlab();
      });
    }
    for (const id of ["slabSurface", "slabThickness", "slabHeight", "slabRoof", "slabPitch", "slabRoomRoof"]) $(id).addEventListener("input", () => this.readSlab());
    this.readSlab();
    this.showRecent();
  }

  // Picks a build tool, or puts it down with null or another tool.
  setTool(tool) {
    this.tool = tool;
    this.drawing = this.moving = this.box = null;
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
      surface: $("slabSurface").value,
      thickness: Math.max(0.1, Math.min(16, Number($("slabThickness").value) || 1)),
      height: Math.max(1, Math.min(60, Number($("slabHeight").value) || 10)),
      roof: $("slabRoof").value,
      pitch: Math.max(0, Math.min(60, Number($("slabPitch").value) || 0)),
      roomRoof: $("slabRoomRoof").checked,
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
    const hit = this.hit();
    if (this.tool === "object" && hit && this.armed.object) return this.placeObject(hit);
    if (this.tool === "template" && hit && this.armed.template) return this.placeTemplate(hit);
    if (this.tool === "slab" && hit) {
      this.drawing = { a: hit.at, yaw: this.cameraYaw(), pieces: [] };
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
    if (this.drawing) {
      const b = this.onLevel(this.drawing.a[1]);
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
    if (this.drawing) {
      const { pieces } = this.drawing;
      this.drawing = null;
      this.clearGhost();
      if (pieces.length && pieces.every((slab) => !slabProblems(slab).length)) this.placed.put(pieces);
      else if (pieces.length) this.say?.("That slab can't be made: it's too big or too small.");
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
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (k === "c" || k === "v") {
      const step = (e.shiftKey ? FINE_TURN_DEG : TURN_DEG) * (k === "c" ? 1 : -1);
      if (this.tool === "pick") this.turnPicked(step);
      else this.yaw += (step * Math.PI) / 180;
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
    const { id: _, ...made } = makeObject(type, [x, z], this.yaw, this.scale);
    const object = readyObject({ ...made, ...(hit.thing ? { y } : {}) });
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
    this.placed.put([...slabs, ...objects.map(readyObject).filter(Boolean)]);
    this.library.used("templates", this.armed.template);
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
    if (mode === "floor") return rectanglePieces(a, b, yaw, { thickness, surface });
    if (mode === "wall") return Math.hypot(b[0] - a[0], b[2] - a[2]) < 0.5 ? [] : wallPieces(a, b, { foot: footUnder(a, b), height, thickness, surface });
    if (mode === "room") return roomPieces(a, b, yaw, { height, thickness, surface, footUnder, roof: roomRoof ? roofing : undefined });
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

  // Each frame: the thing armed follows the pointer.
  tick() {
    if (this.drawing) return;
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

  // Keeps what's picked as a template named as typed, and arms it.
  makeTemplate() {
    const picked = [...this.things.picked];
    if (!picked.length) return;
    const name = $("templateName").value.trim() || "new template";
    const objects = picked.filter((t) => !isSlab(t));
    const template = captureTemplate({
      id: newObjectId(),
      name,
      slabs: picked.filter(isSlab),
      objects: objects.map((o) => ({ ...o, y: Number.isFinite(o.y) ? o.y : undefined })),
      height: (ci, cj) => this.groundAt((ci + 0.5) * TEMPLATE_CELL_FT, (cj + 0.5) * TEMPLATE_CELL_FT),
    });
    const type = this.library.keepTemplate(template);
    this.library.used("templates", type);
    this.armed.template = type;
    $("templateName").value = "";
    this.say?.(`Made the template "${name}".`);
    this.showRecent();
  }
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
