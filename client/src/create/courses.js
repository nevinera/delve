import { Areas } from "./areas.js";
import { inside } from "../v2/biomes.js";
import { WIDTHS, along, levelAt, onTrack, profile, reachOf, trackOf, widened } from "../v2/courses.js";
import { poolAt } from "../v2/pools.js";

// Courses drawn on the map with geo's course tool (areas.js, as open lines): streams and rivers,
// each from its source down (v2/courses.js), with a width at its start and end and straight
// between by how far along it is. Its surface is worked out from the ground before courses cut it
// when its corners change, or the course it joins changes where it joins, and kept as it is
// otherwise. A course that runs into another's water is at that water's level there. A course
// whose end isn't in water, or in another course's, is drawn in OPEN's color. Arrows along each
// show which way it flows. With ripple on, courses running into others widen them below (their
// joins, worked out again with every change), low spots courses run through are filled as pools,
// and the stretches of others a course being drawn or dragged would change are drawn under them;
// with it off, joins and pools are kept as they were, and courses changed cut through. They're
// kept in the water file with the bodies (water.js):
//
//   { "version": 1, "bodies": [...], "courses": [{ "type": "stream", "points": [[x, z, width], ...], "surface": [ft, ...], "seed": 412, "joins": [[t, width], ...], "pools": [{ "level": ft, "from": t, "to": t, "points": [[x, z], ...] }, ...] }, ...], "ripple": true }

export const COURSES = { stream: "#5aa0d8", river: "#2f6bb0" };
const OPEN = "#e04040";
const ARROW_EVERY_PX = 90; // how far apart arrows are along a course, on the screen at most
const ARROW_PX = 7;
const REACH = { color: "rgba(255, 196, 40, 0.75)", px: 9, every: 0.25 }; // how the stretches a ripple reaches are drawn, and how often they're found, s
const JOIN_FT = 5; // how near another course's water a course's end joins it, past its edge

const round = (v) => Math.round(v * 10) / 10;

export class Courses extends Areas {
  // baseAt(x, z) gives the ground before courses cut it, and stillAt(x, z) the level of the water
  // at (x, z) for a course to end in, besides courses, or null.
  constructor(scene, surface, stage, baseAt, stillAt) {
    super(scene, surface, stage, { colors: { ...COURSES, open: OPEN }, kind: "stream", field: "type", list: "courses", extras: ["widths", "surface", "seed", "joins", "pools"], closed: false });
    this.start = () => ({ widths: [WIDTHS[this.kind], WIDTHS[this.kind]], surface: null, seed: Math.floor(Math.random() * 1000), joins: [], pools: [] });
    Object.assign(this, { baseAt, stillAt });
    this.ripple = true;
    this.reaches = { key: null, since: 0, found: [] }; // the stretches a ripple reaches, [[area, t]], from t ft down its line
  }

  load(json) {
    this.ripple = json.ripple ?? true;
    super.load(json);
  }

