import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { NET_SLUG } from "../v2/caves.js";
import { CAMERA } from "./builder.js";
import { ENTRANCE_DEFAULTS, ENTRANCE_FT, JOIN_FT, POINT_FT, EXCLUSIVE, carvePlan, configOf, entranceEnd, entranceProblem, entranceRing, fits, mouthBehind, passageWarnings, segmentShapes, steep } from "./caveLayout.js";

// The caves' layout tools (caveLayout.js). Entrance, from above the ground, places an entrance
// held where the pointer meets it, HOLD_FT in from its mouth: a tube into the hillside, facing the
// way the camera looks, turned with C and V, ending at a point passages go on from. Its mouth has
// to be out in the air but for the bottom of it, and it's red where it isn't. A new entrance
// starts a new cave network, named in the panel, or goes into one picked there. A click picks an
// entrance; the panel shows its details, or those of the next one placed, and changing them
// changes it. Each change carves what it changed straight away (caveLayout.js's carvePlan), and
// undoes on its own.
//
// Passage, from inside a cave, lays out passages: the new point goes the way you look, REACH_FT
// from your feet, level when you look straight ahead (the camera at rest, the pointer in the
// middle), the scroll wheel setting how far, and the passage goes on to it from the nearest
// spot on a passage to you, splitting it there unless a point's within JOIN_FT. Aimed near
// another passage, it snaps to it, to make a loop. A ghost of it shows as you aim, red where it
// can't go, and orange, with a warning, where it can but shouldn't: too steep to walk, or too
// near a passage it doesn't join, or another network (caveLayout.js's passageWarnings).
// Passages too steep to walk are drawn orange. The new point's selected, so the panel can size it; shift-click picks another.
//
// The layout's drawn as glowing lines, as thick, in feet, as what they stand for is big, so they
// thin with distance: an entrance as its mouth's ring and its tube, a point as a ring on its floor.

const PICK_PX = 10; // how near the pointer an element is picked
const CORE_RGB = [0.3, 0.65, 1];
const GLOW_RGB = [0.05, 0.18, 0.7];
const SELECTED_RGB = [1, 0.88, 0.3];
const STEEP_RGB = [1, 0.25, 0.2];
const OPENING_RGB = [0.45, 1, 0.9];
const WARN_RGB = [1, 0.6, 0.15];
const TURN_DEG = 15; // how far C and V turn an entrance, or with shift FINE_TURN_DEG
const FINE_TURN_DEG = 5;
const HOLD_FT = 10; // how far in from an entrance's mouth the pointer holds it
const GLOW = 3; // how much wider the glow is than the line
const UNDOS = 100;
const REACH_FT = [8, 32, 96]; // how far past you a passage reaches: least, at first, most
const REACH_STEP_FT = 4;
const LEVEL_RAD = 0.06; // how far either way of straight ahead a passage aimed is level
const SNAP_FT = 12; // how near another passage a passage aimed snaps to it
const NEW = ""; // the network picker's value for a new network
const $ = (id) => document.getElementById(id);

