import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { NET_SLUG } from "../v2/caves.js";
import { CAMERA } from "./builder.js";
import { reachOf } from "./caveQualities.js";
import { alert } from "./alerts.js";
import { ENTRANCE_DEFAULTS, ENTRANCE_FT, POINT_DEFAULTS, JOIN_FT, POINT_FT, ROCK_FT, EXCLUSIVE, carvePlan, configOf, entranceEnd, entranceProblem, entranceRing, fits, mouthBehind, passageWarnings, rockProblem, segmentShapes, steep } from "./caveLayout.js";

// The caves' layout tools (caveLayout.js), and the panel for the network you're in. Select picks
// an entrance or point by its dot, or nothing, and never places one. Entrance, from above the ground, places an entrance
// held where the pointer meets it, HOLD_FT in from its mouth: a tube into the hillside, facing the
// way the camera looks, turned with C and V, ending at a point passages go on from. Its mouth has
// to be out in the air but for the bottom of it, and it's red where it isn't. A new entrance
// starts a new cave network, named in its options, or goes into one picked there. A click picks an
// entrance; the options show its details, or those of the next one placed, and changing them
// changes it. Each change carves what it changed straight away (caveLayout.js's carvePlan), and
// undoes on its own. What can't be done alerts why when you try it (alerts.js), never while you
// only aim.
//
// Add, from inside a cave, lays out passages: the new point goes the way you look, REACH_FT
// from your feet, level when you look straight ahead (the camera at rest, the pointer in the
// middle), the scroll wheel setting how far, and the passage goes on to it from the nearest
// spot on a passage to you, splitting it there unless a point's within its passage's width
// (Layout's joinAt). Aimed near another passage, it snaps to it, to make a loop. A ghost of it
// shows as you aim, red where it can't go, too near a passage it doesn't join or another network
// (caveLayout.js's rockProblem) among others, and orange where it's too steep to walk. Passages
// too steep to walk are drawn orange. Add has its own options, taken from the point nearest you
// when it's picked, and the points it places take them; a point it splits a passage with takes
// its nearer end's.
//
// The current network is the one you're in, or were last in. The panel shows it and switches it
// between layout and polish: polish locks its layout so its rock can be edited by hand, its lines
// drawn dim; going back to layout, asked first in a dialog, carves it again from its layout,
// throwing away its hand edits.
//
// The layout's drawn as dots, an entrance's at its mouth and a point's on its floor, joined by
// faint lines; the one hovered or selected shows its size in faint lines too: an entrance its
// mouth's ring and its tube, a point a ring on its floor and a rod as tall as its passage.

