import * as THREE from "three";
import { VOXEL_FT, allStone, carve, cellAt, reach, shapeBounds, snap } from "../v2/caves.js";

// The caves' polish tool: hand edits to the rock of a burned in cave network (cavePlan.js), its
// 2 ft voxels changed where you aim, from inside it. With the voxel brush a click breaks the
// voxel aimed at and a right-click places one against it. The sphere, cube and upright cylinder
// brushes, sized in voxels with [ and ], work as you drag. The box brush spans two voxels
// clicked; then [ and ] shrink and grow the face nearest facing you, Enter works it, and Escape
// drops it. What the brushes do:
// - carve: opens air, taking the stone of the air it's dug from.
// - fill: fills rock.
// - smooth: each floor and ceiling moves toward the ones beside it, filling small hollows and
//   knocking off bumps.
// - paint: sets the rock without changing the shape.
// - flatten: levels floors, looking down, or ceilings, looking up, to the height the drag began
//   at.
// Each click or drag undoes on its own, back UNDOS of them.

export const SHAPES = ["voxel", "sphere", "cube", "cylinder", "box"];
export const OPS = ["carve", "fill", "smooth", "paint", "flatten"];
const SIZES = [1, 8]; // the brushes' radii, voxels
const UNDOS = 10;
const GHOST_RGB = 0x7fffe6;
const $ = (id) => document.getElementById(id);
const voxelOf = (p) => p.map((v) => Math.floor(v / VOXEL_FT));
const middleOf = (voxel) => voxel.map((i) => (i + 0.5) * VOXEL_FT);

