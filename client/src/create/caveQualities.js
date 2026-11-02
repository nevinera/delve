import { WALK_DEG } from "./growth.js";

// The shapes a cave segment carves (v2/caves.js's carve), from its copy (caveLayout.js's copyOf):
// a tube from its first point's floor to its second's, as wide and high as each, eased between
// them, a dome every few feet, reshaped by its points' qualities. Each point's quality shapes
// its half of the segment, fading across the middle half where the two points differ.
//
// Layout only carves, so every quality is made of air opened or left out:
// - twisty, very twisty: the passage meanders left and right of the line between its points.
// - bumpy: its floor rises and dips.
// - ledges: a shelf along one wall, ramping down to the floor at one end, sometimes both.
// - cluttered: pillars, boulders against the walls and mounds on the floor, left uncarved.
// - offshoots: alcoves off the walls, and sometimes a narrower side passage, wandering off to end
//   blind or in a pocket, kept ROCK_FT clear of other passages (the copy's `others`).
// - switchbacks: on a stretch too steep to walk, the passage zigzags across the slope.
//
// Everything random is seeded from the segment's id alone, so a segment comes out the same while
// it and what its copy holds stay the same.

export const QUALITIES = ["twisty", "very twisty", "bumpy", "ledges", "cluttered", "offshoots", "switchbacks"];
export const EXCLUSIVE = [["twisty", "very twisty"]]; // qualities only one of which a point can have
export const ROCK_FT = 8; // the least rock to leave between passages that aren't joined
export const JUNCTION_DEG = 45; // the least angle between passages from a junction
const JUNCTION_SPREAD = 1 / Math.sin((JUNCTION_DEG * Math.PI) / 180);
export const OFFSHOOT_FT = 60; // how far a side passage can wander
const WALKABLE_DEG = 35; // how steep a switchback's legs are at most, leaving room under WALK_DEG
const SIDE = { width: 8, height: 8, pocket: 6 }; // a side passage's size, and the pocket it can end in
const ALCOVE_FT = [3, 16]; // how deep an alcove is