const PICK_PX = 14; // how near the pointer an entrance or point is picked
const CORE_RGB = [0.3, 0.65, 1];
const SELECTED_RGB = [1, 0.88, 0.3];
const STEEP_RGB = [1, 0.25, 0.2];
const OPENING_RGB = [0.45, 1, 0.9];
const WARN_RGB = [1, 0.6, 0.15];
const LOCKED_RGB = [0.35, 0.4, 0.5];
const LINE_FT = 0.12; // the faint lines: segments, and rings and rods round what's hovered
const LINE_OPACITY = 0.3;
const DOT_GEOMETRY = new THREE.SphereGeometry(1, 16, 10); // an entrance or point, to pick
const DOT_SCALE = 0.02; // a dot's radius for each foot it is from the camera, so it's the same size on screen
const TURN_DEG = 15; // how far C and V turn an entrance, or with shift FINE_TURN_DEG
const FINE_TURN_DEG = 5;
const HOLD_FT = 10; // how far in from an entrance's mouth the pointer holds it
const UNDOS = 100;
const REACH_FT = [8, 32, 96]; // how far past you a passage reaches: least, at first, most
const REACH_STEP_FT = 4;
const LEVEL_RAD = 0.06; // how far either way of straight ahead a passage aimed is level
const NEW = ""; // the entrance network picker's value for a new network
const ROCKS = 4; // rock types, 0 to 3, picked with the number keys 2 to 5
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
    this.tool = null; // "caveSelect", "entrance" or "caveAdd" while it's picked
    this.reach = REACH_FT[1]; // how far past you a passage reaches
    this.ghost = null; // the passage aimed, { from, to, at, ends, problem }
    this.selected = null; // the id of the element selected
    this.hover = null; // the entrance the pointer would place, { entrance, problem }
    this.pointer = null; // where the pointer is on the canvas, [x, y] px, or null
    this.hovered = null; // the id of the entrance or point the pointer's on
    this.turn = 0; // degrees an entrance is turned from the way the camera looks
    this.history = []; // { net, layout }: the layout as it was before each change to network `net`, latest last
    this.details = { ...ENTRANCE_DEFAULTS };
    this.adding = configOf(POINT_DEFAULTS); // add's options, which the points it places take
    this.net = NEW; // the network new entrances go into, or NEW
    this.current = null; // the network you're in, or were last in, or null
    this.shown = false; // whether the layout's drawn (the panel's layout checkbox)
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
    this.lineMaterial = new LineMaterial({ linewidth: LINE_FT, worldUnits: true, vertexColors: true, depthTest: false, depthWrite: false, transparent: true, opacity: LINE_OPACITY });
    this.dotMaterials = new Map(); // "r,g,b" -> MeshBasicMaterial
    this.bind();
  }

  bind() {
    const changeDetail = (key, value) => {
      if (this.tool === "caveAdd") return key in this.adding && (this.adding[key] = value);
      if (this.lockedProblem(this.layout.get(this.selected)?.net)) return alert(this.lockedProblem(this.layout.get(this.selected).net));
      const point = this.layout.points.get(this.selected);
      if (point) {
        if (point[key] === value || !(key in point)) return;
        this.remember(point.net);
        point[key] = value;
        this.layout.version++;
        return this.carve();
      }
      const e = this.layout.entrances.get(this.selected);
      if (!e) return (this.details[key] = value);
      if (e[key] === value) return;
      // An entrance changed has to fit where it is.
      const problem = entranceProblem({ ...e, [key]: value }, this.groundAt);
      if (problem) return alert(problem);
      this.remember(e.net);
      e[key] = value;
      const end = this.layout.points.get(e.point);
      end.at = entranceEnd(e);
      if (key === "rock") end[key] = value;
      this.layout.version++;
      this.carve();
    };
    this.changeDetail = changeDetail;
    for (const button of document.querySelectorAll('[data-rocks="plan"] [data-rock]')) button.addEventListener("click", () => changeDetail("rock", Number(button.dataset.rock)));
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
        const point = this.tool === "caveAdd" ? this.adding : this.layout.points.get(this.selected);
        if (!point) return;
        const q = button.dataset.quality;
        const others = EXCLUSIVE.find((group) => group.includes(q)) ?? [q];
        changeDetail("qualities", point.qualities.includes(q) ? point.qualities.filter((x) => x !== q) : [...point.qualities.filter((x) => !others.includes(x)), q]);
      });
    }
    $("planNet").addEventListener("change", () => (this.net = $("planNet").value));
    $("caveRename").addEventListener("change", () => this.rename());
    $("cavePhaseSwitch").addEventListener("click", () => this.switchPhase());
    $("caveUnlockYes").addEventListener("click", () => {
      $("caveUnlockAsk").close();
      this.unlock();
    });
    $("caveUnlockNo").addEventListener("click", () => $("caveUnlockAsk").close());
    $("planDelete").addEventListener("click", () => this.deleteSelected());
  }

  // Picks a layout tool, or none. Add takes its options from the point nearest you.
  setTool(tool) {
    if (tool === "caveAdd" && this.tool !== tool) {
      const here = this.here();
      let near = null;
      for (const net of this.layout.networks.keys()) {
        const spot = this.layout.nearest(net, here);
        if (spot && (!near || spot.d < near.d)) near = spot;
      }
      if (near) this.adding = configNear(this.layout, near);
    }
    this.tool = tool;
    this.hover = null;
    this.ghost = null;
    this.drawPreview();
  }

  // Keeps the layout as it is, before a change to network `net`. Switching phase isn't kept:
  // it's never undone.
  remember(net) {
    // A copy: changes are made in place, and would change what's kept.
    this.history.push({ net, layout: structuredClone(this.layout.toJSON()) });
    if (this.history.length > UNDOS) this.history.shift();
  }

  // Undoes the last layout change, but not one to a network being polished. Gives false where
  // there's nothing it can undo.
  undo() {
    const last = this.history.at(-1);
    if (!last) return false;
    if (this.layout.locked(last.net)) {
      alert(`the last layout change was to ${last.net}, which is being polished`);
      return true;
    }
    this.history.pop();
    this.restore(last);
    this.carve(false);
    return true;
  }

  // Puts the layout back as it was in history entry `last`, keeping what's carved and each
  // network's phase as it is now.
  restore(last) {
    const carved = this.layout.carved;
    const phases = new Map([...this.layout.networks].map(([slug, n]) => [slug, n.phase]));
    this.layout.load(last.layout);
    this.layout.carved = carved;
    for (const [slug, n] of this.layout.networks) if (phases.has(slug)) n.phase = phases.get(slug);
    this.layout.version++;
    if (!this.layout.get(this.selected)) this.selected = null;
    if (!this.layout.networks.has(this.net)) this.net = NEW;
    if (!this.layout.networks.has(this.current)) this.current = null;
  }

  deleteSelected() {
    if (!this.selected) return;
    const locked = this.lockedProblem(this.layout.get(this.selected)?.net);
    if (locked) return alert(locked);
    this.remember(this.layout.get(this.selected).net);
    this.layout.remove(this.selected);
    this.selected = null;
    this.carve();
  }

  // Renames the current network to the name typed.
  rename() {
    const [from, to] = [this.current, slugOf($("caveRename").value)];
    $("caveRename").value = "";
    if (!from || !to) return;
    const problem = this.lockedProblem(from) ?? this.nameProblem(to);
    if (problem) return alert(problem);
    this.remember(to);
    this.layout.renameNetwork(from, to);
    if (this.net === from) this.net = to;
    this.current = to;
    this.carve();
  }

  // Why network `net`'s layout can't change, or null where it can.
  lockedProblem(net) {
    return net && this.layout.locked(net) ? `${net} is being polished; you can't change its layout until it's back in layout` : null;
  }

  // Starts polishing the current network, or asks, in a dialog, to take it back to layout.
  switchPhase() {
    const net = this.current;
    if (!net) return;
    if (this.layout.locked(net)) {
      $("caveUnlockNet").textContent = net;
      return $("caveUnlockAsk").showModal();
    }
    this.layout.setPhase(net, "polish");
    alert(`${net} is being polished`);
  }

  // Takes the current network back to layout, carving it again from its layout. Its hand edits
  // are gone, and their undos with them (onUnlock); its layout changes can still be undone.
  unlock() {
    const net = this.current;
    if (!net || !this.layout.locked(net)) return;
    this.layout.setPhase(net, "layout");
    const plan = carvePlan(this.layout, { afresh: net }, this.groundAt);
    this.caves.carvePlan(plan, () => {});
    if (this.caves.refused) {
      this.layout.setPhase(net, "polish");
      return alert(this.caves.refused);
    }
    this.layout.carved = plan.carved;
    this.layout.version++;
    this.onUnlock?.(net);
    alert(`${net} is back in layout and carved again from it`);
  }

  // Why a network can't be named `slug`, or null.
  nameProblem(slug) {
    if (!slug) return "name the network first";
    if (!NET_SLUG.test(slug)) return "a network's name is words of letters and digits";
    if (this.layout.networks.has(slug)) return `there's a network named ${slug} already`;
    return null;
  }

  // Carves what's changed since it was last carved: fills in what it carved before, then carves it
  // as it is now, with what that fills in. Where the caves refuse it, the change to the layout
  // goes back, unless it was an undo (`revert` false), and it gives false.
  carve(revert = true) {
    const plan = carvePlan(this.layout, undefined, this.groundAt);
    if ((plan.fills.length || plan.opens.length) && !this.caves.carvePlan(plan, () => {}) && this.caves.refused) {
      const last = revert && this.history.pop();
      if (last) this.restore(last);
      alert(this.caves.refused);
      return false;
    }
    this.layout.carved = plan.carved;
    this.layout.version++;
    if (plan.unfit.length) alert(`${plan.unfit.join(", ")} won't fit under the ground, so ${plan.unfit.length > 1 ? "aren't" : "isn't"} carved`);
    return true;
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

  // The entrance or point whose dot is at the pointer, nearest the camera.
  pick([px, py]) {
    let best = null;
    const consider = (id, at) => {
      const seen = this.screen(at);
      if (!seen || Math.hypot(seen[0] - px, seen[1] - py) > PICK_PX) return;
      const d = this.camera.position.distanceTo(new THREE.Vector3(...at));
      if (!best || d < best.d) best = { id, d };
    };
    for (const e of this.layout.entrances.values()) consider(e.id, e.mouth);
    for (const p of this.layout.points.values()) consider(p.id, p.at);
    return best?.id ?? null;
  }


  // The left button down, with a layout tool picked.
  down(e) {
    const picked = this.pick(this.pointerPx(e));
    if (picked || this.tool === "caveSelect") return (this.selected = picked);
    if (this.tool === "caveAdd") return this.placePassage();
    const spot = this.tool === "entrance" && this.entranceAt();
    if (spot?.problem) return alert(spot.problem);
    if (spot && this.lockedProblem(this.net)) return alert(this.lockedProblem(this.net));
    if (spot) {
      // A new network's named as the entrance that starts it is placed.
      const slug = this.net === NEW ? slugOf($("planNetName").value) : this.net;
      if (this.net === NEW) {
        const problem = this.nameProblem(slug);
        if (problem) return alert(problem);
      }
      this.remember(slug);
      if (this.net === NEW) {
        this.layout.addNetwork(slug);
        this.net = slug;
        $("planNetName").value = "";
      }
      this.selected = this.layout.addEntrance(slug, spot.entrance).id;
      this.current = slug;
      return this.carve();
    }
    this.selected = null;
  }

  // Lays out the passage aimed, and selects its far point.
  placePassage() {
    const ghost = this.ghost;
    if (!ghost) {
      const open = [...this.layout.networks.keys()].some((net) => !this.layout.locked(net));
      return alert(open || !this.layout.networks.size ? "place an entrance first, then add passages from inside" : "every network is being polished; take one back to layout to add passages to it");
    }
    if (ghost.problem) return alert(ghost.problem);
    this.remember(ghost.from.net);
    this.selected = this.layout.extend(ghost.from, ghost.to ? { to: ghost.to } : { at: ghost.at, config: this.adding }).id;
    this.current = this.layout.points.get(this.selected).net;
    if (this.carve() && ghost.warnings.length) alert(ghost.warnings.join("; "));
    this.aim();
  }

  // The passage aimed, as `ghost`: from the nearest spot on a passage to you to where you look,
  // `reach` ft past you, or to the spot on another passage that's near it.
  aim() {
    const ray = this.ray()?.ray;
    const here = this.here();
    let from = null;
    for (const net of this.layout.networks.keys()) {
      if (this.layout.locked(net)) continue;
      const spot = this.layout.nearest(net, here);
      if (spot && (!from || spot.d < from.d)) from = { ...this.layout.joinAt(spot), net };
    }
    if (!ray || !from) return (this.ghost = null);
    const yaw = Math.atan2(ray.direction.x, ray.direction.z);
    let up = Math.asin(ray.direction.y) + CAMERA.pitch;
    if (Math.abs(up) < LEVEL_RAD) up = 0;
    let at = here.map((v, k) => v + this.reach * [Math.sin(yaw) * Math.cos(up), Math.sin(up), Math.cos(yaw) * Math.cos(up)][k]);
    // Near enough another passage that there'd be less than ROCK_FT of rock between them, to it,
    // but not to the passages within two links of where it goes on from.
    const start = configNear(this.layout, from);
    const skip = new Set([from.id]);
    const close = this.closeTo(from);
    for (const id of [...this.layout.points.keys(), ...this.layout.segments.keys()]) if (close({ id })) skip.add(id);
    let to = this.layout.nearest(from.net, at, skip);
    if (to && to.d < sizeFt(start, 0) + sizeFt(configNear(this.layout, to), lengthOf(this.layout, to)) + ROCK_FT && Math.hypot(...to.at.map((v, k) => v - from.at[k])) > JOIN_FT) at = to.at;
    else to = null;
    const ends = [{ ...start, at: from.at }, { ...(to ? configNear(this.layout, to) : this.adding), at }];
    const length = Math.hypot(...at.map((v, k) => v - from.at[k]));
    const joins = [from, to].filter(Boolean).flatMap((spot) => {
      const segment = this.layout.segments.get(spot.id);
      return segment ? [segment.from, segment.to] : [spot.id];
    });
    const problem =
      length < JOIN_FT
        ? "a passage has to be longer than that"
        : to && this.tooClose(from, to)
          ? "a passage can't join a point within two links of where it starts"
          : (rockProblem(this.layout, from.net, ends, joins) ?? (segmentShapes({ ends }).every((shape) => fits(shape, this.groundAt)) ? null : "a passage has to stay under the ground"));
    this.ghost = { from, to, at, ends, problem, warnings: passageWarnings(this.layout, from.net, ends) };
  }

  // Whether a passage from spot `from` to spot `to` (each a point or a spot on a segment, as
  // nearest gives them) would join points within two links of each other. A spot on a segment
  // becomes a point a link from each of its ends.
  tooClose(from, to) {
    return this.closeTo(from)(to);
  }

  // tooClose for passages from `from`, as a test of where they go to, worked out once.
  closeTo(from) {
    const ends = (spot) => {
      const segment = this.layout.segments.get(spot.id);
      return segment ? [segment.from, segment.to] : [spot.id];
    };
    const steps = 2 - this.layout.segments.has(from.id);
    const near = [steps - 1, steps].map((n) => new Set(n < 0 ? [] : this.layout.around(ends(from), n)));
    return (to) => ends(to).some((id) => near[this.layout.segments.has(to.id) ? 0 : 1].has(id));
  }

  wheel(e) {
    if (this.tool !== "caveAdd") return false;
    this.reach = Math.max(REACH_FT[0], Math.min(REACH_FT[2], this.reach + Math.sign(e.deltaY) * REACH_STEP_FT));
    return true;
  }

  move(e) {
    if (e?.clientX !== undefined) this.pointer = this.pointerPx(e);
    this.hover = this.tool === "entrance" ? this.entranceAt() : null;
    if (this.tool === "caveAdd") this.aim();
    this.drawPreview();
  }

  up() {}

  // Gives whether it took the key.
  key(e) {
    const k = e.key.toLowerCase();
    const rock = Number(e.key) - 2;
    if (rock >= 0 && rock < ROCKS && !e.ctrlKey && !e.metaKey && !e.altKey) {
      this.changeDetail("rock", rock);
      return true;
    }
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

  // Each frame: the current network follows you into the one you're in, and the layout's drawn
  // in the earth, and where it's shown.
  tick(inEarth) {
    if (!this.settled) {
      this.settled = true;
      this.carve(false);
    }
    const [x, y, z] = this.here();
    const net = y < this.groundAt(x, z) ? this.caves.netAt(x, z) : null;
    if (net && this.layout.networks.has(net)) this.current = net;
    if (!this.layout.networks.has(this.current)) this.current = null;
    this.group.visible = inEarth || this.shown;
    if (!this.group.visible) return;
    const { clientWidth: w, clientHeight: h } = this.canvas;
    this.lineMaterial.resolution.set(w, h);
    this.hovered = this.pointer && this.tool ? this.pick(this.pointer) : null;
    const made = `${this.layout.version} ${this.selected} ${this.hovered}`;
    if (made !== this.drawn) this.draw(made);
    for (const dot of this.drawing.children) if (dot.geometry === DOT_GEOMETRY) dot.scale.setScalar(this.camera.position.distanceTo(dot.position) * DOT_SCALE);
    // You and the camera move without the pointer moving.
    if (this.tool === "caveAdd") this.move();
    if (this.tool) this.showDetails();
  }

  // The panel: the current network, its counts and phase.
  showPanel() {
    const net = this.current;
    const count = (things) => [...things.values()].filter((t) => t.net === net).length;
    const [points, entrances] = net ? [count(this.layout.points), count(this.layout.entrances)] : [0, 0];
    $("caveNet").textContent = net ?? "no network";
    $("cavePhase").textContent = net ? `in ${this.layout.networks.get(net).phase}` : "";
    $("caveCounts").textContent = net ? `${points} point${points === 1 ? "" : "s"}, ${entrances} entrance${entrances === 1 ? "" : "s"}` : "place an entrance to start one";
    $("cavePhaseSwitch").hidden = !net;
    $("cavePhaseSwitch").textContent = this.layout.locked(net) ? "back to layout" : "start polishing";
    $("caveRename").hidden = !net;
    $("caveRename").placeholder = `rename ${net ?? ""} to`;
  }

  // A faint line through `points` (continent feet), colored `rgb`.
  line(points, rgb) {
    const geometry = new LineGeometry();
    geometry.setPositions(points.flat());
    geometry.setColors(points.flatMap(() => rgb));
    const line = new Line2(geometry, this.lineMaterial);
    line.renderOrder = 12;
    line.computeLineDistances();
    this.drawing.add(line);
  }

  // A dot at `at` (continent feet), colored `rgb`: an entrance or point, to pick.
  dot(at, rgb) {
    const key = rgb.join(",");
    if (!this.dotMaterials.has(key)) this.dotMaterials.set(key, new THREE.MeshBasicMaterial({ color: new THREE.Color(...rgb), depthTest: false, depthWrite: false, transparent: true }));
    const dot = new THREE.Mesh(DOT_GEOMETRY, this.dotMaterials.get(key));
    dot.position.set(...at);
    dot.renderOrder = 13;
    this.drawing.add(dot);
  }

  // Draws the entrances, each its tube and mouth's ring, the points, each a ring round its floor,
  // and the segments, each a faint line between them, only showing what's joined; what's selected
  // in yellow. Entrances and points are dots, with faint rings and rods for their size where
  // they're hovered or selected.
  draw(made) {
    this.drawn = made;
    for (const child of [...this.drawing.children]) {
      this.drawing.remove(child);
      if (child.geometry !== DOT_GEOMETRY) child.geometry.dispose();
    }
    const rgbOf = (id, rgb) => (id === this.selected ? SELECTED_RGB : this.layout.locked(this.layout.get(id)?.net) ? LOCKED_RGB : rgb);
    const shown = (id) => id === this.selected || id === this.hovered;
    for (const e of this.layout.entrances.values()) {
      this.dot(e.mouth, rgbOf(e.id, OPENING_RGB));
      this.line([e.mouth, this.layout.points.get(e.point).at], rgbOf(e.id, OPENING_RGB));
      if (shown(e.id)) for (const { points } of entranceLines(e, () => -Infinity)) this.line(points, rgbOf(e.id, OPENING_RGB));
    }
    for (const p of this.layout.points.values()) {
      this.dot(p.at, rgbOf(p.id, CORE_RGB));
      if (shown(p.id)) {
        this.line(pointRing(p), rgbOf(p.id, CORE_RGB));
        this.line([p.at, [p.at[0], p.at[1] + p.height, p.at[2]]], rgbOf(p.id, CORE_RGB));
      }
    }
    for (const s of this.layout.segments.values()) {
      const [a, b] = [s.from, s.to].map((id) => this.layout.points.get(id));
      this.line([a.at, b.at], rgbOf(s.id, steep(a, b) ? WARN_RGB : CORE_RGB));
    }
  }

  // Draws the entrance the pointer would place, red where it can't go.
  drawPreview() {
    for (const child of [...this.preview.children]) {
      this.preview.remove(child);
      child.geometry.dispose();
    }
    const spot = this.tool === "entrance" && this.hover?.entrance && this.hover;
    const ghost = this.tool === "caveAdd" && this.ghost;
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

  // The options: the networks to pick from, what the details are of, and their values; with add,
  // its own.
  showDetails() {
    const adding = this.tool === "caveAdd";
    const selected = (!adding && this.selected && this.layout.get(this.selected)) || null;
    const nets = [...this.layout.networks.keys()].sort();
    if (nets.join(",") !== this.listed) {
      this.listed = nets.join(",");
      $("planNet").replaceChildren(new Option("new network", NEW), ...nets.map((slug) => new Option(slug, slug)));
    }
    if (!this.layout.networks.has(this.net)) this.net = NEW;
    $("planNet").value = this.net;
    $("planNetName").hidden = this.net !== NEW;
    const e = (selected && this.layout.entrances.get(this.selected)) ?? null;
    const point = adding ? this.adding : ((selected && this.layout.points.get(this.selected)) ?? null);
    const d = e ?? point ?? this.details;
    const placing = this.tool === "entrance";
    $("planWhat").textContent = adding ? "the points added" : e ? `entrance ${e.id} into ${e.net}` : point ? `point ${point.id} in ${point.net}` : placing ? "the next entrance" : "nothing selected";
    $("planEntranceDetails").hidden = Boolean(point) || (!placing && !e);
    $("planPointDetails").hidden = !point;
    document.querySelector('[data-rocks="plan"]').hidden = !point && !e && !placing;
    $("planReachOut").textContent = `${this.reach} ft`;
    if (point) {
      for (const key of ["width", "height"]) {
        if (document.activeElement !== $(`planPoint-${key}`)) $(`planPoint-${key}`).value = String(point[key]);
        $(`planPoint-${key}Out`).textContent = `${point[key]} ft`;
      }
      for (const button of document.querySelectorAll("[data-quality]")) button.setAttribute("aria-pressed", String(point.qualities.includes(button.dataset.quality)));
    }
    for (const button of document.querySelectorAll('[data-rocks="plan"] [data-rock]')) button.setAttribute("aria-pressed", String(Number(button.dataset.rock) === d.rock));
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
// How far a passage with `config`, along a segment `length` ft long, reaches from its line.
const sizeFt = (config, length) => Math.max(config.width, config.height) / 2 + reachOf(config, length);

// How long the segment spot `spot` is on is, or 0 for a point.
function lengthOf(layout, spot) {
  const segment = layout.segments.get(spot.id);
  if (!segment) return 0;
  const [a, b] = [segment.from, segment.to].map((id) => layout.points.get(id).at);
  return Math.hypot(...b.map((v, k) => v - a[k]));
}

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