export class CavePolish {
  // ray(): the pointer's THREE.Raycaster, or null off the view.
  constructor({ scene, caves, layout, ray, camera }) {
    Object.assign(this, { caves, layout, ray, camera });
    this.on = false;
    this.brush = { shape: "voxel", op: "carve", size: 2, rock: 0 };
    this.stroke = null; // the drag being worked: { before, net, level, last }
    this.box = null; // the box brush's corners, { a, b, net }, voxels
    this.undos = [];
    this.ghost = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: GHOST_RGB, depthTest: false, transparent: true, opacity: 0.8 }));
    this.ghost.renderOrder = 12;
    this.ghost.frustumCulled = false;
    this.ghost.visible = false;
    scene.add(this.ghost);
    this.bind();
  }

  bind() {
    for (const button of document.querySelectorAll("[data-polish-shape]")) button.addEventListener("click", () => this.set("shape", button.dataset.polishShape));
    for (const button of document.querySelectorAll("[data-polish-op]")) button.addEventListener("click", () => this.set("op", button.dataset.polishOp));
    $("polishSize").min = String(SIZES[0]);
    $("polishSize").max = String(SIZES[1]);
    $("polishSize").addEventListener("input", () => this.set("size", Number($("polishSize").value)));
    $("polishRock").addEventListener("change", () => this.set("rock", Number($("polishRock").value)));
    $("polishUndo").addEventListener("click", () => this.undo());
    this.show();
  }

  set(key, value) {
    this.brush[key] = value;
    if (key === "shape") this.box = null;
    this.show();
  }

  setTool(on) {
    this.on = on;
    this.stroke = null;
    this.box = null;
    this.ghost.visible = false;
  }

  status(text) {
    $("polishStatus").textContent = text;
  }

  // The panel, as the brush is.
  show() {
    for (const button of document.querySelectorAll("[data-polish-shape]")) button.setAttribute("aria-pressed", String(button.dataset.polishShape === this.brush.shape));
    for (const button of document.querySelectorAll("[data-polish-op]")) button.setAttribute("aria-pressed", String(button.dataset.polishOp === this.brush.op));
    $("polishSize").value = String(this.brush.size);
    $("polishSizeOut").textContent = `${this.brush.size * VOXEL_FT} ft`;
    $("polishRock").value = String(this.brush.rock);
  }

  // What the pointer's aimed at: where it meets rock, the voxel of rock there and of air before
  // it, the network that air's in, and whether it looks down.
  aim() {
    const ray = this.ray()?.ray;
    const hit = ray && this.caves.hit(ray);
    if (!hit) return null;
    const way = ray.direction.toArray();
    const air = voxelOf(hit.map((v, k) => v - way[k] * 0.5));
    const [x, y, z] = middleOf(air);
    const span = this.caves.spans(Math.floor(x / VOXEL_FT), Math.floor(z / VOXEL_FT))?.find((s) => s.floor <= y && y <= s.ceiling);
    return { hit, rock: voxelOf(hit.map((v, k) => v + way[k] * 0.5)), air, net: span?.net ?? null, down: way[1] < 0 };
  }

  // Why an edit can't be made where `aimed` is, or null where it can.
  problem(aimed) {
    if (!aimed?.net) return "aim at a cave's rock, from inside it";
    if (!this.layout.locked(aimed.net)) return `${aimed.net} is still in layout; you can't polish it until it's being polished`;
    return null;
  }

  // The left button down, or the right with the voxel brush.
  down(e) {
    const aimed = this.aim();
    const problem = this.problem(aimed);
    if (problem) return this.status(problem);
    this.status("");
    const { shape } = this.brush;
    if (shape === "voxel") {
      const at = middleOf(e.button === 2 ? aimed.air : aimed.rock);
      const cube = { kind: "box", at, half: [0.9, 0.9, 0.9], yaw: 0 };
      return this.remember(this.work(cube, e.button === 2 ? "fill" : "carve", aimed.net));
    }
    if (shape === "box") {
      if (!this.box || this.box.b) this.box = { a: aimed.rock, b: null, net: aimed.net };
      else this.box.b = aimed.rock;
      return this.drawGhost(aimed);
    }
    this.stroke = { before: new Map(), net: aimed.net, level: snap(aimed.hit[1]), down: aimed.down, last: null };
    this.strokeAt(aimed);
  }

  move() {
    if (!this.on) return;
    const aimed = this.aim();
    if (this.stroke && aimed) this.strokeAt(aimed);
    this.drawGhost(aimed);
  }

  up() {
    if (!this.stroke) return;
    if (this.stroke.before.size) this.remember(this.stroke.before);
    this.stroke = null;
  }

  // Works the brush at `aimed` in a drag, once it's moved far enough from where it last worked.
  strokeAt(aimed) {
    const { last } = this.stroke;
    if (last && Math.hypot(...aimed.hit.map((v, k) => v - last[k])) < Math.max(VOXEL_FT, this.brush.size)) return;
    this.stroke.last = aimed.hit;
    const before = this.work(this.shapeAt(aimed.hit), this.brush.op, this.stroke.net, this.stroke);
    for (const [key, columns] of before ?? []) if (!this.stroke.before.has(key)) this.stroke.before.set(key, columns);
  }

  // The brush's shape round continent feet `at`.
  shapeAt(at) {
    const r = this.brush.size * VOXEL_FT;
    if (this.brush.shape === "sphere") return { kind: "sphere", at, radius: r };
    if (this.brush.shape === "cylinder") return { kind: "cylinder", at, radius: r, half: [r, r, r] };
    return { kind: "box", at, half: [r, r, r], yaw: 0 };
  }

  // The box brush's box, as a shape, or null till both its corners are marked.
  boxShape() {
    if (!this.box?.b) return null;
    const { a, b } = this.box;
    const low = a.map((v, k) => Math.min(v, b[k]) * VOXEL_FT);
    const high = a.map((v, k) => (Math.max(v, b[k]) + 1) * VOXEL_FT);
    return { kind: "box", at: low.map((v, k) => (v + high[k]) / 2), half: low.map((v, k) => (high[k] - v) / 2 - 0.1), yaw: 0 };
  }

  // Works `op` in `shape`, in network `net`: gives the tiles it changed as they were, or null.
  work(shape, op, net, stroke = null) {
    const groundAt = (ci, cj) => (Number.isFinite(this.caves.groundCell(ci, cj)) ? this.caves.groundCell(ci, cj) : null);
    const stone = allStone(this.brush.rock);
    const before = this.caves.edit((columnsOf) => {
      if (op === "carve") return carve(shape, columnsOf, groundAt, { net, mouth: false });
      if (op === "fill") return carve(shape, columnsOf, groundAt, { fill: true });
      return reshape(shape, columnsOf, (spans, low, high, around) => {
        if (op === "paint") return spans.map((s) => (s.net === net && s.ceiling > low && s.floor < high ? { ...s, stone } : s));
        if (op === "flatten") return flatten(spans, low, high, net, stroke?.level ?? snap((low + high) / 2), stroke?.down ?? true);
        return smooth(spans, low, high, net, around);
      });
    });
    if (this.caves.refused) this.status(this.caves.refused);
    return before;
  }

  remember(before) {
    if (!before) return;
    this.undos.push(before);
    if (this.undos.length > UNDOS) this.undos.shift();
  }

  undo() {
    const before = this.undos.pop();
    if (!before) return this.status("nothing to undo");
    this.caves.restore(before);
  }

  // Gives whether it took the key.
  key(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      this.undo();
      return true;
    }
    if (e.key === "[" || e.key === "]") {
      const grow = e.key === "]" ? 1 : -1;
      if (this.brush.shape === "box" && this.box?.b) this.growBox(grow);
      else this.set("size", Math.max(SIZES[0], Math.min(SIZES[1], this.brush.size + grow)));
      this.drawGhost(this.aim());
      return true;
    }
    if (e.key === "Enter" && this.boxShape()) {
      this.remember(this.work(this.boxShape(), this.brush.op, this.box.net, { level: snap(this.boxShape().at[1] - this.boxShape().half[1]), down: true }));
      return true;
    }
    if (e.key === "Escape" && this.box) {
      this.box = null;
      this.drawGhost(this.aim());
      return true;
    }
    return false;
  }

  // Moves the box's face nearest facing the camera out a voxel (grow 1), or in (-1).
  growBox(grow) {
    const facing = this.camera.getWorldDirection(new THREE.Vector3()).toArray();
    const axis = [0, 1, 2].reduce((best, k) => (Math.abs(facing[k]) > Math.abs(facing[best]) ? k : best), 0);
    const { a, b } = this.box;
    // The face toward the camera is the low one where the camera looks the positive way.
    const lowSide = facing[axis] > 0;
    const [lo, hi] = a[axis] <= b[axis] ? [a, b] : [b, a];
    if (lowSide) lo[axis] = Math.min(hi[axis], lo[axis] - grow);
    else hi[axis] = Math.max(lo[axis], hi[axis] + grow);
  }

  tick() {
    if (this.on) this.drawGhost(this.aim());
  }

  // Outlines what the brush works on: the voxel or box, or the brush round where it's aimed.
  drawGhost(aimed) {
    let geometry = null;
    const box = this.boxShape();
    if (this.brush.shape === "box" && (box || this.box)) {
      const shape = box ?? { at: middleOf(this.box.a), half: [1, 1, 1] };
      geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(...shape.half.map((v) => v * 2 + 0.2))).translate(...shape.at);
    } else if (aimed) {
      const r = this.brush.size * VOXEL_FT;
      if (this.brush.shape === "voxel") geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(VOXEL_FT, VOXEL_FT, VOXEL_FT)).translate(...middleOf(aimed.rock));
      else if (this.brush.shape === "box") geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(VOXEL_FT, VOXEL_FT, VOXEL_FT)).translate(...middleOf(aimed.rock));
      else if (this.brush.shape === "sphere") geometry = new THREE.WireframeGeometry(new THREE.SphereGeometry(r, 12, 8)).translate(...aimed.hit);
      else if (this.brush.shape === "cylinder") geometry = new THREE.EdgesGeometry(new THREE.CylinderGeometry(r, r, r * 2, 16)).translate(...aimed.hit);
      else geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(r * 2, r * 2, r * 2)).translate(...aimed.hit);
    }
    this.ghost.geometry.dispose();
    this.ghost.geometry = geometry ?? new THREE.BufferGeometry();
    this.ghost.visible = Boolean(geometry);
  }
}

