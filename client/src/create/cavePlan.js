import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { ARC_DEFAULTS, ARC_FT, NODE_DEFAULTS, NODE_SIZES, STEEP_DEG, arcCurve, arcSteepness, carvePlan } from "./caveLayout.js";

// The caves' plan tools: plan chamber places rooms (nodes) on the points of a 3D grid round the
// camera and selects them, to change or drag elsewhere; plan tunnel joins two rooms with a tunnel
// (an arc), clicked one then the other. A selected tunnel's bends drag to curve it. The panel
// shows the details of what's selected, or of what's placed next; carve carves everything
// changed since it was last carved (caveLayout.js), and uncarve and recarve just what's selected.
// Each change, and each carving, undoes on its own.

// The grid's lines: every `every` ft, seen out to `out` ft, `px` wide, fading with distance.
const GRIDS = [
  { every: 128, out: 1024, px: 3, rgb: [0.2, 0.28, 0.4] },
  { every: 32, out: 256, px: 2, rgb: [0.16, 0.22, 0.32] },
  { every: 8, out: 64, px: 1, rgb: [0.14, 0.19, 0.27] },
];
const SNAP_FT = 64; // how far from the camera points snap
const SNAP_PX = 14; // and how near the pointer
const FAR_PX = 60; // or failing that, how near it at most
const PICK_PX = 10; // how near the pointer a node, bend or arc is picked
const NODE_RGB = { carved: 0xe8e4dc, changed: 0xffa040, selected: 0xffe14d, start: 0x7fffa0 };
const ARC_RGB = [0.4, 0.8, 1];
const STEEP_RGB = [1, 0.25, 0.2];
const SELECTED_RGB = [1, 0.88, 0.3];
const UNDOS = 100;
const $ = (id) => document.getElementById(id);

export class CavePlan {
  // ray(): the pointer's THREE.Raycaster, or null off the view.
  constructor({ scene, camera, canvas, caves, layout, ray }) {
    Object.assign(this, { scene, camera, canvas, caves, layout, ray });
    this.tool = null; // "chamber" or "tunnel" while one's picked
    this.selected = null; // the id of the node or arc selected
    this.start = null; // the node a tunnel's being drawn from
    this.hover = null; // the grid point the pointer snaps to, [x, y, z]
    this.drag = null; // { id, bend } or { id } for a node, with the layout as it was, while dragging
    this.history = []; // { before } for each change, { entry } for each carving, latest last
    this.details = { node: { ...NODE_DEFAULTS }, arc: { ...ARC_DEFAULTS } };
    this.drawn = -1; // the layout's version drawn
    this.gridAt = null; // the 8 ft cube the grid was made round

    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.grid = GRIDS.map(({ px }) => {
      const material = new LineMaterial({ linewidth: px, vertexColors: true, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
      const lines = new LineSegments2(new LineSegmentsGeometry(), material);
      lines.renderOrder = 9;
      lines.frustumCulled = false;
      this.group.add(lines);
      return lines;
    });
    this.snapMark = new THREE.Mesh(new THREE.OctahedronGeometry(1), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.9 }));
    this.snapMark.renderOrder = 11;
    this.group.add(this.snapMark);
    this.drawing = new THREE.Group();
    this.group.add(this.drawing);
    this.arcMaterials = [3, 5].map((px) => new LineMaterial({ linewidth: px, vertexColors: true, depthTest: false, transparent: true }));
    this.label = document.createElement("div");
    this.label.className = "create-plan-label";
    this.label.hidden = true;
    canvas.parentElement.append(this.label);
    this.bind();
  }

