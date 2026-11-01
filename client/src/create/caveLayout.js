import * as THREE from "three";
import { allStone, shapeBounds } from "../v2/caves.js";
import { hash2, hashString, valueNoise } from "../world/noise.js";

// A continent's cave layout (docs/formats/cave-layout.md): rooms (nodes) joined by tunnels
// (arcs), each with its details, and what each looked like when it was last carved. Carving
// opens each room and tunnel as a set of shapes (v2/caves.js's carve), made from its details by
// noise seeded from its id, so carving it again opens the same cave. A node's `at` is the middle
// of its floor, and an arc runs floor to floor between its nodes' and through its bends.

export const layoutPath = (continent) => `places/continents/${continent}/caves/layout.json`;
export const LAYOUT_PATH = /^places\/continents\/([\w-]+)\/caves\/layout\.json$/;

// Each node size, the width of the sphere its room fits in.
export const NODE_SIZES = { s: 16, m: 32, l: 64, xl: 128, xxl: 256, "3xl": 512, "4xl": 1024 };
export const NODE_SHAPES = ["cathedral", "round", "flat"];
export const ARC_SHAPES = ["straight", "wiggly", "zigzag", "deadends"];
export const STYLES = ["mineshaft", "borehole", "lavatube"];
export const ARC_FT = [4, 60]; // the tunnels' widths
export const BEND_FT = 32; // an arc gets a bend for about every this much of its length
export const STEEP_DEG = 45; // arcs are drawn red where they climb steeper than this

export const NODE_DEFAULTS = { size: "m", shape: "round", style: "borehole", rock: 0, hewn: false };
export const ARC_DEFAULTS = { size: 10, shape: "wiggly", style: "borehole", rock: 0, hewn: false };

const add = (a, b) => a.map((v, i) => v + b[i]);
const mul = (a, k) => a.map((v) => v * k);
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

export class Layout {
  constructor(json = null) {
    this.nodes = new Map();
    this.arcs = new Map();
    this.carved = new Map(); // id -> the element as it was when last carved (an arc's with `ends`)
    this.next = 1;
    this.version = 0;
    if (json) this.load(json);
  }

  load({ nodes = [], arcs = [], carved = {} }) {
    for (const node of nodes) this.nodes.set(node.id, { ...NODE_DEFAULTS, ...node });
    for (const arc of arcs) this.arcs.set(arc.id, { ...ARC_DEFAULTS, bends: [], ...arc });
    this.carved = new Map(Object.entries(carved));
    for (const id of [...this.nodes.keys(), ...this.arcs.keys(), ...this.carved.keys()]) this.next = Math.max(this.next, Number(id.slice(1)) + 1);
    this.version++;
  }

  toJSON() {
    return { version: 1, nodes: [...this.nodes.values()], arcs: [...this.arcs.values()], carved: Object.fromEntries(this.carved) };
  }

  get(id) {
    return this.nodes.get(id) ?? this.arcs.get(id) ?? null;
  }

  addNode(at, details) {
    const node = { id: `n${this.next++}`, at: [...at], ...NODE_DEFAULTS, ...details };
    this.nodes.set(node.id, node);
    this.version++;
    return node;
  }

  // An arc from node `from` to node `to`, with a bend for about every BEND_FT along the straight
  // line between them.
  addArc(from, to, details) {
    const [a, b] = [this.nodes.get(from).at, this.nodes.get(to).at];
    const count = Math.max(0, Math.round(Math.hypot(...add(b, mul(a, -1))) / BEND_FT) - 1);
    const bends = Array.from({ length: count }, (_, i) => lerp(a, b, (i + 1) / (count + 1)).map((v) => Math.round(v * 4) / 4));
    const arc = { id: `a${this.next++}`, from, to, bends, ...ARC_DEFAULTS, ...details };
    this.arcs.set(arc.id, arc);
    this.version++;
    return arc;
  }

  // Removes a node and its arcs, or an arc.
  remove(id) {
    if (this.nodes.delete(id)) for (const arc of [...this.arcs.values()]) if (arc.from === id || arc.to === id) this.arcs.delete(arc.id);
    this.arcs.delete(id);
    this.version++;
  }

  // An element as carving sees it: a copy, an arc's with its ends' places.
  copyOf(id) {
    const node = this.nodes.get(id);
    if (node) return structuredClone(node);
    const arc = this.arcs.get(id);
    if (!arc) return null;
    return { ...structuredClone(arc), ends: [[...this.nodes.get(arc.from).at], [...this.nodes.get(arc.to).at]] };
  }

  // Whether an element's changed since it was last carved: new, moved or otherwise changed, or
  // deleted.
  changed(id) {
    const copy = this.copyOf(id);
    const carved = this.carved.get(id);
    return JSON.stringify(copy) !== JSON.stringify(carved ?? null);
  }

