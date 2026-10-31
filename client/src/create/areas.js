import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { inside } from "../v2/biomes.js";

// Areas drawn on the map with geo's biome and water tools (biomes.js, water.js): polygons, each
// of a kind, with its own color. Their outlines follow the ground, lifted off it more the further
// they are from the camera, in their kind's color. Where areas overlap, the one drawn last wins.
// Undo goes back over every change. A file keeps them as
//
//   { "version": 1, <list>: [{ <field>: kind, ...more, "points": [[x, z], ...] }, ...] }, continent feet
//
// `more` being what else each area has (`extras`), worked out by `start(points)` for a new one.
// With `closed` false, they're open lines, not polygons, of two corners or more.
const WIDTH_PX = 3;
const SELECTED_PX = 6;
const HANDLE_PX = 9; // how wide a corner's handle is
export const PICK_PX = 8; // how near the pointer a corner or edge is picked
const EDGE_STEP_FT = 64; // how far apart an outline's points are put along its edges, to follow the ground
const EDGE_MOST = 256; // and at most how many on an edge
const LIFT_FT = 1;
const LIFT_SHARE = 0.01; // how much higher outlines are lifted, as a share of how far off they are
const LIFT_EVERY_S = 0.5; // how often outlines are put back on the ground, should it have moved
const UNDOS = 50;

export class Areas {
  // surface(x, z) gives the height outlines are drawn at. Corners' handles are drawn over `stage`.
  // colors: kind -> CSS color; kind: what new areas are; field and list: as files have them.
  constructor(scene, surface, stage, { colors, kind, field, list, extras = [], start = () => ({}), closed = true }) {
    Object.assign(this, { surface, colors, field, list, extras, start, closed });
    this.fewest = closed ? 3 : 2; // the fewest corners an area has
    this.fallback = kind;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.handles = document.createElement("canvas");
    this.handles.className = "create-measure";
    stage.append(this.handles);
    this.materials = new Map(); // "kind,selected" -> its material
    this.kind = kind; // what new areas are
    this.areas = []; // { kind, points, ...extras, line }, last drawn on top
    this.draft = null; // the area being drawn, { points, line }
    this.to = null; // where the pointer is, [x, z], for the draft's last edge
    this.selected = null; // the area picked out
    this.dragging = null; // a corner being dragged, { area, k, before, moved }
    this.undos = []; // the file's JSON before each change
    this.eye = new THREE.Vector3();
    this.shown = false; // whether outlines are shown
    this.group.visible = false;
    this.version = 0; // counts changes, to tell when to save
    this.since = 0;
  }

  load(json) {
    this.show(json);
    this.undos = [];
    this.version = 0;
  }

  show(json) {
    this.unselect();
    for (const area of this.areas) this.remove(area.line);
    const extras = (area) => Object.fromEntries(this.extras.map((key) => [key, area[key]]));
    this.areas = (json[this.list] ?? []).filter(({ points }) => points.length >= this.fewest).map((area) => this.area(area[this.field] in this.colors ? area[this.field] : this.fallback, area.points, extras(area)));
  }

  toJSON() {
    const round = (v) => Math.round(v * 10) / 10;
    const json = (area) => ({ [this.field]: area.kind, ...Object.fromEntries(this.extras.map((key) => [key, area[key]])), points: area.points.map(([x, z]) => [round(x), round(z)]) });
    return { version: 1, [this.list]: this.areas.map(json) };
  }

  // Keeps the areas as they are, for undo to go back to.
  save(json = this.toJSON()) {
    this.undos.push(json);
    if (this.undos.length > UNDOS) this.undos.shift();
  }

  changed() {
    this.version++;
  }

  undo() {
    const json = this.undos.pop();
    if (!json) return;
    this.drop();
    this.show(json);
    this.changed();
  }

  setShown(shown) {
    this.shown = shown;
    this.group.visible = shown;
    if (!shown) {
      this.drop();
      this.unselect();
      this.clearHandles();
    }
  }

  area(kind, points, extras = this.start(points)) {
    const area = { kind, ...extras, points };
    area.line = this.line(area, this.closed);
    return area;
  }

  material(kind, selected) {
    const key = `${kind},${selected}`;
    if (!this.materials.has(key)) this.materials.set(key, new LineMaterial({ color: this.colors[kind], linewidth: selected ? SELECTED_PX : WIDTH_PX, depthWrite: false }));
    return this.materials.get(key);
  }

  line(area, closed) {
    const line = new Line2(new LineGeometry(), this.material(area.kind, area === this.selected));
    line.renderOrder = 10;
    line.frustumCulled = false;
    line.userData.closed = closed;
    this.place(line, area.points);
    this.group.add(line);
    return line;
  }

  remove(line) {
    this.group.remove(line);
    line.geometry.dispose();
  }

