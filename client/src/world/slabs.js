import polygonClipping from "polygon-clipping";
import { turnPoint } from "./builtObjects.js";
import { TILE_FT } from "./constants.js";

// Slabs: flat pieces placed in the detail editor to walk on and to block movement and sight
// (docs/formats/slabs.md). Floors, ramps, walls and roofs are all slabs. A tile lists its slabs;
// plates keep them as `slab` lines.
//
// A slab is { at, turn, outline, thickness, surface }:
// - at: [x, y, z] continent feet, a point on its top face.
// - turn: [yaw, pitch, roll] degrees, applied roll, pitch, yaw (three.js's "YXZ" order), as an
//   object piece's is. Unturned, the top face is level and faces up.
// - outline: the top face, 3 to MAX_SLAB_CORNERS [u, v] points in feet from `at`, u along x and v
//   along z before turning. It may be concave, but its edges don't cross.
// - holes: up to MAX_HOLES polygons in the outline's [u, v], each 3 to MAX_SLAB_CORNERS corners,
//   right through the slab, for doors and windows. They're inside the outline, and touch neither
//   it nor each other. Absent when there are none.
// - thickness: feet down from the top face, more than 0 and at most MAX_THICKNESS_FT.
// - surface: one of SLAB_PRESETS by name, or { color, pattern, tile, palette }: a "#rrggbb" color,
//   shaded by one of SLAB_PATTERNS the way the ground is, or with a world texture tiled over it
//   ({ image, every, jitter }, as an object piece's tile), whose letter inks take palette's colors
//   in turn (the color alone when there's no palette).
//
// A slab belongs to the tile holding its home corner: the north-most top corner, the west-most of
// those. Every corner, top and bottom, is within SLAB_REACH_FT of it.

export const MAX_SLAB_CORNERS = 32;
export const MAX_HOLES = 16;
export const MAX_THICKNESS_FT = 16;
export const DEFAULT_THICKNESS_FT = 1;
export const SLAB_REACH_FT = 64;

// The surfaces a slab picks from by default, each with its colors baked in.
export const SLAB_PRESETS = {
  woodgrain: { color: "#8a6440" },
  floorboards: { color: "#7a5636" },
  logs: { color: "#6b4a2e" },
  shingles: { color: "#5e4632" },
  stone: { color: "#8c8a84" },
  stoneBlocks: { color: "#918d84" },
  brick: { color: "#9a4a36" },
  roughRock: { color: "#77736c" },
  dirtyStone: { color: "#6a6258" },
  cobblestone: { color: "#7d7a74" },
  flagstones: { color: "#8a857a" },
  marble: { color: "#e4e0d8" },
  sandstone: { color: "#c8a878" },
  thatch: { color: "#b49452" },
  slateTiles: { color: "#4e5258" },
  clayTiles: { color: "#a85a3e" },
  plaster: { color: "#e2dccb" },
  packedEarth: { color: "#806648" },
  ironPlate: { color: "#5a5e62" },
  rustyIronPlate: { color: "#7a4a32" },
};

// The ground's patterns (editor/groundMaterial.js), which an advanced surface can wear.
export const SLAB_PATTERNS = ["grass", "dirt", "sand", "rock", "path", "shore", "mud", "moss", "litter"];

const HEX = /^#[0-9a-f]{6}$/;

// The slab's top corners in continent feet, [x, y, z] each, in outline order.
export function slabTop(slab) {
  return slabFace(slab, slab.outline);
}

// Points [u, v] of the slab's top face in continent feet, [x, y, z] each.
export function slabFace(slab, points) {
  const turn = turner(slab.turn);
  return points.map(([u, v]) => add(slab.at, turn([u, 0, v])));
}

// Where the upright line through continent [x, z] passes through the slab, as [low, high] feet, or
// null where it misses, or the slab stands near enough upright that it hardly would.
export function slabSpanAt(slab, x, z) {
  const n = turnPoint([0, 1, 0], slab.turn);
  if (Math.abs(n[1]) < 0.05) return null;
  // The top face's height over [x, z], then where that is across the face.
  const [ax, ay, az] = slab.at;
  const y = ay - (n[0] * (x - ax) + n[2] * (z - az)) / n[1];
  const [u, , v] = unturned(slab, [x, y, z]);
  if (!inPolygon(slab.outline, [u, v]) || (slab.holes ?? []).some((hole) => inPolygon(hole, [u, v]))) return null;
  const bottom = y - slab.thickness / n[1];
  return [Math.min(y, bottom), Math.max(y, bottom)];
}

