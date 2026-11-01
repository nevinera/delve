import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { ARC_DEFAULTS, ARC_FT, NODE_DEFAULTS, NODE_SIZES, STEEP_DEG, arcCurve, arcSteepness } from "./caveLayout.js";

// The caves' plan tools, in the earth: chamber places rooms (nodes) on the points of the grid
// round the camera, or an opening on the ground where the pointer meets it from under it, and
// drags them elsewhere; tunnel joins two rooms with a tunnel (an arc), clicked one then the other,
// and drags a selected tunnel's bends to curve it. Both select: a click picks one, shift-click
// adds or takes away, and shift-drag boxes them in. The panel shows the details of what's
// selected, to change all of it at once, or of what's placed next. Nothing's carved yet. Each
// change undoes on its own.
//
// The plan's drawn as glowing blue lines, as thick, in feet, as what they stand for is big, so
// they thin with distance: a room as a ring on its floor and a stalk as high as it is, a tunnel
// along its line.

const SNAP_FT = 64; // how far from the camera points snap
const SNAP_PX = 14; // and how near the pointer
const FAR_PX = 60; // or failing that, how near it at most
const PICK_PX = 10; // how near the pointer a node, bend or arc is picked
const SHALLOW_FT = 16; // grid points nearer the ground than this aren't snapped to: the ground is
const BOX_PX = 4; // how far a shift-drag goes before it's a box
const CORE_RGB = [0.3, 0.65, 1];
const GLOW_RGB = [0.05, 0.18, 0.7];
const SELECTED_RGB = [1, 0.88, 0.3];
const START_RGB = [0.5, 1, 0.63];
const STEEP_RGB = [1, 0.25, 0.2];
const OPENING_RGB = [0.45, 1, 0.9];
const GLOW = 3; // how much wider the glow is than the line
const UNDOS = 100;
const $ = (id) => document.getElementById(id);

// How thick, in feet, a room's lines are, and a tunnel's.
const nodeLine = (node) => Math.max(0.25, NODE_SIZES[node.size] / 64);
const arcLine = (arc) => Math.max(0.25, arc.size / 20);