  // The ids of everything changed since it was last carved.
  changes() {
    return [...new Set([...this.nodes.keys(), ...this.arcs.keys(), ...this.carved.keys()])].filter((id) => this.changed(id));
  }
}

// The shapes an element (as Layout's copyOf gives it) carves, as v2/caves.js's carve takes them.
export const shapesOf = (copy) => (copy.ends ? arcShapes(copy) : nodeShapes(copy));

// A room: shapes standing on its floor, sized to fit the sphere of its size. Cathedral is tall and
// vaulted, narrowing upward, with lower aisles round it; round is a wide low dome with bays round
// its edge; flat is wide and low, flat-roofed. A mineshaft room is cut square, a lava tube's
// lumpy.
export function nodeShapes({ id, at, size, shape, style }) {
  const R = NODE_SIZES[size] / 2;
  const seed = hashString(id);
  const random = (k) => hash2(k, 0, seed);
  const yaw = random(0) * Math.PI;
  // A lava tube's rooms swell and shrink here and there.
  const lumpy = (k, v) => (style === "lavatube" ? v * (0.8 + 0.4 * random(100 + k)) : v);
  const round = (k, offset, [rx, ry, rz], turn = 0) => {
    const a = yaw + turn;
    const p = add(at, [offset * Math.sin(a), 0, offset * Math.cos(a)]);
    if (style === "mineshaft") return { kind: "box", at: add(p, [0, ry / 2, 0]), half: [rx * 0.8, ry / 2, rz * 0.8], yaw: a };
    return { kind: "dome", at: p, radii: [lumpy(k, rx), lumpy(k + 1, ry), lumpy(k + 2, rz)], yaw: a };
  };
  // Bays round the edge, `count` of them, `out` from the middle.
  const bays = (count, out, radii) => Array.from({ length: count }, (_, i) => round(10 + i * 3, out * (0.85 + 0.3 * random(20 + i)), radii.map((r) => r * (0.75 + 0.5 * random(30 + i))), (2 * Math.PI * (i + random(40 + i) * 0.5)) / count));
  if (shape === "cathedral") return [round(1, 0, [0.55 * R, 1.6 * R, 0.65 * R]), round(4, 0, [0.3 * R, 1.9 * R, 0.35 * R]), ...bays(4, 0.45 * R, [0.35 * R, 0.85 * R, 0.35 * R])];
  if (shape === "flat") {
    const main = style === "mineshaft" ? round(1, 0, [0.85 * R, 0.25 * R, 0.85 * R]) : { kind: "box", at: add(at, [0, 0.12 * R, 0]), half: [0.6 * R, 0.12 * R, 0.6 * R], yaw };
    return [main, ...bays(6, 0.6 * R, [0.38 * R, 0.24 * R, 0.38 * R])];
  }
  return [round(1, 0, [0.85 * R, 0.5 * R, 0.75 * R]), ...bays(5, 0.6 * R, [0.35 * R, 0.32 * R, 0.35 * R])];
}

// The line an arc (as Layout's copyOf gives it) runs along, floor to floor through its bends.
export function arcCurve({ ends, bends }) {
  const points = [ends[0], ...bends, ends[1]].map((p) => new THREE.Vector3(...p));
  return new THREE.CatmullRomCurve3(points, false, "centripetal");
}

// How steep the arc's line is at each of `count` + 1 points along it, in degrees, with the points.
export function arcSteepness(copy, count = 64) {
  const points = arcCurve(copy).getSpacedPoints(count);
  return points.map((p, i) => {
    const q = points[Math.min(i + 1, count)];
    const o = points[Math.max(i - 1, 0)];
    const run = Math.hypot(q.x - o.x, q.z - o.z);
    return { at: [p.x, p.y, p.z], deg: (Math.atan2(Math.abs(q.y - o.y), run) * 180) / Math.PI };
  });
}