  bind() {
    const changeDetail = (key, value) => {
      const picked = this.selected && this.layout.get(this.selected);
      if (!picked) return (this.details[this.kind()][key] = value);
      if (picked[key] === value) return;
      this.remember();
      picked[key] = value;
      this.layout.version++;
    };
    $("planRock").addEventListener("change", () => changeDetail("rock", Number($("planRock").value)));
    $("planHewn").addEventListener("change", () => changeDetail("hewn", $("planHewn").checked));
    $("planArcSize").addEventListener("input", () => changeDetail("size", Number($("planArcSize").value)));
    for (const button of document.querySelectorAll("[data-plan-size]")) button.addEventListener("click", () => changeDetail("size", button.dataset.planSize));
    for (const button of document.querySelectorAll("[data-plan-shape]")) button.addEventListener("click", () => changeDetail("shape", button.dataset.planShape));
    for (const button of document.querySelectorAll("[data-plan-style]")) button.addEventListener("click", () => changeDetail("style", button.dataset.planStyle));
    $("planCarve").addEventListener("click", () => this.carve());
    $("planUncarve").addEventListener("click", () => this.selected && this.carve({ ids: [], uncarve: [this.selected] }));
    $("planRecarve").addEventListener("click", () => this.selected && this.carve({ ids: [this.selected] }));
    $("planDelete").addEventListener("click", () => this.deleteSelected());
    $("planUndo").addEventListener("click", () => this.undo());
    $("planArcSize").min = String(ARC_FT[0]);
    $("planArcSize").max = String(ARC_FT[1]);
  }

  // Whether the details shown are a node's or an arc's: what's selected, or the tool's.
  kind() {
    if (this.selected) return this.layout.nodes.has(this.selected) ? "node" : "arc";
    return this.tool === "tunnel" ? "arc" : "node";
  }

  // Picks a plan tool, or none.
  setTool(tool) {
    this.tool = tool;
    this.group.visible = Boolean(tool);
    this.start = null;
    this.drag = null;
    if (!tool) this.label.hidden = true;
    this.drawn = -1;
  }

  remember() {
    this.history.push({ before: this.layout.toJSON() });
    if (this.history.length > UNDOS) this.history.shift();
  }

  undo() {
    const last = this.history.pop();
    if (!last) return this.status("nothing to undo");
    if (last.entry) {
      // A carving undoes only while it's the caves' last change.
      if (this.caves.undos.at(-1) !== last.entry) {
        this.history.push(last);
        return this.status("undo the cave work done since the carving first");
      }
      this.caves.undo();
      return this.status("carving undone");
    }
    const carved = this.layout.carved;
    this.layout.nodes.clear();
    this.layout.arcs.clear();
    this.layout.load(last.before);
    this.layout.carved = carved;
    if (this.selected && !this.layout.get(this.selected)) this.selected = null;
    this.status("");
  }

  deleteSelected() {
    if (!this.selected) return;
    this.remember();
    this.layout.remove(this.selected);
    this.selected = null;
  }

