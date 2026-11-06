import * as THREE from "three";
import { SEA_LEVEL_FT } from "../v2/sizes.js";

// Planning's measuring tool, drawn flat over the view at sea level: a ruler from where it was
// clicked to the pointer, ticked at miles, quarter miles, 500, 100 and 10 ft, only the three
// biggest that fit; or a circle dragged out from its middle, with its radius and area.

const MILE_FT = 5280;
export const TICKS = [MILE_FT, MILE_FT / 4, 500, 100, 10]; // ft between ticks, biggest first
const TICK_PX = [14, 9, 5]; // how long ticks are, biggest first
const SHOWN = 3; // how many sizes of tick are shown
const MOST_TICKS = 2000; // past this many, the smallest ticks are left out
const CIRCLE_POINTS = 96;
const COLOR = "#ffe9a0";
const SHADOW = "#14141c";
const FILL = "#ffe9a02e"; // inside a circle

// The sizes of tick a ruler `length` ft long shows: the biggest that fits, and the next two.
export function tickSizes(length) {
  const first = TICKS.findIndex((every) => every <= length);
  return first < 0 ? [] : TICKS.slice(first, first + SHOWN);
}

const feet = (ft) => `${Math.round(ft).toLocaleString()} ft`;
const miles = (ft) => `${(ft / MILE_FT).toFixed(2)} mi`;

export class Measure {
  constructor(stage) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "create-measure";
    stage.append(this.canvas);
    this.context = this.canvas.getContext("2d");
    this.drawn = false;
  }

  clear() {
    if (!this.drawn) return;
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawn = false;
  }

  // Draws a ruler from [x, z] `from` to `to`, or a circle round `middle` of `radius` ft.
  draw(camera, width, height, { from, to, middle, radius }) {
    if (this.canvas.width !== width || this.canvas.height !== height) [this.canvas.width, this.canvas.height] = [width, height];
    this.clear();
    const c = this.context;
    const screen = ([x, z]) => {
      const v = new THREE.Vector3(x, SEA_LEVEL_FT, z).project(camera);
      return v.z > 1 || v.z < -1 ? null : [((v.x + 1) / 2) * width, ((1 - v.y) / 2) * height];
    };
    c.lineWidth = 2;
    c.strokeStyle = COLOR;
    c.fillStyle = COLOR;
    c.font = "bold 13px sans-serif";
    c.shadowColor = SHADOW;
    c.shadowBlur = 3;
    let label, at;
    if (middle && radius) {
      c.beginPath();
      let drawing = false;
      for (let k = 0; k <= CIRCLE_POINTS; k++) {
        const a = (k / CIRCLE_POINTS) * Math.PI * 2;
        const p = screen([middle[0] + Math.cos(a) * radius, middle[1] + Math.sin(a) * radius]);
        if (!p) {
          drawing = false;
          continue;
        }
        if (drawing) c.lineTo(...p);
        else c.moveTo(...p);
        drawing = true;
      }
      c.save();
      c.shadowBlur = 0;
      c.fillStyle = FILL;
      c.fill();
      c.restore();
      const m = screen(middle);
      const edge = screen([middle[0] + radius, middle[1]]);
      if (m && edge) {
        c.moveTo(...m);
        c.lineTo(...edge);
      }
      c.stroke();
      const area = Math.PI * radius * radius;
      label = [`radius ${feet(radius)} · ${miles(radius)}`, `area ${(area / MILE_FT ** 2).toFixed(2)} sq mi · ${Math.round(area / 43560).toLocaleString()} acres`];
      at = m;
    } else if (from && to) {
      const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
      const [a, b] = [screen(from), screen(to)];
      if (!a || !b || !length) return;
      c.beginPath();
      c.moveTo(...a);
      c.lineTo(...b);
      c.stroke();
      // Ticks across the line on the screen, the biggest longest.
      const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
      const across = Math.hypot(dx, dy) || 1;
      const [nx, ny] = [-dy / across, dx / across];
      const sizes = tickSizes(length).filter((every) => length / every <= MOST_TICKS);
      c.beginPath();
      sizes.forEach((every, k) => {
        for (let d = every; d <= length; d += every) {
          if (sizes.slice(0, k).some((bigger) => d % bigger === 0)) continue;
          const t = d / length;
          const p = screen([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]);
          if (!p) continue;
          c.moveTo(p[0] - nx * TICK_PX[k], p[1] - ny * TICK_PX[k]);
          c.lineTo(p[0] + nx * TICK_PX[k], p[1] + ny * TICK_PX[k]);
        }
      });
      c.stroke();
      label = [`${feet(length)} · ${miles(length)}`];
      at = b;
    }
    if (!label || !at) return;
    label.forEach((line, k) => c.fillText(line, at[0] + 10, at[1] - 8 + k * 16));
    this.drawn = true;
  }
}

// The measuring tool's clicks and drags: a click starts a ruler that follows the pointer, a drag
// from there draws a circle, and a click with a ruler or circle shown takes it away. `hit()` gives
// where the pointer meets the ground, [x, y, z], or null; a drag starts `dragPx` from the click.
export class MeasureTool {
  constructor(stage, canvas, hit, dragPx) {
    Object.assign(this, { canvas, hit, dragPx });
    this.drawing = new Measure(stage);
    this.shown = null; // { from, to } for a ruler, { middle, radius } for a circle, and while the button's down, where it went down and whether one was shown before
  }

  // Picking any tool takes away what's shown.
  setTool() {
    this.shown = null;
  }

  down(e) {
    const at = this.hit();
    if (at) this.shown = { from: [at[0], at[2]], down: this.px(e), shown: Boolean(this.shown) };
  }

  move(e) {
    if (!this.shown?.down) return;
    const at = this.hit();
    const [x, y] = this.shown.down;
    const [px, py] = this.px(e);
    if (at && (this.shown.radius || Math.hypot(px - x, py - y) >= this.dragPx)) {
      const middle = this.shown.from;
      this.shown = { ...this.shown, middle, radius: Math.hypot(at[0] - middle[0], at[2] - middle[1]) };
    }
  }

  up() {
    if (!this.shown?.down) return;
    const { from, middle, radius, shown } = this.shown;
    this.shown = radius ? { middle, radius } : shown ? null : { from };
  }

  key() {
    return false;
  }

  // Draws what's shown, while the tool's `active`.
  tick(camera, width, height, active) {
    if (!active || !this.shown) return this.drawing.clear();
    if (this.shown.from && !this.shown.radius) {
      const at = this.hit();
      if (at) this.shown.to = [at[0], at[2]];
    }
    this.drawing.draw(camera, width, height, this.shown);
  }

  px(e) {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }
}
