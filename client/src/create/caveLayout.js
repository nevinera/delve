import { ROOF_FT, allStone, shapeBounds } from "../v2/caves.js";

// A continent's cave layout (docs/formats/cave-layout.md): its cave networks, each named by a
// slug, and the elements laid out in them: entrances, tubes in from the ground; points, each
// holding the config of the passage round it; and segments joining two points. Each element
// keeps its network's slug in `net`. What each element looked like when it was last carved is
// kept too, so a change carves only what it reaches.
//
// Carving opens each entrance and segment as a set of shapes (v2/caves.js's carve), made from what
// the element is and what it's joined to (copyOf), so carving it again opens the same cave.

export const layoutPath = (continent) => `places/continents/${continent}/caves/layout.json`;
export const LAYOUT_PATH = /^places\/continents\/([\w-]+)\/caves\/layout\.json$/;

const VERSION = 2;
export const ENTRANCE_LENGTHS = [16, 32, 48, 64];
export const ENTRANCE_FT = [8, 24]; // the entrances' widths
const DOWN = 0.2; // how far a sloping entrance drops for each foot in
const LOW_RING = Math.PI / 4; // how far round from the bottom an entrance's mouth can be in the ground

export const ENTRANCE_DEFAULTS = { style: "natural", width: 12, length: 48, slope: "level", rock: 0, hewn: false };
export const POINT_DEFAULTS = { width: 12, height: 10, qualities: [], rock: 0, hewn: false };
export const PHASES = ["layout", "polish"];

// A value as JSON with its objects' keys sorted, to compare.
const stable = (value) => JSON.stringify(value, (k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v));
const add = (a, b) => a.map((v, i) => v + b[i]);
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

export class Layout {
  // A layout from before cave networks (version 1) is dropped, with `dropped` true, as its caves are.
  constructor(json = null) {
    this.networks = new Map(); // slug -> { slug, phase }
    this.entrances = new Map();
    this.points = new Map();
    this.segments = new Map();
    this.carved = new Map(); // id -> the element as it was when last carved (copyOf)
    this.next = 1;
    this.version = 0;
    this.dropped = Boolean(json) && !(json.version >= VERSION);
    if (json && !this.dropped) this.load(json);
  }

  load({ networks = [], entrances = [], points = [], segments = [], carved = {} }) {
    this.networks = new Map(networks.map((n) => [n.slug, { phase: PHASES[0], ...n }]));
    this.entrances = new Map(entrances.map((e) => [e.id, { ...ENTRANCE_DEFAULTS, ...e }]));
    this.points = new Map(points.map((p) => [p.id, { ...structuredClone(POINT_DEFAULTS), ...p }]));
    this.segments = new Map(segments.map((s) => [s.id, { ...s }]));
    this.carved = new Map(Object.entries(carved));
    for (const id of [...this.ids(), ...this.carved.keys()]) this.next = Math.max(this.next, Number(id.slice(1)) + 1);
    this.version++;
  }

  toJSON() {
    return { version: VERSION, networks: [...this.networks.values()], entrances: [...this.entrances.values()], points: [...this.points.values()], segments: [...this.segments.values()], carved: Object.fromEntries(this.carved) };
  }

  // The ids of every element.
  ids() {
    return [...this.entrances.keys(), ...this.points.keys(), ...this.segments.keys()];
  }

  get(id) {
    return this.entrances.get(id) ?? this.points.get(id) ?? this.segments.get(id) ?? null;
  }

  // A new network, named `slug`.
  addNetwork(slug) {
    const network = { slug, phase: PHASES[0] };
    this.networks.set(slug, network);
    this.version++;
    return network;
  }

  // Renames network `from` to `to`, and every element in it.
  renameNetwork(from, to) {
    const network = this.networks.get(from);
    this.networks.delete(from);
    this.networks.set(to, { ...network, slug: to });
    for (const id of this.ids()) {
      const e = this.get(id);
      if (e.net === from) e.net = to;
    }
    this.version++;
  }

  // An entrance into network `net`, and the point at its far end, where passages start.
  addEntrance(net, details) {
    const entrance = { id: `e${this.next++}`, net, ...ENTRANCE_DEFAULTS, ...details };
    const point = this.addPoint(net, entranceEnd(entrance), { width: entrance.width, height: entrance.width, rock: entrance.rock, hewn: entrance.hewn });
    entrance.point = point.id;
    this.entrances.set(entrance.id, entrance);
    this.version++;
    return entrance;
  }

  addPoint(net, at, details = {}) {
    const point = { id: `p${this.next++}`, net, at: [...at], ...structuredClone(POINT_DEFAULTS), ...details };
    this.points.set(point.id, point);
    this.version++;
    return point;
  }

  addSegment(net, from, to) {
    const segment = { id: `s${this.next++}`, net, from, to };
    this.segments.set(segment.id, segment);
    this.version++;
    return segment;
  }

  // Removes an element: an entrance with its point, where nothing else joins it, a point with its
  // segments and entrances, and a network left with nothing in it.
  remove(id) {
    const entrance = this.entrances.get(id);
    if (entrance) {
      this.entrances.delete(id);
      if (!this.joined(entrance.point).length) this.remove(entrance.point);
    }
    if (this.points.delete(id)) {
      for (const s of [...this.segments.values()]) if (s.from === id || s.to === id) this.segments.delete(s.id);
      for (const e of [...this.entrances.values()]) if (e.point === id) this.entrances.delete(e.id);
    }
    this.segments.delete(id);
    const used = new Set(this.ids().map((other) => this.get(other).net));
    for (const slug of [...this.networks.keys()]) if (!used.has(slug)) this.networks.delete(slug);
    this.version++;
  }

