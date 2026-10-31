import { Areas } from "./areas.js";
import { WIDTHS, along, levelAt, onTrack, profile, reachOf, trackOf, widened } from "../v2/courses.js";

// Courses drawn on the map with geo's course tool (areas.js, as open lines): streams and rivers,
// each from its source down (v2/courses.js), with a width at its start and end and straight
// between by how far along it is. Its surface is worked out from the ground before courses cut it
// when its corners change, or the course it joins changes where it joins, and kept as it is
// otherwise. A course that runs into another's water is at that water's level there. A course
// whose end isn't in water, or in another course's, is drawn in OPEN's color. Arrows along each
// show which way it flows. With ripple on, courses running into others widen them below (their
// joins, worked out again with every change), and with it off, they're kept as they were. They're
// kept in the water file with the bodies (water.js):
//
//   { "version": 1, "bodies": [...], "courses": [{ "type": "stream", "points": [[x, z, width], ...], "surface": [ft, ...], "seed": 412, "joins": [[t, width], ...] }, ...], "ripple": true }

export const COURSES = { stream: "#5aa0d8", river: "#2f6bb0" };
const OPEN = "#e04040";
const ARROW_EVERY_PX = 90; // how far apart arrows are along a course, on the screen at most
const ARROW_PX = 7;
const JOIN_FT = 5; // how near another course's water a course's end joins it, past its edge

const round = (v) => Math.round(v * 10) / 10;

export class Courses extends Areas {
  // baseAt(x, z) gives the ground before courses cut it, and stillAt(x, z) the level of the water
  // at (x, z) for a course to end in, besides courses, or null.
  constructor(scene, surface, stage, baseAt, stillAt) {
    super(scene, surface, stage, { colors: { ...COURSES, open: OPEN }, kind: "stream", field: "type", list: "courses", extras: ["widths", "surface", "seed", "joins"], closed: false });
    this.start = () => ({ widths: [WIDTHS[this.kind], WIDTHS[this.kind]], surface: null, seed: Math.floor(Math.random() * 1000), joins: [] });
    Object.assign(this, { baseAt, stillAt });
    this.ripple = true;
  }

  load(json) {
    this.ripple = json.ripple ?? true;
    super.load(json);
  }

  show(json) {
    super.show({
      courses: (json.courses ?? []).map(({ type, points, surface, seed, joins }) => ({ type, points: points.map(([x, z]) => [x, z]), widths: [points[0]?.[2] ?? WIDTHS.stream, points.at(-1)?.[2] ?? WIDTHS.stream], surface, seed: seed ?? 0, joins: joins ?? [] })),
    });
    for (const area of this.areas) area.surfaceKey = this.keyOf(area);
  }

  toJSON() {
    this.settle();
    return { version: 1, courses: this.areas.map((area) => this.courseOf(area)) };
  }

  // Works out again the surfaces of courses whose corners or widths, or the level of the water
  // they run into, have changed: those they run into first, as far as they go.
  settle() {
    for (let pass = 0; pass <= this.areas.length; pass++) {
      let changed = false;
      if (this.ripple) for (const area of this.areas) area.joins = this.joinsOf(area);
      for (const area of this.areas) {
        const key = this.keyOf(area);
        if (area.surfaceKey === key && area.surface) continue;
        const course = this.courseOf(area);
        area.surface = profile(course, (x, z) => this.baseAt(x, z) ?? 0, this.stillAt, (x, z) => this.joinAt(area, x, z));
        area.surfaceKey = key;
        changed = true;
      }
      if (!changed) return;
    }
  }

  // The course `area` is, as v2/courses.js has it, with its surface as last worked out.
  courseOf(area) {
    const points = pointsOf(area);
    if (area.course?.points.length !== points.length || area.course.points.some((p, k) => p.some((v, n) => v !== points[k][n]))) area.course = { points };
    return Object.assign(area.course, { type: area.kind, surface: area.surface, seed: area.seed, joins: area.joins ?? [] });
  }

  // Where other courses run into `area`'s water, as courses.js has its joins, each as wide as its
  // own joins make it at its end.
  joinsOf(area) {
    const joins = [];
    for (const other of this.areas) {
      if (other === area) continue;
      const [x, z] = other.points.at(-1);
      const near = this.nearOther(area, x, z);
      // Into the nearest it runs into.
      if (!near || this.areas.some((third) => third !== other && third !== area && (this.nearOther(third, x, z)?.d ?? Infinity) < near.d)) continue;
      const end = pointsOf(other).at(-1)[2];
      joins.push([round(along(this.courseOf(area).points, x, z).t), round(widened(end, (other.joins ?? []).map((j) => j[1])))]);
    }
    return joins.sort((a, b) => a[0] - b[0]);
  }

  // Turns ripple on or off.
  setRipple(ripple) {
    if (ripple === this.ripple) return;
    this.ripple = ripple;
    this.changed();
  }

  // What a course's surface is worked out from: its corners, widths and seed, and the level of the
  // water its end runs into.
  keyOf(area) {
    const [x, z] = area.points.at(-1);
    const join = this.joinAt(area, x, z);
    return JSON.stringify([area.seed, pointsOf(area), area.joins ?? [], join == null ? null : round(join)]);
  }

  // The level of other courses' water than `area`'s at (x, z), the highest, or null.
  joinAt(area, x, z) {
    let level = null;
    for (const other of this.areas) {
      const near = other !== area && this.nearOther(other, x, z);
      if (near && near.d <= near.width / 2) level = Math.max(level ?? -Infinity, near.level);
    }
    return level;
  }

  // Where (x, z) is from `other`'s track, as onTrack has it, with its level there, or null where
  // it's further than JOIN_FT past its edge.
  nearOther(other, x, z) {
    const course = this.courseOf(other);
    if (!course.surface?.length) return null;
    const near = onTrack(trackOf(course.points, course.seed, course.joins), x, z, reachOf(course));
    if (!near || near.d > near.width / 2 + JOIN_FT) return null;
    return { ...near, level: levelAt(course, near.t) };
  }

  // Sets the picked out course's widths at its start and end.
  setWidths(start, end) {
    if (this.selected) this.setExtra("widths", [start, end]);
  }

  // Whether a course's end is in water.
  ended(area) {
    const [x, z] = area.points.at(-1);
    if (this.stillAt(x, z) != null) return true;
    return this.areas.some((other) => other !== area && this.nearOther(other, x, z));
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

// Each of `points`' widths, from `widths` at its start and end, straight between by how far along.
function widthsAlong(points, [start, end]) {
  let total = 0;
  const at = [0];
  for (let k = 1; k < points.length; k++) at.push((total += Math.hypot(points[k][0] - points[k - 1][0], points[k][1] - points[k - 1][1])));
  return at.map((t) => round(start + (end - start) * (total ? t / total : 0)));
}

// A course's points with their widths, rounded, as courses.js has them.
function pointsOf(area) {
  const points = area.points.map(([x, z]) => [round(x), round(z)]);
  const wide = widthsAlong(points, area.widths);
  return points.map((p, k) => [...p, wide[k]]);
}
