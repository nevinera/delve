import { CELL_FT } from "./constants.js";
import { slabBottom, slabProblems, slabTop } from "./slabs.js";

// Templates: groups of slabs and objects saved together, to place into the world as copies
// (docs/formats/templates.md). A world keeps its templates as templates/<id>.json, in collections
// as its objects are. The world never holds a template itself: placing one copies its slabs and
// objects into the tiles.
//
// A template is { id, name, tags, collection, slabs, objects, ground }. Everything in it is in
// feet from its anchor: a corner of the world's CELL_FT grid, at the height the template stands
// on. x runs east and z south.
// - slabs: slabs as tiles hold them (slabs.js), their `at` from the anchor.
// - objects: placed objects, { type, at: [x, z], yaw, scale, colors, texts, y }, as tiles hold
//   them, `at` from the anchor and `y`, when there is one, up from it. One without `y` stands on
//   whatever's under it.
// - ground: the ground under it, when it was saved with it: [[i, j, height], ...], cell (i, j)
//   covering i to i + 1 and j to j + 1 cells from the anchor, its height up from the anchor.

export const TEMPLATE_PREFIX = "template:";
export const MAX_TEMPLATE_PARTS = 1024; // slabs and objects together
export const TEMPLATE_REACH_CELLS = 128; // so a template reaches at most 1024 ft from its anchor
const REACH_FT = TEMPLATE_REACH_CELLS * CELL_FT;

const ID = /^[0-9a-z]{8}$/;
const COLOR = /^#[0-9a-f]{6}$/;

// What's wrong with a template, as messages; none when it's fine. `images` are the ids of the
// images its slabs can wear, when they're known.
export function templateProblems(template, images) {
  const out = [];
  const { slabs, objects, ground } = template ?? {};
  if (!ID.test(template?.id ?? "")) out.push("needs an id of 8 lowercase letters and digits");
  if (typeof template?.name !== "string" || !template.name.trim()) out.push("needs a name");
  if (template?.tags !== undefined && !(Array.isArray(template.tags) && template.tags.every((t) => typeof t === "string"))) out.push("has tags that aren't a list of words");
  if (!Array.isArray(slabs)) out.push("needs slabs: a list, empty if there are none");
  if (!Array.isArray(objects)) out.push("needs objects: a list, empty if there are none");
  if (out.length) return out;
  if (!slabs.length && !objects.length) out.push("has no slabs or objects");
  if (slabs.length + objects.length > MAX_TEMPLATE_PARTS) out.push(`has ${slabs.length + objects.length} slabs and objects, more than ${MAX_TEMPLATE_PARTS}`);
  slabs.forEach((slab, n) => {
    for (const message of slabProblems(slab, images)) out.push(`has slab ${n}, which ${message}`);
    if (slab?.at?.every?.(Number.isFinite) && (Math.abs(slab.at[0]) > REACH_FT || Math.abs(slab.at[2]) > REACH_FT)) out.push(`has slab ${n} more than ${REACH_FT} ft from its anchor`);
  });
  objects.forEach((object, n) => {
    for (const message of objectProblems(object)) out.push(`has object ${n}, which ${message}`);
  });
  if (ground !== undefined) out.push(...groundProblems(ground));
  return out;
}

function objectProblems(object) {
  const out = [];
  if (typeof object?.type !== "string" || !object.type) return ["needs a type"];
  if (object.type.startsWith(TEMPLATE_PREFIX) || object.type.startsWith("structure:")) out.push(`is ${object.type}, which can't go in a template`);
  if (!(Array.isArray(object.at) && object.at.length === 2 && object.at.every(Number.isFinite))) out.push("needs at: [x, z]");
  else if (object.at.some((v) => Math.abs(v) > REACH_FT)) out.push(`is more than ${REACH_FT} ft from the anchor`);
  if (!Number.isFinite(object.yaw)) out.push("needs a yaw");
  if (!(Number.isFinite(object.scale) && object.scale > 0)) out.push("needs a scale over 0");
  if (object.y !== undefined && !Number.isFinite(object.y)) out.push("has a y that isn't a number");
  if (object.colors !== undefined && !(Array.isArray(object.colors) && object.colors.every((c) => c === null || COLOR.test(c)))) out.push("has colors that aren't #rrggbb");
  return out;
}

function groundProblems(ground) {
  if (!Array.isArray(ground)) return ["has ground that isn't a list of [i, j, height] cells"];
  const out = [];
  const seen = new Set();
  for (const cell of ground) {
    const [i, j, height] = Array.isArray(cell) ? cell : [];
    if (!(cell?.length === 3 && Number.isInteger(i) && Number.isInteger(j) && Number.isFinite(height))) {
      out.push(`has a ground cell that isn't [i, j, height]: ${JSON.stringify(cell)}`);
      continue;
    }
    if (Math.max(Math.abs(i), Math.abs(j)) > TEMPLATE_REACH_CELLS) out.push(`has ground cell ${i},${j}, more than ${TEMPLATE_REACH_CELLS} cells from the anchor`);
    if (seen.has(`${i},${j}`)) out.push(`has ground cell ${i},${j} twice`);
    seen.add(`${i},${j}`);
  }
  return out;
}

