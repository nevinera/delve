import { BUILTIN_OBJECTS } from "../../builtinObjects.js";
import { TILES, color } from "../pieces.js";

// Helpers for writing builtin structures (builtinStructures.js) in structures.js's format. Cells are
// [x, z] in 4 ft cells from the anchor; furnishings are placed in feet.

export { color };
export const CELL = 4;

// The feet at the middle of cell n.
export const mid = (n) => (n + 0.5) * CELL;

// The cells of a rectangle `w` by `d` from (x0, z0), as keys.
export function rect(x0, z0, w, d) {
  const out = [];
  for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) out.push(`${x},${z}`);
  return out;
}

export const minus = (keys, without) => keys.filter((k) => !without.includes(k));

// The edges around a set of cells: those between a cell in it and one not.
export function outline(cells) {
  const set = new Set(cells);
  const out = [];
  for (const key of cells) {
    const [x, z] = key.split(",").map(Number);
    if (!set.has(`${x},${z - 1}`)) out.push(`${x},${z},n`);
    if (!set.has(`${x},${z + 1}`)) out.push(`${x},${z + 1},n`);
    if (!set.has(`${x - 1},${z}`)) out.push(`${x},${z},w`);
    if (!set.has(`${x + 1},${z}`)) out.push(`${x + 1},${z},w`);
  }
  return out;
}

// Walls of `material` on edges, as a storey's edges.
export const walls = (keys, material) => Object.fromEntries(keys.map((k) => [k, { material }]));

// Openings put in walls already there.
export const DOOR = { opening: "door", sill: 0, top: 8 };
export const window_ = (sill = 3, top = 6) => ({ opening: "window", sill, top });
export function open(edges, keys, opening) {
  for (const key of keys) {
    if (!edges[key]) throw new Error(`no wall at ${key} for an opening`);
    edges[key] = { ...edges[key], ...opening };
  }
  return edges;
}

// Takes walls away from edges.
export function drop(edges, keys) {
  for (const key of keys) delete edges[key];
  return edges;
}

// Materials, by what they're made of: c is a palette index.
export const stone = (c, thicknessFt = 1.5) => ({ color: c, thicknessFt, tile: { image: TILES.stone, every: 4, jitter: 0.15 } });
export const rock = (c) => ({ color: c, thicknessFt: 2, tile: { image: TILES.cobbles, every: 6, jitter: 0.3 } });
export const timber = (c) => ({ color: c, thicknessFt: 0.75, tile: { image: TILES.planks, every: 3, jitter: 0.1 } });
export const plaster = (c) => ({ color: c, thicknessFt: 0.75 });
export const boards = (c) => ({ color: c, thicknessFt: 0.5, tile: { image: TILES.planks, every: 3, jitter: 0.1 } });
export const shingles = (c) => ({ color: c, thicknessFt: 0.5, tile: { image: TILES.shingles, every: 3, jitter: 0.15 } });
export const thatch = (c) => ({ color: c, thicknessFt: 0.5, tile: { image: TILES.thatch, every: 3, jitter: 0.2 } });
export const plain = (c, thicknessFt = 1) => ({ color: c, thicknessFt });

// Components.
export const stairs = (level, at, facing, run, width = 1, material) => ({ type: "stairs", level, at, facing, run, width, ...(material ? { material } : {}) });
export const ramp = (level, at, facing, run, width = 1, material) => ({ type: "ramp", level, at, facing, run, width, ...(material ? { material } : {}) });
export const railing = (level, edges, material) => ({ type: "railing", level, edges, ...(material ? { material } : {}) });
export const gable = (level, at, size, ridge, material, pitch = 0.75, overhangFt = 1) => ({ type: "roof", level, at, size, shape: "gable", pitch, overhangFt, ridge, material });
export const leanTo = (level, at, size, facing, material, pitch = 0.4, overhangFt = 1) => ({ type: "roof", level, at, size, shape: "lean-to", pitch, overhangFt, facing, material });
export const flat = (level, at, size, material) => ({ type: "roof", level, at, size, shape: "flat", pitch: 0, overhangFt: 0, material });
export const span = (level, at, facing, run, width, material, rails = true) => ({ type: "span", level, at, facing, run, width, material, rails });

// A builtin object placed in it (objects.js BUILT_PREFIX, written out since objects.js reads
// these structures as it loads), `id` a builtin object's, at (x, z) feet, `y` feet up.
const names = new Map(BUILTIN_OBJECTS.map((o) => [o.id, o.name]));
export function put(id, x, z, { y = 0, yaw = 0, scale = 1, colors } = {}) {
  if (!names.has(id)) throw new Error(`no builtin object ${id}`);
  return { type: `built:${id}`, name: names.get(id), at: [x, y, z], yaw: (yaw * Math.PI) / 180, scale, ...(colors ? { colors } : {}) };
}

export const storey = (level, floor, edges = {}) => ({ level, floor, edges });

export function structure({ id, name, tags, palette, storeyFt = 10, materials, floor, foundation, storeys, components = [], objects = [] }) {
  return { id, name, tags, palette, storeyFt, materials, floor, foundation, storeys, components, objects };
}
