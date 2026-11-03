import * as THREE from "three";
import { TILE_COLUMNS, VOXEL_FT, allStone, carve, cellAt, reach, shapeBounds, snap } from "../v2/caves.js";
import { alert } from "./alerts.js";
import { setBrush } from "./caveMaterial.js";

// The caves' polish tools: hand edits to the rock of a cave network being polished (cavePlan.js),
// its 2 ft voxels changed where you aim, from inside it.
// - blocks: a click breaks the voxel aimed at, and a right-click places one against it, as the
//   button is let go and not where it dragged the camera round. The face aimed at, which it's
//   broken through or placed against, is outlined.
// - sculpt: the sphere, cube and upright cylinder brushes, sized with [ and ], carve as you drag,
//   or fill with the right button. The box brush spans two voxels clicked, the button of the
//   second saying whether it carves or fills; then [ and ] shrink and grow the face nearest
//   facing you, Enter works it, and Escape drops it.
// - smooth: each floor and ceiling moves toward the ones beside it, filling small hollows and
//   knocking off bumps. The blocks it would change are outlined as you aim.
// - flatten: levels floors, looking down, or ceilings, looking up, to the height the drag began
//   at.
// - paint: sets the rock without changing the shape.
// Smooth, flatten and paint work on the rock's surface within their size of where you aim, and
// that patch of it is lit. Blocks and sculpt carve and fill with the rock picked, or "same", the
// rock round where they work; paint with the rock picked. The number keys pick: 1 same, 2 to 5
// the rocks. Each click or drag undoes on its own, back UNDOS of them in each network. They all
// work within REACH_FT of the camera.

export const SHAPES = ["sphere", "cube", "cylinder", "box"];
export const TOOLS = ["caveBlocks", "caveSculpt", "caveSmooth", "caveFlatten", "cavePaint"];
const SURFACE = new Set(["caveSmooth", "caveFlatten", "cavePaint"]); // tools that work on the rock's surface
const OP_OF = { caveSmooth: "smooth", caveFlatten: "flatten", cavePaint: "paint" };
const SIZES = [1, 8]; // the brushes' radii, voxels
const ROCKS = 4;
const UNDOS = 10;
const REACH_FT = 64; // how far from the camera the tools work
const CLICK_PX = 5; // how far the pointer can move with a button down and still click
const GHOST_RGB = 0x7fffe6;
const ADD_RGB = 0xffa040; // smooth's outlines: blocks it fills
const [FACE_RGB, FACE_OPACITY] = [0x3d8bff, 0.7]; // the outline of the face blocks aims at
const FACE_OUT_FT = 0.05;
const $ = (id) => document.getElementById(id);
const voxelOf = (p) => p.map((v) => Math.floor(v / VOXEL_FT));
const middleOf = (voxel) => voxel.map((i) => (i + 0.5) * VOXEL_FT);

