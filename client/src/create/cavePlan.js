import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { ARC_DEFAULTS, ARC_FT, ENTRANCE_DEFAULTS, ENTRANCE_FT, NODE_DEFAULTS, NODE_SIZES, STEEP_DEG, arcCurve, arcSteepness, carvePlan, entranceEnd, entranceProblem, entranceRing, isEntrance } from "./caveLayout.js";

// The caves' plan tools: chamber places rooms (nodes) on the points of the grid round the camera,
// in the earth, and drags them elsewhere; tunnel joins two rooms with a tunnel (an arc), clicked
// one then the other, and drags a selected tunnel's bends to curve it; entrance, from above the
// ground, places an entrance where the pointer meets it: a tube into the hillside, facing the way
// the camera looks, turned with C and V, with a room at its far end for tunnels to join. Its
// mouth has to be out in the air but for the bottom of it, and it's red where it isn't. Both select: a click picks one, shift-click
// adds or takes away, and shift-drag boxes them in. The panel shows the details of what's
// selected, to change all of it at once, or of what's placed next. Each change carves what it
// changed straight away (caveLayout.js's carvePlan), with what's joined to it, and undoes on its
// own. What's locked can't be moved, changed or deleted, and nor can what's joined to it, so it
// isn't carved again, keeping work done on it by hand.
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
const LOCKED_RGB = [0.75, 0.55, 1];
const LOCKED_NOTE = "unlock it, and what's joined to it, to change it";
const TURN_DEG = 15; // how far C and V turn an entrance, or with shift FINE_TURN_DEG
const FINE_TURN_DEG = 5;
const GLOW = 3; // how much wider the glow is than the line
const UNDOS = 100;
const SPOKES = 8; // how many spokes a room's ring has
const $ = (id) => document.getElementById(id);

// How thick, in feet, a room's lines are, and a tunnel's.
const nodeLine = (node) => Math.max(0.25, (isEntrance(node) ? node.width * 2 : NODE_SIZES[node.size]) / 64);
const arcLine = (arc) => Math.max(0.25, arc.size / 20);

