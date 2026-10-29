import { gzipSync } from "fflate";
import { BIOMES } from "../world/biomes.js";
import { CELLS, CELL_FT, TILE_FT, WATER_KINDS } from "../world/constants.js";
import { TERRAIN } from "../world/generator.js";
import { makeObject, tileOf } from "../world/objects.js";
import { slabBottom, slabTile, slabTop } from "../world/slabs.js";
import { captureTemplate, placedTemplate } from "../world/templates.js";
import { encodeTile } from "../world/tileCodec.js";
import { surfacePath } from "./thumbnails.js";

// Editing a template in the detail step: the template stands on flat, bare tiles of a world of
// its own, kept apart from the real one, so every detail tool works on it. Saving takes back
// everything on those tiles.

export const SCRATCH = "scratch"; // the scratch world's continent
export const SCRATCH_FT = 100; // its ground's height

// A scratch world for a template: { world: { files }, continent, size }, the template placed in
// the middle of a window of size × size tiles (from 0, 0) and a ring of tiles round it, its ground
// set to the template's.
export function scratchWorld(template) {
  const reach = Math.max(0, ...template.slabs.flatMap((slab) => [...slabTop(slab), ...slabBottom(slab)].map(([x, , z]) => Math.hypot(x, z))), ...template.objects.map((o) => Math.hypot(...o.at)));
  const size = reach + 2 * CELL_FT <= 1.5 * TILE_FT ? 3 : 5;
  const tiles = new Map();
  for (let tz = -1; tz <= size; tz++) for (let tx = -1; tx <= size; tx++) tiles.set(`${tx},${tz}`, flatTile(tx, tz));
  const middle = (size * TILE_FT) / 2;
  const { slabs, objects, ground } = placedTemplate(template, [middle, SCRATCH_FT, middle]);
  for (const [ci, cj, h] of ground ?? []) {
    const tile = tiles.get(`${Math.floor(ci / CELLS)},${Math.floor(cj / CELLS)}`);
    if (tile) tile.layers.height[(cj - tile.coords[1] * CELLS) * CELLS + ci - tile.coords[0] * CELLS] = h;
  }
  for (const { template: _, ...slab } of slabs) {
    const tile = tiles.get(slabTile(slab).join(","));
    tile.slabs = [...(tile.slabs ?? []), slab];
  }
  for (const { template: _, type, at, yaw, scale, ...rest } of objects) {
    const key = tileOf(at).join(",");
    tiles.get(key).objects.push({ ...makeObject(type, at, yaw, scale), ...rest, id: `${key.replace(",", ".")}.${Math.random().toString(36).slice(2, 8)}` });
  }
  const files = new Map([...tiles.values()].map((tile) => [surfacePath(SCRATCH, ...tile.coords), gzipSync(encodeTile(tile))]));
  return { world: { files }, continent: SCRATCH, size };
}

// Bare grass at SCRATCH_FT, with no trees, water or clutter.
function flatTile(tx, tz) {
  const n = CELLS * CELLS;
  return {
    coords: [tx, tz],
    layer: "surface",
    cells: CELLS,
    cellFt: CELL_FT,
    palettes: { terrain: [...TERRAIN], biome: BIOMES, water: [...WATER_KINDS] },
    objects: [],
    generator: { version: 0, seed: SCRATCH },
    layers: {
      height: new Float64Array(n).fill(SCRATCH_FT),
      water: new Float64Array(n).fill(NaN),
      terrain: new Uint8Array(n).fill(TERRAIN.indexOf("grass")),
      biome: new Uint8Array(n),
      forest: new Uint8Array(n),
      clutter: new Uint8Array(n),
    },
  };
}

// The template the scratch tiles hold now (captureTemplate), every slab and object on them, or null
// when they hold fewer than two. tiles: the detail view's tiles in the window; height(ci, cj).
export function scratchTemplate(tiles, height, { id, name, withGround }) {
  const slabs = tiles.flatMap((tile) => tile.slabs ?? []);
  const objects = tiles.flatMap((tile) => tile.objects ?? []);
  if (slabs.length + objects.length < 2) return null;
  return captureTemplate({ id, name, withGround, slabs, objects, height });
}