export class CavePolish {
  // ray(): the pointer's THREE.Raycaster, or null off the view.
  constructor({ scene, caves, layout, ray, camera }) {
    Object.assign(this, { caves, layout, ray, camera });
    this.tool = null; // one of TOOLS while it's picked
    this.brush = { shape: "sphere", size: 2, fill: null, paint: 0 }; // fill: the rock blocks and sculpt use, or null for the same
    this.stroke = null; // the drag being worked: { before, net, op, level, down, last }
    this.box = null; // the box brush's corners, { a, b, net, op }, voxels
    this.pressed = null; // a button down for a click: { button, x, y }
    this.undos = new Map(); // network -> the tiles each edit to it changed, as they were before it
    this.previewed = null; // what smooth's outlines were worked out for
    this.ghost = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: GHOST_RGB, depthTest: false, transparent: true, opacity: 0.8 }));
    this.adds = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: ADD_RGB, depthTest: false, transparent: true, opacity: 0.8 }));
    // Blocks outlines the face aimed at, which a block's broken through or placed against, hidden
    // behind rock as the rock is.
    this.face = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: FACE_RGB, transparent: true, opacity: FACE_OPACITY }));
    for (const lines of [this.ghost, this.adds, this.face]) {
      lines.renderOrder = 12;
      lines.frustumCulled = false;
      lines.visible = false;
      scene.add(lines);
    }
    this.bind();
  }

  bind() {
    for (const button of document.querySelectorAll("[data-polish-shape]")) button.addEventListener("click", () => this.set("shape", button.dataset.polishShape));
    $("polishSize").min = String(SIZES[0]);
    $("polishSize").max = String(SIZES[1]);
    $("polishSize").addEventListener("input", () => this.set("size", Number($("polishSize").value)));
    for (const button of document.querySelectorAll('[data-rocks="fill"] [data-rock]')) button.addEventListener("click", () => this.set("fill", button.dataset.rock === "same" ? null : Number(button.dataset.rock)));
    for (const button of document.querySelectorAll('[data-rocks="paint"] [data-rock]')) button.addEventListener("click", () => this.set("paint", Number(button.dataset.rock)));
    this.show();
  }

  set(key, value) {
    this.brush[key] = value;
    if (key === "shape") this.box = null;
    this.previewed = null;
    this.show();
  }

  // Picks a polish tool, or none.
  setTool(tool) {
    this.tool = tool;
    this.stroke = null;
    this.box = null;
    this.previewed = null;
    this.drawGhost(null);
  }

  // The options, as the brush is.
  show() {
    for (const button of document.querySelectorAll("[data-polish-shape]")) button.setAttribute("aria-pressed", String(button.dataset.polishShape === this.brush.shape));
    $("polishSize").value = String(this.brush.size);
    $("polishSizeOut").textContent = `${this.brush.size * VOXEL_FT} ft`;
    for (const button of document.querySelectorAll('[data-rocks="fill"] [data-rock]')) button.setAttribute("aria-pressed", String(button.dataset.rock === String(this.brush.fill ?? "same")));
    for (const button of document.querySelectorAll('[data-rocks="paint"] [data-rock]')) button.setAttribute("aria-pressed", String(Number(button.dataset.rock) === this.brush.paint));
  }

  // What the pointer's aimed at, within REACH_FT of the camera, or null: where it meets rock, the
  // voxel of rock there and of air before it, across the face between them, `out` of the rock,
  // the network that air's in, which way the ray looks, and whether it looks down.
  aim() {
    const ray = this.ray()?.ray;
    const hit = ray && this.caves.hit(ray);
    if (!hit || ray.origin.distanceTo(new THREE.Vector3(...hit)) > REACH_FT) return null;
    const way = ray.direction.toArray();
    const { rock, out } = faceAt(hit, way);
    const air = rock.map((v, k) => v + out[k]);
    const [x, y, z] = middleOf(air);
    const span = this.caves.spans(Math.floor(x / VOXEL_FT), Math.floor(z / VOXEL_FT))?.find((s) => s.floor <= y && y <= s.ceiling);
    return { hit, rock, air, out, net: span?.net ?? null, way, down: way[1] < 0 };
  }

  // Why an edit can't be made where `aimed` is, or null where it can.
  problem(aimed) {
    if (!aimed?.net) return `aim at a cave's rock within ${REACH_FT} ft, from inside it`;
    if (!this.layout.locked(aimed.net)) return `${aimed.net} is still in layout; you can't polish it until it's being polished`;
    return null;
  }

  // A button down: the left carves (or works a surface tool), the right fills. Blocks and the box
  // brush's corners wait for the button to be let go, and don't if it's dragged the camera round.
  down(e) {
    if (this.tool === "caveBlocks" || (this.tool === "caveSculpt" && this.brush.shape === "box")) {
      this.pressed = { button: e.button, x: e.clientX, y: e.clientY };
      return;
    }
    const aimed = this.aim();
    const problem = this.problem(aimed);
    if (problem) return alert(problem);
    const op = OP_OF[this.tool] ?? (e.button === 2 ? "fill" : "carve");
    if (e.button === 2 && SURFACE.has(this.tool)) return;
    this.stroke = { before: new Map(), net: aimed.net, op, level: snap(aimed.hit[1]), down: aimed.down, last: null };
    this.strokeAt(aimed);
  }

  // A click of blocks or the box brush, button `button`.
  click(button) {
    const aimed = this.aim();
    const problem = this.problem(aimed);
    if (problem) return alert(problem);
    const op = button === 2 ? "fill" : "carve";
    if (this.tool === "caveBlocks") {
      const at = middleOf(op === "fill" ? aimed.air : aimed.rock);
      const cube = { kind: "box", at, half: [0.9, 0.9, 0.9], yaw: 0 };
      return this.remember(aimed.net, this.work(cube, op, aimed.net, null, { exact: true }));
    }
    if (!this.box || this.box.b) this.box = { a: aimed.rock, b: null, net: aimed.net, op };
    else Object.assign(this.box, { b: aimed.rock, op });
    this.drawGhost(aimed);
  }

  move() {
    if (!this.tool) return;
    const aimed = this.aim();
    if (this.stroke && aimed) this.strokeAt(aimed);
    this.drawGhost(aimed);
  }

  // A button let go, at pointer event `e`.
  up(e) {
    const pressed = this.pressed;
    this.pressed = null;
    if (pressed && e && e.button === pressed.button && Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) < CLICK_PX) this.click(pressed.button);
    if (!this.stroke) return;
    if (this.stroke.before.size) this.remember(this.stroke.net, this.stroke.before);
    this.stroke = null;
    this.previewed = null;
  }

  // Works the brush at `aimed` in a drag, once it's moved far enough from where it last worked.
  strokeAt(aimed) {
    const { last } = this.stroke;
    if (last && Math.hypot(...aimed.hit.map((v, k) => v - last[k])) < Math.max(VOXEL_FT, this.brush.size)) return;
    this.stroke.last = aimed.hit;
    // Smooth works round the block aimed at, as its outlines show.
    const at = this.tool === "caveSmooth" ? middleOf(aimed.rock) : aimed.hit;
    const before = this.work(this.shapeAt(at), this.stroke.op, this.stroke.net, this.stroke);
    for (const [key, columns] of before ?? []) if (!this.stroke.before.has(key)) this.stroke.before.set(key, columns);
  }

  // The brush's shape round continent feet `at`: a sphere for the surface tools.
  shapeAt(at) {
    const r = this.brush.size * VOXEL_FT;
    const shape = SURFACE.has(this.tool) ? "sphere" : this.brush.shape;
    if (shape === "sphere") return { kind: "sphere", at, radius: r };
    if (shape === "cylinder") return { kind: "cylinder", at, radius: r, half: [r, r, r] };
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

  // Works `op` in `shape`, in network `net`, `exact`ly for a block (changeRock's): gives the tiles it
  // changed as they were, or null.
  work(shape, op, net, stroke = null, { exact = false } = {}) {
    const before = this.caves.edit((columnsOf) => changeRock(columnsOf, shape, op, net, { groundAt: this.groundAt(), fill: this.brush.fill, paint: this.brush.paint, stroke, exact }));
    if (this.caves.refused) alert(this.caves.refused);
    return before;
  }

  // The ground's height in column (ci, cj), or null where there's none.
  groundAt() {
    return (ci, cj) => this.caves.groundFine(ci, cj);
  }

  // Keeps `before`, as an edit to network `net` gave it, to undo.
  remember(net, before) {
    if (!before) return;
    if (!this.undos.has(net)) this.undos.set(net, []);
    const undos = this.undos.get(net);
    undos.push(before);
    if (undos.length > UNDOS) undos.shift();
  }

  // Undoes the last hand edit to network `net`: gives false where there's none.
  undo(net) {
    const before = this.undos.get(net)?.pop();
    if (!before) return false;
    this.caves.restore(before);
    this.previewed = null;
    return true;
  }

  // Gives whether it took the key.
  key(e) {
    const rock = Number(e.key) - 2;
    if (/^[1-5]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (this.tool === "cavePaint" && rock >= 0) this.set("paint", rock);
      else if (this.tool === "caveBlocks" || this.tool === "caveSculpt") this.set("fill", rock < 0 ? null : rock);
      return true;
    }
    if ((e.key === "[" || e.key === "]") && this.tool !== "caveBlocks") {
      const grow = e.key === "]" ? 1 : -1;
      if (this.tool === "caveSculpt" && this.brush.shape === "box" && this.box?.b) this.growBox(grow);
      else this.set("size", Math.max(SIZES[0], Math.min(SIZES[1], this.brush.size + grow)));
      this.drawGhost(this.aim());
      return true;
    }
    if (e.key === "Enter" && this.boxShape()) {
      this.remember(this.box.net, this.work(this.boxShape(), this.box.op, this.box.net));
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
    if (this.tool) this.drawGhost(this.aim());
  }

  // Shows what the tool works on: the voxel, the box or the sculpting brush outlined; for the
  // surface tools, the patch of rock lit, and for smooth, the blocks it would change outlined.
  drawGhost(aimed) {
    let geometry = null;
    let face = null;
    const box = this.boxShape();
    const surface = SURFACE.has(this.tool);
    const r = this.brush.size * VOXEL_FT;
    if (this.tool === "caveSculpt" && this.brush.shape === "box" && (box || this.box)) {
      const shape = box ?? { at: middleOf(this.box.a), half: [1, 1, 1] };
      geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(...shape.half.map((v) => v * 2 + 0.2))).translate(...shape.at);
    } else if (aimed && !surface && this.tool) {
      if (this.tool === "caveBlocks") face = faceGeometry(aimed);
      else if (this.brush.shape === "box") geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(VOXEL_FT, VOXEL_FT, VOXEL_FT)).translate(...middleOf(aimed.rock));
      else if (this.brush.shape === "sphere") geometry = new THREE.WireframeGeometry(new THREE.SphereGeometry(r, 12, 8)).translate(...aimed.hit);
      else if (this.brush.shape === "cylinder") geometry = new THREE.EdgesGeometry(new THREE.CylinderGeometry(r, r, r * 2, 16)).translate(...aimed.hit);
      else geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(r * 2, r * 2, r * 2)).translate(...aimed.hit);
    }
    if (surface && aimed) setBrush(this.caves.material, aimed.hit, aimed.way.map((v) => -v), r);
    else setBrush(this.caves.material, null);
    let adds = null;
    const kept = new Set([this.ghost.geometry, this.adds.geometry]);
    if (this.tool === "caveSmooth" && aimed?.net && !this.stroke) {
      const key = `${aimed.rock} ${this.brush.size} ${this.caves.version}`;
      if (key !== this.previewed?.key) this.previewed = { key, ...this.smoothPreview(this.shapeAt(middleOf(aimed.rock)), aimed.net) };
      geometry = this.previewed.removes;
      adds = this.previewed.adds;
    }
    for (const old of kept) if (old !== geometry && old !== adds) old.dispose();
    this.ghost.geometry = geometry ?? new THREE.BufferGeometry();
    this.ghost.visible = Boolean(geometry);
    this.adds.geometry = adds ?? new THREE.BufferGeometry();
    this.adds.visible = Boolean(adds);
    this.face.geometry.dispose();
    this.face.geometry = face ?? new THREE.BufferGeometry();
    this.face.visible = Boolean(face);
  }

  // The blocks smoothing `shape` in network `net` would change, worked out on copies of the
  // tiles: { removes, adds }, outlines of the blocks it opens and fills, or null for none.
  smoothPreview(shape, net) {
    const copies = new Map();
    const columnsOf = (tx, tz) => {
      const key = `${tx},${tz}`;
      if (!copies.has(key)) copies.set(key, this.caves.tiles.get(key)?.slice() ?? null);
      return copies.get(key);
    };
    reshape(shape, columnsOf, (spans, low, high, around) => smooth(spans, low, high, net, around));
    const [opened, filled] = [[], []];
    for (const [key, columns] of copies) {
      const was = this.caves.tiles.get(key);
      if (!columns || !was) continue;
      const [tx, tz] = key.split(",").map(Number);
      columns.forEach((now, k) => {
        if (now === was[k]) return;
        const [ci, cj] = [tx * TILE_COLUMNS + (k % TILE_COLUMNS), tz * TILE_COLUMNS + Math.floor(k / TILE_COLUMNS)];
        const air = (spans, y) => (spans ?? []).some((s) => s.floor <= y && y < s.ceiling);
        const all = [...(now ?? []), ...(was[k] ?? [])];
        const [low, high] = [Math.min(...all.map((s) => s.floor)), Math.max(...all.map((s) => s.ceiling))];
        for (let y = low; y < high; y += VOXEL_FT) {
          const [before, after] = [air(was[k], y), air(now, y)];
          if (before !== after) (after ? opened : filled).push([ci, Math.floor(y / VOXEL_FT), cj]);
        }
      });
    }
    return { removes: outlines(opened), adds: outlines(filled) };
  }
}