  // Puts an outline through `points` on the ground.
  place(line, points) {
    const along = this.along(points, line.userData.closed);
    if (along.length === 1) along.push(along[0]);
    const positions = new Float32Array(along.length * 3);
    along.forEach(([x, z], k) => {
      const y = this.surface(x, z);
      positions.set([x, y + LIFT_FT + LIFT_SHARE * Math.hypot(x - this.eye.x, y - this.eye.y, z - this.eye.z), z], k * 3);
    });
    line.geometry.dispose();
    line.geometry = new LineGeometry();
    line.geometry.setPositions(positions);
  }

  // Points along the edges of `points`, so an outline through them follows the ground.
  along(points, closed) {
    const along = [];
    const ends = closed ? [...points, points[0]] : points;
    for (let k = 0; k < ends.length; k++) {
      if (k === 0) {
        along.push(ends[0]);
        continue;
      }
      const [[ax, az], [bx, bz]] = [ends[k - 1], ends[k]];
      const steps = Math.min(EDGE_MOST, Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / EDGE_STEP_FT)));
      for (let s = 1; s <= steps; s++) along.push([ax + ((bx - ax) * s) / steps, az + ((bz - az) * s) / steps]);
    }
    return along;
  }

  // An area's outline across the screen, as pixels on the canvas, null where it's behind.
  outline(camera, width, height, area) {
    return this.along(area.points, this.closed).map((p) => this.screen(camera, width, height, p));
  }

  // The area whose outline passes under the canvas pixel (px, py), or null.
  pickArea(camera, width, height, px, py) {
    let [best, nearest] = [null, PICK_PX];
    for (const area of this.areas) {
      const on = this.outline(camera, width, height, area);
      for (let k = 1; k < on.length; k++) {
        const [a, b] = [on[k - 1], on[k]];
        if (!a || !b) continue;
        const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
        const t = Math.min(1, Math.max(0, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy || 1)));
        const d = Math.hypot(a[0] + dx * t - px, a[1] + dy * t - py);
        if (d <= nearest) [best, nearest] = [area, d];
      }
    }
    return best;
  }

  placeAll() {
    for (const { line, points } of this.areas) this.place(line, points);
    this.placeDraft();
  }

  placeDraft() {
    if (!this.draft) return;
    const points = this.to ? [...this.draft.points, this.to] : this.draft.points;
    this.place(this.draft.line, points);
  }

  // Starts drawing an area with a corner at (x, z), or adds the next corner.
  addCorner(x, z) {
    if (!this.draft) {
      this.unselect();
      this.draft = { kind: this.kind, points: [[x, z]] };
      this.draft.line = this.line(this.draft, false);
      return;
    }
    this.draft.points.push([x, z]);
    this.placeDraft();
  }

  // Takes the last corner of the area being drawn away.
  backCorner() {
    if (!this.draft) return;
    this.draft.points.pop();
    if (!this.draft.points.length) this.drop();
    else this.placeDraft();
  }

  // Keeps the area being drawn, when it has three corners or more, picked out.
  close() {
    if (!this.draft) return;
    const { kind, points } = this.draft;
    this.drop();
    if (points.length < this.fewest) return;
    this.save();
    const area = this.area(kind, points);
    this.areas.push(area);
    this.select(area);
    this.changed();
  }

  // Throws the area being drawn away.
  drop() {
    if (!this.draft) return;
    this.remove(this.draft.line);
    this.draft = null;
  }

  select(area) {
    if (area === this.selected) return;
    const was = this.selected;
    this.selected = area;
    for (const a of [was, area]) if (a) a.line.material = this.material(a.kind, a === area);
  }

  unselect() {
    this.select(null);
  }

  // Sets the kind new areas are, and the picked out or drawn area's.
  setKind(kind) {
    this.kind = kind;
    if (this.draft) {
      this.draft.kind = kind;
      this.draft.line.material = this.material(kind, false);
    }
    const area = this.selected;
    if (!area || area.kind === kind) return;
    this.save();
    area.kind = kind;
    area.line.material = this.material(kind, true);
    this.changed();
  }

  // Sets the picked out area's `key` (one of `extras`) to `value`.
  setExtra(key, value) {
    const area = this.selected;
    if (!area || area[key] === value) return;
    this.save();
    area[key] = value;
    this.changed();
  }

  // Adds an area of `kind` round `points`, on top. Gives it.
  addArea(kind, points) {
    this.save();
    const area = this.area(kind, points);
    this.areas.push(area);
    this.changed();
    return area;
  }

  // Adds an area of `kind` for each of `list`, its points and whatever else it keeps, as one
  // change. Gives them.
  addAreas(kind, list) {
    this.save();
    const areas = list.map(({ points, ...extras }) => this.area(kind, points, { ...this.start(points), ...extras }));
    this.areas.push(...areas);
    this.changed();
    return areas;
  }

  // Takes those of `areas` still there away, as one change.
  removeAreas(areas) {
    const gone = new Set(areas.filter((a) => this.areas.includes(a)));
    if (!gone.size) return;
    this.save();
    if (gone.has(this.selected)) this.unselect();
    for (const area of gone) this.remove(area.line);
    this.areas = this.areas.filter((a) => !gone.has(a));
    this.changed();
  }

  // Takes `area` away, if it's still there.
  removeArea(area) {
    if (!this.areas.includes(area)) return;
    this.save();
    if (this.selected === area) this.unselect();
    this.remove(area.line);
    this.areas = this.areas.filter((a) => a !== area);
    this.changed();
  }

  deleteSelected() {
    if (!this.selected) return;
    this.save();
    this.remove(this.selected.line);
    this.areas = this.areas.filter((a) => a !== this.selected);
    this.selected = null;
    this.changed();
  }

  // The area on top at (x, z), or null.
  at(x, z) {
    if (!this.closed) return null;
    for (let k = this.areas.length - 1; k >= 0; k--) if (inside(this.areas[k].points, x, z)) return this.areas[k];
    return null;
  }

  // Where (x, z) on the ground is on the canvas, in pixels, or null when it's behind.
  screen(camera, width, height, [x, z]) {
    const v = new THREE.Vector3(x, this.surface(x, z), z);
    if (v.clone().applyMatrix4(camera.matrixWorldInverse).z >= 0) return null;
    v.project(camera);
    return [((v.x + 1) / 2) * width, ((1 - v.y) / 2) * height];
  }

  // The picked out area's corner (k) or edge (k, from corner k to the next, and t along it) under
  // the canvas pixel (px, py), or null.
  pick(camera, width, height, px, py) {
    const area = this.selected;
    if (!area) return null;
    const on = area.points.map((p) => this.screen(camera, width, height, p));
    let best = null;
    on.forEach((p, k) => {
      const d = p && Math.hypot(p[0] - px, p[1] - py);
      if (p && d <= PICK_PX && (!best || d < best.d)) best = { corner: k, d };
    });
    if (best) return best;
    on.forEach((a, k) => {
      const b = on[(k + 1) % on.length];
      if (!a || !b || (!this.closed && k === on.length - 1)) return;
      const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
      const t = Math.min(1, Math.max(0, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy || 1)));
      const d = Math.hypot(a[0] + dx * t - px, a[1] + dy * t - py);
      if (d <= PICK_PX && (!best || d < best.d)) best = { edge: k, t, d };
    });
    return best;
  }

  // Starts dragging the picked out area's corner `k`.
  grab(k) {
    this.dragging = { area: this.selected, k, before: this.toJSON(), moved: false };
  }

  // Adds a corner on the picked out area's edge from corner `k`, at (x, z), and starts dragging it.
  split(k, x, z) {
    const before = this.toJSON();
    this.selected.points.splice(k + 1, 0, [x, z]);
    this.place(this.selected.line, this.selected.points);
    this.dragging = { area: this.selected, k: k + 1, before, moved: true };
  }

  // Takes the picked out area's corner `k` away, while it keeps three.
  removeCorner(k) {
    const area = this.selected;
    if (area.points.length <= this.fewest) return;
    this.save();
    area.points.splice(k, 1);
    this.place(area.line, area.points);
    this.changed();
  }

  drag(x, z) {
    const { area, k } = this.dragging;
    area.points[k] = [x, z];
    this.place(area.line, area.points);
    this.dragging.moved = true;
  }

  letGo() {
    if (this.dragging?.moved) {
      this.save(this.dragging.before);
      this.changed();
    }
    this.dragging = null;
  }

  clearHandles() {
    this.handles.getContext("2d").clearRect(0, 0, this.handles.width, this.handles.height);
  }

  // `eye` is where the camera is. `to` is where the pointer is on the ground, [x, z], or null.
  tick(dt, camera, width, height, to, active) {
    this.eye.copy(camera.position);
    for (const material of this.materials.values()) material.resolution.set(width, height);
    const before = this.to;
    this.to = this.draft ? to : null;
    if (this.draft && (before?.[0] !== this.to?.[0] || before?.[1] !== this.to?.[1])) this.placeDraft();
    if ((this.since += dt) >= LIFT_EVERY_S && this.shown) {
      this.since = 0;
      this.placeAll();
    }
    // Handles on the corners of the area picked out or being drawn, while the tool's picked.
    if (this.handles.width !== width || this.handles.height !== height) [this.handles.width, this.handles.height] = [width, height];
    this.clearHandles();
    const area = this.draft ?? this.selected;
    if (!active || !area) return;
    const c = this.handles.getContext("2d");
    c.fillStyle = this.colors[area.kind];
    c.strokeStyle = "#ffffff";
    c.lineWidth = 1.5;
    for (const p of area.points) {
      const s = this.screen(camera, width, height, p);
      if (!s) continue;
      c.fillRect(s[0] - HANDLE_PX / 2, s[1] - HANDLE_PX / 2, HANDLE_PX, HANDLE_PX);
      c.strokeRect(s[0] - HANDLE_PX / 2, s[1] - HANDLE_PX / 2, HANDLE_PX, HANDLE_PX);
    }
  }
}