// The kinds of object a template places, for checking the world has them.
export const templateKinds = (template) => new Set((template.objects ?? []).map((o) => o.type));

// A template of slabs and objects picked in the world, as { id, name, slabs, objects, ground }:
// slabs as tiles hold them, objects { type, at: [x, z], yaw, scale, y, colors, texts } in continent
// feet. Its anchor is the cell corner nearest the middle of what's picked, at the ground's mean
// height over the cells under it: those inside the convex hull of the slabs' corners and the
// objects' places. With `withGround`, it keeps those cells' heights. height(ci, cj) gives a
// continent cell's ground height.
export function captureTemplate({ id, name, slabs, objects, height, withGround = false }) {
  const points = [...slabs.flatMap((slab) => [...slabTop(slab), ...slabBottom(slab)].map(([x, , z]) => [x, z])), ...objects.map((o) => o.at)];
  const xs = points.map((p) => p[0]);
  const zs = points.map((p) => p[1]);
  const [ai, aj] = [Math.round((Math.min(...xs) + Math.max(...xs)) / 2 / CELL_FT), Math.round((Math.min(...zs) + Math.max(...zs)) / 2 / CELL_FT)];
  const cells = hullCells(convexHull(points));
  const heights = cells.map(([ci, cj]) => height(ci, cj));
  const base = round(heights.length ? heights.reduce((s, h) => s + h, 0) / heights.length : height(ai, aj), 4);
  const anchor = [ai * CELL_FT, base, aj * CELL_FT];
  return {
    id,
    name,
    slabs: slabs.map(({ at, ...slab }) => ({ at: at.map((v, i) => round(v - anchor[i])), ...structuredClone(slab) })),
    objects: objects.map(({ type, at, yaw, scale, y, colors, texts }) => ({
      type,
      at: [round(at[0] - anchor[0]), round(at[1] - anchor[2])],
      ...(Number.isFinite(y) ? { y: round(y - base) } : {}),
      yaw,
      scale,
      ...(colors ? { colors: [...colors] } : {}),
      ...(texts ? { texts: structuredClone(texts) } : {}),
    })),
    ...(withGround ? { ground: cells.map(([ci, cj], n) => [ci - ai, cj - aj, round(heights[n] - base)]) } : {}),
  };
}

// The convex hull of [x, z] points, counter-clockwise, without repeats.
export function convexHull(points) {
  const sorted = [...new Map(points.map((p) => [p.join(","), p])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => {
    const out = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out.at(-2), out.at(-1), p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

// The cells [ci, cj] a convex polygon overlaps, more than touching: those no edge of it or the
// cell's sides separate from it. A polygon of one or two points overlaps the cells it's on.
export function hullCells(hull) {
  if (!hull.length) return [];
  const xs = hull.map((p) => p[0]);
  const zs = hull.map((p) => p[1]);
  const [i0, i1, j0, j1] = [Math.floor(Math.min(...xs) / CELL_FT), Math.ceil(Math.max(...xs) / CELL_FT), Math.floor(Math.min(...zs) / CELL_FT), Math.ceil(Math.max(...zs) / CELL_FT)];
  const flat = hull.length < 3;
  const out = [];
  for (let cj = j0; cj < Math.max(j1, j0 + 1); cj++) {
    for (let ci = i0; ci < Math.max(i1, i0 + 1); ci++) {
      const corners = [[ci, cj], [ci + 1, cj], [ci + 1, cj + 1], [ci, cj + 1]].map(([i, j]) => [i * CELL_FT, j * CELL_FT]);
      if (flat ? hull.every(([x, z]) => x >= corners[0][0] && x <= corners[2][0] && z >= corners[0][1] && z <= corners[2][1]) : overlaps(hull, corners)) out.push([ci, cj]);
    }
  }
  return out;
}

// Whether two convex polygons overlap by more than touching.
function overlaps(a, b) {
  for (const poly of [a, b]) {
    for (let n = 0; n < poly.length; n++) {
      const [p, q] = [poly[n], poly[(n + 1) % poly.length]];
      const axis = [q[1] - p[1], p[0] - q[0]];
      const span = (list) => list.map(([x, z]) => x * axis[0] + z * axis[1]);
      const [sa, sb] = [span(a), span(b)];
      if (Math.max(...sa) <= Math.min(...sb) + 1e-9 || Math.max(...sb) <= Math.min(...sa) + 1e-9) return false;
    }
  }
  return true;
}

const round = (v, per = 100) => Math.round(v * per) / per + 0;