// A network's name as a slug: lowercase words joined by hyphens.
export const slugOf = (name) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export class CavePlan {
  // ray(): the pointer's THREE.Raycaster, or null off the view. groundHit(): where the pointer
  // meets the ground, [x, y, z], or null. groundAt(x, z): the ground's height.
  // caves: the Caves to carve.
  // here(): where you stand, [x, y, z].
  constructor({ scene, camera, canvas, layout, caves, ray, groundHit, groundAt, here }) {
    Object.assign(this, { camera, canvas, layout, caves, ray, groundHit, groundAt, here });
    this.tool = null; // "entrance" or "passage" while it's picked
    this.reach = REACH_FT[1]; // how far past you a passage reaches
    this.ghost = null; // the passage aimed, { from, to, at, ends, problem }
    this.selected = null; // the id of the element selected
    this.hover = null; // the entrance the pointer would place, { entrance, problem }
    this.turn = 0; // degrees an entrance is turned from the way the camera looks
    this.shownProblem = null; // why what's pointed at can't go there, as last shown
    this.history = []; // the layout as it was before each change, latest last
    this.details = { ...ENTRANCE_DEFAULTS };
    this.net = NEW; // the network new entrances go into, or NEW
    this.drawn = null; // what the drawing was made from
    this.listed = null; // the networks the picker lists

    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
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
    this.bind();
  }

  bind() {
    const changeDetail = (key, value) => {
      const point = this.layout.points.get(this.selected);
      if (point) {
        if (point[key] === value || !(key in point)) return;
        this.remember();
        point[key] = value;
        this.layout.version++;
        return this.carve();
      }
      const e = this.layout.entrances.get(this.selected);
      if (!e) return (this.details[key] = value);
      if (e[key] === value) return;
      // An entrance changed has to fit where it is.
      const problem = entranceProblem({ ...e, [key]: value }, this.groundAt);
      if (problem) return this.status(problem);
      this.remember();
      e[key] = value;
      const end = this.layout.points.get(e.point);
      end.at = entranceEnd(e);
      if (key === "rock" || key === "hewn") end[key] = value;
      this.layout.version++;
      this.carve();
    };
    $("planRock").addEventListener("change", () => changeDetail("rock", Number($("planRock").value)));
    $("planHewn").addEventListener("change", () => changeDetail("hewn", $("planHewn").checked));
    for (const button of document.querySelectorAll("[data-entrance-style]")) button.addEventListener("click", () => changeDetail("style", button.dataset.entranceStyle));
    for (const button of document.querySelectorAll("[data-entrance-length]")) button.addEventListener("click", () => changeDetail("length", Number(button.dataset.entranceLength)));
    for (const button of document.querySelectorAll("[data-entrance-slope]")) button.addEventListener("click", () => changeDetail("slope", button.dataset.entranceSlope));
    $("planEntranceWidth").addEventListener("input", () => changeDetail("width", Number($("planEntranceWidth").value)));
    $("planEntranceWidth").min = String(ENTRANCE_FT[0]);
    $("planEntranceWidth").max = String(ENTRANCE_FT[1]);
    for (const key of ["width", "height"]) {
      const input = $(`planPoint-${key}`);
      [input.min, input.max] = POINT_FT[key].map(String);
      input.addEventListener("input", () => changeDetail(key, Number(input.value)));
    }
    // Qualities toggle, but for those only one of which a point can have.
    for (const button of document.querySelectorAll("[data-quality]")) {
      button.addEventListener("click", () => {
        const point = this.layout.points.get(this.selected);
        if (!point) return;
        const q = button.dataset.quality;
        const others = EXCLUSIVE.find((group) => group.includes(q)) ?? [q];
        changeDetail("qualities", point.qualities.includes(q) ? point.qualities.filter((x) => x !== q) : [...point.qualities.filter((x) => !others.includes(x)), q]);
      });
    }
    $("planNet").addEventListener("change", () => (this.net = $("planNet").value));
    $("planRename").addEventListener("click", () => this.rename());
    $("planDelete").addEventListener("click", () => this.deleteSelected());
    $("planUndo").addEventListener("click", () => this.undo());
  }

  // Picks a layout tool, or none.
  setTool(tool) {
    this.tool = tool;
    this.hover = null;
    this.ghost = null;
    this.drawPreview();
  }

  remember() {
    this.history.push(this.layout.toJSON());
    if (this.history.length > UNDOS) this.history.shift();
  }

  undo() {
    const last = this.history.pop();
    if (!last) return this.status("nothing to undo");
    const carved = this.layout.carved;
    this.layout.load(last);
    this.layout.carved = carved;
    if (!this.layout.get(this.selected)) this.selected = null;
    this.status("");
    this.carve();
  }

  deleteSelected() {
    if (!this.selected) return;
    this.remember();
    this.layout.remove(this.selected);
    this.selected = null;
    this.carve();
  }

  // Renames the network picked to the name typed.
  rename() {
    const [from, to] = [this.net, slugOf($("planNetName").value)];
    if (from === NEW) return;
    const problem = this.nameProblem(to);
    if (problem) return this.status(problem);
    this.remember();
    this.layout.renameNetwork(from, to);
    this.net = to;
    $("planNetName").value = "";
    this.carve();
  }

  // Why a network can't be named `slug`, or null.
  nameProblem(slug) {
    if (!slug) return "name the network first";
    if (!NET_SLUG.test(slug)) return "a network's name is words of letters and digits";
    if (this.layout.networks.has(slug)) return `there's a network named ${slug} already`;
    return null;
  }

  // Carves what's changed since it was last carved: fills in what it carved before, then carves it
  // as it is now, with what that fills in.
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

  // The entrance the pointer would place, its floor HOLD_FT in where the pointer meets the
  // ground: { entrance, problem }, with why it can't go there, or null where the pointer's off the
  // ground.
  entranceAt() {
    const ground = this.groundHit();
    if (!ground) return null;
    const facing = new THREE.Vector3();
    this.camera.getWorldDirection(facing);
    const yaw = (((Math.round((Math.atan2(facing.x, facing.z) * 180) / Math.PI) + this.turn) % 360) + 360) % 360;
    const entrance = { ...this.details, mouth: mouthBehind(ground, { ...this.details, yaw }, HOLD_FT), yaw };
    return { entrance, problem: entranceProblem(entrance, this.groundAt) };
  }

  // The element at the pointer, nearest the camera: an entrance, by any of its lines, or a point,
  // by its middle or its ring.
  pick([px, py]) {
    let best = null;
    const consider = (id, at, lines) => {
      const middle = this.screen(at);
      const near =
        (middle && Math.hypot(middle[0] - px, middle[1] - py) <= PICK_PX) ||
        lines.some((points) => {
          const seen = points.map((p) => this.screen(p));
          return seen.some((a, i) => i > 0 && a && seen[i - 1] && toSegment([px, py], seen[i - 1], a) <= PICK_PX / 2 + 2);
        });
      if (!near) return;
      const d = this.camera.position.distanceTo(new THREE.Vector3(...at));
      if (!best || d < best.d) best = { id, d };
    };
    for (const e of this.layout.entrances.values()) consider(e.id, e.mouth, entranceLines(e, () => -Infinity).map((line) => line.points));
    for (const p of this.layout.points.values()) consider(p.id, p.at, [pointRing(p)]);
    return best?.id ?? null;
  }

  // Where go to takes the builder for the pointer at [px, py]: the floor of a point, or of an
  // entrance's far end, or null.
  target(px) {
    const id = this.pick(px);
    const e = id && this.layout.entrances.get(id);
    const point = e ? this.layout.points.get(e.point) : id && this.layout.points.get(id);
    return point ? [...point.at] : null;
  }

  // The left button down, with a layout tool picked.
  down(e) {
    if (this.tool === "passage" && !e.shiftKey) return this.placePassage();
    const picked = this.pick(this.pointerPx(e));
    if (picked) return (this.selected = picked);
    if (this.tool === "passage") return (this.selected = null);
    const spot = this.tool === "entrance" && this.entranceAt();
    if (spot?.problem) return this.status(spot.problem);
    if (spot) {
      // A new network's named as the entrance that starts it is placed.
      const slug = this.net === NEW ? slugOf($("planNetName").value) : this.net;
      if (this.net === NEW) {
        const problem = this.nameProblem(slug);
        if (problem) return this.status(problem);
      }
      this.remember();
      if (this.net === NEW) {
        this.layout.addNetwork(slug);
        this.net = slug;
        $("planNetName").value = "";
      }
      this.selected = this.layout.addEntrance(slug, spot.entrance).id;
      return this.carve();
    }
    this.selected = null;
  }

  // Lays out the passage aimed, and selects its far point.
  placePassage() {
    const ghost = this.ghost;
    if (!ghost) return this.status("place an entrance first, then lay passages out from inside");
    if (ghost.problem) return this.status(ghost.problem);
    this.remember();
    this.selected = this.layout.extend(ghost.from, ghost.to ? { to: ghost.to } : { at: ghost.at }).id;
    this.net = this.layout.points.get(this.selected).net;
    this.carve();
    if (ghost.warnings.length) this.status(ghost.warnings.join("; "));
    this.aim();
  }

  // The passage aimed, as `ghost`: from the nearest spot on a passage to you to where you look,
  // `reach` ft past you, or to the spot on another passage that's near it.
  aim() {
    const ray = this.ray()?.ray;
    const here = this.here();
    let from = null;
    for (const net of this.layout.networks.keys()) {
      const spot = this.layout.nearest(net, here);
      if (spot && (!from || spot.d < from.d)) from = { ...spot, net };
    }
    if (!ray || !from) return (this.ghost = null);
    const yaw = Math.atan2(ray.direction.x, ray.direction.z);
    let up = Math.asin(ray.direction.y) + CAMERA.pitch;
    if (Math.abs(up) < LEVEL_RAD) up = 0;
    let at = here.map((v, k) => v + this.reach * [Math.sin(yaw) * Math.cos(up), Math.sin(up), Math.cos(yaw) * Math.cos(up)][k]);
    // Near another passage, to it, but not back along where it goes on from.
    const skip = new Set([from.id]);
    for (const s of this.layout.segments.values()) if (s.from === from.id || s.to === from.id) skip.add(s.id);
    let to = this.layout.nearest(from.net, at, skip);
    if (to && to.d <= SNAP_FT && Math.hypot(...to.at.map((v, k) => v - from.at[k])) > JOIN_FT) at = to.at;
    else to = null;
    const start = configNear(this.layout, from);
    const ends = [{ ...start, at: from.at }, { ...start, at }];
    const length = Math.hypot(...at.map((v, k) => v - from.at[k]));
    const problem = length < JOIN_FT ? "a passage has to be longer than that" : segmentShapes({ ends }).every((shape) => fits(shape, this.groundAt)) ? null : "a passage has to stay under the ground";
    const joins = [from, to].filter(Boolean).flatMap((spot) => {
      const segment = this.layout.segments.get(spot.id);
      return segment ? [segment.from, segment.to] : [spot.id];
    });
    this.ghost = { from, to, at, ends, problem, warnings: passageWarnings(this.layout, from.net, ends, joins) };
  }

  wheel(e) {
    if (this.tool !== "passage") return false;
    this.reach = Math.max(REACH_FT[0], Math.min(REACH_FT[2], this.reach + Math.sign(e.deltaY) * REACH_STEP_FT));
    return true;
  }

  move() {
    this.hover = this.tool === "entrance" ? this.entranceAt() : null;
    if (this.tool === "passage") this.aim();
    this.drawPreview();
    // Why what's pointed at can't go there, while it can't.
    const problem = this.hover?.problem ?? this.ghost?.problem ?? (this.ghost?.warnings.join("; ") || null);
    if (problem !== this.shownProblem) this.status(problem ?? "");
    this.shownProblem = problem;
  }

  up() {}

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
    if (e.key === "Escape" && this.selected) {
      this.selected = null;
      return true;
    }
    return false;
  }

  // Each frame: the layout's shown in the earth, and with a layout tool.
  tick(inEarth) {
    if (!this.settled) {
      this.settled = true;
      this.carve();
    }
    this.group.visible = inEarth || Boolean(this.tool) || this.caves.view === "config";
    if (!this.group.visible) return;
    const { clientWidth: w, clientHeight: h } = this.canvas;
    for (const material of this.materials.values()) material.resolution.set(w, h);
    const made = `${this.layout.version} ${this.selected}`;
    if (made !== this.drawn) this.draw(made);
    // You and the camera move without the pointer moving.
    if (this.tool === "passage") this.move();
    if (this.tool) this.showDetails();
  }

  // A line through `points` (continent feet), `width` ft thick, colored `rgb`, glowing.
  line(points, width, rgb) {
    for (const glow of [true, false]) {
      const geometry = new LineGeometry();
      geometry.setPositions(points.flat());
      geometry.setColors(points.flatMap(() => (!glow ? rgb : rgb === CORE_RGB ? GLOW_RGB : rgb.map((v) => v * 0.4))));
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

  // Draws the entrances, each its tube and mouth's ring, the points, each a ring round its floor,
  // and the segments, each along its line; what's selected in yellow.
  draw(made) {
    this.drawn = made;
    for (const child of [...this.drawing.children]) {
      this.drawing.remove(child);
      child.geometry.dispose();
    }
    const rgbOf = (id, rgb) => (id === this.selected ? SELECTED_RGB : rgb);
    for (const e of this.layout.entrances.values()) for (const { points } of entranceLines(e, () => -Infinity)) this.line(points, Math.max(0.25, e.width / 32), rgbOf(e.id, OPENING_RGB));
    for (const p of this.layout.points.values()) this.line(pointRing(p), Math.max(0.25, p.width / 32), rgbOf(p.id, CORE_RGB));
    for (const s of this.layout.segments.values()) {
      const [a, b] = [s.from, s.to].map((id) => this.layout.points.get(id));
      this.line([a.at, b.at], 0.5, rgbOf(s.id, steep(a, b) ? WARN_RGB : CORE_RGB));
    }
  }

  // Draws the entrance the pointer would place, red where it can't go.
  drawPreview() {
    for (const child of [...this.preview.children]) {
      this.preview.remove(child);
      child.geometry.dispose();
    }
    const spot = this.tool === "entrance" && this.hover?.entrance && this.hover;
    const ghost = this.tool === "passage" && this.ghost;
    if (!spot && !ghost) return;
    const [positions, colors] = [[], []];
    const lines = spot ? entranceLines(spot.entrance, this.groundAt, spot.problem) : passageLines(ghost);
    for (const { points, open } of lines) {
      for (let i = 1; i < points.length; i++) {
        positions.push(...points[i - 1], ...points[i]);
        for (let k = 0; k < 2; k++) colors.push(...(!open ? STEEP_RGB : ghost?.warnings.length ? WARN_RGB : OPENING_RGB));
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

  // The panel: the networks to pick from, what the details are of, and their values.
  showDetails() {
    const selected = this.selected && this.layout.get(this.selected);
    if (selected) this.net = selected.net;
    const nets = [...this.layout.networks.keys()].sort();
    if (nets.join(",") !== this.listed) {
      this.listed = nets.join(",");
      $("planNet").replaceChildren(new Option("new network", NEW), ...nets.map((slug) => new Option(slug, slug)));
    }
    if (!this.layout.networks.has(this.net)) this.net = NEW;
    $("planNet").value = this.net;
    $("planRename").hidden = this.net === NEW;
    $("planNetName").placeholder = this.net === NEW ? "new network's name" : `rename ${this.net} to`;
    const e = selected && this.layout.entrances.get(this.selected);
    const point = selected && this.layout.points.get(this.selected);
    const d = e ?? point ?? this.details;
    $("planWhat").textContent = e ? `entrance ${e.id} into ${e.net}` : point ? `point ${point.id} in ${point.net}` : this.tool === "passage" ? "no point selected" : "the next entrance";
    $("planEntranceDetails").hidden = Boolean(point) || (this.tool === "passage" && !e);
    $("planPointDetails").hidden = !point;
    $("planReachOut").textContent = `${this.reach} ft`;
    if (point) {
      for (const key of ["width", "height"]) {
        if (document.activeElement !== $(`planPoint-${key}`)) $(`planPoint-${key}`).value = String(point[key]);
        $(`planPoint-${key}Out`).textContent = `${point[key]} ft`;
      }
      for (const button of document.querySelectorAll("[data-quality]")) button.setAttribute("aria-pressed", String(point.qualities.includes(button.dataset.quality)));
    }
    if (document.activeElement !== $("planRock")) $("planRock").value = String(d.rock);
    $("planHewn").checked = d.hewn;
    for (const button of document.querySelectorAll("[data-entrance-style]")) button.setAttribute("aria-pressed", String(button.dataset.entranceStyle === d.style));
    for (const button of document.querySelectorAll("[data-entrance-length]")) button.setAttribute("aria-pressed", String(Number(button.dataset.entranceLength) === d.length));
    for (const button of document.querySelectorAll("[data-entrance-slope]")) button.setAttribute("aria-pressed", String(button.dataset.entranceSlope === d.slope));
    if (document.activeElement !== $("planEntranceWidth")) $("planEntranceWidth").value = String(d.width);
    $("planEntranceWidthOut").textContent = `${d.width} ft`;
    $("planDelete").disabled = !selected;
  }
}

// The config of the point a passage from spot `spot` (Layout's nearest) goes on from: the point's,
// or on a segment, its nearer end's.
function configNear(layout, spot) {
  const segment = layout.segments.get(spot.id);
  if (!segment) return configOf(layout.points.get(spot.id));
  const ends = [segment.from, segment.to].map((id) => layout.points.get(id));
  const d = (p) => Math.hypot(...p.at.map((v, k) => v - spot.at[k]));
  return configOf(d(ends[0]) <= d(ends[1]) ? ends[0] : ends[1]);
}

// A passage aimed's lines, continent feet, each { points, open }: along its floor, a ring round
// its far end's floor, and an arch at each end as wide and high as its passage; `open` false
// where it can't go.
function passageLines({ ends, problem }) {
  const open = !problem;
  const [a, b] = ends.map((end) => end.at);
  const yaw = Math.atan2(b[0] - a[0], b[2] - a[2]);
  const side = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const arch = ({ at, width, height }) => Array.from({ length: 17 }, (_, i) => {
    const t = (i / 16) * Math.PI;
    return at.map((v, k) => v + side[k] * Math.cos(t) * (width / 2) + (k === 1 ? Math.sin(t) * height : 0));
  });
  const ring = pointRing(ends[1]);
  return [
    { points: [a, b], open },
    ...ends.flatMap((end) => arch(end).map((p, i, all) => ({ points: [p, all[Math.min(i + 1, all.length - 1)]], open }))),
    ...ring.slice(1).map((p, i) => ({ points: [ring[i], p], open })),
  ];
}

// A ring round a point's floor, as wide as its passage, continent feet.
function pointRing({ at: [x, y, z], width }) {
  const R = width / 2;
  return Array.from({ length: 33 }, (_, i) => [x + R * Math.cos((i / 32) * Math.PI * 2), y, z + R * Math.sin((i / 32) * Math.PI * 2)]);
}

// An entrance's lines, continent feet, each { points, open }: its mouth's ring, a point at a
// time, `open` false where it's in the ground and can't be; and its tube's top and sides, `open`
// false where its far end isn't under the ground (problem).
function entranceLines(entrance, groundAt, problem = null) {
  const ring = entranceRing(entrance, groundAt);
  const out = ring.map((p, i) => ({ points: [p.at, ring[(i + 1) % ring.length].at], open: p.open && ring[(i + 1) % ring.length].open }));
  const along = entranceEnd(entrance).map((v, k) => v - entrance.mouth[k]);
  for (const i of [ring.length / 4, ring.length / 2, (3 * ring.length) / 4]) {
    const p = ring[i].at;
    out.push({ points: [p, p.map((v, k) => v + along[k])], open: !problem?.includes("far end") });
  }
  return out;
}

// How far point p is from the segment a to b, in pixels.
function toSegment([px, py], [ax, ay], [bx, by]) {
  const [dx, dy] = [bx - ax, by - ay];
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
