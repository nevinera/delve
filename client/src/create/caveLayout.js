import { ROOF_FT, allStone, shapeBounds } from "../v2/caves.js";
import { OFFSHOOT_FT, ROCK_FT, middleOf, rockBetween, segmentShapes, steep } from "./caveQualities.js";
import { WALK_DEG } from "./growth.js";

export { EXCLUSIVE, QUALITIES, ROCK_FT, rockBetween, segmentShapes, seedOf, steep } from "./caveQualities.js";

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
export const ENTRANCE_FT = [16, 24]; // the entrances' widths
const DOWN = 0.2; // how far a sloping entrance drops for each foot in
const LOW_RING = Math.PI / 4; // how far round from the bottom an entrance's mouth can be in the ground

export const ENTRANCE_DEFAULTS = { style: "natural", width: 18, length: 48, slope: "level", rock: 0 };
export const POINT_DEFAULTS = { width: 18, height: 22, qualities: [], rock: 0 };
export const PHASES = ["layout", "polish"];
export const POINT_FT = { width: [16, 64], height: [16, 48] }; // the passage's sizes a point can have
export const JOIN_FT = 8; // how near an existing point a passage joins it, not splitting
const CONFIG = ["width", "height", "qualities", "rock"]; // what a point keeps of its section
export const NETWORK_GAP_FT = 32; // the least rock to leave between networks
export const REACH_SEGMENTS = 3; // how many segments either way a segment's shape can depend on