  // A point's segments.
  joined(pointId) {
    return [...this.segments.values()].filter((s) => s.from === pointId || s.to === pointId);
  }

  // An element as carving sees it, which carving it opens just the same again: a copy of it, a
  // segment's with its points', `ends`; null for a point, which carves nothing of its own.
  copyOf(id) {
    if (this.points.has(id)) return null;
    const element = this.entrances.get(id) ?? this.segments.get(id);
    if (!element) return null;
    const copy = structuredClone(element);
    if (this.segments.has(id)) copy.ends = [copy.from, copy.to].map((p) => structuredClone(this.points.get(p)));
    return copy;
  }

  // Whether an element's changed since it was last carved: new, changed, or deleted.
  changed(id) {
    return stable(this.copyOf(id)) !== stable(this.carved.get(id) ?? null);
  }

  // The ids of everything changed since it was last carved.
  changes() {
    return [...new Set([...this.ids(), ...this.carved.keys()])].filter((id) => this.changed(id));
  }
}

export const isEntrance = (copy) => Boolean(copy.mouth);

// The shapes an element (as Layout's copyOf gives it) carves, as v2/caves.js's carve takes them.
export function shapesOf(copy) {
  if (isEntrance(copy)) return entranceShapes({ ...copy, at: entranceEnd(copy) });
  return segmentShapes(copy);
}

// A segment: a tube from its first point's floor to its second's, as wide and high as each, eased
// between them, a dome every few feet.
export function segmentShapes({ ends: [a, b] }) {
  const length = Math.hypot(...b.at.map((v, k) => v - a.at[k]));
  const yaw = Math.atan2(b.at[0] - a.at[0], b.at[2] - a.at[2]);
  const count = Math.max(1, Math.ceil(length / (Math.min(a.width, b.width) / 3)));
  const out = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const [w, h] = [a.width + (b.width - a.width) * t, a.height + (b.height - a.height) * t];
    out.push({ kind: "dome", at: lerp(a.at, b.at, t), radii: [w / 2, h, Math.max(w / 2, length / count)], yaw });
  }
  return out;
}

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
// `open`), and closed off round at the far end, for passages to go on from.
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
  if (style === "mine") out.push({ kind: "box", at: add(at, [0, W / 2, 0]), half: [W / 2, W / 2, W / 2], yaw: a });
  else out.push({ kind: "dome", at, radii: [W / 2, W, W / 2], yaw: a });
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
    const p = add(add(mouth, [0, W / 2 - (Math.cos(t) * s * W) / 2, 0]), side.map((v) => (v * Math.sin(t) * s * W) / 2));
    const low = Math.min(t, Math.PI * 2 - t) <= LOW_RING;
    return { at: p, low, open: low || p[1] > groundAt(p[0], p[2]) };
  });
}

// Why an entrance can't go where it is, or null where it can: its mouth has to be out in the air,
// but for the bottom of it, and its far end under the ground.
export function entranceProblem(entrance, groundAt) {
  if (!entranceRing(entrance, groundAt).every((p) => p.open)) return "an entrance's mouth has to be out in the open";
  const end = entranceShapes({ ...entrance, at: entranceEnd(entrance) }).at(-1);
  if (!fits(end, groundAt)) return "an entrance's far end has to be under the ground";
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
// the shapes each opens afresh, and every unchanged element whose last carving the filling cuts
// into, each in its network. `ids`: the elements to carve (all changed ones, by default). Only
// entrances' tubes open through the ground; given groundAt(x, z), the ground's height, a segment
// that would come within ROOF_FT of it isn't carved, and is listed in `unfit`.
export function carvePlan(layout, { ids = layout.changes() } = {}, groundAt = null) {
  const redo = new Set(ids);
  const fills = ids.filter((id) => layout.carved.has(id)).flatMap((id) => shapesOf(layout.carved.get(id)));
  if (fills.length) {
    const box = boxOf(fills);
    for (const [id, copy] of layout.carved) {
      if (redo.has(id) || layout.changed(id)) continue;
      if (overlap(box, boxOf(shapesOf(copy)))) redo.add(id);
    }
  }
  const carved = new Map(layout.carved);
  for (const id of ids) carved.delete(id);
  const [opens, unfit] = [[], []];
  for (const id of redo) {
    const copy = layout.copyOf(id);
    if (!copy) continue;
    const shapes = shapesOf(copy);
    if (groundAt && !isEntrance(copy) && shapes.some((s) => !fits(s, groundAt))) {
      unfit.push(id);
      continue;
    }
    carved.set(id, copy);
    const [rock, hewn] = isEntrance(copy) ? [copy.rock, copy.hewn] : [copy.ends[0].rock, copy.ends[0].hewn];
    for (const shape of shapes) opens.push({ shape, stone: allStone(rock, hewn), mouth: Boolean(shape.open), net: copy.net });
  }
  return { fills, opens, carved, unfit };
}
