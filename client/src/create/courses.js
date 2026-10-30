import { Areas } from "./areas.js";
import { WIDTHS, along, profile } from "../v2/courses.js";

// Courses drawn on the map with geo's course tool (areas.js, as open lines): streams and rivers,
// each from its source down (v2/courses.js), with a width at its start and end and straight
// between by how far along it is. Its surface is worked out from the ground before courses cut it
// when its corners change, and kept as it is otherwise. A course whose end isn't in water, or on
// another course, is drawn in OPEN's color. Arrows along each show which way it flows. They're
// kept in the water file with the bodies (water.js):
//
//   { "version": 1, "bodies": [...], "courses": [{ "type": "stream", "points": [[x, z, width], ...], "surface": [ft, ...], "seed": 412 }, ...] }

export const COURSES = { stream: "#5aa0d8", river: "#2f6bb0" };
const OPEN = "#e04040";
const ARROW_EVERY_PX = 90; // how far apart arrows are along a course, on the screen at most
const ARROW_PX = 7;
const JOIN_FT = 5; // how near another course's water a course's end joins it

const round = (v) => Math.round(v * 10) / 10;

export class Courses extends Areas {
  // baseAt(x, z) gives the ground before courses cut it, and stillAt(x, z) the level of the water
  // at (x, z) for a course to end in, besides courses, or null.
  constructor(scene, surface, stage, baseAt, stillAt) {
    super(scene, surface, stage, { colors: { ...COURSES, open: OPEN }, kind: "stream", field: "type", list: "courses", extras: ["widths", "surface", "seed"], closed: false });
    this.start = () => ({ widths: [WIDTHS[this.kind], WIDTHS[this.kind]], surface: null, seed: Math.floor(Math.random() * 1000) });
    Object.assign(this, { baseAt, stillAt });
  }

  show(json) {
    super.show({
      courses: (json.courses ?? []).map(({ type, points, surface, seed }) => ({ type, points: points.map(([x, z]) => [x, z]), widths: [points[0]?.[2] ?? WIDTHS.stream, points.at(-1)?.[2] ?? WIDTHS.stream], surface, seed: seed ?? 0 })),
    });
    for (const area of this.areas) area.surfaceKey = keyOf(widthsOf(area), area.seed);
  }

  toJSON() {
    return {
      version: 1,
      courses: this.areas.map((area) => {
        const points = area.points.map(([x, z]) => [round(x), round(z)]);
        const wide = widthsAlong(points, area.widths);
        const course = points.map((p, k) => [...p, wide[k]]);
        return { type: area.kind, points: course, surface: this.surfaceOf(area, course), seed: area.seed };
      }),
    };
  }

  // A course's surface, worked out again where its corners or widths have changed.
  surfaceOf(area, points) {
    const key = keyOf(points, area.seed);
    if (area.surfaceKey !== key || !area.surface) {
      area.surface = profile(points, (x, z) => this.baseAt(x, z) ?? 0, this.stillAt, area.seed);
      area.surfaceKey = key;
    }
    return area.surface;
  }

  // Sets the picked out course's widths at its start and end.
  setWidths(start, end) {
    if (this.selected) this.setExtra("widths", [start, end]);
  }

  // Whether a course's end is in water.
  ended(area) {
    const [x, z] = area.points.at(-1);
    if (this.stillAt(x, z) != null) return true;
    return this.areas.some((other) => other !== area && along(widthsOf(other), x, z, Math.max(...other.widths) / 2 + JOIN_FT));
  }

  tick(dt, camera, width, height, to, active) {
    super.tick(dt, camera, width, height, to, active);
    if (!this.shown) return;
    for (const area of this.areas) area.line.material = this.material(this.ended(area) ? area.kind : "open", area === this.selected);
    // Arrows down each course.
    const c = this.handles.getContext("2d");
    c.lineWidth = 2;
    for (const area of this.areas) {
      c.strokeStyle = this.colors[this.ended(area) ? area.kind : "open"];
      const on = area.points.map((p) => this.screen(camera, width, height, p));
      for (let k = 1; k < on.length; k++) {
        const [a, b] = [on[k - 1], on[k]];
        if (!a || !b) continue;
        const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
        const length = Math.hypot(dx, dy);
        if (length < ARROW_PX * 3) continue;
        const [ux, uy] = [dx / length, dy / length];
        const count = Math.max(1, Math.floor(length / ARROW_EVERY_PX));
        for (let n = 1; n <= count; n++) {
          const [mx, my] = [a[0] + (dx * n) / (count + 1), a[1] + (dy * n) / (count + 1)];
          c.beginPath();
          c.moveTo(mx - ux * ARROW_PX - uy * ARROW_PX, my - uy * ARROW_PX + ux * ARROW_PX);
          c.lineTo(mx, my);
          c.lineTo(mx - ux * ARROW_PX + uy * ARROW_PX, my - uy * ARROW_PX - ux * ARROW_PX);
          c.stroke();
        }
      }
    }
  }
}

const keyOf = (points, seed) => JSON.stringify([seed, points.map(([x, z, w]) => [round(x), round(z), round(w)])]);

// Each of `points`' widths, from `widths` at its start and end, straight between by how far along.
function widthsAlong(points, [start, end]) {
  let total = 0;
  const at = [0];
  for (let k = 1; k < points.length; k++) at.push((total += Math.hypot(points[k][0] - points[k - 1][0], points[k][1] - points[k - 1][1])));
  return at.map((t) => round(start + (end - start) * (total ? t / total : 0)));
}

// A course's points with their widths, as courses.js has them.
function widthsOf(area) {
  const wide = widthsAlong(area.points, area.widths);
  return area.points.map(([x, z], k) => [x, z, wide[k]]);
}