// The face of the rock a ray the way `way` meets at `hit`, on the voxels' grid: the voxel of rock,
// and which way `out` of it the face looks, the grid plane nearest the hit the one it's on.
export function faceAt(hit, way) {
  const off = hit.map((v) => Math.abs(v / VOXEL_FT - Math.round(v / VOXEL_FT)));
  const axis = [0, 1, 2].reduce((best, k) => (off[k] < off[best] ? k : best), 0);
  const out = [0, 0, 0];
  out[axis] = way[axis] > 0 ? -1 : 1;
  const rock = voxelOf(hit.map((v, k) => v + way[k] * 0.01));
  rock[axis] = Math.round(hit[axis] / VOXEL_FT) - (out[axis] > 0 ? 1 : 0);
  return { rock, out };
}

// The outline of the face `aimed` gives, a square on the voxels' grid, as a geometry.
function faceGeometry({ rock, out }) {
  const axis = out.findIndex((v) => v !== 0);
  const [u, v] = [0, 1, 2].filter((k) => k !== axis);
  // A hair out into the air, so it's over the blocks' edges.
  const plane = (rock[axis] + (out[axis] > 0 ? 1 : 0)) * VOXEL_FT + out[axis] * FACE_OUT_FT;
  const corners = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([a, b]) => {
    const p = [0, 0, 0];
    p[axis] = plane;
    p[u] = (rock[u] + a) * VOXEL_FT;
    p[v] = (rock[v] + b) * VOXEL_FT;
    return p;
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 1, 1, 2, 2, 3, 3, 0].flatMap((n) => corners[n]), 3));
  return geometry;
}

