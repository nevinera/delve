import { CELL_FT } from "./constants.js";
import { slabProblems } from "./slabs.js";

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
export const MAX_TEMPLATE_PARTS = 512; // slabs and objects together
export const TEMPLATE_REACH_CELLS = 32; // so a template reaches at most 256 ft from its anchor
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