// A value as JSON with its objects' keys sorted, to compare.
const stable = (value) => JSON.stringify(value, (k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v));
const add = (a, b) => a.map((v, i) => v + b[i]);
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const byId = (a, b) => Number(a.slice(1)) - Number(b.slice(1));

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
    this.entrances = new Map(entrances.map(({ hewn, ...e }) => [e.id, { ...ENTRANCE_DEFAULTS, ...e }]));
    this.points = new Map(points.map(({ hewn, ...p }) => [p.id, { ...structuredClone(POINT_DEFAULTS), ...p }]));
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

  // Network `net` as it is, copied: its record (null where there's none) and its elements, to put
  // back with putNetwork.
  networkJSON(net) {
    const mine = (elements) => [...elements.values()].filter((e) => e.net === net);
    return structuredClone({ network: this.networks.get(net) ?? null, entrances: mine(this.entrances), points: mine(this.points), segments: mine(this.segments) });
  }

  // Puts network `net` back as `json` (networkJSON's) has it, maybe under another name, or gone
  // where it has no record, leaving every other network as it is. The network keeps the phase it's
  // in now.
  putNetwork(net, json) {
    const phase = this.networks.get(net)?.phase;
    for (const elements of [this.entrances, this.points, this.segments]) for (const [id, e] of [...elements]) if (e.net === net) elements.delete(id);
    this.networks.delete(net);
    if (json.network) this.networks.set(json.network.slug, { ...structuredClone(json.network), phase: phase ?? json.network.phase });
    for (const [elements, list] of [[this.entrances, json.entrances], [this.points, json.points], [this.segments, json.segments]]) for (const e of list) elements.set(e.id, structuredClone(e));
    this.version++;
  }

  // An entrance into network `net`, and the point at its far end, where passages start.
  addEntrance(net, details) {
    const entrance = { id: `e${this.next++}`, net, ...ENTRANCE_DEFAULTS, ...details };
    const point = this.addPoint(net, entranceEnd(entrance), { width: entrance.width, height: entrance.width, rock: entrance.rock });
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

  // The nearest spot on network `net`'s passages to `p`, continent feet, as { id, at, d }: a point's
  // id, or a segment's with the spot on its line; null in a network with no points. Leaves out
  // `skip`, a set of ids.
  nearest(net, p, skip = new Set()) {
    let best = null;
    const consider = (id, at) => {
      const d = Math.hypot(...at.map((v, k) => v - p[k]));
      if (!best || d < best.d) best = { id, at, d };
    };
    for (const point of this.points.values()) if (point.net === net && !skip.has(point.id)) consider(point.id, point.at);
    for (const s of this.segments.values()) {
      if (s.net !== net || skip.has(s.id)) continue;
      const [a, b] = [this.points.get(s.from).at, this.points.get(s.to).at];
      const ab = b.map((v, k) => v - a[k]);
      const t = Math.max(0, Math.min(1, ab.reduce((sum, v, k) => sum + v * (p[k] - a[k]), 0) / (ab.reduce((sum, v) => sum + v * v, 0) || 1)));
      consider(s.id, lerp(a, b, t));
    }
    return best;
  }

  // The spot a passage from spot `spot` (as `nearest` gives it) goes from: the end of its segment
  // nearer it, where that's within its passage's width (JOIN_FT at least), so a point isn't put
  // where its passage would overlap another's; or else the spot itself.
  joinAt(spot) {
    const segment = this.segments.get(spot.id);
    if (!segment) return spot;
    const [near] = [segment.from, segment.to].map((id) => this.points.get(id)).map((point) => ({ point, d: Math.hypot(...point.at.map((v, k) => v - spot.at[k])) })).sort((a, b) => a.d - b.d);
    return near.d <= Math.max(JOIN_FT, near.point.width) ? { ...spot, id: near.point.id, at: near.point.at, d: spot.d } : spot;
  }

  // The point at a spot `nearest` gave: the point itself, or on a segment, the end joinAt gives,
  // or a new point splitting the segment there, with the config of its nearer end.
  pointAt(spot) {
    const { id, at } = this.joinAt(spot);
    const segment = this.segments.get(id);
    if (!segment) return this.points.get(id);
    const ends = [segment.from, segment.to].map((p) => this.points.get(p));
    const [near] = ends.map((point) => ({ point, d: Math.hypot(...point.at.map((v, k) => v - at[k])) })).sort((a, b) => a.d - b.d);
    const split = this.addPoint(segment.net, at.map((v) => Math.round(v * 4) / 4), configOf(near.point));
    this.segments.delete(id);
    this.addSegment(segment.net, segment.from, split.id);
    this.addSegment(segment.net, split.id, segment.to);
    return split;
  }

  // A passage on from spot `from` (as `nearest` gives it): to a new point at `at`, with `config`,
  // or the config of the point it goes on from, or, with spot `to`, joining the passage there. Gives the
  // passage's far point.
  extend(from, { at = null, to = null, config = null } = {}) {
    const start = this.pointAt(from);
    const end = to ? this.pointAt(to) : this.addPoint(start.net, at.map((v) => Math.round(v * 4) / 4), structuredClone(config ?? configOf(start)));
    this.addSegment(start.net, start.id, end.id);
    return end;
  }

  // Whether network `net` is burned in, its layout kept as it is.
  locked(net) {
    return this.networks.get(net)?.phase === "polish";
  }

  // Burns network `net` in, or unlocks it.
  setPhase(net, phase) {
    this.networks.get(net).phase = phase;
    this.version++;
  }

  // The ids of network `net`'s entrances and segments, which carve.
  carvers(net) {
    return [...this.entrances.values(), ...this.segments.values()].filter((e) => e.net === net).map((e) => e.id);
  }

  // A point's segments.
  joined(pointId) {
    return [...this.segments.values()].filter((s) => s.from === pointId || s.to === pointId);
  }

  // An element as carving sees it, which carving it opens just the same again: a copy of it, a
  // segment's with its points', `ends`, and the points within REACH_SEGMENTS of them, `near`,
  // by id, which its shape can depend on, so changing one carves it again; null for a point,
  // which carves nothing of its own.
  copyOf(id) {
    if (this.points.has(id)) return null;
    const element = this.entrances.get(id) ?? this.segments.get(id);
    if (!element) return null;
    const copy = structuredClone(element);
    if (this.segments.has(id)) {
      copy.ends = [copy.from, copy.to].map((p) => structuredClone(this.points.get(p)));
      copy.near = this.around([copy.from, copy.to], REACH_SEGMENTS)
        .filter((p) => p !== copy.from && p !== copy.to)
        .sort(byId)
        .map((p) => structuredClone(this.points.get(p)));
      // Side passages keep clear of the passages they could reach.
      if (copy.ends.some((end) => end.qualities.includes("offshoots"))) {
        copy.others = [...this.segments.values()]
          .filter((s) => s.id !== id && s.net === copy.net)
          .map((s) => ({ id: s.id, ends: [s.from, s.to].map((p) => this.points.get(p)) }))
          .filter((s) => rockBetween(copy.ends, s.ends) < OFFSHOOT_FT + ROCK_FT)
          .sort((a, b) => byId(a.id, b.id))
          .map((s) => structuredClone(s.ends));
      }
    }
    return copy;
  }

  // The ids of the points within `steps` segments of points `ids`, with them.
  around(ids, steps) {
    const seen = new Set(ids);
    let edge = [...ids];
    for (let step = 0; step < steps && edge.length; step++) {
      const next = [];
      for (const id of edge) {
        for (const s of this.joined(id)) {
          const other = s.from === id ? s.to : s.from;
          if (!seen.has(other)) seen.add(other), next.push(other);
        }
      }
      edge = next;
    }
    return [...seen];
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
// The warnings for a passage `ends` ({ at, width, height } twice): too steep to walk.
export function passageWarnings(layout, net, ends) {
  return steep(...ends) ? [`steeper than ${WALK_DEG}°, so it can't be walked`] : [];
}

// Why a passage `ends` ({ at, width, height } twice) laid out in network `net` can't go there, too
// near another passage, or another network, or null. `junctions`: for the ends it joins others
// at, { end, points }, the end's index in `ends` and the ids of the points whose passages it
// meets there, within a link, which it only needs rock between away from the junction. Round a
// junction it needs no rock between it and any other passage of its network: what's there is
// the junction's already.
export function rockProblem(layout, net, ends, junctions = []) {
  let nearest = null;
  for (const s of layout.segments.values()) {
    const meets = (j) => j.points.includes(s.from) || j.points.includes(s.to);
    const away = junctions.filter(meets).map((j) => middleOf(ends[j.end]));
    const own = s.net === net ? junctions.filter((j) => !meets(j)).map((j) => middleOf(ends[j.end])) : [];
    const least = s.net === net ? ROCK_FT : NETWORK_GAP_FT;
    const gap = rockBetween(ends, [s.from, s.to].map((id) => layout.points.get(id)), away, least, own);
    if (gap < least && (!nearest || gap - least < nearest.short)) nearest = { s, gap, short: gap - least };
  }
  if (!nearest) return null;
  const { s, gap } = nearest;
  const left = gap > 0 ? `only ${Math.floor(gap)} ft of rock` : "no rock";
  return s.net === net ? `${left} between it and the passage from ${s.from} to ${s.to}; leave ${ROCK_FT} ft` : `${left} between it and ${s.net}; leave ${NETWORK_GAP_FT} ft between networks`;
}

export const configOf = (point) => structuredClone(Object.fromEntries(CONFIG.map((key) => [key, point[key]])));

// The shapes an element (as Layout's copyOf gives it) carves, as v2/caves.js's carve takes them.
export function shapesOf(copy) {
  if (isEntrance(copy)) return entranceShapes({ ...copy, at: entranceEnd(copy) });
  return segmentShapes(copy);
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
export function fits(shape, groundAt) {
  const [[x0, , z0], [x1, top, z1]] = shapeBox(shape);
  const [x, , z] = shape.at;
  return [[x, z], [x0, z0], [x1, z0], [x0, z1], [x1, z1]].every(([a, b]) => top <= groundAt(a, b) - ROOF_FT);
}

// The box round some shapes, or null round none.
const boxOf = (shapes) => (shapes.length ? shapes.map(shapeBox).reduce((a, b) => [a[0].map((v, k) => Math.min(v, b[0][k])), a[1].map((v, k) => Math.max(v, b[1][k]))]) : null);
const overlap = (a, b) => Boolean(a && b) && [0, 1, 2].every((k) => a[0][k] <= b[1][k] && b[0][k] <= a[1][k]);

// What carving changes: rock filled back into what each changed element carved last time, then
// the shapes each opens afresh, and every unchanged element whose last carving the filling cuts
// into, each in its network. `ids`: the elements to carve (all changed ones, by default), but for
// those in burned in networks, whose rock is kept as polished. Given `afresh`, a network, all its
// air goes and its layout's carved again from nothing, throwing its hand edits away. Only
// entrances' tubes open through the ground; given groundAt(x, z), the ground's height, a segment
// that would come within ROOF_FT of it isn't carved, and is listed in `unfit`.
export function carvePlan(layout, { ids = layout.changes(), afresh = null } = {}, groundAt = null) {
  if (afresh) ids = layout.carvers(afresh);
  ids = ids.filter((id) => !layout.locked(layout.get(id)?.net ?? layout.carved.get(id)?.net));
  const redo = new Set(ids);
  const fills = afresh ? [] : ids.filter((id) => layout.carved.has(id)).flatMap((id) => shapesOf(layout.carved.get(id)));
  if (fills.length) {
    const box = boxOf(fills);
    for (const [id, copy] of layout.carved) {
      if (redo.has(id) || layout.changed(id) || layout.locked(copy.net)) continue;
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
    const rock = isEntrance(copy) ? copy.rock : copy.ends[0].rock;
    for (const shape of shapes) opens.push({ shape, stone: allStone(rock), mouth: Boolean(shape.open), net: copy.net });
  }
  return { fills, opens, carved, unfit, clear: afresh };
}
