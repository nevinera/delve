import { Stroke, STROKE_MAX_FT } from "./stroke.js";

// Planning's marker, select and pin tools, which work on the planning file's lines and pins
// (marks.js, pins.js). The marker draws a line on the ground where it's dragged. Select picks
// lines out, clicked or in a box dragged round them, with shift more than one, for delete or
// backspace to delete whole; it picks pins out too, dragging one picked out moves those picked
// out, and double-clicking one opens it. The pin tool sticks a pin in the ground where it's
// clicked and opens it. Opening a pin from a click with no tool or the pin tool is the Tools'.

const PICK_LINE_PX = 8; // how near the pointer a line is picked out
const BOX_PX = 4; // how far the pointer's dragged before select draws a box

const $ = (id) => document.getElementById(id);
const pressed = (buttons, on) => buttons.forEach((b) => b.setAttribute("aria-pressed", String(b === on)));

export class MarkerTool {
  constructor(tools) {
    this.tools = tools;
    this.drawing = null; // the Stroke being drawn
    const { marks } = tools;
    for (const [attr, set] of [
      ["penColor", (v) => (marks.pen.color = v)],
      ["penStyle", (v) => (marks.pen.style = v)],
      ["penWidth", (v) => (marks.pen.width = Number(v))],
    ]) {
      const buttons = [...document.querySelectorAll(`[data-${attr.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}]`)];
      for (const button of buttons) {
        button.addEventListener("click", () => {
          set(button.dataset[attr]);
          pressed(buttons, button);
        });
      }
    }
  }

  setTool() {
    if (this.drawing) this.tools.marks.keep([]);
    this.drawing = null;
  }

  down() {
    const at = this.tools.hit(this.tools.drawAt);
    if (!at) return;
    this.drawing = new Stroke(at[0], at[2]);
    this.tools.marks.draw(this.drawing.points);
    this.showStroke();
  }

  move() {
    const at = this.drawing && this.tools.hit(this.tools.drawAt);
    if (!at) return;
    this.drawing.add(at[0], at[2]);
    this.tools.marks.draw(this.drawing.points);
    this.showStroke();
  }

  up() {
    if (!this.drawing) return;
    this.drawing.end();
    this.tools.marks.keep(this.drawing.points);
    this.drawing = null;
  }

  key() {
    return false;
  }

  // How long the line being drawn is, of how long it can be.
  showStroke() {
    const miles = (ft) => (ft / 5280).toFixed(2);
    $("strokeLength").textContent = `${miles(this.drawing.length)} of ${miles(STROKE_MAX_FT)} mi`;
  }
}

export class SelectTool {
  constructor(tools) {
    this.tools = tools;
    this.box = null; // the box being dragged, { x0, y0, x1, y1, add } in pixels on the canvas
    this.moving = null; // pins being dragged, { from, pins: [[pin, x, z]], before, moved }
    this.boxEl = document.createElement("div");
    this.boxEl.className = "create-box";
    this.boxEl.hidden = true;
    document.body.append(this.boxEl);
    $("marksDelete").addEventListener("click", () => tools.marks.deleteSelected());
  }

  setTool() {
    this.box = this.moving = null;
    this.boxEl.hidden = true;
  }