  show(json) {
    super.show({
      courses: (json.courses ?? []).map(({ type, points, surface, seed, joins, pools }) => ({ type, points: points.map(([x, z]) => [x, z]), widths: [points[0]?.[2] ?? WIDTHS.stream, points.at(-1)?.[2] ?? WIDTHS.stream], surface, seed: seed ?? 0, joins: joins ?? [], pools: pools ?? [] })),
    });
    // As they were worked out, with ripple on or off as it is.
    for (const area of this.areas) [area.surfaceKey, area.rippled] = [this.keyOf(area), this.ripple];
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
        if (area.surfaceKey === key && area.surface && (area.rippled || !this.ripple)) continue;
        const course = this.courseOf(area);
        const pools = this.ripple ? (x, z, low, most) => poolAt(this.baseAt, x, z, low, most) : null;
        ({ surface: area.surface, pools: area.pools } = profile(course, (x, z) => this.baseAt(x, z) ?? 0, this.stillAt, (x, z) => this.joinAt(area, x, z), pools));
        [area.surfaceKey, area.rippled] = [key, this.ripple];
        changed = true;
      }
      if (!changed) return;
    }
  }

  // The course `area` is, as v2/courses.js has it, with its surface as last worked out.
  courseOf(area) {
    const points = pointsOf(area);
    if (area.course?.points.length !== points.length || area.course.points.some((p, k) => p.some((v, n) => v !== points[k][n]))) area.course = { points };
    return Object.assign(area.course, { type: area.kind, surface: area.surface, seed: area.seed, joins: area.joins ?? [], pools: area.pools ?? [] });
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

  // The level of other courses' water than `area`'s at (x, z), in them or their pools, the highest, or null.
  joinAt(area, x, z) {
    let level = null;
    for (const other of this.areas) {
      if (other === area) continue;
      const near = this.nearOther(other, x, z);
      if (near && near.d <= near.width / 2) level = Math.max(level ?? -Infinity, near.level);
      const pool = this.poolOf(other, x, z);
      if (pool) level = Math.max(level ?? -Infinity, pool.level);
    }
    return level;
  }

  // The pool of `other`'s that (x, z)'s in, or null.
  poolOf(other, x, z) {
    return (other.pools ?? []).find((pool) => inside(pool.points, x, z)) ?? null;
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
    return this.areas.some((other) => other !== area && (this.nearOther(other, x, z) || this.poolOf(other, x, z)));
  }

  // What a course being drawn or dragged would change of others, with ripple on: [[area, t]], each
  // from t ft down its line, where what runs into it changes, to its end.
  reach() {
    const editing = this.dragging?.moved ? this.dragging.area : this.draft && this.to ? { kind: this.draft.kind, points: [...this.draft.points, this.to], ...this.start() } : null;
    if (!this.ripple || !editing) return [];
    const areas = this.areas;
    const had = areas.map((area) => area.joins ?? []);
    if (!areas.includes(editing)) this.areas = [...areas, editing];
    for (let pass = 0; pass <= this.areas.length; pass++) {
      let changed = false;
      for (const area of this.areas) {
        const joins = this.joinsOf(area);
        if (JSON.stringify(joins) === JSON.stringify(area.joins ?? [])) continue;
        area.joins = joins;
        changed = true;
      }
      if (!changed) break;
    }
    const found = [];
    areas.forEach((area, k) => {
      const [was, now] = [had[k].map((j) => JSON.stringify(j)), area.joins.map((j) => JSON.stringify(j))];
      const moved = [...had[k].filter((_, n) => !now.includes(was[n])), ...area.joins.filter((_, n) => !was.includes(now[n]))];
      if (area !== editing && moved.length) found.push([area, Math.min(...moved.map((j) => j[0]))]);
      area.joins = had[k];
    });
    this.areas = areas;
    return found;
  }

  tick(dt, camera, width, height, to, active) {
    super.tick(dt, camera, width, height, to, active);
    if (!this.shown) return;
    for (const area of this.areas) area.line.material = this.material(this.ended(area) ? area.kind : "open", area === this.selected);
    const c = this.handles.getContext("2d");
    // The stretches a ripple from the course being edited reaches, found again now and then as it changes.
    const reaches = this.reaches;
    const editing = this.dragging?.moved || (this.draft && this.to);
    const key = editing ? JSON.stringify([this.ripple, this.dragging?.area.points ?? this.draft.points, this.to]) : null;
    if ((reaches.since += dt) >= REACH.every && key !== reaches.key) [reaches.key, reaches.since, reaches.found] = [key, 0, key ? this.reach() : []];
    c.strokeStyle = REACH.color;
    c.lineWidth = REACH.px;
    c.lineCap = "round";
    for (const [area, from] of editing ? reaches.found : []) {
      c.beginPath();
      let [t, started] = [0, false];
      for (let k = 1; k < area.points.length; k++) {
        const [a, b] = [area.points[k - 1], area.points[k]];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (t + length > from) {
          const u = Math.max(0, (from - t) / (length || 1));
          const [p, q] = [this.screen(camera, width, height, [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]), this.screen(camera, width, height, b)];
          if (p && q) {
            if (!started) c.moveTo(...p);
            c.lineTo(...q);
            started = true;
          }
        }
        t += length;
      }
      c.stroke();
    }
    c.lineCap = "butt";
    // Arrows down each course.
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