// Reshapes each column `shape` covers, by change(spans, low, high, around): its spans, the
// height the shape covers there, and around(), the spans of the four columns beside it as they
// were before. Gives the "tx,tz" of the tiles changed.
export function reshape(shape, columnsOf, change) {
  const [x0, z0, x1, z1] = shapeBounds(shape);
  const before = new Map();
  const spansAt = (ci, cj) => {
    const key = `${ci},${cj}`;
    if (!before.has(key)) {
      const found = cellAt(columnsOf, ci, cj, false);
      before.set(key, found?.columns[found.k] ?? null);
    }
    return before.get(key);
  };
  const changes = [];
  for (let cj = Math.floor(z0 / VOXEL_FT); cj <= Math.floor(z1 / VOXEL_FT); cj++) {
    for (let ci = Math.floor(x0 / VOXEL_FT); ci <= Math.floor(x1 / VOXEL_FT); ci++) {
      const r = reach(shape, (ci + 0.5) * VOXEL_FT, (cj + 0.5) * VOXEL_FT);
      const spans = r && spansAt(ci, cj);
      if (!spans?.length) continue;
      const around = () => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => spansAt(ci + a, cj + b) ?? []);
      const next = change(spans, snap(r[0]), snap(r[1]), around);
      if (JSON.stringify(next) !== JSON.stringify(spans)) changes.push({ ci, cj, next });
    }
  }
  const changed = new Set();
  for (const { ci, cj, next } of changes) {
    const found = cellAt(columnsOf, ci, cj, false);
    found.columns[found.k] = next.length ? next : null;
    changed.add(found.key);
  }
  return changed;
}

