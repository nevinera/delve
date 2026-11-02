import * as THREE from "three";
import { ROOF_FT, allStone, shapeBounds } from "../v2/caves.js";
import { CELL_FT } from "../v2/sizes.js";
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
export const SPACING = 5; // how many times the sum of their radii rooms' middles are apart, at least
export const TUNNEL_SPAN = 10; // how many times its width a tunnel's length is, at least, to be carved
const SAMPLE_FT = 4; // how finely an arc's line is laid out
const LEVEL = 0.7; // how far, of a room's radius, a tunnel runs level into it
const CLEAR = 1.6; // how many times that from a room a tunnel's first bend has to be
export const ENTRANCE_LENGTHS = [16, 32, 48, 64];
export const ENTRANCE_FT = [6, 24]; // the entrances' widths
const DOWN = 0.2; // how far a sloping entrance drops for each foot in
const NEAR_TUBE_FT = 0.5; // ground cells this near an entrance's tube are left out with those in it
const LOW_RING = Math.PI / 4; // how far round from the bottom an entrance's mouth can be in the ground

export const NODE_DEFAULTS = { size: "m", shape: "round", style: "borehole", rock: 0, hewn: false };
export const ARC_DEFAULTS = { size: 12, shape: "wiggly", style: "borehole", rock: 0, hewn: false };
export const ENTRANCE_DEFAULTS = { shape: "entrance", style: "natural", width: 10, length: 48, slope: "level", rock: 0, hewn: false };