// Whether the slab runs into a tree's trunk: an upright cylinder { x, z, radius } in continent
// feet, from `ground` up to `top`.
export function slabHitsTrunk(slab, { x, z, radius, ground, top }) {
  const corners = [...slabTop(slab), ...slabBottom(slab)];
  const [low, high] = [Math.min(...corners.map((p) => p[1])), Math.max(...corners.map((p) => p[1]))];
  if (corners.every((p) => p[0] < x - radius) || corners.every((p) => p[0] > x + radius)) return false;
  if (corners.every((p) => p[2] < z - radius) || corners.every((p) => p[2] > z + radius)) return false;
  // Up the trunk where it's beside the slab, how near the slab comes.
  const step = 0.25;
  for (let y = Math.max(ground, low - radius); y <= Math.min(top, high + radius); y += step) {
    const [u, h, v] = unturned(slab, [x, y, z]);
    const hole = (slab.holes ?? []).find((hole) => inPolygon(hole, [u, v]));
    const across = hole ? edgeDistance(hole, [u, v]) : inPolygon(slab.outline, [u, v]) ? 0 : edgeDistance(slab.outline, [u, v]);
    const through = Math.max(0, h, -slab.thickness - h);
    if (Math.hypot(across, through) < radius) return true;
  }
  return false;
}

// A continent point as [u, h, v]: across the slab's top face from `at`, and up from it.
function unturned(slab, [x, y, z]) {
  const deg = Math.PI / 180;
  const [yaw, pitch, roll] = slab.turn.map((v) => -v);
  // Turning back: yaw, then pitch, then roll, each undone.
  let [u, h, v] = [x - slab.at[0], y - slab.at[1], z - slab.at[2]];
  [u, v] = [u * Math.cos(yaw * deg) + v * Math.sin(yaw * deg), -u * Math.sin(yaw * deg) + v * Math.cos(yaw * deg)];
  [h, v] = [h * Math.cos(pitch * deg) - v * Math.sin(pitch * deg), h * Math.sin(pitch * deg) + v * Math.cos(pitch * deg)];
  [u, h] = [u * Math.cos(roll * deg) - h * Math.sin(roll * deg), u * Math.sin(roll * deg) + h * Math.cos(roll * deg)];
  return [u, h, v];
}

// How far a point [u, v] is from the nearest edge of a polygon.
function edgeDistance(polygon, [u, v]) {
  let best = Infinity;
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    const [dx, dv] = [b[0] - a[0], b[1] - a[1]];
    const t = Math.max(0, Math.min(1, ((u - a[0]) * dx + (v - a[1]) * dv) / (dx * dx + dv * dv || 1)));
    best = Math.min(best, Math.hypot(u - a[0] - t * dx, v - a[1] - t * dv));
  });
  return best;
}

// The slab with `hole` ([u, v] points) taken out of it: what's left, as slabs. A hole inside it
// joins its holes; one reaching its edge cuts a notch, and one across it splits it in pieces.
export function cutSlab(slab, hole) {
  const close = (ring) => [...ring, ring[0]];
  const tidy = (v) => Math.round(v * 100) / 100 + 0;
  // polygon-clipping repeats each ring's first corner at the end.
  const open = (ring) => ring.slice(0, -1).map((p) => p.map(tidy));
  const left = polygonClipping.difference([close(slab.outline), ...(slab.holes ?? []).map(close)], [close(hole)]);
  return left.map(([outline, ...holes]) => {
    const { holes: _, ...rest } = slab;
    return holes.length ? { ...rest, outline: open(outline), holes: holes.map(open) } : { ...rest, outline: open(outline) };
  });
}

// Its bottom corners, under the top ones.
export function slabBottom(slab) {
  const down = turner(slab.turn)([0, -slab.thickness, 0]);
  return slabTop(slab).map((p) => add(p, down));
}

// The corner it's kept by: the north-most top corner, the west-most of those.
export function slabHome(slab) {
  return slabTop(slab).reduce((best, p) => (p[2] < best[2] || (p[2] === best[2] && p[0] < best[0]) ? p : best));
}

// The tile it belongs to, [tx, tz].
export function slabTile(slab) {
  const [x, , z] = slabHome(slab);
  return [Math.floor(x / TILE_FT), Math.floor(z / TILE_FT)];
}

// What's wrong with a slab, as messages; empty when nothing is. `images`: the world's image ids,
// to check a tiled surface's against.
export function slabProblems(slab, images) {
  const out = [];
  const numbers = (list, n) => Array.isArray(list) && list.length === n && list.every(Number.isFinite);
  if (!numbers(slab?.at, 3)) out.push("needs at: [x, y, z]");
  if (!numbers(slab?.turn, 3)) out.push("needs turn: [yaw, pitch, roll]");
  const outline = slab?.outline;
  if (!(Array.isArray(outline) && outline.length >= 3 && outline.length <= MAX_SLAB_CORNERS && outline.every((p) => numbers(p, 2)))) out.push(`needs an outline of 3 to ${MAX_SLAB_CORNERS} [u, v] points`);
  else if (crosses(outline)) out.push("has an outline whose edges cross");
  else if (Math.abs(area(outline)) < 1e-6) out.push("has an outline with no area");
  if (!out.length) out.push(...holeProblems(outline, slab.holes));
  if (!(Number.isFinite(slab?.thickness) && slab.thickness > 0 && slab.thickness <= MAX_THICKNESS_FT)) out.push(`needs a thickness over 0 and at most ${MAX_THICKNESS_FT} ft`);
  out.push(...surfaceProblems(slab?.surface, images));
  if (!out.length) {
    const home = slabHome(slab);
    if ([...slabTop(slab), ...slabBottom(slab)].some((p) => Math.hypot(...sub(p, home)) > SLAB_REACH_FT + 1e-6)) out.push(`reaches more than ${SLAB_REACH_FT} ft from its home corner`);
  }
  return out;
}