// A seeded random number generator, giving numbers in [0, 1).
export function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A number to seed an element's randomness from, by its id alone.
export function seedOf(id) {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

// Whether a passage from point `a` to point `b` is too steep to walk.
export const steep = (a, b) => Math.abs(b.at[1] - a.at[1]) > Math.tan((WALK_DEG * Math.PI) / 180) * Math.hypot(b.at[0] - a.at[0], b.at[2] - a.at[2]);

// How far past its plain tube a point's qualities can carve, feet, on a segment `length` ft long.
export function reachOf(point, length) {
  const q = new Set(point.qualities ?? []);
  return Math.max(
    0,
    q.has("very twisty") ? twistFt(length, true) : q.has("twisty") ? twistFt(length, false) : 0,
    q.has("bumpy") ? bumpFt(length) : 0,
    q.has("ledges") ? ledgeSize(point).width : 0,
    q.has("offshoots") ? Math.min(ALCOVE_FT[1], length / 4) : 0,
    q.has("switchbacks") ? zigzagFt(point) : 0,
  );
}

// How much rock there is between two passages, each its two ends ({ at, width, height,
// qualities }): taken as a round tube along the middle of each, as wide as its passage's wider
// way and padded by how far its qualities reach, so no less than there is.
// `away`: the middles of junctions they meet at, round which as far as JUNCTION_SPREAD times the
// rock and room they'd need is left out of both, so that branches from a junction only need rock
// between them once they're apart, which keeps them JUNCTION_DEG apart; `own`, junctions of p's
// only, left out of it alone, where it's in what's open round its own end anyway. Infinity where
// nothing's left.
export function rockBetween(p, q, away = [], least = ROCK_FT, own = []) {
  const [rp, rq] = [radiusOf(p), radiusOf(q)];
  const zone = JUNCTION_SPREAD * (rp + rq + least);
  const ps = outside([p.map(middleOf)], [...away, ...own], zone);
  const qs = outside([q.map(middleOf)], away, zone);
  let gap = Infinity;
  for (const a of ps) for (const b of qs) gap = Math.min(gap, segmentGap(a, b));
  return gap - rp - rq;
}

export const middleOf = (end) => [end.at[0], end.at[1] + end.height / 2, end.at[2]];
const radiusOf = (ends) => {
  const length = Math.hypot(...ends[1].at.map((v, k) => v - ends[0].at[k]));
  return Math.max(...ends.map((end) => Math.max(end.width, end.height) / 2 + reachOf(end, length)));
};

// The pieces of line segments `pieces` ([a, b] each) left outside spheres of radius `r` round `centres`.
function outside(pieces, centres, r) {
  for (const c of centres) {
    pieces = pieces.flatMap(([a, b]) => {
      const d = a.map((v, k) => b[k] - v);
      const f = a.map((v, k) => v - c[k]);
      const [qa, qb, qc] = [d.reduce((s, v) => s + v * v, 0), 2 * d.reduce((s, v, k) => s + v * f[k], 0), f.reduce((s, v) => s + v * v, 0) - r * r];
      const disc = qb * qb - 4 * qa * qc;
      if (qa < 1e-9 || disc <= 0) return qc > 0 || qa >= 1e-9 ? [[a, b]] : [];
      const [t0, t1] = [(-qb - Math.sqrt(disc)) / (2 * qa), (-qb + Math.sqrt(disc)) / (2 * qa)];
      const at = (t) => a.map((v, k) => v + d[k] * t);
      const left = [];
      if (t0 > 0) left.push([a, at(Math.min(1, t0))]);
      if (t1 < 1) left.push([at(Math.max(0, t1)), b]);
      return left;
    });
  }
  return pieces;
}

const twistFt = (length, very) => (very ? Math.min(0.35 * length, 20) : Math.min(0.2 * length, 10));
const bumpFt = (length) => Math.min(0.1 * length, 4);
const ledgeSize = (point) => ({ width: Math.max(4, Math.min(8, point.width * 0.35)), up: Math.max(4, Math.min(8, point.height * 0.4)) });
const zigzagFt = (point) => Math.max(12, point.width) * 1.2;
const smooth = (t) => t * t * (3 - 2 * t);
const add = (a, b) => a.map((v, i) => v + b[i]);
const scale = (a, s) => a.map((v) => v * s);
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const sideOf = (yaw) => [Math.cos(yaw), 0, -Math.sin(yaw)];
const ahead = (yaw) => [Math.sin(yaw), 0, Math.cos(yaw)];

// The shapes a segment carves, from its copy: { id, ends: [a, b], others }.
export function segmentShapes(copy) {
  const [a, b] = copy.ends;
  const rand = random(seedOf(copy.id ?? "s"));
  // How much of quality q is on at u, 0 to 1 along the segment.
  const has = (q, point) => (point.qualities ?? []).includes(q);
  const on = (q, u) => {
    const [x, y] = [has(q, a) ? 1 : 0, has(q, b) ? 1 : 0];
    return x + (y - x) * smooth(Math.max(0, Math.min(1, (u - 0.25) / 0.5)));
  };
  const length = Math.hypot(...b.at.map((v, k) => v - a.at[k]));
  // Seeded draws come in a fixed order, the same whatever's on, so turning one quality on or off
  // leaves the others as they were.
  const twist = [0, 0, 0].map(() => rand() * 2 - 1);
  const bump = [0, 0].map(() => rand() * 2 - 1);
  const ledgeDraw = [rand(), rand(), rand()];
  const clutterRand = random(seedOf(`${copy.id}:clutter`));
  const offshootRand = random(seedOf(`${copy.id}:offshoots`));

  // The middle of the floor along the way, before meanders: straight, or zigzagging.
  const zig = (has("switchbacks", a) || has("switchbacks", b)) && steep(a, b) ? zigzag(a, b) : [a.at, b.at];
  const path = alongPath(zig);
  const step = Math.min(a.width, b.width) / 3;
  const count = Math.max(1, Math.ceil(path.length / step));
  const twisting = zig.length === 2;
  const slices = [];
  for (let i = 0; i <= count; i++) {
    const u = i / count;
    const { at, yaw } = path.at(u);
    const amount = (on("very twisty", u) * twistFt(length, true) + on("twisty", u) * twistFt(length, false)) * (twisting ? 1 : 0);
    const sideways = amount * (twist[0] * Math.sin(Math.PI * u) + 0.5 * twist[1] * Math.sin(2 * Math.PI * u) + 0.3 * twist[2] * Math.sin(3 * Math.PI * u));
    const up = on("bumpy", u) * bumpFt(length) * (bump[0] * Math.sin(2 * Math.PI * u) + 0.5 * bump[1] * Math.sin(3 * Math.PI * u));
    slices.push({ u, at: add(add(at, scale(sideOf(yaw), sideways)), [0, up, 0]), width: a.width + (b.width - a.width) * u, height: a.height + (b.height - a.height) * u });
  }
  // Each slice faces the way the passage goes there.
  for (let i = 0; i < slices.length; i++) {
    const [p, q] = [slices[Math.max(0, i - 1)].at, slices[Math.min(slices.length - 1, i + 1)].at];
    slices[i].yaw = Math.atan2(q[0] - p[0], q[2] - p[2]);
  }
  const reachAlong = path.length / count;
  clutter(slices, path.length, (u) => on("cluttered", u), clutterRand);
  const out = slices.flatMap((s) => sliceShapes(s, reachAlong));
  out.push(...ledges(slices, (u) => on("ledges", u), ledgeDraw, path.length));
  out.push(...offshoots(slices, (u) => on("offshoots", u), offshootRand, path.length, copy.others ?? []));
  return out;
}

// A path through points, as { length, at(u) }: at(u) gives the point a fraction u of the way along
// and the way it goes there (yaw).
function alongPath(points) {
  const legs = points.slice(1).map((p, i) => Math.hypot(...p.map((v, k) => v - points[i][k])));
  const length = legs.reduce((sum, l) => sum + l, 0);
  return {
    length,
    at(u) {
      let d = u * length;
      for (let i = 0; i < legs.length; i++) {
        if (d <= legs[i] || i === legs.length - 1) {
          const [p, q] = [points[i], points[i + 1]];
          return { at: lerp(p, q, legs[i] ? Math.min(1, d / legs[i]) : 0), yaw: Math.atan2(q[0] - p[0], q[2] - p[2]) };
        }
        d -= legs[i];
      }
      return null;
    },
  };
}

// A steep segment's floor as a zigzag across the slope, from a to b: legs to either side of the
// line between them, as few as keep each leg under WALKABLE_DEG, the height shared out by how far
// each leg goes across the ground.
function zigzag(a, b) {
  const yaw = Math.atan2(b.at[0] - a.at[0], b.at[2] - a.at[2]);
  const across = zigzagFt(a);
  const flat = Math.hypot(b.at[0] - a.at[0], b.at[2] - a.at[2]);
  const rise = b.at[1] - a.at[1];
  const most = Math.tan((WALKABLE_DEG * Math.PI) / 180);
  let points = [a.at, b.at];
  for (let n = 1; n <= 16; n++) {
    const ground = [a.at];
    for (let i = 1; i <= n; i++) ground.push(add(add(a.at, scale(ahead(yaw), (flat * (i - 0.5)) / n)), scale(sideOf(yaw), (i % 2 ? 1 : -1) * across)));
    ground.push(b.at);
    const legs = ground.slice(1).map((p, i) => Math.hypot(p[0] - ground[i][0], p[2] - ground[i][2]));
    const total = legs.reduce((sum, l) => sum + l, 0);
    let gone = 0;
    points = ground.map((p, i) => {
      if (i) gone += legs[i - 1];
      return [p[0], a.at[1] + (rise * gone) / total, p[2]];
    });
    if (Math.abs(rise) <= most * total) break;
  }
  return points;
}

// Cluttered: pillars, boulders against the walls and mounds on the floor, each a stretch of the
// passage's slices narrowed, split or raised, so rock's left there.
function clutter(slices, length, on, rand) {
  const count = Math.floor(length / 24);
  for (let k = 0; k < count; k++) {
    const [u, kind, side] = [0.2 + 0.6 * rand(), rand(), rand() < 0.5 ? -1 : 1];
    if (on(u) < 0.5) continue;
    const middle = slices.reduce((best, s) => (Math.abs(s.u - u) < Math.abs(best.u - u) ? s : best));
    const near = slices.filter((s) => Math.hypot(...s.at.map((v, i) => v - middle.at[i])) <= middle.width / 2 + 2);
    for (const s of near) {
      if (kind < 0.3 && s.width >= 16) s.gap = 4; // a pillar
      else if (kind < 0.7) [s.width, s.shift] = [s.width - 3, side * 1.5]; // a boulder against a wall
      else s.raise = 2; // a mound
    }
  }
}

// One slice of a passage as domes: one across it, or two either side of a pillar's gap.
function sliceShapes({ at, yaw, width, height, gap = 0, shift = 0, raise = 0 }, along) {
  const floor = add(add(at, scale(sideOf(yaw), shift)), [0, raise, 0]);
  const tall = Math.max(4, height - raise);
  if (!gap) return [{ kind: "dome", at: floor, radii: [width / 2, tall, Math.max(width / 2, along)], yaw }];
  const half = (width - gap) / 2;
  return [-1, 1].map((side) => ({ kind: "dome", at: add(floor, scale(sideOf(yaw), side * (gap / 2 + half / 2))), radii: [half / 2 + 1, tall, Math.max(half / 2, along)], yaw }));
}

// Ledges: a shelf along one wall over the middle of the stretch they're on along, its top `up`
// over the floor, ramping down to the floor at one end, sometimes both.
function ledges(slices, on, [sideDraw, startDraw, bothDraw], length) {
  const along = slices.filter((s) => s.u >= 0.15 && s.u <= 0.85 && on(s.u) >= 0.5);
  if (along.length < 3) return [];
  const side = sideDraw < 0.5 ? -1 : 1;
  const ramp = Math.max(1, Math.round((along.length * 8) / Math.max(8, length * 0.7))); // about 8 ft
  const fromStart = startDraw < 0.5;
  const both = bothDraw < 0.3;
  return along.map((s, i) => {
    const { width, up } = ledgeSize(s);
    const fromLow = fromStart ? i : along.length - 1 - i;
    const fromHigh = both ? Math.min(i, along.length - 1 - i) : fromLow;
    const lift = up * Math.min(1, fromHigh / ramp);
    const at = add(add(s.at, scale(sideOf(s.yaw), side * (s.width / 2 + width / 2 - 1))), [0, lift, 0]);
    return { kind: "dome", at, radii: [width / 2 + 1, Math.max(4, s.height - lift), width], yaw: s.yaw };
  });
}

// Offshoots: alcoves off the walls, and, half the time, a side passage wandering off to end blind
// or in a pocket, if one can be found that keeps ROCK_FT of rock from the passages in `others`.
function offshoots(slices, on, rand, length, others) {
  const out = [];
  const pick = (u) => slices.reduce((best, s) => (Math.abs(s.u - u) < Math.abs(best.u - u) ? s : best));
  for (let k = Math.floor(length / 20); k > 0; k--) {
    const [u, side, deep, size] = [0.2 + 0.6 * rand(), rand() < 0.5 ? -1 : 1, rand(), rand()];
    if (on(u) < 0.5) continue;
    const s = pick(u);
    const depth = ALCOVE_FT[0] + deep * (Math.min(ALCOVE_FT[1], length / 4) - ALCOVE_FT[0]);
    const across = 4 + size * Math.max(0, s.width / 2 - 4);
    const at = add(s.at, scale(sideOf(s.yaw), side * (s.width / 2 + depth / 2 - 1)));
    out.push({ kind: "dome", at, radii: [depth / 2 + 1, Math.max(5, s.height * 0.7), across / 2], yaw: s.yaw });
  }
  const [chance, u, side] = [rand(), 0.3 + 0.4 * rand(), rand() < 0.5 ? -1 : 1];
  if (chance >= 0.5 || on(u) < 0.5) return out;
  const s = pick(u);
  for (let attempt = 0; attempt < 4; attempt++) {
    const [turn, far, pocket, wander] = [(50 + 30 * rand()) * (Math.PI / 180), 20 + (OFFSHOOT_FT - 20) * rand(), rand() < 0.5, [rand(), rand()]];
    const yaw = s.yaw + side * turn;
    const start = add(s.at, scale(sideOf(s.yaw), side * (s.width / 2 - 1)));
    const points = [start];
    for (let i = 1; i <= 3; i++) points.push(add(add(start, scale(ahead(yaw), (far * i) / 3)), scale(sideOf(yaw), (wander[(i - 1) % 2] * 2 - 1) * far * 0.15 * (i < 3 ? 1 : 0.5))));
    // Its legs, the first from halfway, clear of the passage it leaves.
    const legs = points.slice(1).map((p, i) => [i ? points[i] : lerp(points[0], p, 0.5), p].map((at) => ({ at, width: SIDE.width, height: SIDE.height })));
    if (!others.every((o) => legs.every((leg) => rockBetween(leg, o) >= ROCK_FT))) continue;
    const path = alongPath(points);
    const n = Math.max(2, Math.ceil(path.length / (SIDE.width / 3)));
    for (let i = 0; i <= n; i++) {
      const { at, yaw: way } = path.at(i / n);
      out.push({ kind: "dome", at, radii: [SIDE.width / 2, SIDE.height, SIDE.width / 2], yaw: way });
    }
    if (pocket) out.push({ kind: "dome", at: points.at(-1), radii: [SIDE.pocket, SIDE.height + 2, SIDE.pocket], yaw });
    break;
  }
  return out;
}

// The least distance between segments p and q, each two points.
function segmentGap([p0, p1], [q0, q1]) {
  const sub = (a, b) => a.map((v, k) => v - b[k]);
  const dot = (a, b) => a.reduce((sum, v, k) => sum + v * b[k], 0);
  const [d1, d2, r] = [sub(p1, p0), sub(q1, q0), sub(p0, q0)];
  const [a, e, f] = [dot(d1, d1), dot(d2, d2), dot(d2, r)];
  const clamp = (v) => Math.max(0, Math.min(1, v));
  let s, t;
  if (a <= 1e-9 && e <= 1e-9) [s, t] = [0, 0];
  else if (a <= 1e-9) [s, t] = [0, clamp(f / e)];
  else {
    const c = dot(d1, r);
    if (e <= 1e-9) [s, t] = [clamp(-c / a), 0];
    else {
      const b = dot(d1, d2);
      const denom = a * e - b * b;
      s = denom > 1e-9 ? clamp((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) [s, t] = [clamp(-c / a), 0];
      else if (t > 1) [s, t] = [clamp((b - c) / a), 1];
    }
  }
  return Math.hypot(...sub(p0.map((v, k) => v + d1[k] * s), q0.map((v, k) => v + d2[k] * t)));
}