export const isEntrance = (node) => node.shape === "entrance";
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

  // The elements joined to one: a node's arcs, or an arc's nodes.
  linked(id) {
    const arc = this.arcs.get(id);
    if (arc) return [arc.from, arc.to];
    return [...this.arcs.values()].filter((a) => a.from === id || a.to === id).map((a) => a.id);
  }

  // An element as carving sees it: a copy, without whether it's locked, which carving doesn't
  // care about, and an arc's with its ends, the floors it runs between, and how far into each it
  // runs level (arcCurve).
  copyOf(id) {
    const element = this.nodes.get(id) ?? this.arcs.get(id);
    if (!element) return null;
    const { locked, ...copy } = structuredClone(element);
    if (!copy.from) return copy;
    const [from, to] = [this.nodes.get(copy.from), this.nodes.get(copy.to)];
    const ends = [from, to];
    return { ...copy, ends: ends.map((node) => [...node.at]), level: ends.map((node) => LEVEL * nodeRadius(node)) };
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
// For now every room carves as a round borehole room and every tunnel as a wiggly borehole
// tunnel, whatever their details say.
export const shapesOf = (copy) => (copy.ends ? arcShapes({ ...copy, ...PLAIN_ARC }) : nodeShapes(isEntrance(copy) ? copy : { ...copy, ...PLAIN_NODE }));
const PLAIN_NODE = { shape: "round", style: "borehole" };
const PLAIN_ARC = { shape: "wiggly", style: "borehole" };

// A room: shapes standing on its floor, sized to fit the sphere of its size. Cathedral is tall and
// vaulted, narrowing upward, with lower aisles round it; round is a wide low dome with bays round
// its edge; flat is wide and low, flat-roofed. A mineshaft room is cut square, a lava tube's
// lumpy.
export function nodeShapes(node) {
  const { id, at, size, shape, style } = node;
  if (isEntrance(node)) return entranceShapes(node);
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
  return [round(1, 0, [0.85 * R, 0.8 * R, 0.75 * R]), ...bays(5, 0.6 * R, [0.35 * R, 0.5 * R, 0.35 * R])];
}

// The line an arc (as Layout's copyOf gives it) runs along, floor to floor: across, through its
// bends (only where they are across, not how high), leaving each end level, out across the room's
// floor as far as `level` says, so it meets the floor and not the walls or ceiling, and between
// those climbing or falling evenly all the way. Bends that near an end, or not far past, give way.
export function arcCurve({ ends, bends, level = [0, 0] }) {
  const flat = (a, b) => Math.hypot(b[0] - a[0], b[2] - a[2]);
  const kept = bends.filter((b) => flat(ends[0], b) > level[0] * CLEAR && flat(ends[1], b) > level[1] * CLEAR);
  const out = (end, toward, reach) => {
    const d = flat(end, toward);
    return reach && d > reach * CLEAR ? [[end[0] + ((toward[0] - end[0]) / d) * reach, 0, end[2] + ((toward[2] - end[2]) / d) * reach]] : [];
  };
  const [first, last] = [kept[0] ?? ends[1], kept.at(-1) ?? ends[0]];
  const [out0, out1] = [out(ends[0], first, level[0]), out(ends[1], last, level[1])];
  const across = [ends[0], ...out0, ...kept, ...out1, ends[1]].map((p) => new THREE.Vector3(p[0], 0, p[2]));
  const plan = new THREE.CatmullRomCurve3(across, false, "centripetal");
  const length = plan.getLength();
  const [run0, run1] = [out0.length ? level[0] : 0, out1.length ? level[1] : 0];
  const climb = Math.max(1e-6, length - run0 - run1);
  const count = Math.max(2, Math.ceil(length / SAMPLE_FT));
  const points = plan.getSpacedPoints(count).map((p, i) => {
    const t = Math.min(1, Math.max(0, ((i / count) * length - run0) / climb));
    return new THREE.Vector3(p.x, ends[0][1] + (ends[1][1] - ends[0][1]) * t, p.z);
  });
  return new THREE.CatmullRomCurve3(points, false, "centripetal");
}

// An arc's bends laid out afresh along its line: one for about every BEND_FT, evenly, past its
// level runs, so a tunnel drawn out longer gets more of them.
export function respacedBends(copy) {
  const curve = arcCurve(copy);
  const length = curve.getLength();
  const [from, to] = [(copy.level?.[0] ?? 0) * CLEAR, length - (copy.level?.[1] ?? 0) * CLEAR];
  const count = Math.max(0, Math.round((to - from) / BEND_FT) - 1);
  return Array.from({ length: count }, (_, i) => {
    const p = curve.getPointAt(Math.min(1, Math.max(0, (from + ((to - from) * (i + 1)) / (count + 1)) / (length || 1))));
    return [p.x, p.y, p.z].map((v) => Math.round(v * 4) / 4);
  });
}

// Whether an arc is long enough to carve: TUNNEL_SPAN times its width along its line.
export const longEnough = (copy) => arcCurve(copy).getLength() >= TUNNEL_SPAN * copy.size;

// The room too near where a room `radius` ft out would be at `at`, SPACING times the sum of their
// radii, or null; `self`, its id where it's being moved, so it's not too near itself.
export function tooNear(layout, at, radius, self = null) {
  for (const node of layout.nodes.values()) {
    if (node.id === self) continue;
    if (Math.hypot(node.at[0] - at[0], node.at[1] - at[1], node.at[2] - at[2]) < SPACING * (radius + nodeRadius(node))) return node;
  }
  return null;
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
    return { kind: "dome", at: p, radii: [w, W * scale, Math.max(w, step)], yaw };
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

// How far out from its middle a node's room reaches: an entrance's, the room at its far end.
export const nodeRadius = (node) => (isEntrance(node) ? node.width : NODE_SIZES[node.size] / 2);

// Where an entrance's far end is, from its mouth (the middle of the mouth's floor): `length` ft in
// along its yaw (degrees, 0 facing +z), level, or down DOWN for each foot with slope "down".
export function entranceEnd({ mouth, yaw, length, slope }) {
  const a = (yaw * Math.PI) / 180;
  return [mouth[0] + Math.sin(a) * length, mouth[1] - (slope === "down" ? DOWN * length : 0), mouth[2] + Math.cos(a) * length].map((v) => Math.round(v * 4) / 4);
}

// The mouth of an entrance whose floor, `inFt` in along the tube, is at `held`: where the
// pointer holds it as it's placed, so the mouth stands out from the hillside.
export function mouthBehind(held, { yaw, slope }, inFt) {
  const a = (yaw * Math.PI) / 180;
  return [held[0] - Math.sin(a) * inFt, held[1] + (slope === "down" ? DOWN * inFt : 0), held[2] - Math.cos(a) * inFt].map((v) => Math.round(v * 4) / 4);
}

// An entrance: a tube from its mouth to its far end, as wide as it is tall, round (natural) or
// square (mine), opening through the ground wherever its roof would be too thin (each shape
// `open`), and a room at the far end, twice as wide, for tunnels to join.
function entranceShapes({ mouth, at, yaw, width: W, style }) {
  const a = (yaw * Math.PI) / 180;
  const step = Math.max(1.5, W / 3);
  const length = Math.hypot(at[0] - mouth[0], at[2] - mouth[2]);
  const count = Math.max(2, Math.ceil(length / step));
  const out = [];
  for (let i = 0; i < count; i++) {
    const p = lerp(mouth, at, i / count);
    if (style === "mine") out.push({ kind: "box", at: add(p, [0, W / 2, 0]), half: [W / 2, W / 2, step * 0.6 + 0.5], yaw: a, open: true });
    else out.push({ kind: "dome", at: p, radii: [W / 2, W, step], yaw: a, open: true });
  }
  if (style === "mine") out.push({ kind: "box", at: add(at, [0, W / 2, 0]), half: [W, W / 2, W], yaw: a });
  else out.push({ kind: "dome", at, radii: [W, W, W], yaw: a });
  return out;
}

// Whether continent feet `p` is inside an entrance's tube, as entranceShapes carves it, or within
// `margin` ft of it: from its mouth to its far end, an arch as wide as it is tall (natural) or a
// square (mine) over its floor.
export function inTube({ mouth, at, yaw, width: W, style }, p, margin = 0) {
  const a = (yaw * Math.PI) / 180;
  const [dx, dz] = [p[0] - mouth[0], p[2] - mouth[2]];
  const d = dx * Math.sin(a) + dz * Math.cos(a);
  const across = dx * Math.cos(a) - dz * Math.sin(a);
  const length = Math.hypot(at[0] - mouth[0], at[2] - mouth[2]);
  if (d < -margin || d > length + margin || Math.abs(across) >= W / 2 + margin) return false;
  const up = p[1] - (mouth[1] + ((at[1] - mouth[1]) * Math.min(length, Math.max(0, d))) / (length || 1));
  const top = style === "mine" ? W : W * Math.sqrt(Math.max(0, 1 - ((2 * across) / W) ** 2));
  return up > -margin && up < top + margin;
}

// The ground cells, as [ci, cj], whose surface reaches into an entrance's tube anywhere, or within
// NEAR_TUBE_FT of it: each cell's ground tried every half foot across it, its edges and corners
// too. groundAt(x, z): the ground's height.
export function entranceCells(entrance, groundAt) {
  const { mouth, at, width: W } = entrance;
  const [x0, x1] = [Math.min(mouth[0], at[0]) - W, Math.max(mouth[0], at[0]) + W];
  const [z0, z1] = [Math.min(mouth[2], at[2]) - W, Math.max(mouth[2], at[2]) + W];
  const out = [];
  for (let cj = Math.floor(z0 / CELL_FT); cj <= Math.floor(z1 / CELL_FT); cj++) {
    for (let ci = Math.floor(x0 / CELL_FT); ci <= Math.floor(x1 / CELL_FT); ci++) {
      let reaches = false;
      for (let v = 0; v <= CELL_FT && !reaches; v += 0.5) {
        for (let u = 0; u <= CELL_FT && !reaches; u += 0.5) {
          const [x, z] = [ci * CELL_FT + u, cj * CELL_FT + v];
          reaches = inTube(entrance, [x, groundAt(x, z), z], NEAR_TUBE_FT);
        }
      }
      if (reaches) out.push([ci, cj]);
    }
  }
  return out;
}

// The points round an entrance's mouth, as tall and wide as its tube, each { at, low, open }:
// `low` where it's near enough the bottom that it can be in the ground, `open` where it's out in
// the air or can be in the ground. groundAt(x, z): the ground's height.
export function entranceRing({ mouth, yaw, width: W, style }, groundAt, count = 32) {
  const a = (yaw * Math.PI) / 180;
  const side = [Math.cos(a), 0, -Math.sin(a)];
  return Array.from({ length: count }, (_, i) => {
    // Round from the bottom, square for a mine.
    const t = (i / count) * Math.PI * 2;
    const s = style === "mine" ? 1 / Math.max(Math.abs(Math.cos(t)), Math.abs(Math.sin(t))) : 1;
    const p = add(add(mouth, [0, W / 2 - (Math.cos(t) * s * W) / 2, 0]), mul(side, (Math.sin(t) * s * W) / 2));
    const low = Math.min(t, Math.PI * 2 - t) <= LOW_RING;
    return { at: p, low, open: low || p[1] > groundAt(p[0], p[2]) };
  });
}

// Why an entrance can't go where it is, or null where it can: its mouth has to be out in the air,
// but for the bottom of it, and the room at its far end under the ground.
export function entranceProblem(node, groundAt) {
  if (!entranceRing(node, groundAt).every((p) => p.open)) return "an entrance's mouth has to be out in the open";
  const room = entranceShapes(node).at(-1);
  if (!fits(room, groundAt)) return "an entrance's far end has to be under the ground";
  return null;
}

// A shape's reach as a box, [[x0, y0, z0], [x1, y1, z1]].
export function shapeBox(shape) {
  const [x0, z0, x1, z1] = shapeBounds(shape);
  const y = shape.at[1];
  if (shape.kind === "sphere") return [[x0, y - shape.radius, z0], [x1, y + shape.radius, z1]];
  if (shape.kind === "dome") return [[x0, y, z0], [x1, y + shape.radii[1], z1]];
  return [[x0, y - shape.half[1], z0], [x1, y + shape.half[1], z1]];
}

// The elements joined to one, as it is or, deleted, as it was carved.
function linkedOf(layout, id) {
  if (layout.get(id)) return layout.linked(id);
  const copy = layout.carved.get(id);
  return copy?.from ? [copy.from, copy.to] : [];
}

// Whether a shape stays ROOF_FT under the ground, over its middle and its corners.
function fits(shape, groundAt) {
  const [[x0, , z0], [x1, top, z1]] = shapeBox(shape);
  const [x, , z] = shape.at;
  return [[x, z], [x0, z0], [x1, z0], [x0, z1], [x1, z1]].every(([a, b]) => top <= groundAt(a, b) - ROOF_FT);
}

// The box round some shapes, or null round none.
const boxOf = (shapes) => (shapes.length ? shapes.map(shapeBox).reduce((a, b) => [a[0].map((v, k) => Math.min(v, b[0][k])), a[1].map((v, k) => Math.max(v, b[1][k]))]) : null);
const overlap = (a, b) => Boolean(a && b) && [0, 1, 2].every((k) => a[0][k] <= b[1][k] && b[0][k] <= a[1][k]);

// What carving changes: rock filled back into what each changed element carved last time, then
// the shapes each opens afresh, it, the elements joined to it, and every unchanged element whose
// last carving the filling cuts into, and the carved copies after. `ids`: the elements to carve (all changed ones, by
// default); `uncarve`: the elements to fill in and not carve again. Only entrances' tubes
// open through the ground; given groundAt(x, z), the ground's height, a room that would come
// within ROOF_FT of it isn't carved, and is listed in `unfit`; nor is a tunnel shorter than
// TUNNEL_SPAN times its width, listed in `short`.
export function carvePlan(layout, { ids = layout.changes(), uncarve = [] } = {}, groundAt = null) {
  const redo = new Set(ids.filter((id) => !uncarve.includes(id)));
  for (const id of ids) for (const other of linkedOf(layout, id)) if (layout.get(other)) redo.add(other);
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
  const [opens, unfit, short] = [[], [], []];
  for (const id of redo) {
    const copy = layout.copyOf(id);
    if (!copy) continue;
    // What isn't carved isn't kept as carved, so there's nothing of it to fill in later.
    if (copy.ends && !longEnough(copy)) {
      short.push(id);
      continue;
    }
    const shapes = shapesOf(copy);
    if (groundAt && !copy.ends && shapes.some((s) => !s.open && !fits(s, groundAt))) {
      unfit.push(id);
      continue;
    }
    carved.set(id, copy);
    for (const shape of shapes) opens.push({ shape, stone: allStone(copy.rock, copy.hewn), mouth: Boolean(shape.open) });
  }
  return { fills, opens, carved, unfit, short };
}