  // Carves what's changed, or with `ids` and `uncarve`, just those (caveLayout.js's carvePlan).
  carve(which) {
    const plan = carvePlan(this.layout, which);
    if (!plan.fills.length && !plan.opens.length) return this.status("nothing to carve");
    const before = this.layout.carved;
    const record = { entry: null };
    record.entry = this.caves.carvePlan(plan, () => {
      this.layout.carved = before;
      this.layout.version++;
      this.history = this.history.filter((h) => h !== record);
    });
    this.layout.carved = plan.carved;
    this.layout.version++;
    if (record.entry) this.history.push(record);
    this.status(`carved ${new Set([...plan.carved.keys()].filter((id) => plan.carved.get(id) !== before.get(id))).size} and filled ${plan.fills.length ? "what changed" : "nothing"}`);
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

  // The grid point the pointer at [px, py] snaps to: of those within SNAP_FT of the camera and
  // SNAP_PX of the pointer, the one nearest the camera; or where none is that near the pointer,
  // the nearest to it within FAR_PX.
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
          if (d > SNAP_FT || d < 2) continue;
          const s = this.screen(p);
          const off = s && Math.hypot(s[0] - px, s[1] - py);
          if (!s || off > FAR_PX) continue;
          if (off <= SNAP_PX && (!best || d < best.d)) best = { p, d };
          if (!nearest || off < nearest.off) nearest = { p, off };
        }
      }
    }
    return (best ?? nearest)?.p ?? null;
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

  // The bend of the selected arc at the pointer, as its index.
  pickBend([px, py]) {
    const arc = this.layout.arcs.get(this.selected);
    if (!arc) return null;
    const i = arc.bends.findIndex((b) => {
      const s = this.screen(b);
      return s && Math.hypot(s[0] - px, s[1] - py) <= PICK_PX;
    });
    return i < 0 ? null : i;
  }

  // The arc at the pointer.
  pickArc([px, py]) {
    for (const arc of this.layout.arcs.values()) {
      const points = arcCurve(this.layout.copyOf(arc.id)).getPoints(48).map((p) => this.screen([p.x, p.y, p.z]));
      for (let i = 1; i < points.length; i++) {
        const [a, b] = [points[i - 1], points[i]];
        if (a && b && toSegment([px, py], a, b) <= PICK_PX / 2 + 2) return arc.id;
      }
    }
    return null;
  }

  // The left button down, with a plan tool picked.
  down(e) {
    const at = this.pointerPx(e);
    const bend = this.pickBend(at);
    if (bend !== null) return (this.drag = { id: this.selected, bend, before: this.layout.toJSON(), moved: false });
    const node = this.pickNode(at);
    if (node) {
      if (this.tool === "tunnel") {
        if (this.start && this.start !== node) {
          this.remember();
          const arc = this.layout.addArc(this.start, node, this.details.arc);
          this.start = null;
          return this.select(arc.id);
        }
        this.start = node;
        return this.select(node);
      }
      this.select(node);
      this.drag = { id: node, before: this.layout.toJSON(), moved: false };
      return;
    }
    const arc = this.pickArc(at);
    if (arc) return this.select(arc);
    const point = this.tool === "chamber" && this.snap(at);
    if (point) {
      this.remember();
      return this.select(this.layout.addNode(point, this.details.node).id);
    }
    this.start = null;
    this.select(null);
  }

  move(e) {
    const at = this.pointerPx(e);
    this.hover = this.tool === "chamber" || this.drag ? this.snap(at) : null;
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
      if (!this.hover || this.hover.every((v, k) => v === element.at[k])) return;
      element.at = [...this.hover];
    }
    this.drag.moved = true;
    this.layout.version++;
  }

  up() {
    if (this.drag?.moved) {
      this.history.push({ before: this.drag.before });
      if (this.history.length > UNDOS) this.history.shift();
    }
    this.drag = null;
  }

  select(id) {
    this.selected = id;
    this.drawn = -1;
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
    if (e.key === "Escape" && (this.start || this.selected)) {
      this.start = null;
      this.select(null);
      return true;
    }
    return false;
  }

  // Each frame.
  tick() {
    if (!this.tool) return;
    const { clientWidth: w, clientHeight: h } = this.canvas;
    for (const lines of this.grid) lines.material.resolution.set(w, h);
    for (const material of this.arcMaterials) material.resolution.set(w, h);
    const c = this.camera.position;
    const cube = [c.x, c.y, c.z].map((v) => Math.floor(v / 8)).join(",");
    if (cube !== this.gridAt) this.makeGrid(cube);
    this.snapMark.visible = Boolean(this.hover);
    if (this.hover) {
      this.snapMark.position.set(...this.hover);
      this.snapMark.scale.setScalar(Math.max(0.4, c.distanceTo(this.snapMark.position) * 0.012));
    }
    if (this.drawn !== this.layout.version) this.draw();
    this.showDetails();
    this.showLabel();
  }

  // The grid round the camera, in its 8 ft cube `cube`.
  makeGrid(cube) {
    this.gridAt = cube;
    const c = this.camera.position;
    GRIDS.forEach(({ every, out, rgb }, level) => {
      const n = Math.ceil(out / every);
      const base = [c.x, c.y, c.z].map((v) => Math.round(v / every) * every);
      const [positions, colors] = [[], []];
      const fade = (p) => Math.max(0, 1 - Math.hypot(p[0] - c.x, p[1] - c.y, p[2] - c.z) / out) ** 2;
      for (let axis = 0; axis < 3; axis++) {
        const [a1, a2] = [(axis + 1) % 3, (axis + 2) % 3];
        for (let i = -n; i <= n; i++) {
          for (let j = -n; j <= n; j++) {
            for (let k = -n; k < n; k++) {
              const p = [0, 0, 0];
              p[a1] = base[a1] + i * every;
              p[a2] = base[a2] + j * every;
              p[axis] = base[axis] + k * every;
              const q = [...p];
              q[axis] += every;
              const [f0, f1] = [fade(p), fade(q)];
              if (!f0 && !f1) continue;
              positions.push(...p, ...q);
              colors.push(...rgb.map((v) => v * f0), ...rgb.map((v) => v * f1));
            }
          }
        }
      }
      const geometry = new LineSegmentsGeometry();
      if (positions.length) {
        geometry.setPositions(positions);
        geometry.setColors(colors);
      }
      this.grid[level].geometry.dispose();
      this.grid[level].geometry = geometry;
    });
  }

  // Draws the nodes and arcs: each node a point, ringed by its room's reach on its floor; each
  // arc a line, red where it's steep; what's selected in yellow, with a selected node's sphere
  // and a selected arc's bends.
  draw() {
    this.drawn = this.layout.version;
    for (const child of [...this.drawing.children]) {
      this.drawing.remove(child);
      child.geometry.dispose();
    }
    const changes = new Set(this.layout.changes());
    for (const node of this.layout.nodes.values()) {
      const color = node.id === this.selected ? NODE_RGB.selected : node.id === this.start ? NODE_RGB.start : changes.has(node.id) ? NODE_RGB.changed : NODE_RGB.carved;
      const material = new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true });
      const point = new THREE.Mesh(new THREE.OctahedronGeometry(1.5), material);
      point.position.set(...node.at);
      point.renderOrder = 12;
      this.drawing.add(point);
      const R = NODE_SIZES[node.size] / 2;
      const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 48 }, (_, i) => new THREE.Vector3(R * Math.cos((i / 48) * Math.PI * 2), 0, R * Math.sin((i / 48) * Math.PI * 2)))), new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.6 }));
      ring.position.set(...node.at);
      ring.renderOrder = 12;
      this.drawing.add(ring);
      if (node.id === this.selected) {
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 12), new THREE.MeshBasicMaterial({ color, wireframe: true, depthTest: false, transparent: true, opacity: 0.25 }));
        sphere.position.set(...node.at);
        sphere.renderOrder = 12;
        this.drawing.add(sphere);
      }
    }
    for (const arc of this.layout.arcs.values()) {
      const selected = arc.id === this.selected;
      const steep = arcSteepness(this.layout.copyOf(arc.id), 96);
      const geometry = new LineGeometry();
      geometry.setPositions(steep.flatMap((p) => p.at));
      geometry.setColors(steep.flatMap((p) => (p.deg > STEEP_DEG ? STEEP_RGB : selected ? SELECTED_RGB : changes.has(arc.id) ? [1, 0.63, 0.25] : ARC_RGB)));
      const line = new Line2(geometry, this.arcMaterials[selected ? 1 : 0]);
      line.renderOrder = 12;
      line.computeLineDistances();
      this.drawing.add(line);
      if (!selected) continue;
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
    const picked = this.selected && this.layout.get(this.selected);
    const d = picked ?? this.details[kind];
    $("planWhat").textContent = picked ? `${kind === "node" ? "room" : "tunnel"} ${picked.id}${this.layout.changed(picked.id) ? ", not carved as it is" : ", carved"}` : `the next ${kind === "node" ? "room" : "tunnel"}`;
    for (const part of document.querySelectorAll("[data-plan-for]")) part.hidden = part.dataset.planFor !== kind;
    if (document.activeElement !== $("planRock")) $("planRock").value = String(d.rock);
    $("planHewn").checked = d.hewn;
    if (kind === "arc" && document.activeElement !== $("planArcSize")) $("planArcSize").value = String(d.size);
    $("planArcSizeOut").textContent = kind === "arc" ? `${d.size} ft` : "";
    for (const button of document.querySelectorAll("[data-plan-size]")) button.setAttribute("aria-pressed", String(button.dataset.planSize === d.size));
    for (const button of document.querySelectorAll("[data-plan-shape]")) button.setAttribute("aria-pressed", String(button.dataset.planShape === d.shape));
    for (const button of document.querySelectorAll("[data-plan-style]")) button.setAttribute("aria-pressed", String(button.dataset.planStyle === d.style));
    const count = this.layout.changes().length;
    $("planCarve").textContent = count ? `carve ${count}` : "carve";
    for (const id of ["planUncarve", "planRecarve", "planDelete"]) $(id).disabled = !picked;
  }

  // The selected arc's steepest climb, by it.
  showLabel() {
    const arc = this.layout.arcs.get(this.selected);
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

// How far point p is from the segment a to b, in pixels.
function toSegment([px, py], [ax, ay], [bx, by]) {
  const [dx, dy] = [bx - ax, by - ay];
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
