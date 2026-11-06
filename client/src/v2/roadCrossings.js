import { courseBox, pooledAt, poolsIn, shape } from "./courses.js";
import { FORD_FT, ROAD_KINDS, bedAt, placeOn, roadTrack } from "./roads.js";

// Where roads (roads.js) cross courses (courses.js), or their pools: a ford across a stream, its bed built up
// FORD_FT under the water (shaping.js, with roads.js's fordAt) and stones strewn
// over it; a plank bridge over a river, a deck of slabs from bank to bank with a beam down each
// side. /create puts both in the placed files, each with `road`, as it does what lines roads
// (roadEdges.js).

const STEP_FT = 2; // how far apart down a road it looks for water
const FORD_STONES = { type: "built:broad012", every: 5, scale: 1 };
const BANK_FT = 4; // how far onto each bank a bridge's deck reaches
const PIECE_FT = 48; // how long a bridge's slabs are at most
const CLEAR_FT = 1.5; // how far over the water a bridge's deck is at least
const DECK = { thickness: 0.6, surface: "floorboards", over: 0.3 }; // over: its top over the road's bed at each end
const BEAM = { width: 0.6, up: 0.5, thickness: 1.3, surface: "logs" };
const NARROWEST_FT = 4; // a bridge for a footpath is this wide

const round = (v, places = 1) => Math.round(v * 10 ** places) / 10 ** places;

function rand(seed, n) {
  const v = Math.sin(seed * 127.1 + n * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

// The stretches of `road` in the water of `courses`, or their pools: [{ from, to, type, level }], t ft down its
// track, type "stream" or "river" ("river" where it's in both), level the highest the water is.
export function crossingsOf(road, courses) {
  const track = roadTrack(road.points, road.kind, road.seed ?? 0);
  const near = courses.filter((course) => course.surface?.length);
  const pools = poolsIn(near);
  const found = [];
  let open = null;
  for (let t = 0; t <= track.length; t += STEP_FT) {
    const at = placeOn(track, t);
    let wet = null;
    for (const course of near) {
      const box = courseBox(course);
      if (at.x < box[0] || at.x > box[2] || at.z < box[1] || at.z > box[3]) continue;
      const made = shape(course, at.x, at.z);
      if (!made?.wet) continue;
      wet = { type: wet?.type === "river" || course.type === "river" ? "river" : "stream", level: Math.max(wet?.level ?? -Infinity, made.level) };
    }
    const pool = pooledAt(pools, at.x, at.z);
    if (pool) wet = { type: wet?.type === "river" || pool.course.type === "river" ? "river" : "stream", level: Math.max(wet?.level ?? -Infinity, pool.level) };
    if (wet && open) Object.assign(open, { to: t, type: open.type === "river" ? "river" : wet.type, level: Math.max(open.level, wet.level) });
    else if (wet) found.push((open = { from: t, to: t, ...wet }));
    else open = null;
  }
  return found;
}

// The stones strewn over a ford, `from` to `to` down the road's track, as placed files keep them.
function fordStones(road, track, { from, to }) {
  const out = [];
  const seed = road.seed ?? 0;
  for (let n = 0, t = from; t <= to; n++, t += FORD_STONES.every) {
    const at = placeOn(track, t);
    const side = (rand(seed, n * 5 + 1) - 0.5) * at.width * 0.7;
    out.push({
      type: FORD_STONES.type,
      at: [round(at.x + at.across[0] * side), round(at.z + at.across[1] * side)],
      yaw: round(rand(seed, n * 5 + 2) * 2 * Math.PI, 4),
      scale: FORD_STONES.scale,
      road: road.id,
    });
  }
  return out;
}

// A plank bridge over a river, `from` to `to` down the road's track, as slabs: from BANK_FT onto
// one bank to BANK_FT onto the other, in a straight line, its ends on the road's bed and kept
// CLEAR_FT over the water between.
function bridge(road, track, { from, to, level }) {
  const [ta, tb] = [Math.max(0, from - BANK_FT), Math.min(track.length, to + BANK_FT)];
  const [a, b] = [placeOn(track, ta), placeOn(track, tb)];
  const [ya, yb] = [bedAt(road.bed, ta) + DECK.over, bedAt(road.bed, tb) + DECK.over];
  const span = Math.hypot(b.x - a.x, b.z - a.z);
  const pieces = Math.max(1, Math.ceil(span / PIECE_FT));
  const width = Math.max(NARROWEST_FT, a.width);
  const corners = [];
  for (let n = 0; n <= pieces; n++) {
    const u = n / pieces;
    const y = ya + (yb - ya) * u;
    corners.push([a.x + (b.x - a.x) * u, n === 0 || n === pieces ? y : Math.max(y, level + CLEAR_FT), a.z + (b.z - a.z) * u]);
  }
  const out = [];
  for (let n = 0; n < pieces; n++) {
    const [p, q] = [corners[n], corners[n + 1]];
    const run = Math.hypot(q[0] - p[0], q[2] - p[2]);
    const length = round(Math.hypot(run, q[1] - p[1]), 2);
    const turn = [round((Math.atan2(q[0] - p[0], q[2] - p[2]) * 180) / Math.PI, 2), round((-Math.atan2(q[1] - p[1], run) * 180) / Math.PI, 2), 0];
    const at = p.map((v) => round(v, 2));
    const strip = (u0, u1) => [[u0, 0], [u1, 0], [u1, length], [u0, length]].map(([u, v]) => [round(u, 2), v]);
    out.push({ at, turn, outline: strip(-width / 2, width / 2), thickness: DECK.thickness, surface: DECK.surface, road: road.id });
    for (const side of [-1, 1]) {
      const edge = (side * width) / 2;
      out.push({ at: [at[0], round(at[1] + BEAM.up, 2), at[2]], turn, outline: strip(Math.min(edge, edge - side * BEAM.width), Math.max(edge, edge - side * BEAM.width)), thickness: BEAM.thickness, surface: BEAM.surface, road: road.id });
    }
  }
  return out;
}

// What `road` puts where it crosses the courses in `waterFile` (water.json): ford stones and
// bridge slabs.
export function crossingThingsOf(road, waterFile) {
  if (!road.id || !road.bed?.length || road.points.length < 2) return [];
  const track = roadTrack(road.points, road.kind, road.seed ?? 0);
  return crossingsOf(road, waterFile?.courses ?? []).flatMap((crossing) => (crossing.type === "river" ? bridge(road, track, crossing) : fordStones(road, track, crossing)));
}

// Every road's crossings' things, for `roads` as roads.json keeps them.
export function crossingThings(roads, waterFile) {
  return roads.filter((road) => ROAD_KINDS.includes(road.kind)).flatMap((road) => crossingThingsOf(road, waterFile));
}
