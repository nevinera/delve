import * as THREE from "three";
import { VOXEL_FT } from "../v2/caves.js";
import { slabHome } from "../world/slabs.js";
import { SEA_LEVEL_FT } from "../v2/sizes.js";
import { PICK_PX } from "./areas.js";
import { Biomes } from "./biomes.js";
import { Courses } from "./courses.js";
import { CELLS, SHAPES, TURNS, noiseBrush, pullBrush, raiseBrush } from "./geo.js";
import { EMPTY_FT } from "./ground.js";
import { isSlab } from "./placed.js";
import { Draw } from "./draw.js";
import { Marks } from "./marks.js";
import { scatterPools } from "./marsh.js";
import { Measure } from "./measure.js";
import { CavePlan } from "./cavePlan.js";
import { CavePolish } from "./cavePolish.js";
import { Build } from "./build.js";
import { Paths } from "./paths.js";
import { TITLE_MAX } from "./pins.js";
import { STROKE_MAX_FT, Stroke } from "./stroke.js";
import { WaterBodies } from "./water.js";

// The tools' sidebar: the type of work and its tools above, the picked tool's settings below. A
// picked tool takes the left button, and Esc puts it down.
// - geo's draw: dragging draws a line to grow hills, a mountain range or a cliff along (draw.js,
//   growth.js).
// - planning's marker: dragging draws a line on the ground (stroke.js, marks.js), its eraser
//   cuts lines away where it's dragged, and select picks lines out, clicked or in a box dragged
//   round them, with shift more than one, for delete or backspace to delete whole. The pin tool
//   sticks pins in the ground. Clicking a pin's head, with no tool or with pin, or double-clicking
//   it with select, opens its title and content to edit. Select picks pins out too, and dragging
//   one picked out moves those picked out. Measure's click starts a ruler to the pointer, and its
//   drag draws a circle (measure.js). Path's clicks put a start and an end to search for the
//   shortest way on foot between (paths.js).
// - geo's biomes: clicking corners draws an area of a biome, closed by clicking its first corner,
//   double-clicking or Enter, and Esc throws it away (biomes.js). Clicking an area or its outline
//   picks it out; then its corners drag, shift-clicking one takes it away, dragging an edge adds
//   one, clicking inside it starts another area there, and clicking outside puts it back.
// - geo's water: the same for bodies of water (water.js), and the level of the one picked out
//   can be typed.
// - geo's courses: the same for streams and rivers, open lines from their source down, finished
//   by double-clicking or Enter (courses.js), and the widths of the one picked out can be typed.
// - geo's brushes, raise and lower, flatten, smooth, noise and clear: dragging on the ground works
//   them where the pointer is, and a ring on the ground shows where they reach. [ and ] resize
//   them, and c and v turn raise and lower's, shift+c and shift+v a little.
// - build's tools place objects, templates and slabs, and pick them to change (build.js).
// - caves' go to stands the builder on the floor of a cave's point or entrance where it's clicked;
//   place entrance and passage lay out cave networks (cavePlan.js), and polish edits a burned in
//   network's rock by hand, the right button placing voxels (cavePolish.js).
// - geo's pools: clicking scatters small swamp pools in the ring (marsh.js), and dragging scatters
//   more each time the ring's moved its radius. Its undo takes back the last scattering.

const MIN_RADIUS_FT = 16;
const MAX_RADIUS_FT = 16000;
const RING_POINTS = 96;
const PICK_FT = 30000; // how far off the pointer finds the ground
const PICK_LINE_PX = 8; // how near the pointer a line is picked out
const BOX_PX = 4; // how far the pointer's dragged before select draws a box
const BRUSHES = new Set(["raise", "flatten", "smooth", "noise", "pools", "clear", "eraser"]);
const PLANNING = new Set(["marker", "eraser", "select", "measure"]); // tools that work on lines drawn at sea level
const OPENS_PINS = new Set([null, "pin"]); // tools with which clicking a pin opens it
const BUILD = new Set(["pick", "object", "template", "slab", "stairs", "ramp"]);
const PLANS = new Set(["entrance", "passage"]);
const TURN_DEG = 15;
const FINE_TURN_DEG = 2;

const $ = (id) => document.getElementById(id);
// The kind an area tool's kind button picks.
const kindOf = (button) => button.dataset.biome ?? button.dataset.water ?? button.dataset.course;
// The draw tool's sliders, 0 to 1000, and the growth settings they set, some on a log scale,
// their ranges by what's grown.
const logSlider = (key, ranges, show) => {
  const range = (kind) => ranges[kind] ?? ranges.other;
  return {
    get: (s, kind) => Math.round((1000 * Math.log(s[key] / range(kind)[0])) / Math.log(range(kind)[1] / range(kind)[0])),
    set: (s, v, kind) => (s[key] = Math.round(range(kind)[0] * (range(kind)[1] / range(kind)[0]) ** (v / 1000))),
    show: (s) => show(s[key]),
  };
};
const GROW_SLIDERS = {
  growWidth: logSlider("width", { other: [400, 21120], cliff: [40, 2640] }, (ft) => `${ft.toLocaleString()} ft`),
  growHeight: logSlider("height", { other: [50, 3000], cliff: [8, 600] }, (ft) => `${ft.toLocaleString()} ft`),
  growDensity: { get: (s) => Math.round(((s.density - 0.2) / 5.8) * 1000), set: (s, v) => (s.density = 0.2 + (5.8 * v) / 1000), show: (s) => `×${s.density.toFixed(1)}` },
  growNoise: { get: (s) => Math.round(s.noise * 1000), set: (s, v) => (s.noise = v / 1000), show: (s) => `${Math.round(s.noise * 100)}%` },
};