// A column's spans with their floors (`down`) or ceilings within low to high moved to `level`,
// for those in `net`, keeping at least a voxel of air and not running into the span beside.
export function flatten(spans, low, high, net, level, down) {
  return spans.map((s, i) => {
    if (s.net !== net) return s;
    if (down && s.floor >= low && s.floor <= high) {
      const under = spans[i - 1]?.ceiling ?? -Infinity;
      const floor = Math.max(level, under);
      return s.ceiling - floor >= VOXEL_FT ? { ...s, floor } : s;
    }
    if (!down && s.ceiling >= low && s.ceiling <= high) {
      const over = spans[i + 1]?.floor ?? Infinity;
      const ceiling = Math.min(level, over);
      return ceiling - s.floor >= VOXEL_FT ? { ...s, ceiling } : s;
    }
    return s;
  });
}

// A column's spans with each floor and ceiling within low to high, for those in `net`, moved to
// the middle value of its own and those of the spans it meets beside it.
export function smooth(spans, low, high, net, around) {
  const beside = around();
  const middle = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    return snap(sorted[Math.floor(sorted.length / 2)]);
  };
  return spans.map((s) => {
    if (s.net !== net || s.ceiling < low || s.floor > high) return s;
    const met = beside.map((column) => column.find((o) => o.ceiling > s.floor && o.floor < s.ceiling)).filter(Boolean);
    if (!met.length) return s;
    const floor = s.floor >= low ? middle([s.floor, ...met.map((o) => o.floor)]) : s.floor;
    const ceiling = s.ceiling <= high ? middle([s.ceiling, ...met.map((o) => o.ceiling)]) : s.ceiling;
    return ceiling - floor >= VOXEL_FT ? { ...s, floor, ceiling } : s;
  });
}