function holeProblems(outline, holes) {
  if (holes === undefined) return [];
  const loop = (h) => Array.isArray(h) && h.length >= 3 && h.length <= MAX_SLAB_CORNERS && h.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite));
  if (!(Array.isArray(holes) && holes.length <= MAX_HOLES && holes.every(loop))) return [`needs holes as up to ${MAX_HOLES} lists of 3 to ${MAX_SLAB_CORNERS} [u, v] points`];
  for (const [n, hole] of holes.entries()) {
    const name = `hole ${n + 1}`;
    if (crosses(hole) || Math.abs(area(hole)) < 1e-6) return [`has ${name} whose edges cross, or with no area`];
    if (!hole.every((p) => inPolygon(outline, p)) || edgesTouch(hole, outline)) return [`has ${name} reaching outside its outline`];
    for (const other of holes.slice(0, n)) {
      if (edgesTouch(hole, other) || inPolygon(other, hole[0]) || inPolygon(hole, other[0])) return [`has ${name} overlapping another`];
    }
  }
  return [];
}

function surfaceProblems(surface, images) {
  if (typeof surface === "string") return Object.hasOwn(SLAB_PRESETS, surface) ? [] : [`has surface ${JSON.stringify(surface)}, which isn't a preset`];
  if (!(typeof surface === "object" && surface !== null && HEX.test(surface.color ?? ""))) return ["needs a surface: a preset's name, or { color }"];
  const out = [];
  if (surface.pattern !== undefined && !SLAB_PATTERNS.includes(surface.pattern)) out.push(`has pattern ${JSON.stringify(surface.pattern)}, which isn't one of ${SLAB_PATTERNS.join(", ")}`);
  if (surface.pattern !== undefined && surface.tile !== undefined) out.push("has both a pattern and a tile");
  const tile = surface.tile;
  if (tile !== undefined && !(typeof tile?.image === "string" && tile.every > 0 && tile.jitter >= 0 && tile.jitter <= 1)) out.push("has a tile without an image, a width (feet) and a jitter (0 to 1)");
  else if (tile && images && !images.has(tile.image)) out.push(`wears image ${tile.image}, which the world doesn't have`);
  if (surface.palette !== undefined && !(Array.isArray(surface.palette) && surface.palette.length <= 26 && surface.palette.every((c) => HEX.test(c)))) out.push('has a palette that isn\'t a list of up to 26 "#rrggbb" colors');
  return out;
}

// A function turning [x, y, z] by [yaw, pitch, roll] degrees, as a piece turns, rounded so a
// right angle gives whole numbers.
function turner(turn) {
  return (p) => turnPoint(p, turn).map((v) => Math.round(v * 1e6) / 1e6 + 0);
}

const add = (p, q) => p.map((v, i) => v + q[i]);
const sub = (p, q) => p.map((v, i) => v - q[i]);

function area(points) {
  let sum = 0;
  points.forEach(([x0, y0], i) => {
    const [x1, y1] = points[(i + 1) % points.length];
    sum += x0 * y1 - x1 * y0;
  });
  return sum / 2;
}

// Whether [u, v] is inside a loop of [u, v] points.
export function inPolygon(polygon, [x, z]) {
  let into = false;
  polygon.forEach(([x0, z0], i) => {
    const [x1, z1] = polygon[(i + 1) % polygon.length];
    if (z0 > z !== z1 > z && x < x0 + ((z - z0) * (x1 - x0)) / (z1 - z0)) into = !into;
  });
  return into;
}

const side = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
const between = (a, b, c) => Math.min(a[0], b[0]) <= c[0] && c[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= c[1] && c[1] <= Math.max(a[1], b[1]);

// Whether the segments a-b and c-d touch.
function touch(a, b, c, d) {
  const [d1, d2, d3, d4] = [side(c, d, a), side(c, d, b), side(a, b, c), side(a, b, d)];
  if (d1 !== d2 && d3 !== d4 && d1 && d2 && d3 && d4) return true;
  return (!d1 && between(c, d, a)) || (!d2 && between(c, d, b)) || (!d3 && between(a, b, c)) || (!d4 && between(a, b, d));
}

// Whether two edges of the loop that don't share a corner touch.
function crosses(points) {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (touch(points[i], points[(i + 1) % n], points[j], points[(j + 1) % n])) return true;
    }
  }
  return false;
}

// Whether an edge of one loop touches an edge of another.
function edgesTouch(a, b) {
  return a.some((p, i) => b.some((q, j) => touch(p, a[(i + 1) % a.length], q, b[(j + 1) % b.length])));
}