  // Where the pointer is on the canvas, in pixels.
  spot(e) {
    const r = this.tools.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top, r];
  }

  down(e) {
    const { marks, camera } = this.tools;
    const [x, y, r] = this.spot(e);
    const pin = marks.pins.pick(camera, r.width, r.height, x, y);
    if (!pin) {
      this.box = { x0: x, y0: y, x1: x, y1: y, add: e.shiftKey };
      return;
    }
    // A pin picked out already stays so, to move with the rest.
    if (e.shiftKey) marks.pins.select(pin, true);
    else if (!marks.pins.selected.has(pin)) {
      marks.unselect();
      marks.pins.select(pin, true);
    }
    const from = this.tools.hit();
    if (from && marks.pins.selected.has(pin)) this.moving = { from, pins: [...marks.pins.selected].map((p) => [p, p.x, p.z]), before: marks.toJSON(), moved: false };
  }

  move(e) {
    if (this.moving) this.movePins();
    if (this.box) {
      [this.box.x1, this.box.y1] = this.spot(e);
      this.showBox();
    }
  }

  up() {
    const { marks } = this.tools;
    if (this.box) this.endBox();
    if (this.moving?.moved) {
      marks.undos.push(this.moving.before);
      marks.version++;
    }
    this.moving = null;
  }

  dblclick(e) {
    const [x, y, r] = this.spot(e);
    const pin = this.tools.marks.pins.pick(this.tools.camera, r.width, r.height, x, y);
    if (pin) this.tools.openPin(pin);
  }

  key(e) {
    if (e.key !== "Delete" && e.key !== "Backspace") return false;
    this.tools.marks.deleteSelected();
    return true;
  }

  // Moves the pins being dragged by as far as the pointer's moved over the ground.
  movePins() {
    const at = this.tools.hit();
    if (!at) return;
    const { from, pins } = this.moving;
    for (const [pin, x, z] of pins) [pin.x, pin.z] = [x + at[0] - from[0], z + at[2] - from[2]];
    this.moving.moved = true;
  }

  boxDragged() {
    const { x0, y0, x1, y1 } = this.box;
    return Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) >= BOX_PX;
  }

  showBox() {
    const { x0, y0, x1, y1 } = this.box;
    const r = this.tools.canvas.getBoundingClientRect();
    this.boxEl.hidden = !this.boxDragged();
    Object.assign(this.boxEl.style, { left: `${r.left + Math.min(x0, x1)}px`, top: `${r.top + Math.min(y0, y1)}px`, width: `${Math.abs(x1 - x0)}px`, height: `${Math.abs(y1 - y0)}px` });
  }

  // Picks out the lines with a point in the box, or when it wasn't dragged, the line clicked.
  endBox() {
    const { marks } = this.tools;
    const { x0, y0, x1, y1, add } = this.box;
    if (this.boxDragged()) {
      const inside = (p) => p && p[0] >= Math.min(x0, x1) && p[0] <= Math.max(x0, x1) && p[1] >= Math.min(y0, y1) && p[1] <= Math.max(y0, y1);
      marks.selectAll(marks.kept.filter((mark) => mark.points.some((point) => inside(this.tools.onScreen(point)))), add);
      for (const pin of marks.pins.list) if (inside(this.tools.onScreen([pin.x, pin.z], pin.top))) marks.pins.mark(pin, true);
    } else {
      const mark = this.pickMark();
      if (mark) marks.select(mark, add);
      else if (!add) marks.unselect();
    }
    this.box = null;
    this.boxEl.hidden = true;
  }

  // The kept line nearest the pointer on the screen, within PICK_LINE_PX, or null.
  pickMark() {
    const { pointer, canvas, marks } = this.tools;
    if (!pointer) return null;
    const [w, h] = [canvas.clientWidth, canvas.clientHeight];
    const [ax, ay] = [((pointer.x + 1) / 2) * w, ((1 - pointer.y) / 2) * h];
    let [best, nearest] = [null, PICK_LINE_PX];
    for (const mark of marks.kept) {
      let a = null;
      for (const point of mark.points) {
        const b = this.tools.onScreen(point);
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
}

export class PinTool {
  constructor(tools) {
    this.tools = tools;
    this.capture = false; // a click, so it doesn't hold the pointer
    this.color = "red";
    this.at = null; // where it was clicked, to put a pin when the button's let go
    const colors = [...document.querySelectorAll("[data-pin-color]")];
    for (const button of colors) {
      button.addEventListener("click", () => {
        this.color = button.dataset.pinColor;
        pressed(colors, button);
      });
    }
  }

  setTool() {
    this.at = null;
  }

  down() {
    this.at = this.tools.hit();
  }

  move() {}

  // Put in when the button's let go, so letting it go doesn't close the pin opened.
  up() {
    const { at } = this;
    this.at = null;
    if (!at) return;
    const { marks } = this.tools;
    const before = marks.toJSON();
    const pin = marks.pins.add(at[0], at[2], this.color);
    marks.version++;
    this.tools.openPin(pin, before);
  }

  key() {
    return false;
  }
}
