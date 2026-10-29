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
// - thickness: feet down from the top face, more than 0 and at most MAX_THICKNESS_FT.
// - surface: one of SLAB_PRESETS by name, or { color, pattern, tile, palette }: a "#rrggbb" color,
//   shaded by one of SLAB_PATTERNS the way the ground is, or with a world texture tiled over it
//   ({ image, every, jitter }, as an object piece's tile), whose letter inks take palette's colors
//   in turn (the color alone when there's no palette).
//
// A slab belongs to the tile holding its home corner: the north-most top corner, the west-most of
// those. Every corner, top and bottom, is within SLAB_REACH_FT of it.

export const MAX_SLAB_CORNERS = 32;
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
  const turn = turner(slab.turn);
  return slab.outline.map(([u, v]) => add(slab.at, turn([u, 0, v])));
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
  if (!(Number.isFinite(slab?.thickness) && slab.thickness > 0 && slab.thickness <= MAX_THICKNESS_FT)) out.push(`needs a thickness over 0 and at most ${MAX_THICKNESS_FT} ft`);
  out.push(...surfaceProblems(slab?.surface, images));
  if (!out.length) {
    const home = slabHome(slab);
    if ([...slabTop(slab), ...slabBottom(slab)].some((p) => Math.hypot(...sub(p, home)) > SLAB_REACH_FT + 1e-6)) out.push(`reaches more than ${SLAB_REACH_FT} ft from its home corner`);
  }
  return out;
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

// A function turning [x, y, z] by [yaw, pitch, roll] degrees: roll about z, then pitch about x,
// then yaw about y.
function turner([yaw, pitch, roll]) {
  const [cy, sy, cp, sp, cr, sr] = [yaw, pitch, roll].flatMap((d) => [Math.cos((d * Math.PI) / 180), Math.sin((d * Math.PI) / 180)]);
  return ([x, y, z]) => {
    [x, y] = [x * cr - y * sr, x * sr + y * cr];
    [y, z] = [y * cp - z * sp, y * sp + z * cp];
    [x, z] = [x * cy + z * sy, -x * sy + z * cy];
    return [x, y, z].map((v) => Math.round(v * 1e6) / 1e6 + 0);
  };
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

// Whether two edges of the loop that don't share a corner touch.
function crosses(points) {
  const n = points.length;
  const side = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  const between = (a, b, c) => Math.min(a[0], b[0]) <= c[0] && c[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= c[1] && c[1] <= Math.max(a[1], b[1]);
  const touch = (a, b, c, d) => {
    const [d1, d2, d3, d4] = [side(c, d, a), side(c, d, b), side(a, b, c), side(a, b, d)];
    if (d1 !== d2 && d3 !== d4 && d1 && d2 && d3 && d4) return true;
    return (!d1 && between(c, d, a)) || (!d2 && between(c, d, b)) || (!d3 && between(a, b, c)) || (!d4 && between(a, b, d));
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (touch(points[i], points[(i + 1) % n], points[j], points[(j + 1) % n])) return true;
    }
  }
  return false;
}