// The edges of `voxels`, each [i, j, k] (x, height, z), as one geometry, or null for none.
function outlines(voxels) {
  if (!voxels.length) return null;
  const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(VOXEL_FT, VOXEL_FT, VOXEL_FT)).getAttribute("position").array;
  const positions = new Float32Array(edges.length * voxels.length);
  voxels.forEach(([i, j, k], n) => {
    const [x, y, z] = middleOf([i, j, k]);
    for (let p = 0; p < edges.length; p += 3) positions.set([edges[p] + x, edges[p + 1] + y, edges[p + 2] + z], n * edges.length + p);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return geometry;
}

// Works `op` in `shape` on the columns columnsOf gives, in network `net`, as Caves.edit takes it:
// carve opens air, with the rock `fill` or, null, that of the air it's dug from; fill fills rock,
// then gives the air round what it filled the rock `fill`, if there is one, leaving air however
// thin `exact`ly (carve's); smooth, flatten (to
// the `stroke`'s level) and paint (with the rock `paint`) reshape the spans. Gives the "tx,tz" of
// the tiles changed.
export function changeRock(columnsOf, shape, op, net, { groundAt, fill = null, paint = 0, stroke = null, exact = false }) {
  if (op === "carve") return carve(shape, columnsOf, groundAt, fill === null ? { net, mouth: false } : { net, mouth: false, stone: allStone(fill), own: true });
  if (op === "fill") {
    const changed = carve(shape, columnsOf, groundAt, { fill: true, exact });
    if (fill === null || !changed.size) return changed;
    const round = { ...shape };
    if (shape.radius) round.radius = shape.radius + VOXEL_FT;
    if (shape.half) round.half = shape.half.map((v) => v + VOXEL_FT);
    const stone = allStone(fill);
    for (const key of reshape(round, columnsOf, (spans, low, high) => spans.map((s) => (s.net === net && s.ceiling >= low && s.floor <= high ? { ...s, stone } : s)))) changed.add(key);
    return changed;
  }
  return reshape(shape, columnsOf, (spans, low, high, around) => {
    if (op === "paint") return spans.map((s) => (s.net === net && s.ceiling > low && s.floor < high ? { ...s, stone: allStone(paint) } : s));
    if (op === "flatten") return flatten(spans, low, high, net, stroke?.level ?? snap((low + high) / 2), stroke?.down ?? true);
    return smooth(spans, low, high, net, around);
  });
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