// A tunnel: shapes standing on its floor all along its line, a few feet apart. Wiggly wanders
// side to side and zigzag goes in straight legs, both settling back onto the line at its ends;
// dead-ends adds short passages off to the sides that stop in the rock. A mineshaft is square, a
// borehole round, a lava tube a flattened tube that swells and narrows.
export function arcShapes(copy) {
  const { id, size: W, shape, style } = copy;
  const seed = hashString(id);
  const curve = arcCurve(copy);
  const length = curve.getLength();
  const step = Math.max(1.5, W / 3);
  const count = Math.max(2, Math.ceil(length / step));
  const points = curve.getSpacedPoints(count).map((p) => [p.x, p.y, p.z]);
  const out = [];
  // Off the line, across it: settling to nothing within 1.5 widths of each end.
  const offset = (d) => {
    const settle = Math.min(1, d / (1.5 * W), (length - d) / (1.5 * W));
    if (shape === "wiggly") return settle * 0.9 * W * valueNoise(d / (6 * W), 0.5, seed);
    if (shape === "zigzag") {
      const leg = 4 * W;
      const t = (d / leg + hash2(0, 1, seed)) % 2;
      return settle * 0.8 * W * (t < 1 ? 2 * t - 1 : 3 - 2 * t);
    }
    return 0;
  };
  const along = (i) => {
    const [a, b] = [points[Math.max(0, i - 1)], points[Math.min(count, i + 1)]];
    const [dx, dz] = [b[0] - a[0], b[2] - a[2]];
    const flat = Math.hypot(dx, dz) || 1;
    return [dx / flat, dz / flat];
  };
  const section = (p, heading, d, scale = 1) => {
    const yaw = Math.atan2(heading[0], heading[1]);
    const w = (W / 2) * scale;
    if (style === "mineshaft") return { kind: "box", at: add(p, [0, 0.45 * W * scale, 0]), half: [w, 0.45 * W * scale, step * 0.6 + 0.5], yaw };
    if (style === "lavatube") {
      const swell = 1 + 0.35 * valueNoise(d / (3 * W), 2.5, seed);
      return { kind: "dome", at: p, radii: [w * swell, 0.6 * W * scale * (1 + 0.3 * valueNoise(d / (2 * W), 4.5, seed)), Math.max(w, step)], yaw };
    }
    return { kind: "dome", at: p, radii: [w, 0.85 * W * scale, Math.max(w, step)], yaw };
  };
  points.forEach((p, i) => {
    const d = (i / count) * length;
    const [hx, hz] = along(i);
    const o = offset(d);
    out.push(section(add(p, [hz * o, 0, -hx * o]), [hx, hz], d));
  });
  if (shape === "deadends") {
    const branches = Math.floor(length / (8 * W));
    for (let k = 0; k < branches; k++) {
      const i = Math.round(((k + 0.5 + 0.4 * (hash2(k, 2, seed) - 0.5)) / branches) * count);
      const [hx, hz] = along(i);
      const side = hash2(k, 3, seed) < 0.5 ? -1 : 1;
      const turn = (hash2(k, 4, seed) - 0.5) * 1.0;
      const [c, s] = [Math.cos(turn), Math.sin(turn)];
      const [sx, sz] = [side * (hz * c - -hx * s), side * (hz * s + -hx * c)];
      const reach = W * (2 + 2 * hash2(k, 5, seed));
      const rise = (hash2(k, 6, seed) - 0.5) * 0.4;
      for (let t = 0; t <= reach; t += step) {
        const p = add(points[i], [sx * t, rise * t, sz * t]);
        out.push(section(p, [sx, sz], t, 1 - (0.4 * t) / reach));
      }
    }
  }
  return out;
}

// A shape's reach as a box, [[x0, y0, z0], [x1, y1, z1]].
export function shapeBox(shape) {
  const [x0, z0, x1, z1] = shapeBounds(shape);
  const y = shape.at[1];
  if (shape.kind === "sphere") return [[x0, y - shape.radius, z0], [x1, y + shape.radius, z1]];
  if (shape.kind === "dome") return [[x0, y, z0], [x1, y + shape.radii[1], z1]];
  return [[x0, y - shape.half[1], z0], [x1, y + shape.half[1], z1]];
}

const boxOf = (shapes) => shapes.map(shapeBox).reduce((a, b) => [a[0].map((v, k) => Math.min(v, b[0][k])), a[1].map((v, k) => Math.max(v, b[1][k]))]);
const overlap = (a, b) => [0, 1, 2].every((k) => a[0][k] <= b[1][k] && b[0][k] <= a[1][k]);

// What carving changes: rock filled back into what each changed element carved last time, then
// the shapes each opens afresh, it and every unchanged element whose last carving the filling
// cuts into, and the carved copies after. `ids`: the elements to carve (all changed ones, by
// default); `uncarve`: the elements to fill in and not carve again.
export function carvePlan(layout, { ids = layout.changes(), uncarve = [] } = {}) {
  const redo = new Set(ids.filter((id) => !uncarve.includes(id)));
  const filled = [...new Set([...ids, ...uncarve])].filter((id) => layout.carved.has(id));
  const fills = filled.flatMap((id) => shapesOf(layout.carved.get(id)));
  if (fills.length) {
    const box = boxOf(fills);
    for (const [id, copy] of layout.carved) {
      if (redo.has(id) || uncarve.includes(id) || !layout.get(id) || layout.changed(id)) continue;
      if (overlap(box, boxOf(shapesOf(copy)))) redo.add(id);
    }
  }
  const carved = new Map(layout.carved);
  for (const id of [...ids, ...uncarve]) carved.delete(id);
  const opens = [];
  for (const id of redo) {
    const copy = layout.copyOf(id);
    if (!copy) continue;
    carved.set(id, copy);
    for (const shape of shapesOf(copy)) opens.push({ shape, stone: allStone(copy.rock, copy.hewn) });
  }
  return { fills, opens, carved };
}
