import * as THREE from "three";
import { SEA_LEVEL_FT } from "../v2/sizes.js";
import { SHAPES, TURNS, pullBrush, raiseBrush } from "./geo.js";
import { EMPTY_FT } from "./ground.js";
import { Marks } from "./marks.js";
import { TITLE_MAX } from "./pins.js";
import { STROKE_MAX_FT, Stroke } from "./stroke.js";

// The tools' sidebar: the type of work and its tools above, the picked tool's settings below. A
// picked tool takes the left button, and Esc puts it down.
// - planning's marker: dragging draws a line on the ground (stroke.js, marks.js), its eraser
//   cuts lines away where it's dragged, and select picks lines out, clicked or in a box dragged
//   round them, with shift more than one, for delete or backspace to delete whole. The pin tool
//   sticks pins in the ground. Clicking a pin's head, with no tool or with pin, or double-clicking
//   it with select, opens its title and content to edit. Select picks pins out too, and dragging
//   one picked out moves those picked out.
// - geo's brushes, raise and lower, flatten, smooth and clear: dragging on the ground works them
//   where the pointer is, and a ring on the ground shows where they reach. [ and ] resize them, and
//   c and v turn raise and lower's, shift+c and shift+v a little.

const MIN_RADIUS_FT = 16;
const MAX_RADIUS_FT = 16000;
const RING_POINTS = 96;
const PICK_FT = 30000; // how far off the pointer finds the ground
const PICK_LINE_PX = 8; // how near the pointer a line is picked out
const BOX_PX = 4; // how far the pointer's dragged before select draws a box
const BRUSHES = new Set(["raise", "flatten", "smooth", "clear", "eraser"]);
const PLANNING = new Set(["marker", "eraser", "select"]); // tools that work on lines drawn at sea level
const OPENS_PINS = new Set([null, "pin"]); // tools with which clicking a pin opens it
const TURN_DEG = 15;
const FINE_TURN_DEG = 2;

const $ = (id) => document.getElementById(id);

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
  constructor({ scene, camera, canvas, builder, renditions, ground }) {
    Object.assign(this, { camera, canvas, builder, renditions, ground });
    this.tool = null;
    this.settings = { shape: "round", radius: 0, strength: 0, noise: 0, lower: false, angle: 0 };
    this.pointer = null; // normalized device coordinates, or null off the view
    this.stroke = null; // { invert } while the left button's down with the brush
    this.drawing = null; // the Stroke being drawn with the marker
    this.marks = new Marks(scene, (x, z) => this.surface(x, z), canvas.parentElement);
    this.pinColor = "red";
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
    $("marksDelete").addEventListener("click", () => this.marks.deleteSelected());
    $("marksUndo").addEventListener("click", () => this.marks.undo());
    this.readSize();
    this.readStrength();
    this.readNoise();

    this.box = null; // select's box, { x0, y0, x1, y1, add } in pixels on the canvas
    this.boxEl = document.createElement("div");
    this.boxEl.className = "create-box";
    this.boxEl.hidden = true;
    document.body.append(this.boxEl);
    canvas.addEventListener("pointermove", (e) => {
      this.point(e);
      if (this.moving) this.movePins();
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
      if (this.tool !== "select") return;
      const r = canvas.getBoundingClientRect();
      const pin = this.marks.pins.pick(this.camera, r.width, r.height, e.clientX - r.left, e.clientY - r.top);
      if (pin) this.openPin(pin);
    });
    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      this.point(e);
      if (OPENS_PINS.has(this.tool)) {
        const r = canvas.getBoundingClientRect();
        const pin = this.marks.pins.pick(this.camera, r.width, r.height, e.clientX - r.left, e.clientY - r.top);
        // Opened when the button's let go, so letting it go doesn't close it again.
        if (pin) return (this.clicked = { pin });
      }
      if (!this.tool) return;
      if (this.tool === "pin") {
        const at = this.hit();
        if (at) this.clicked = { at };
        return;
      }
      canvas.setPointerCapture(e.pointerId);
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
      if (this.clicked?.pin) this.openPin(this.clicked.pin);
      else if (this.clicked?.at) {
        const before = this.marks.toJSON();
        const pin = this.marks.pins.add(this.clicked.at[0], this.clicked.at[2], this.pinColor);
        this.marks.version++;
        this.openPin(pin, before);
      }
      this.clicked = null;
      if (this.box) this.endBox();
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
      if (e.target.matches?.("input, textarea, select")) return;
      if (e.key === "Escape") this.pick(null);
      else if ((e.key === "Delete" || e.key === "Backspace") && this.tool === "select") this.marks.deleteSelected();
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
    for (const part of document.querySelectorAll("[data-only]")) part.hidden = part.dataset.only !== tool;
    for (const part of document.querySelectorAll("[data-not]")) part.hidden = part.dataset.not.split(" ").includes(tool);
    this.showAngle();
    this.builder.paints = Boolean(tool);
    this.stroke = null;
    if (this.drawing) this.marks.keep([]);
    this.marks.unselect();
    this.marks.setFlat(PLANNING.has(tool));
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
  surface(x, z) {
    return Math.max(this.renditions.heightAt(x, z) ?? EMPTY_FT, SEA_LEVEL_FT);
  }

  // Where the tool works at (x, z): sea level for lines being worked on, or the surface.
  drawAt = (x, z) => (this.marks.flat ? SEA_LEVEL_FT : this.surface(x, z));

  // Where the pointer meets the ground (or the sea), or `surface` given, [x, y, z], or null.
  hit(surface = (x, z) => this.surface(x, z)) {
    if (!this.pointer) return null;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(this.pointer, this.camera);
    const { origin, direction } = ray.ray;
    const above = (t) => {
      const [x, z] = [origin.x + direction.x * t, origin.z + direction.z * t];
      return origin.y + direction.y * t - surface(x, z);
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
    } else if (this.stroke && dt > 0 && (this.tool === "raise" || this.stroke.from !== null)) {
      const lower = this.settings.lower !== this.stroke.invert;
      const groundAt = (px, pz) => this.renditions.heightAt(px, pz) ?? EMPTY_FT;
      const brush = this.tool === "raise" ? raiseBrush({ ...this.settings, lower }, x, z, dt) : pullBrush(this.tool, this.settings, x, z, dt, groundAt, this.stroke.from);
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