// Draws a shape's profile into a thumbnail, across the way it's turned.
function drawShape(canvas, shape) {
  const g = canvas.getContext("2d");
  const { width: w, height: h } = canvas;
  g.clearRect(0, 0, w, h);
  g.fillStyle = "#c8b48a";
  g.beginPath();
  g.moveTo(0, h);
  for (let x = 0; x <= w; x++) g.lineTo(x, h - 2 - SHAPES[shape](Math.abs((2 * x) / w - 1), (2 * x) / w - 1) * (h - 4));
  g.lineTo(w, h);
  g.fill();
}

export class Tools {
  constructor({ scene, camera, canvas, builder, renditions, ground, placed, things, library, caves, layout, inEarth }) {
    this.inEarth = inEarth;
    Object.assign(this, { camera, canvas, builder, renditions, ground, caves, layout, placed });
    this.tool = null;
    this.settings = { shape: "round", radius: 0, strength: 0, noise: 0, lower: false, angle: 0, grain: 0, craggy: false };
    this.pools = { count: 0, size: 0 }; // the pools tool's settings
    this.poolUndos = []; // each scattering's pools and water bodies, latest last
    this.pointer = null; // normalized device coordinates, or null off the view
    this.stroke = null; // { invert } while the left button's down with the brush
    this.drawing = null; // the Stroke being drawn with the marker
    this.marks = new Marks(scene, (x, z) => this.surface(x, z), canvas.parentElement);
    this.pinColor = "red";
    this.measure = new Measure(canvas.parentElement);
    this.biomes = new Biomes(scene, (x, z) => this.surface(x, z), canvas.parentElement);
    this.biomesShown = false; // whether biome areas are shown with other tools too
    this.water = new WaterBodies(scene, (x, z) => this.surface(x, z), canvas.parentElement, (x, z) => renditions.heightAt(x, z) ?? EMPTY_FT);
    const stillAt = (x, z) => this.water.at(x, z)?.level ?? (renditions.seaAt(x, z) ? SEA_LEVEL_FT : null);
    this.courses = new Courses(scene, (x, z) => this.surface(x, z), canvas.parentElement, (x, z) => renditions.baseAt(x, z), stillAt);
    this.outlined = { biomes: this.biomes, water: this.water, courses: this.courses }; // each tool that draws areas, its areas
    this.draw = new Draw(scene, canvas.parentElement, renditions, ground, (x, z) => renditions.heightAt(x, z) ?? EMPTY_FT, () => this.showDraw(), this.biomes);
    // Measure's, { from, to } for a ruler, { middle, radius } for a circle, and while the button's
    // down, where it went down and whether a ruler or circle was shown before.
    this.measuring = null;
    this.build = new Build({
      scene,
      camera,
      canvas,
      placed,
      things,
      library,
      groundAt: (x, z) => renditions.heightAt(x, z) ?? EMPTY_FT,
      ray: () => {
        if (!this.pointer) return null;
        const ray = new THREE.Raycaster();
        ray.setFromCamera(this.pointer, this.camera);
        return ray;
      },
      groundHit: () => this.hit(),
      caveHit: () => this.caveHit(),
    });
    this.build.onPick = (tool) => this.tool !== tool && this.pick(tool);
    this.plan = new CavePlan({ scene, camera, canvas, layout, caves, ray: () => this.build.ray(), groundHit: () => this.hit(), groundAt: (x, z) => renditions.heightAt(x, z) ?? EMPTY_FT, here: () => [builder.state.x, builder.state.y, builder.state.z] });
    builder.wheel = (e) => PLANS.has(this.tool) && this.plan.wheel(e);
    this.polish = new CavePolish({ scene, caves, layout, camera, ray: () => this.build.ray() });
    // A thing under the ground in a cave network's chunk is that network's, and goes there only
    // while it's being polished.
    placed.caveOf = (thing) => {
      const [x, y, z] = isSlab(thing) ? slabHome(thing) : [thing.at[0], thing.y, thing.at[1]];
      return Number.isFinite(y) && y < (renditions.heightAt(x, z) ?? EMPTY_FT) ? caves.netAt(x, z) : null;
    };
    placed.caveProblem = (net) => (layout.locked(net) ? null : `${net} is still in layout; you can't add objects until it's being polished`);
    // Unlocking a network throws away its hand edits, and what's placed in it.
    this.plan.onUnlock = (net) => {
      this.polish.undos = [];
      this.placed.dropCave(net);
    };
    this.paths = new Paths(scene, canvas.parentElement, renditions, (x, z) => this.surface(x, z), (text) => ($("pathStatus").textContent = text));
    this.moving = null; // pins being dragged, { from, pins: [[pin, x, z]], before, moved }
    this.clicked = null; // a pin clicked, { pin }, or where the pin tool was clicked, { at }
    this.editing = null; // the pin open to edit, { pin, before }, before the planning file's JSON
    this.ring = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffe9a0, depthTest: false, transparent: true }));
    this.ring.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(RING_POINTS * 3), 3));
    this.ring.renderOrder = 10;
    this.ring.frustumCulled = false;
    this.ring.visible = false;
    scene.add(this.ring);

    for (const thumb of document.querySelectorAll("#side canvas[data-shape]")) drawShape(thumb, thumb.dataset.shape);
    const pressed = (buttons, on) => buttons.forEach((b) => b.setAttribute("aria-pressed", String(b === on)));
    // Each type of work shows its own tools.
    const works = [...document.querySelectorAll(".create-work [data-work]")];
    this.works = works;
    for (const button of works) {
      button.addEventListener("click", () => {
        pressed(works, button);
        for (const tools of document.querySelectorAll(".create-tools[data-work]")) tools.hidden = tools.dataset.work !== button.dataset.work;
        // A tool of another type of work is put down.
        if (this.tool && !document.querySelector(`.create-tools:not([hidden]) [data-tool="${this.tool}"]`)) this.pick(null);
      });
    }
    const toolButtons = [...document.querySelectorAll("[data-tool]")];
    for (const button of toolButtons) button.addEventListener("click", () => this.pick(this.tool === button.dataset.tool ? null : button.dataset.tool));
    const shapes = [...document.querySelectorAll(".create-shapes [data-shape]")];
    for (const button of shapes) {
      button.addEventListener("click", () => {
        this.settings.shape = button.dataset.shape;
        pressed(shapes, button);
        this.showAngle();
      });
    }
    const ways = [...document.querySelectorAll("[data-way]")];
    for (const button of ways) {
      button.addEventListener("click", () => {
        this.settings.lower = button.dataset.way === "lower";
        pressed(ways, button);
      });
    }
    $("brushSize").addEventListener("input", () => this.readSize());
    $("brushStrength").addEventListener("input", () => this.readStrength());
    $("brushAngle").addEventListener("input", () => this.turn((Number($("brushAngle").value) * Math.PI) / 180));
    $("brushNoise").addEventListener("input", () => this.readNoise());
    $("brushGrain").addEventListener("input", () => this.readGrain());
    const grains = [...document.querySelectorAll("[data-grain]")];
    for (const button of grains) {
      button.addEventListener("click", () => {
        this.settings.craggy = button.dataset.grain === "craggy";
        pressed(grains, button);
      });
    }
    $("poolsCount").addEventListener("input", () => this.readPools());
    $("poolsSize").addEventListener("input", () => this.readPools());
    $("poolsUndo").addEventListener("click", () => this.undoPools());
    $("pathMost").addEventListener("input", () => {
      this.readPath();
      this.paths.start();
    });
    $("pathSpeed").addEventListener("input", () => this.readPath());
    $("pathAgain").addEventListener("click", () => this.paths.start());
    const colors = [...document.querySelectorAll("[data-pen-color]")];
    for (const button of colors) {
      button.addEventListener("click", () => {
        this.marks.pen.color = button.dataset.penColor;
        pressed(colors, button);
      });
    }
    const styles = [...document.querySelectorAll("[data-pen-style]")];
    for (const button of styles) {
      button.addEventListener("click", () => {
        this.marks.pen.style = button.dataset.penStyle;
        pressed(styles, button);
      });
    }
    const widths = [...document.querySelectorAll("[data-pen-width]")];
    for (const button of widths) {
      button.addEventListener("click", () => {
        this.marks.pen.width = Number(button.dataset.penWidth);
        pressed(widths, button);
      });
    }
    const pinColors = [...document.querySelectorAll("[data-pin-color]")];
    for (const button of pinColors) {
      button.addEventListener("click", () => {
        this.pinColor = button.dataset.pinColor;
        pressed(pinColors, button);
      });
    }
    $("pinTitle").maxLength = TITLE_MAX;
    $("pinTitle").addEventListener("input", () => {
      this.editing.pin.title = $("pinTitle").value;
      this.marks.pins.relabel(this.editing.pin);
      this.marks.version++;
    });
    $("pinContent").addEventListener("input", () => {
      this.editing.pin.content = $("pinContent").value;
      this.marks.version++;
    });
    $("pinDelete").addEventListener("click", () => {
      const { pin, before } = this.editing;
      this.editing = null;
      this.marks.undos.push(before);
      this.marks.pins.remove(pin);
      this.marks.version++;
      $("pinEdit").hidePopover();
    });
    // A pin's changes are undone together, once it's closed.
    $("pinEdit").addEventListener("toggle", (e) => {
      if (e.newState !== "closed" || !this.editing) return;
      const { before } = this.editing;
      this.editing = null;
      if (JSON.stringify(before) !== JSON.stringify(this.marks.toJSON())) this.marks.undos.push(before);
    });
    for (const button of document.querySelectorAll("[data-grow]")) button.addEventListener("click", () => this.draw.adjust(button.dataset.grow));
    $("growBack").addEventListener("click", () => this.draw.back());
    $("growGo").addEventListener("click", () => this.draw.grow());
    $("growUndo").addEventListener("click", () => this.draw.undo());
    $("growThrow").addEventListener("click", () => this.draw.clear());
    for (const [id, read] of Object.entries(GROW_SLIDERS)) {
      $(id).addEventListener("input", () => {
        const settings = this.draw.settings[this.draw.kind];
        read.set(settings, Number($(id).value), this.draw.kind);
        $(`${id}Out`).textContent = read.show(settings);
        this.draw.dirty = true;
      });
    }
    // Each area tool's kinds' buttons, by tool.
    this.kindButtons = { biomes: [...document.querySelectorAll("[data-biome]")], water: [...document.querySelectorAll("[data-water]")], courses: [...document.querySelectorAll("[data-course]")] };
    for (const [tool, buttons] of Object.entries(this.kindButtons)) {
      for (const button of buttons) {
        button.addEventListener("click", () => {
          this.outlined[tool].setKind(kindOf(button));
          pressed(buttons, button);
        });
      }
    }
    $("biomesDelete").addEventListener("click", () => this.biomes.deleteSelected());
    $("biomesUndo").addEventListener("click", () => this.biomes.undo());
    $("waterDelete").addEventListener("click", () => this.water.deleteSelected());
    $("waterUndo").addEventListener("click", () => this.water.undo());
    $("coursesDelete").addEventListener("click", () => this.courses.deleteSelected());
    $("coursesUndo").addEventListener("click", () => this.courses.undo());
    for (const id of ["courseStart", "courseEnd"]) {
      $(id).addEventListener("change", () => {
        const [start, end] = [Number($("courseStart").value), Number($("courseEnd").value)];
        if (start > 0 && end > 0) this.courses.setWidths(Math.round(start * 10) / 10, Math.round(end * 10) / 10);
      });
    }
    $("courseRipple").addEventListener("change", () => this.courses.setRipple($("courseRipple").checked));
    $("waterLevel").addEventListener("change", () => {
      const level = Number($("waterLevel").value);
      if (Number.isFinite(level)) this.water.setExtra("level", Math.round(level * 10) / 10);
    });
    $("marksDelete").addEventListener("click", () => this.marks.deleteSelected());
    $("marksUndo").addEventListener("click", () => this.marks.undo());
    this.readSize();
    this.readStrength();
    this.readNoise();
    this.readGrain();
    this.readPools();
    this.readPath();

    this.box = null; // select's box, { x0, y0, x1, y1, add } in pixels on the canvas
    this.boxEl = document.createElement("div");
    this.boxEl.className = "create-box";
    this.boxEl.hidden = true;
    document.body.append(this.boxEl);
    canvas.addEventListener("pointermove", (e) => {
      this.point(e);
      if (BUILD.has(this.tool)) this.build.move(e);
      if (PLANS.has(this.tool)) this.plan.move(e);
      if (this.tool === "polish") this.polish.move();
      if (this.moving) this.movePins();
      for (const areas of Object.values(this.outlined)) {
        if (!areas.dragging) continue;
        const at = this.hit();
        if (at) areas.drag(at[0], at[2]);
      }
      if (this.draw.state === "drawing") {
        const at = this.hit();
        if (at) this.draw.add(at[0], at[2]);
      }
      if (this.measuring?.down) {
        const at = this.hit(this.drawAt);
        const r = canvas.getBoundingClientRect();
        const [x, y] = this.measuring.down;
        if (at && (this.measuring.radius || Math.hypot(e.clientX - r.left - x, e.clientY - r.top - y) >= BOX_PX)) {
          const middle = this.measuring.from;
          this.measuring = { ...this.measuring, middle, radius: Math.hypot(at[0] - middle[0], at[2] - middle[1]) };
        }
      }
      if (this.box) {
        const r = canvas.getBoundingClientRect();
        [this.box.x1, this.box.y1] = [e.clientX - r.left, e.clientY - r.top];
        this.showBox();
      }
      const at = this.drawing && this.hit(this.drawAt);
      if (!at) return;
      this.drawing.add(at[0], at[2]);
      this.marks.draw(this.drawing.points);
      this.showStroke();
    });
    canvas.addEventListener("pointerleave", () => (this.pointer = null));
    canvas.addEventListener("dblclick", (e) => {
      if (this.outlined[this.tool]) return this.outlined[this.tool].close();
      if (this.tool !== "select") return;
      const r = canvas.getBoundingClientRect();
      const pin = this.marks.pins.pick(this.camera, r.width, r.height, e.clientX - r.left, e.clientY - r.top);
      if (pin) this.openPin(pin);
    });
    canvas.addEventListener("pointerdown", (e) => {
      if (e.button === 2 && this.tool === "polish") return this.polish.down(e);
      if (e.button !== 0) return;
      this.point(e);
      // Clicking away from an open pin only closes it. (The canvas's own handlers keep the browser
      // from closing it itself.)
      if (this.editing) return $("pinEdit").hidePopover();
      if (OPENS_PINS.has(this.tool)) {
        const r = canvas.getBoundingClientRect();
        const pin = this.marks.pins.pick(this.camera, r.width, r.height, e.clientX - r.left, e.clientY - r.top);
        // Opened when the button's let go, so letting it go doesn't close it again.
        if (pin) return (this.clicked = { pin });
      }
      if (!this.tool) return;
      if (BUILD.has(this.tool)) {
        canvas.setPointerCapture(e.pointerId);
        return this.build.down(e);
      }
      if (PLANS.has(this.tool)) {
        canvas.setPointerCapture(e.pointerId);
        return this.plan.down(e);
      }
      if (this.tool === "polish") {
        canvas.setPointerCapture(e.pointerId);
        return this.polish.down(e);
      }
      if (this.tool === "goto") {
        const r = canvas.getBoundingClientRect();
        const at = this.plan.target([e.clientX - r.left, e.clientY - r.top]);
        if (at) this.builder.state = { ...this.builder.state, x: at[0], y: at[1], z: at[2], flying: false, swimming: false, falling: 0 };
        return;
      }
      if (this.tool === "pin") {
        const at = this.hit();
        if (at) this.clicked = { at };
        return;
      }
      canvas.setPointerCapture(e.pointerId);
      if (this.outlined[this.tool]) return this.areasDown(this.outlined[this.tool], e);
      if (this.tool === "draw") {
        const at = this.hit();
        if (at) this.draw.start(at[0], at[2]);
        return;
      }
      if (this.tool === "path") {
        const at = this.hit();
        if (at) this.paths.click(at[0], at[2]);
        return;
      }
      if (this.tool === "measure") {
        const at = this.hit(this.drawAt);
        const r = canvas.getBoundingClientRect();
        if (at) this.measuring = { from: [at[0], at[2]], down: [e.clientX - r.left, e.clientY - r.top], shown: Boolean(this.measuring) };
        return;
      }
      if (this.tool === "select") {
        const r = canvas.getBoundingClientRect();
        const [x, y] = [e.clientX - r.left, e.clientY - r.top];
        const pin = this.marks.pins.pick(this.camera, r.width, r.height, x, y);
        if (pin) {
          // A pin picked out already stays so, to move with the rest.
          if (e.shiftKey) this.marks.pins.select(pin, true);
          else if (!this.marks.pins.selected.has(pin)) {
            this.marks.unselect();
            this.marks.pins.select(pin, true);
          }
          const from = this.hit();
          if (from && this.marks.pins.selected.has(pin)) this.moving = { from, pins: [...this.marks.pins.selected].map((p) => [p, p.x, p.z]), before: this.marks.toJSON(), moved: false };
          return;
        }
        this.box = { x0: x, y0: y, x1: x, y1: y, add: e.shiftKey };
        return;
      }
      const at = this.hit(this.drawAt);
      if (BRUSHES.has(this.tool)) {
        // Flatten pulls toward the ground's height where the stroke began.
        this.stroke = { invert: e.ctrlKey || e.metaKey, from: at ? this.renditions.heightAt(at[0], at[2]) ?? EMPTY_FT : null };
        this.marks.erased = false;
        return;
      }
      if (!at) return;
      this.drawing = new Stroke(at[0], at[2]);
      this.marks.draw(this.drawing.points);
      this.showStroke();
    });
    canvas.addEventListener("pointerup", () => {
      this.stroke = null;
      if (BUILD.has(this.tool)) this.build.up();
      if (PLANS.has(this.tool)) this.plan.up();
      if (this.tool === "polish") this.polish.up();
      if (this.clicked?.pin) this.openPin(this.clicked.pin);
      else if (this.clicked?.at) {
        const before = this.marks.toJSON();
        const pin = this.marks.pins.add(this.clicked.at[0], this.clicked.at[2], this.pinColor);
        this.marks.version++;
        this.openPin(pin, before);
      }
      this.clicked = null;
      for (const areas of Object.values(this.outlined)) areas.letGo();
      if (this.box) this.endBox();
      if (this.draw.state === "drawing") this.draw.end();
      // A click leaves a ruler following the pointer, or takes away the ruler or circle there was,
      // and a drag leaves the circle drawn.
      if (this.measuring?.down) {
        const { from, middle, radius, shown } = this.measuring;
        this.measuring = radius ? { middle, radius } : shown ? null : { from };
      }
      if (this.moving?.moved) {
        this.marks.undos.push(this.moving.before);
        this.marks.version++;
      }
      this.moving = null;
      if (!this.drawing) return;
      this.drawing.end();
      this.marks.keep(this.drawing.points);
      this.drawing = null;
    });
    window.addEventListener("keydown", (e) => {
      if (e.target.matches?.("input, textarea, select") || e.target.closest?.(":popover-open")) return;
      const areas = this.outlined[this.tool];
      if (BUILD.has(this.tool) && this.build.key(e)) return e.preventDefault();
      if (PLANS.has(this.tool) && this.plan.key(e)) return e.preventDefault();
      if (this.tool === "polish" && this.polish.key(e)) return e.preventDefault();
      if (e.key === "Escape" && areas?.draft) areas.drop();
      else if (e.key === "Escape") this.pick(null);
      else if ((e.key === "Delete" || e.key === "Backspace") && this.tool === "select") this.marks.deleteSelected();
      else if (e.key === "Enter" && this.tool === "draw") this.draw.grow();
      else if (e.key === "Enter" && areas) areas.close();
      else if ((e.key === "Delete" || e.key === "Backspace") && areas) {
        if (areas.draft) areas.backCorner();
        else areas.deleteSelected();
      }
      else if ((e.key === "c" || e.key === "C" || e.key === "v" || e.key === "V") && this.tool === "raise" && !e.ctrlKey && !e.metaKey) {
        const step = (e.shiftKey ? FINE_TURN_DEG : TURN_DEG) * (e.key.toLowerCase() === "c" ? -1 : 1);
        this.turn(this.settings.angle + (step * Math.PI) / 180);
      }
      else if ((e.key === "[" || e.key === "]") && BRUSHES.has(this.tool)) {
        const size = $("brushSize");
        size.value = String(Number(size.value) + (e.key === "]" ? 50 : -50));
        this.readSize();
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) {
        this.hotkey(e.key.toLowerCase());
      }
    });
    this.toolButtons = toolButtons;
    this.turn(0);
  }

  // An area tool's click, on `areas`: a corner for the area being drawn, or closing it at its
  // first corner; or a picked out area's corner or edge to drag; or an area to pick out; or the
  // first corner of a new one.
  areasDown(areas, e) {
    const r = this.canvas.getBoundingClientRect();
    const [px, py] = [e.clientX - r.left, e.clientY - r.top];
    const near = (p) => {
      const s = p && areas.screen(this.camera, r.width, r.height, p);
      return s && Math.hypot(s[0] - px, s[1] - py) <= PICK_PX;
    };
    const at = this.hit();
    const { draft } = areas;
    if (draft) {
      if (areas.closed && draft.points.length >= 3 && near(draft.points[0])) return areas.close();
      // A double-click's second press, closed by the dblclick.
      if (near(draft.points.at(-1))) return;
      if (at) areas.addCorner(at[0], at[2]);
      return;
    }
    const picked = areas.pick(this.camera, r.width, r.height, px, py);
    if (picked?.corner !== undefined) {
      if (e.shiftKey) areas.removeCorner(picked.corner);
      else areas.grab(picked.corner);
      return;
    }
    if (picked && at) return areas.split(picked.edge, at[0], at[2]);
    const outlined = areas.pickArea(this.camera, r.width, r.height, px, py);
    if (outlined) return this.selectArea(areas, outlined);
    if (!at) return;
    const area = areas.at(at[0], at[2]);
    if (area && area !== areas.selected) return this.selectArea(areas, area);
    // Clicking away from the area picked out only puts it back.
    if (!area && areas.selected) return areas.unselect();
    areas.addCorner(at[0], at[2]);
  }

  selectArea(areas, area) {
    areas.select(area);
    areas.kind = area.kind;
    const tool = Object.keys(this.outlined).find((t) => this.outlined[t] === areas);
    this.kindButtons[tool].forEach((b) => b.setAttribute("aria-pressed", String(kindOf(b) === area.kind)));
  }

  // Shows biome areas' outlines with every tool, or only the biome tool.
  showBiomes(shown) {
    this.biomesShown = shown;
    this.biomes.setShown(shown || this.tool === "biomes");
  }

  // Shows the draw tool's state, and the settings of what it's growing.
  showDraw() {
    const { state, kind } = this.draw;
    for (const part of document.querySelectorAll("[data-draw]")) part.hidden = !part.dataset.draw.split(" ").includes(state);
    $("growUndo").disabled = !this.draw.undos.length;
    if (state !== "adjusting") return;
    const settings = this.draw.settings[kind];
    for (const part of document.querySelectorAll("[data-grown]")) part.hidden = !part.dataset.grown.split(" ").includes(kind);
    for (const [id, read] of Object.entries(GROW_SLIDERS)) {
      if (settings[id.replace("grow", "").toLowerCase()] === undefined) continue;
      $(id).value = String(read.get(settings, kind));
      $(`${id}Out`).textContent = read.show(settings);
    }
  }

  // Opens a pin's title and content to edit, `before` the planning file's JSON before it was made.
  openPin(pin, before = this.marks.toJSON()) {
    this.editing = { pin, before };
    $("pinTitle").value = pin.title;
    $("pinContent").value = pin.content;
    $("pinEdit").showPopover();
    $(pin.title ? "pinContent" : "pinTitle").focus();
  }

  // A type of work's key (data-key) shows its tools, and a tool's, among those shown, picks it.
  hotkey(key) {
    const work = this.works.find((b) => b.dataset.key === key);
    if (work) return work.click();
    const tool = document.querySelector(`.create-tools:not([hidden]) [data-tool][data-key="${key}"]`);
    if (tool) this.pick(tool.dataset.tool);
  }

  // Turns the tool to `angle` radians from east toward south.
  turn(angle) {
    this.settings.angle = angle - Math.floor(angle / (2 * Math.PI)) * 2 * Math.PI;
    const degrees = Math.round((this.settings.angle * 180) / Math.PI) % 360;
    $("brushAngleOut").textContent = `${degrees}°`;
    $("brushAngle").value = String(degrees);
  }

  pick(tool) {
    this.tool = tool;
    this.toolButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tool === tool)));
    for (const panel of document.querySelectorAll("[data-config]")) panel.hidden = !panel.dataset.config.split(" ").includes(tool ?? "none");
    for (const part of document.querySelectorAll("[data-only]")) part.hidden = !part.dataset.only.split(" ").includes(tool);
    for (const part of document.querySelectorAll("[data-not]")) part.hidden = part.dataset.not.split(" ").includes(tool);
    this.showAngle();
    this.builder.paints = Boolean(tool);
    this.stroke = null;
    if (this.drawing) this.marks.keep([]);
    this.marks.unselect();
    this.marks.setFlat(PLANNING.has(tool));
    if (tool !== "draw") this.draw.clear();
    this.biomes.setShown(tool === "biomes" || this.biomesShown);
    this.water.setShown(tool === "water" || tool === "courses");
    this.courses.setShown(tool === "courses" || tool === "water");
    this.measuring = null;
    this.paths.setShown(tool === "path");
    if (BUILD.has(tool) || BUILD.has(this.build.tool)) this.build.setTool(BUILD.has(tool) ? tool : null);
    this.plan.setTool(PLANS.has(tool) ? tool : null);
    this.polish.setTool(tool === "polish");
    this.box = null;
    this.boxEl.hidden = true;
    this.drawing = null;
  }

  // Only raise and lower's shapes that look different turned have an angle.
  showAngle() {
    $("brushAngleRow").hidden = this.tool !== "raise" || !TURNS.has(this.settings.shape);
  }

  // How long the line being drawn is, of how long it can be.
  showStroke() {
    const miles = (ft) => (ft / 5280).toFixed(2);
    $("strokeLength").textContent = `${miles(this.drawing.length)} of ${miles(STROKE_MAX_FT)} mi`;
  }

  readSize() {
    const t = Number($("brushSize").value) / 1000;
    this.settings.radius = Math.round(MIN_RADIUS_FT * (MAX_RADIUS_FT / MIN_RADIUS_FT) ** t);
    // Shown as the brush's width.
    $("brushSizeOut").textContent = `${(2 * this.settings.radius).toLocaleString()} ft`;
  }

  readNoise() {
    this.settings.noise = Number($("brushNoise").value) / 100;
    $("brushNoiseOut").textContent = `${$("brushNoise").value}%`;
  }

  // Grain, 8 ft to 2,000, on a log scale.
  readGrain() {
    this.settings.grain = Math.round(8 * 250 ** (Number($("brushGrain").value) / 1000));
    $("brushGrainOut").textContent = `${this.settings.grain.toLocaleString()} ft`;
  }

  // How many pools a scattering tries for, and how big across they are, 8 ft to 120, on a log
  // scale.
  readPools() {
    this.pools.count = Number($("poolsCount").value);
    this.pools.size = Math.round(8 * 15 ** (Number($("poolsSize").value) / 1000));
    $("poolsCountOut").textContent = String(this.pools.count);
    $("poolsSizeOut").textContent = `${this.pools.size} ft`;
  }

  // The path tool's longest way, a quarter mile to 5 miles, and how many cells it searches a
  // frame, 100 to 200,000, both on a log scale.
  readPath() {
    const s = this.paths.settings;
    s.mostFt = Math.round(1320 * 20 ** (Number($("pathMost").value) / 1000));
    s.cells = Math.round(100 * 2000 ** (Number($("pathSpeed").value) / 1000));
    $("pathMostOut").textContent = `${(s.mostFt / 5280).toFixed(2)} mi`;
    $("pathSpeedOut").textContent = `${s.cells.toLocaleString()} cells a frame`;
  }

  // Scatters pools in the ring at (x, z), kept to undo.
  scatter(x, z) {
    const groundAt = (px, pz) => this.renditions.heightAt(px, pz) ?? EMPTY_FT;
    const wetAt = (px, pz) => this.renditions.waterAt(px, pz) !== null || Boolean(this.water.at(px, pz));
    const pools = scatterPools({ ...this.pools, radius: this.settings.radius }, x, z, groundAt, wetAt);
    if (!pools.length) return;
    const moved = new Set();
    for (const pool of pools) for (const key of this.renditions.raise(pool.at, pool.bounds, CELLS)) moved.add(key);
    this.ground.refresh(moved);
    const areas = this.water.addAreas("swamp", pools.map((p) => p.body));
    this.poolUndos.push({ pools, areas });
    $("poolsUndo").disabled = false;
  }

  undoPools() {
    const last = this.poolUndos.pop();
    $("poolsUndo").disabled = !this.poolUndos.length;
    if (!last) return;
    const moved = new Set();
    for (const pool of last.pools) for (const key of this.renditions.raise(pool.undo, pool.bounds, CELLS)) moved.add(key);
    this.ground.refresh(moved);
    this.water.removeAreas(last.areas);
  }

  readStrength() {
    this.settings.strength = Number($("brushStrength").value) / 100;
    $("brushStrengthOut").textContent = `${$("brushStrength").value}%`;
  }

  point(e) {
    const r = this.canvas.getBoundingClientRect();
    this.pointer = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    if (this.stroke) this.stroke.at = null;
  }

  // Moves the pins being dragged by as far as the pointer's moved over the ground.
  movePins() {
    const at = this.hit();
    if (!at) return;
    const { from, pins } = this.moving;
    for (const [pin, x, z] of pins) [pin.x, pin.z] = [x + at[0] - from[0], z + at[2] - from[2]];
    this.moving.moved = true;
  }

  // Where a line's point [x, z] is on the canvas, or the point `y` over it, in pixels, or null when
  // it's behind.
  onScreen([x, z], y = this.drawAt(x, z) + 1) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return v.z > 1 || v.z < -1 ? null : [((v.x + 1) / 2) * this.canvas.clientWidth, ((1 - v.y) / 2) * this.canvas.clientHeight];
  }

  boxDragged() {
    const { x0, y0, x1, y1 } = this.box;
    return Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) >= BOX_PX;
  }

  showBox() {
    const { x0, y0, x1, y1 } = this.box;
    const r = this.canvas.getBoundingClientRect();
    this.boxEl.hidden = !this.boxDragged();
    Object.assign(this.boxEl.style, { left: `${r.left + Math.min(x0, x1)}px`, top: `${r.top + Math.min(y0, y1)}px`, width: `${Math.abs(x1 - x0)}px`, height: `${Math.abs(y1 - y0)}px` });
  }

  // Picks out the lines with a point in select's box, or when it wasn't dragged, the line clicked.
  endBox() {
    const { x0, y0, x1, y1, add } = this.box;
    if (this.boxDragged()) {
      const inside = (p) => p && p[0] >= Math.min(x0, x1) && p[0] <= Math.max(x0, x1) && p[1] >= Math.min(y0, y1) && p[1] <= Math.max(y0, y1);
      this.marks.selectAll(this.marks.kept.filter((mark) => mark.points.some((point) => inside(this.onScreen(point)))), add);
      for (const pin of this.marks.pins.list) if (inside(this.onScreen([pin.x, pin.z], pin.top))) this.marks.pins.mark(pin, true);
    } else {
      const mark = this.pickMark();
      if (mark) this.marks.select(mark, add);
      else if (!add) this.marks.unselect();
    }
    this.box = null;
    this.boxEl.hidden = true;
  }

  // The kept line nearest the pointer on the screen, within PICK_LINE_PX, or null.
  pickMark() {
    if (!this.pointer) return null;
    const [w, h] = [this.canvas.clientWidth, this.canvas.clientHeight];
    const [ax, ay] = [((this.pointer.x + 1) / 2) * w, ((1 - this.pointer.y) / 2) * h];
    let [best, nearest] = [null, PICK_LINE_PX];
    for (const mark of this.marks.kept) {
      let a = null;
      for (const point of mark.points) {
        const b = this.onScreen(point);
        if (a && b) {
          const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
          const t = Math.min(1, Math.max(0, ((ax - a[0]) * dx + (ay - a[1]) * dy) / (dx * dx + dy * dy || 1)));
          const d = Math.hypot(a[0] + dx * t - ax, a[1] + dy * t - ay);
          if (d < nearest) [best, nearest] = [mark, d];
        }
        a = b;
      }
    }
    return best;
  }

  // The surface the pointer finds at (x, z): the ground, or the sea over it.
  // From in a cave, where the pointer meets its rock, { at, ceiling, net, problem }: ceiling
  // where there's rock just over it and air just under it, net the network of the air it's
  // aimed through, and problem why things can't be placed there, or null where they can; or null.
  // Things go only in burned in networks.
  caveHit() {
    if (!this.pointer) return null;
    const { position: p } = this.camera;
    if (p.y >= (this.renditions.heightAt(p.x, p.z) ?? EMPTY_FT) || this.caves.solid(p.x, p.y, p.z)) return null;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(this.pointer, this.camera);
    const at = this.caves.hit(ray.ray);
    if (!at) return null;
    const [x, y, z] = at;
    const way = ray.ray.direction.toArray();
    const [ax, ay, az] = at.map((v, k) => v - way[k] * 0.5);
    const net = this.caves.spans(Math.floor(ax / VOXEL_FT), Math.floor(az / VOXEL_FT))?.find((s) => s.floor <= ay && ay <= s.ceiling)?.net ?? null;
    const problem = net && !this.layout.locked(net) ? `${net} is still in layout; you can't add objects until it's being polished` : null;
    return { at, ceiling: this.caves.solid(x, y + 0.5, z) && !this.caves.solid(x, y - 0.5, z), net, problem };
  }

  surface(x, z) {
    return Math.max(this.renditions.heightAt(x, z) ?? EMPTY_FT, SEA_LEVEL_FT);
  }

  // Where the tool works at (x, z): sea level for lines being worked on, or the surface.
  drawAt = (x, z) => (this.marks.flat ? SEA_LEVEL_FT : this.surface(x, z));

  // Where the pointer meets the ground (or the sea), or `surface` given, [x, y, z], or null: from
  // over it or, in the earth, from under it.
  hit(surface = (x, z) => this.surface(x, z)) {
    if (!this.pointer) return null;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(this.pointer, this.camera);
    const { origin, direction } = ray.ray;
    const side = origin.y < surface(origin.x, origin.z) ? -1 : 1;
    const above = (t) => {
      const [x, z] = [origin.x + direction.x * t, origin.z + direction.z * t];
      return side * (origin.y + direction.y * t - surface(x, z));
    };
    let [t0, t] = [0, 0];
    while (t < PICK_FT) {
      t0 = t;
      t += Math.max(2, t * 0.01);
      if (above(t) <= 0) break;
    }
    if (t >= PICK_FT || above(t) > 0) return null;
    for (let k = 0; k < 12; k++) {
      const mid = (t0 + t) / 2;
      if (above(mid) > 0) t0 = mid;
      else t = mid;
    }
    const p = origin.clone().addScaledVector(direction, t);
    return [p.x, p.y, p.z];
  }

  // Each frame: shows where the tool reaches, and works it while the left button's down. While
  // neither the pointer nor the camera moves, a stroke keeps working where it was, though the
  // ground it moved now meets the pointer's ray somewhere else.
  tick(dt) {
    const { x: cx, y: cy, z: cz } = this.camera.position;
    const [w, h] = [this.canvas.clientWidth, this.canvas.clientHeight];
    const above = cy - this.surface(cx, cz);
    const ftPerPx = (Math.max(above, 50) * 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / h;
    this.marks.tick(dt, w, h, this.camera.position, above, ftPerPx);
    this.marks.pins.tick(this.camera, w, h);
    this.draw.tick(this.camera, w, h);
    this.paths.tick(this.camera, w, h);
    if (BUILD.has(this.tool)) this.build.tick();
    this.plan.tick(this.inEarth());
    this.polish.tick();
    for (const [tool, areas] of Object.entries(this.outlined)) {
      const to = this.tool === tool && areas.draft && this.hit();
      areas.tick(dt, this.camera, w, h, to ? [to[0], to[2]] : null, this.tool === tool);
    }
    // The water picked out's level, but while it's being typed.
    const level = $("waterLevel");
    level.disabled = !this.water.selected;
    if (document.activeElement !== level) level.value = this.water.selected ? String(this.water.selected.level) : "";
    // And the course picked out's widths.
    [$("courseStart"), $("courseEnd")].forEach((input, k) => {
      input.disabled = !this.courses.selected;
      if (document.activeElement !== input) input.value = this.courses.selected ? String(this.courses.selected.widths[k]) : "";
    });
    $("courseRipple").checked = this.courses.ripple;
    $("growFlat").hidden = !this.draw.flat;
    if (this.tool === "measure" && this.measuring) {
      if (this.measuring.from && !this.measuring.radius) {
        const at = this.hit(this.drawAt);
        if (at) this.measuring.to = [at[0], at[2]];
      }
      this.measure.draw(this.camera, w, h, this.measuring);
    } else {
      this.measure.clear();
    }
    if (!BRUSHES.has(this.tool)) {
      this.ring.visible = false;
      return;
    }
    const view = this.camera.matrixWorld.elements.join();
    if (this.stroke?.view !== view) this.stroke &&= { ...this.stroke, view, at: null };
    const at = this.tool && (this.stroke?.at ?? this.hit(this.drawAt));
    if (this.stroke) this.stroke.at = at;
    this.ring.visible = Boolean(at);
    if (!at) return;
    const [x, , z] = at;
    if (this.stroke && this.tool === "eraser") {
      this.marks.erase(x, z, this.settings.radius);
    } else if (this.stroke && dt > 0 && this.tool === "clear") {
      const cleared = this.renditions.clear(x, z, this.settings.radius);
      if (cleared.size) {
        this.ground.stale = true;
        this.ground.refresh(cleared);
      }
    } else if (this.stroke && this.tool === "pools") {
      const last = this.stroke.scattered;
      if (!last || Math.hypot(x - last[0], z - last[1]) >= this.settings.radius) {
        this.stroke.scattered = [x, z];
        this.scatter(x, z);
      }
    } else if (this.stroke && dt > 0 && (this.tool === "raise" || this.tool === "noise" || this.stroke.from !== null)) {
      const lower = this.settings.lower !== this.stroke.invert;
      const groundAt = (px, pz) => this.renditions.heightAt(px, pz) ?? EMPTY_FT;
      const brush =
        this.tool === "raise"
          ? raiseBrush({ ...this.settings, lower }, x, z, dt)
          : this.tool === "noise"
            ? noiseBrush({ ...this.settings, lower: this.stroke.invert }, x, z, dt)
            : pullBrush(this.tool, this.settings, x, z, dt, groundAt, this.stroke.from);
      this.ground.refresh(this.renditions.raise(brush.at, brush.bounds, brush.level));
    }
    const positions = this.ring.geometry.attributes.position;
    const lift = Math.max(1, this.camera.position.distanceTo(new THREE.Vector3(...at)) * 0.002);
    // A turned shape's outline: half the ring, and back across the cut.
    const half = this.tool === "raise" && TURNS.has(this.settings.shape);
    const arc = half ? RING_POINTS / 2 : RING_POINTS;
    const { angle, radius } = this.settings;
    for (let k = 0; k < RING_POINTS; k++) {
      let px, pz;
      if (k <= arc) {
        const a = half ? angle - Math.PI / 2 + (k / arc) * Math.PI : (k / RING_POINTS) * Math.PI * 2;
        [px, pz] = [x + Math.cos(a) * radius, z + Math.sin(a) * radius];
      } else {
        const t = 1 - (2 * (k - arc)) / (RING_POINTS - arc);
        [px, pz] = [x - Math.sin(angle) * radius * t, z + Math.cos(angle) * radius * t];
      }
      positions.setXYZ(k, px, this.drawAt(px, pz) + lift, pz);
    }
    positions.needsUpdate = true;
  }
}