export class CavePlan {
  // ray(): the pointer's THREE.Raycaster, or null off the view. groundHit(): where the pointer
  // meets the ground, [x, y, z], or null. groundAt(x, z): the ground's height.
  // caves: the Caves to carve.
  constructor({ scene, camera, canvas, layout, caves, ray, groundHit, groundAt }) {
    Object.assign(this, { scene, camera, canvas, layout, caves, ray, groundHit, groundAt });
    this.settled = false; // whether what was planned before has been carved
    this.tool = null; // "chamber", "tunnel" or "entrance" while one's picked
    this.selected = new Set(); // the ids of the nodes and arcs selected
    this.focus = null; // the one selected last, whose details show
    this.start = null; // the node a tunnel's being drawn from
    this.hover = null; // the grid point the pointer snaps to, { at }, or the entrance it'd place, { entrance, problem }
    this.pointer = null; // where the pointer last was, [x, y] pixels
    this.turn = 0; // degrees an entrance is turned from the way the camera looks
    this.drag = null; // { id, bend } or { id } for a node, with the layout as it was, while dragging
    this.box = null; // { from, to } in pixels, while shift-dragging a box
    this.history = []; // the layout as it was before each change, latest last
    this.details = { node: { ...NODE_DEFAULTS }, arc: { ...ARC_DEFAULTS }, entrance: { ...ENTRANCE_DEFAULTS } };
    this.drawn = null; // what the drawing was made from

    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.snapMark = new THREE.Mesh(new THREE.OctahedronGeometry(1), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.9 }));
    this.snapMark.renderOrder = 11;
    this.group.add(this.snapMark);
    this.drawing = new THREE.Group();
    this.group.add(this.drawing);
    // The entrance being placed: drawn as it is, and faint through the ground.
    this.preview = new THREE.Group();
    scene.add(this.preview);
    this.previewMaterials = [
      new THREE.LineBasicMaterial({ vertexColors: true }),
      new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, depthWrite: false, transparent: true, opacity: 0.25 }),
    ];
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
      // Rock is everything's; the rest a room's, a tunnel's or an entrance's own.
      const takes = (e) => this.free(e.id) && (key === "rock" || key === "hewn" || kindOf(e) === kind);
      const changing = picked.filter((e) => takes(e) && e[key] !== value);
      if (!changing.length) return this.status(picked.some((e) => !this.free(e.id)) ? LOCKED_NOTE : "");
      // An entrance changed has to fit where it is.
      for (const e of changing.filter(isEntrance)) {
        const problem = entranceProblem(placed({ ...e, [key]: value }), this.groundAt);
        if (problem) return this.status(problem);
      }
      this.remember();
      for (const e of changing) {
        e[key] = value;
        if (isEntrance(e)) e.at = entranceEnd(e);
      }
      this.layout.version++;
      this.carve();
    };
    $("planRock").addEventListener("change", () => changeDetail("rock", Number($("planRock").value)));
    $("planHewn").addEventListener("change", () => changeDetail("hewn", $("planHewn").checked));
    $("planArcSize").addEventListener("input", () => changeDetail("size", Number($("planArcSize").value)));
    for (const button of document.querySelectorAll("[data-plan-size]")) button.addEventListener("click", () => changeDetail("size", button.dataset.planSize));
    for (const button of document.querySelectorAll("[data-plan-shape]")) button.addEventListener("click", () => changeDetail("shape", button.dataset.planShape));
    for (const button of document.querySelectorAll("[data-plan-style]")) button.addEventListener("click", () => changeDetail("style", button.dataset.planStyle));
    for (const button of document.querySelectorAll("[data-entrance-style]")) button.addEventListener("click", () => changeDetail("style", button.dataset.entranceStyle));
    for (const button of document.querySelectorAll("[data-entrance-length]")) button.addEventListener("click", () => changeDetail("length", Number(button.dataset.entranceLength)));
    for (const button of document.querySelectorAll("[data-entrance-slope]")) button.addEventListener("click", () => changeDetail("slope", button.dataset.entranceSlope));
    $("planEntranceWidth").addEventListener("input", () => changeDetail("width", Number($("planEntranceWidth").value)));
    $("planEntranceWidth").min = String(ENTRANCE_FT[0]);
    $("planEntranceWidth").max = String(ENTRANCE_FT[1]);
    $("planDelete").addEventListener("click", () => this.deleteSelected());
    $("planLock").addEventListener("click", () => this.lock(true));
    $("planUnlock").addEventListener("click", () => this.lock(false));
    $("planUndo").addEventListener("click", () => this.undo());
    $("planArcSize").min = String(ARC_FT[0]);
    $("planArcSize").max = String(ARC_FT[1]);
  }

  // Whether the details shown are a node's, an arc's or an entrance's: what was selected last, or
  // the tool's.
  kind() {
    const focus = this.focus && this.layout.get(this.focus);
    if (focus) return kindOf(focus);
    return { tunnel: "arc", entrance: "entrance" }[this.tool] ?? "node";
  }

  // Picks a plan tool, or none.
  setTool(tool) {
    this.tool = tool;
    this.start = null;
    this.drag = null;
    this.box = null;
    this.boxEl.hidden = true;
    this.hover = null;
    this.drawPreview();
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
    this.carve();
  }

  // Whether an element can be changed: it isn't locked, nor anything joined to it.
  free(id) {
    return [id, ...this.layout.linked(id)].every((other) => !this.layout.get(other)?.locked);
  }

  deleteSelected() {
    const deleting = [...this.selected].filter((id) => this.free(id));
    if (!deleting.length) return this.status(this.selected.size ? LOCKED_NOTE : "");
    this.remember();
    for (const id of deleting) this.layout.remove(id);
    this.select(null);
    this.carve();
  }

  // Locks what's selected, or unlocks it.
  lock(on) {
    const changing = [...this.selected].map((id) => this.layout.get(id)).filter((e) => e && Boolean(e.locked) !== on);
    if (!changing.length) return;
    this.remember();
    for (const e of changing) {
      if (on) e.locked = true;
      else delete e.locked;
    }
    this.layout.version++;
  }

  // Carves what's changed since it was last carved: fills in what it carved before, then carves it
  // as it is now, with the neighbours that touches.
  carve() {
    const plan = carvePlan(this.layout, undefined, this.groundAt);
    if (plan.fills.length || plan.opens.length) this.caves.carvePlan(plan, () => {});
    this.layout.carved = plan.carved;
    this.layout.version++;
    this.status(plan.unfit.length ? `${plan.unfit.join(", ")} won't fit under the ground, so ${plan.unfit.length > 1 ? "aren't" : "isn't"} carved` : "");
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
  // where none is that near the pointer, the nearest to it within FAR_PX; or null, there or where
  // the pointer meets the ground before that point. { at }, or null.
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
    if (!point || (ground && c.distanceTo(new THREE.Vector3(...ground)) < point.d)) return null;
    return { at: point.p };
  }

  // The entrance the pointer would place, where it meets the ground: { entrance, problem }, with
  // why it can't go there, or null where the pointer's off the ground.
  entranceAt() {
    const ground = this.groundHit();
    if (!ground) return null;
    const facing = new THREE.Vector3();
    this.camera.getWorldDirection(facing);
    const yaw = (((Math.round((Math.atan2(facing.x, facing.z) * 180) / Math.PI) + this.turn) % 360) + 360) % 360;
    const entrance = placed({ ...this.details.entrance, mouth: ground.map((v) => Math.round(v * 4) / 4), yaw });
    return { entrance, problem: entranceProblem(entrance, this.groundAt) };
  }

  // The node at the pointer, nearest the camera: its middle, or any of its lines.
  pickNode([px, py]) {
    let best = null;
    for (const node of this.layout.nodes.values()) {
      const middle = this.screen(node.at);
      const near =
        (middle && Math.hypot(middle[0] - px, middle[1] - py) <= PICK_PX) ||
        nodeLines(node).some((points) => {
          const seen = points.map((p) => this.screen(p));
          return seen.some((a, i) => i > 0 && a && seen[i - 1] && toSegment([px, py], seen[i - 1], a) <= PICK_PX / 2 + 2);
        });
      if (!near) continue;
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
    if (bend !== null && this.free(this.focus)) return (this.drag = { id: this.focus, bend, before: this.layout.toJSON(), moved: false });
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
          if (this.layout.nodes.get(this.start).locked || this.layout.nodes.get(node).locked) return this.status(LOCKED_NOTE);
          this.remember();
          const made = this.layout.addArc(this.start, node, this.details.arc);
          this.start = null;
          this.select(made.id);
          return this.carve();
        }
        this.start = node;
        return this.select(node);
      }
      if (!this.selected.has(node)) this.select(node);
      this.focus = node;
      // An entrance's room stays at the end of its tube.
      if (this.free(node) && !isEntrance(this.layout.nodes.get(node))) this.drag = { id: node, before: this.layout.toJSON(), moved: false };
      return;
    }
    if (arc) return this.select(arc);
    if (this.tool === "entrance") {
      const spot = this.entranceAt();
      if (spot?.problem) return this.status(spot.problem);
      if (spot) {
        this.remember();
        const { at, ...details } = spot.entrance;
        this.select(this.layout.addNode(at, details).id);
        return this.carve();
      }
    }
    const spot = this.tool === "chamber" && this.snap(at);
    if (spot) {
      this.remember();
      this.select(this.layout.addNode(spot.at, this.details.node).id);
      return this.carve();
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
    this.pointer = at;
    const node = this.drag && this.drag.bend === undefined && this.layout.nodes.get(this.drag.id);
    this.hover = this.tool === "chamber" || node ? this.snap(at) : this.tool === "entrance" ? this.entranceAt() : null;
    this.drawPreview();
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
      const spot = this.hover;
      if (!spot || spot.at.every((v, k) => v === element.at[k])) return;
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
      this.drag = null;
      this.carve();
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
    const k = e.key.toLowerCase();
    if (this.tool === "entrance" && (k === "c" || k === "v") && !e.ctrlKey && !e.metaKey && !e.altKey) {
      this.turn += (e.shiftKey ? FINE_TURN_DEG : TURN_DEG) * (k === "c" ? 1 : -1);
      this.hover = this.entranceAt();
      this.drawPreview();
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
    if (!this.settled) {
      this.settled = true;
      this.carve();
    }
    this.group.visible = inEarth || Boolean(this.tool);
    if (!this.group.visible) return (this.label.hidden = true);
    const { clientWidth: w, clientHeight: h } = this.canvas;
    for (const material of this.materials.values()) material.resolution.set(w, h);
    const c = this.camera.position;
    this.snapMark.visible = Boolean(this.hover?.at) && !this.drag;
    if (this.snapMark.visible) {
      this.snapMark.position.set(...this.hover.at);
      this.snapMark.scale.setScalar(Math.max(0.4, c.distanceTo(this.snapMark.position) * 0.012));
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

  // Draws the nodes and arcs, what's locked in violet: each room a ring round its floor as wide as it is, with thin spokes
  // in to its middle and a stalk up as high, each entrance its tube and its room's ring, each tunnel along its
  // line, red where it's steep; what's selected in yellow, a tunnel's start in green, and the one
  // arc selected with its bends.
  draw(made) {
    this.drawn = made;
    for (const child of [...this.drawing.children]) {
      this.drawing.remove(child);
      child.geometry.dispose();
    }
    for (const node of this.layout.nodes.values()) {
      const rgb = this.selected.has(node.id) ? SELECTED_RGB : node.id === this.start ? START_RGB : node.locked ? LOCKED_RGB : isEntrance(node) ? OPENING_RGB : CORE_RGB;
      if (isEntrance(node)) {
        for (const points of nodeLines(node)) this.line(points, nodeLine(node), rgb);
        continue;
      }
      const [ring, stalk, ...spokes] = nodeLines(node);
      this.line(ring, nodeLine(node), rgb);
      this.line(stalk, nodeLine(node), rgb);
      for (const spoke of spokes) this.line(spoke, nodeLine(node) / 3, rgb);
    }
    for (const arc of this.layout.arcs.values()) {
      const selected = this.selected.has(arc.id);
      const steep = arcSteepness(this.layout.copyOf(arc.id), 96);
      const rgb = selected ? SELECTED_RGB : arc.locked ? LOCKED_RGB : CORE_RGB;
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

  // Draws the entrance the pointer would place, red where it can't go.
  drawPreview() {
    for (const child of [...this.preview.children]) {
      this.preview.remove(child);
      child.geometry.dispose();
    }
    const spot = this.tool === "entrance" && this.hover?.entrance && this.hover;
    if (!spot) return;
    const [positions, colors] = [[], []];
    for (const { points, open } of entranceLines(spot.entrance, this.groundAt, spot.problem)) {
      for (let i = 1; i < points.length; i++) {
        positions.push(...points[i - 1], ...points[i]);
        for (let k = 0; k < 2; k++) colors.push(...(open ? OPENING_RGB : STEEP_RGB));
      }
    }
    for (const material of this.previewMaterials) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      const lines = new THREE.LineSegments(geometry, material);
      lines.renderOrder = material.depthTest ? 0 : 12;
      lines.frustumCulled = false;
      this.preview.add(lines);
    }
  }

  // The panel: what the details are of, and their values.
  showDetails() {
    const kind = this.kind();
    const focus = this.focus && this.layout.get(this.focus);
    const d = focus ?? this.details[kind];
    const count = this.selected.size;
    const name = (e) => ({ arc: "tunnel", node: "room", entrance: "entrance" })[kindOf(e)];
    $("planWhat").textContent = focus ? (count > 1 ? `${count} selected; details of ${name(focus)} ${focus.id}` : `${name(focus)} ${focus.id}`) : `the next ${{ arc: "tunnel", node: "room", entrance: "entrance" }[kind]}`;
    for (const part of document.querySelectorAll("[data-plan-for]")) part.hidden = !part.dataset.planFor.split(" ").includes(kind);
    if (document.activeElement !== $("planRock")) $("planRock").value = String(d.rock);
    $("planHewn").checked = d.hewn;
    if (kind === "arc" && document.activeElement !== $("planArcSize")) $("planArcSize").value = String(d.size);
    $("planArcSizeOut").textContent = kind === "arc" ? `${d.size} ft` : "";
    for (const button of document.querySelectorAll("[data-plan-size]")) button.setAttribute("aria-pressed", String(button.dataset.planSize === d.size));
    for (const button of document.querySelectorAll("[data-plan-shape]")) button.setAttribute("aria-pressed", String(button.dataset.planShape === d.shape));
    for (const button of document.querySelectorAll("[data-plan-style]")) button.setAttribute("aria-pressed", String(button.dataset.planStyle === d.style));
    if (kind === "entrance") {
      for (const button of document.querySelectorAll("[data-entrance-style]")) button.setAttribute("aria-pressed", String(button.dataset.entranceStyle === d.style));
      for (const button of document.querySelectorAll("[data-entrance-length]")) button.setAttribute("aria-pressed", String(Number(button.dataset.entranceLength) === d.length));
      for (const button of document.querySelectorAll("[data-entrance-slope]")) button.setAttribute("aria-pressed", String(button.dataset.entranceSlope === d.slope));
      if (document.activeElement !== $("planEntranceWidth")) $("planEntranceWidth").value = String(d.width);
      $("planEntranceWidthOut").textContent = `${d.width} ft`;
    }
    const picked = [...this.selected].map((id) => this.layout.get(id)).filter(Boolean);
    $("planDelete").disabled = !picked.some((e) => this.free(e.id));
    $("planLock").disabled = !picked.some((e) => !e.locked);
    $("planUnlock").disabled = !picked.some((e) => e.locked);
    if (focus?.locked) $("planWhat").textContent += ", locked";
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

// A node's lines, continent feet: its ring round its floor, its stalk, up as high as the room is,
// and its spokes from the ring to its middle; an entrance's, its tube's (entranceLines) and its
// room's ring.
function nodeLines(node) {
  if (isEntrance(node)) return entranceLines(node, () => -Infinity).map((line) => line.points);
  const R = NODE_SIZES[node.size] / 2;
  const [x, y, z] = node.at;
  const round = (i, n) => [x + R * Math.cos((i / n) * Math.PI * 2), y, z + R * Math.sin((i / n) * Math.PI * 2)];
  const ring = Array.from({ length: 49 }, (_, i) => round(i, 48));
  const stalk = [node.at, [x, y + R, z]];
  return [ring, stalk, ...Array.from({ length: SPOKES }, (_, i) => [round(i, SPOKES), node.at])];
}

// An entrance with its far end where its mouth, yaw, length and slope put it.
const placed = (entrance) => ({ ...entrance, at: entranceEnd(entrance) });

// An entrance's lines, continent feet, each { points, open }: its mouth's ring, a point at a
// time, `open` false where it's in the ground and can't be; its tube's top and sides; and its
// room's ring round its floor, `open` false where the room isn't under the ground (problem).
function entranceLines(entrance, groundAt, problem = null) {
  const ring = entranceRing(entrance, groundAt);
  const out = ring.map((p, i) => ({ points: [p.at, ring[(i + 1) % ring.length].at], open: p.open && ring[(i + 1) % ring.length].open }));
  const along = entrance.at.map((v, k) => v - entrance.mouth[k]);
  for (const i of [ring.length / 4, ring.length / 2, (3 * ring.length) / 4]) {
    const p = ring[i].at;
    out.push({ points: [p, p.map((v, k) => v + along[k])], open: true });
  }
  const R = entrance.width;
  const [x, y, z] = entrance.at;
  const room = Array.from({ length: 33 }, (_, i) => [x + R * Math.cos((i / 32) * Math.PI * 2), y, z + R * Math.sin((i / 32) * Math.PI * 2)]);
  out.push({ points: room, open: !problem?.includes("far end") });
  return out;
}

const kindOf = (element) => (element.from ? "arc" : isEntrance(element) ? "entrance" : "node");

// How far point p is from the segment a to b, in pixels.
function toSegment([px, py], [ax, ay], [bx, by]) {
  const [dx, dy] = [bx - ax, by - ay];
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