export class CavePlan {
  // ray(): the pointer's THREE.Raycaster, or null off the view. groundHit(): where the pointer
  // meets the ground, [x, y, z], or null. groundAt(x, z): the ground's height.
  constructor({ scene, camera, canvas, layout, ray, groundHit, groundAt }) {
    Object.assign(this, { scene, camera, canvas, layout, ray, groundHit, groundAt });
    this.tool = null; // "chamber" or "tunnel" while one's picked
    this.selected = new Set(); // the ids of the nodes and arcs selected
    this.focus = null; // the one selected last, whose details show
    this.start = null; // the node a tunnel's being drawn from
    this.hover = null; // the grid point or ground the pointer snaps to, { at, opening }
    this.drag = null; // { id, bend } or { id } for a node, with the layout as it was, while dragging
    this.box = null; // { from, to } in pixels, while shift-dragging a box
    this.history = []; // the layout as it was before each change, latest last
    this.details = { node: { ...NODE_DEFAULTS }, arc: { ...ARC_DEFAULTS } };
    this.drawn = null; // what the drawing was made from

    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.snapMark = new THREE.Mesh(new THREE.OctahedronGeometry(1), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.9 }));
    this.snapMark.renderOrder = 11;
    this.group.add(this.snapMark);
    this.drawing = new THREE.Group();
    this.group.add(this.drawing);
    this.materials = new Map(); // "width,glow" -> LineMaterial
    this.label = document.createElement("div");
    this.label.className = "create-plan-label";
    this.label.hidden = true;
    canvas.parentElement.append(this.label);
    this.boxEl = document.createElement("div");
    this.boxEl.className = "create-box";
    this.boxEl.hidden = true;
    document.body.append(this.boxEl);
    this.bind();
  }

  bind() {
    const changeDetail = (key, value) => {
      const kind = this.kind();
      const picked = [...this.selected].map((id) => this.layout.get(id)).filter(Boolean);
      if (!picked.length) return (this.details[kind][key] = value);
      // Sizes and shapes are a room's or a tunnel's own; an opening's shape is always that.
      const takes = (e) => (key !== "size" && key !== "shape") || (kindOf(e) === kind && !(key === "shape" && isOpening(e)));
      const changing = picked.filter((e) => takes(e) && e[key] !== value);
      if (!changing.length) return;
      this.remember();
      for (const e of changing) e[key] = value;
      this.layout.version++;
    };
    $("planRock").addEventListener("change", () => changeDetail("rock", Number($("planRock").value)));
    $("planHewn").addEventListener("change", () => changeDetail("hewn", $("planHewn").checked));
    $("planArcSize").addEventListener("input", () => changeDetail("size", Number($("planArcSize").value)));
    for (const button of document.querySelectorAll("[data-plan-size]")) button.addEventListener("click", () => changeDetail("size", button.dataset.planSize));
    for (const button of document.querySelectorAll("[data-plan-shape]")) button.addEventListener("click", () => changeDetail("shape", button.dataset.planShape));
    for (const button of document.querySelectorAll("[data-plan-style]")) button.addEventListener("click", () => changeDetail("style", button.dataset.planStyle));
    $("planDelete").addEventListener("click", () => this.deleteSelected());
    $("planUndo").addEventListener("click", () => this.undo());
    $("planArcSize").min = String(ARC_FT[0]);
    $("planArcSize").max = String(ARC_FT[1]);
  }

  // Whether the details shown are a node's or an arc's: what was selected last, or the tool's.
  kind() {
    const focus = this.focus && this.layout.get(this.focus);
    if (focus) return kindOf(focus);
    return this.tool === "tunnel" ? "arc" : "node";
  }

  // Picks a plan tool, or none.
  setTool(tool) {
    this.tool = tool;
    this.start = null;
    this.drag = null;
    this.box = null;
    this.boxEl.hidden = true;
    this.hover = null;
    if (!tool) this.label.hidden = true;
  }

  remember() {
    this.history.push(this.layout.toJSON());
    if (this.history.length > UNDOS) this.history.shift();
  }

  undo() {
    const last = this.history.pop();
    if (!last) return this.status("nothing to undo");
    const carved = this.layout.carved;
    this.layout.nodes.clear();
    this.layout.arcs.clear();
    this.layout.load(last);
    this.layout.carved = carved;
    for (const id of [...this.selected]) if (!this.layout.get(id)) this.selected.delete(id);
    this.status("");
  }

  deleteSelected() {
    if (!this.selected.size) return;
    this.remember();
    for (const id of this.selected) this.layout.remove(id);
    this.select(null);
  }

  status(text) {
    $("planStatus").textContent = text;
  }

  // Where `p` (continent feet) is on the canvas, [x, y] in pixels, or null behind the camera.
  screen(p) {
    const v = new THREE.Vector3(...p).project(this.camera);
    if (v.z > 1) return null;
    return [((v.x + 1) / 2) * this.canvas.clientWidth, ((1 - v.y) / 2) * this.canvas.clientHeight];
  }

  pointerPx(e) {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  // Where a room at the pointer at [px, py] goes: the grid point it snaps to, of those SHALLOW_FT
  // and more under the ground within SNAP_FT of the camera and SNAP_PX of the pointer, the one nearest the camera, or
  // where none is that near the pointer, the nearest to it within FAR_PX; or an opening, where the
  // pointer meets the ground before that point. { at, opening }, or null.
  snap([px, py]) {
    const c = this.camera.position;
    const n = SNAP_FT / 8;
    const [bx, by, bz] = [Math.round(c.x / 8), Math.round(c.y / 8), Math.round(c.z / 8)];
    let [best, nearest] = [null, null];
    for (let i = -n; i <= n; i++) {
      for (let j = -n; j <= n; j++) {
        for (let k = -n; k <= n; k++) {
          const p = [(bx + i) * 8, (by + j) * 8, (bz + k) * 8];
          const d = Math.hypot(p[0] - c.x, p[1] - c.y, p[2] - c.z);
          if (d > SNAP_FT || d < 2 || p[1] > this.groundAt(p[0], p[2]) - SHALLOW_FT) continue;
          const s = this.screen(p);
          const off = s && Math.hypot(s[0] - px, s[1] - py);
          if (!s || off > FAR_PX) continue;
          if (off <= SNAP_PX && (!best || d < best.d)) best = { p, d };
          if (!nearest || off < nearest.off) nearest = { p, off, d };
        }
      }
    }
    const point = best ?? nearest;
    const ground = this.groundHit();
    if (ground && (!point || c.distanceTo(new THREE.Vector3(...ground)) < point.d)) return { at: ground.map((v) => Math.round(v * 4) / 4), opening: true };
    return point ? { at: point.p, opening: false } : null;
  }

  // The node at the pointer, nearest the camera.
  pickNode([px, py]) {
    let best = null;
    for (const node of this.layout.nodes.values()) {
      const s = this.screen(node.at);
      if (!s || Math.hypot(s[0] - px, s[1] - py) > PICK_PX) continue;
      const d = this.camera.position.distanceTo(new THREE.Vector3(...node.at));
      if (!best || d < best.d) best = { id: node.id, d };
    }
    return best?.id ?? null;
  }

  // The bend of the one arc selected at the pointer, as its index.
  pickBend([px, py]) {
    const arc = this.selected.size === 1 && this.layout.arcs.get(this.focus);
    if (!arc) return null;
    const i = arc.bends.findIndex((b) => {
      const s = this.screen(b);
      return s && Math.hypot(s[0] - px, s[1] - py) <= PICK_PX;
    });
    return i < 0 ? null : i;
  }

  // The arc at the pointer, and the point on its line nearest it: { id, at }, or null.
  pickArc([px, py]) {
    let best = null;
    for (const arc of this.layout.arcs.values()) {
      const points = arcCurve(this.layout.copyOf(arc.id)).getPoints(48);
      const seen = points.map((p) => this.screen([p.x, p.y, p.z]));
      for (let i = 1; i < seen.length; i++) {
        const [a, b] = [seen[i - 1], seen[i]];
        if (!a || !b) continue;
        const off = toSegment([px, py], a, b);
        if (off <= PICK_PX / 2 + 2 && (!best || off < best.off)) best = { id: arc.id, at: [points[i].x, points[i].y, points[i].z], off };
      }
    }
    return best && { id: best.id, at: best.at };
  }

  // Where go to takes the builder for the pointer at [px, py]: a room's floor, or a tunnel's
  // floor where the pointer's on it, or null.
  target(px) {
    const node = this.pickNode(px);
    if (node) return [...this.layout.nodes.get(node).at];
    return this.pickArc(px)?.at ?? null;
  }

  // The left button down, with a plan tool picked.
  down(e) {
    const at = this.pointerPx(e);
    const bend = this.pickBend(at);
    if (bend !== null) return (this.drag = { id: this.focus, bend, before: this.layout.toJSON(), moved: false });
    const node = this.pickNode(at);
    const arc = !node && this.pickArc(at)?.id;
    const picked = node || arc;
    if (e.shiftKey) {
      if (picked) return this.toggle(picked);
      this.box = { from: at, to: at };
      return;
    }
    if (node) {
      if (this.tool === "tunnel") {
        if (this.start && this.start !== node) {
          this.remember();
          const made = this.layout.addArc(this.start, node, this.details.arc);
          this.start = null;
          return this.select(made.id);
        }
        this.start = node;
        return this.select(node);
      }
      if (!this.selected.has(node)) this.select(node);
      this.focus = node;
      this.drag = { id: node, before: this.layout.toJSON(), moved: false };
      return;
    }
    if (arc) return this.select(arc);
    const spot = this.tool === "chamber" && this.snap(at);
    if (spot) {
      this.remember();
      const details = spot.opening ? { ...this.details.node, shape: "opening" } : { ...this.details.node, shape: this.details.node.shape === "opening" ? NODE_DEFAULTS.shape : this.details.node.shape };
      return this.select(this.layout.addNode(spot.at, details).id);
    }
    this.start = null;
    this.select(null);
  }

  move(e) {
    const at = this.pointerPx(e);
    if (this.box) {
      this.box.to = at;
      return;
    }
    const node = this.drag && this.drag.bend === undefined && this.layout.nodes.get(this.drag.id);
    this.hover = this.tool === "chamber" || node ? this.snap(at) : null;
    if (!this.drag) return;
    const element = this.layout.get(this.drag.id);
    if (!element) return (this.drag = null);
    if (this.drag.bend !== undefined) {
      // A bend drags across the view, at the distance it's at.
      const bend = element.bends[this.drag.bend];
      const ray = this.ray();
      if (!ray) return;
      const facing = new THREE.Vector3();
      this.camera.getWorldDirection(facing);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(facing, new THREE.Vector3(...bend));
      const to = ray.ray.intersectPlane(plane, new THREE.Vector3());
      if (!to) return;
      element.bends[this.drag.bend] = [to.x, to.y, to.z].map((v) => Math.round(v * 4) / 4);
    } else {
      // An opening stays on the ground, and a room under it.
      const spot = this.hover;
      if (!spot || spot.opening !== isOpening(element) || spot.at.every((v, k) => v === element.at[k])) return;
      element.at = [...spot.at];
    }
    this.drag.moved = true;
    this.layout.version++;
  }

  up() {
    if (this.box) {
      const [[x0, x1], [y0, y1]] = [0, 1].map((k) => [this.box.from[k], this.box.to[k]].sort((a, b) => a - b));
      if (x1 - x0 > BOX_PX || y1 - y0 > BOX_PX) {
        const inside = (p) => {
          const s = this.screen(p);
          return s && s[0] >= x0 && s[0] <= x1 && s[1] >= y0 && s[1] <= y1;
        };
        for (const node of this.layout.nodes.values()) if (inside(node.at)) this.selected.add(node.id);
        for (const arc of this.layout.arcs.values()) {
          const mid = arcCurve(this.layout.copyOf(arc.id)).getPoint(0.5);
          if (inside([mid.x, mid.y, mid.z])) this.selected.add(arc.id);
        }
        this.focus = [...this.selected].at(-1) ?? null;
      }
      this.box = null;
      this.boxEl.hidden = true;
    }
    if (this.drag?.moved) {
      this.history.push(this.drag.before);
      if (this.history.length > UNDOS) this.history.shift();
    }
    this.drag = null;
  }

  // Selects just `id`, or nothing.
  select(id) {
    this.selected = new Set(id ? [id] : []);
    this.focus = id;
  }

  // Adds `id` to what's selected, or takes it away.
  toggle(id) {
    if (this.selected.delete(id)) this.focus = [...this.selected].at(-1) ?? null;
    else {
      this.selected.add(id);
      this.focus = id;
    }
  }

  // Gives whether it took the key.
  key(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      this.undo();
      return true;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      this.deleteSelected();
      return true;
    }
    if (e.key === "Escape" && (this.start || this.selected.size)) {
      this.start = null;
      this.select(null);
      return true;
    }
    return false;
  }

  // Each frame: the plan's shown in the earth, and with a plan tool.
  tick(inEarth) {
    this.group.visible = inEarth || Boolean(this.tool);
    if (!this.group.visible) return (this.label.hidden = true);
    const { clientWidth: w, clientHeight: h } = this.canvas;
    for (const material of this.materials.values()) material.resolution.set(w, h);
    const c = this.camera.position;
    this.snapMark.visible = Boolean(this.hover) && !this.drag;
    if (this.snapMark.visible) {
      this.snapMark.position.set(...this.hover.at);
      this.snapMark.scale.setScalar(Math.max(0.4, c.distanceTo(this.snapMark.position) * 0.012));
      this.snapMark.material.color.setRGB(...(this.hover.opening ? OPENING_RGB : [1, 1, 1]));
    }
    const made = `${this.layout.version} ${[...this.selected]} ${this.start}`;
    if (made !== this.drawn) this.draw(made);
    if (this.tool) this.showDetails();
    this.showLabel();
    this.boxEl.hidden = !this.box;
    if (this.box) {
      const r = this.canvas.getBoundingClientRect();
      const [x0, x1] = [this.box.from[0], this.box.to[0]].sort((a, b) => a - b);
      const [y0, y1] = [this.box.from[1], this.box.to[1]].sort((a, b) => a - b);
      Object.assign(this.boxEl.style, { left: `${r.left + x0}px`, top: `${r.top + y0}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px` });
    }
  }

  // A line through `points` (continent feet), `width` ft thick, colored `rgb` or by `colors` for
  // each point, glowing.
  line(points, width, rgb, colors = null) {
    for (const glow of [true, false]) {
      const geometry = new LineGeometry();
      geometry.setPositions(points.flat());
      const each = colors ?? points.map(() => rgb);
      geometry.setColors(each.flatMap((c) => (!glow ? c : c === CORE_RGB ? GLOW_RGB : c.map((v) => v * 0.4))));
      const line = new Line2(geometry, this.material(glow ? width * GLOW : width, glow));
      line.renderOrder = glow ? 11 : 12;
      line.computeLineDistances();
      this.drawing.add(line);
    }
  }

  material(width, glow) {
    const key = `${width.toFixed(2)},${glow}`;
    if (!this.materials.has(key)) {
      this.materials.set(key, new LineMaterial({ linewidth: width, worldUnits: true, vertexColors: true, depthTest: false, depthWrite: false, transparent: true, opacity: glow ? 0.35 : 1, blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending }));
    }
    return this.materials.get(key);
  }

  // Draws the nodes and arcs: each room a ring round its floor as wide as it is, with a stalk up
  // as high, each opening a ring on the ground with a stalk down into it, each tunnel along its
  // line, red where it's steep; what's selected in yellow, a tunnel's start in green, and the one
  // arc selected with its bends.
  draw(made) {
    this.drawn = made;
    for (const child of [...this.drawing.children]) {
      this.drawing.remove(child);
      child.geometry.dispose();
    }
    for (const node of this.layout.nodes.values()) {
      const R = NODE_SIZES[node.size] / 2;
      const opening = isOpening(node);
      const rgb = this.selected.has(node.id) ? SELECTED_RGB : node.id === this.start ? START_RGB : opening ? OPENING_RGB : CORE_RGB;
      const ring = Array.from({ length: 49 }, (_, i) => [node.at[0] + R * Math.cos((i / 48) * Math.PI * 2), node.at[1], node.at[2] + R * Math.sin((i / 48) * Math.PI * 2)]);
      this.line(ring, nodeLine(node), rgb);
      this.line([node.at, [node.at[0], node.at[1] + (opening ? -R : R), node.at[2]]], nodeLine(node), rgb);
    }
    for (const arc of this.layout.arcs.values()) {
      const selected = this.selected.has(arc.id);
      const steep = arcSteepness(this.layout.copyOf(arc.id), 96);
      const rgb = selected ? SELECTED_RGB : CORE_RGB;
      this.line(
        steep.map((p) => p.at),
        arcLine(arc),
        rgb,
        steep.map((p) => (p.deg > STEEP_DEG ? STEEP_RGB : rgb)),
      );
      if (!selected || this.selected.size !== 1) continue;
      for (const bend of arc.bends) {
        const handle = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }));
        handle.position.set(...bend);
        handle.renderOrder = 13;
        this.drawing.add(handle);
      }
    }
  }

  // The panel: what the details are of, and their values.
  showDetails() {
    const kind = this.kind();
    const focus = this.focus && this.layout.get(this.focus);
    const d = focus ?? this.details[kind];
    const count = this.selected.size;
    const name = (e) => (kindOf(e) === "arc" ? "tunnel" : isOpening(e) ? "opening" : "room");
    $("planWhat").textContent = focus ? (count > 1 ? `${count} selected; details of ${name(focus)} ${focus.id}` : `${name(focus)} ${focus.id}`) : `the next ${kind === "node" ? "room" : "tunnel"}`;
    for (const part of document.querySelectorAll("[data-plan-for]")) part.hidden = part.dataset.planFor !== kind;
    if (document.activeElement !== $("planRock")) $("planRock").value = String(d.rock);
    $("planHewn").checked = d.hewn;
    if (kind === "arc" && document.activeElement !== $("planArcSize")) $("planArcSize").value = String(d.size);
    $("planArcSizeOut").textContent = kind === "arc" ? `${d.size} ft` : "";
    for (const button of document.querySelectorAll("[data-plan-size]")) button.setAttribute("aria-pressed", String(button.dataset.planSize === d.size));
    // A room can't be made an opening, nor an opening a room.
    const opening = focus && isOpening(focus);
    for (const button of document.querySelectorAll("[data-plan-shape]")) {
      button.setAttribute("aria-pressed", String(button.dataset.planShape === d.shape));
      if (kind === "node") button.disabled = Boolean(opening) !== (button.dataset.planShape === "opening");
    }
    for (const button of document.querySelectorAll("[data-plan-style]")) button.setAttribute("aria-pressed", String(button.dataset.planStyle === d.style));
    $("planDelete").disabled = !count;
  }

  // The one arc selected's steepest climb, by it.
  showLabel() {
    const arc = this.selected.size === 1 && this.layout.arcs.get(this.focus);
    if (!arc) return (this.label.hidden = true);
    const steepest = arcSteepness(this.layout.copyOf(arc.id), 64).reduce((a, b) => (b.deg > a.deg ? b : a));
    const s = this.screen(steepest.at);
    this.label.hidden = !s;
    if (!s) return;
    this.label.textContent = `${Math.round(steepest.deg)}°`;
    this.label.classList.toggle("steep", steepest.deg > STEEP_DEG);
    this.label.style.transform = `translate(${s[0]}px, ${s[1]}px)`;
  }
}

const kindOf = (element) => (element.from ? "arc" : "node");
const isOpening = (element) => element.shape === "opening";

// How far point p is from the segment a to b, in pixels.
function toSegment([px, py], [ax, ay], [bx, by]) {
  const [dx, dy] = [bx - ax, by - ay];
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
