import { CELLS, CELL_FT, TILE_FT } from "../world/constants.js";
import { ROAD, prepareRoad, roadAt, roadsNear } from "../world/generator.js";
import { SEA_FLOOR_FT } from "../world/landGrid.js";
import { hash2, hashString } from "../world/noise.js";
import { fellTree, paletteIndex } from "../world/trees.js";
import { ROADS } from "./features.js";

// Trails drawn by hand in the detail step, stamped into tiles the way the generator stamps roads
// (generator.js prepareRoad and roadAt): the ground's evened into a bed held to the grade cap and
// sloped back to the land beside it, the surface turned to path, trees felled where the road keeps
// clear of them, and clutter cleared off roads in use. Roads and highways in use are also listed in
// tile.roads, so the ground draws their edges sharply. Objects are left for the author.
//
// A trail is one of the road kinds (features.js ROADS), in use, faint or disused.

export const TRAIL_KINDS = Object.keys(ROADS);
export const TRAIL_STATES = ["in use", "faint", "disused"];

// Stamps a trail along `points` ([x, z] continent feet) into `tiles` (a Map of "tx,tz" to decoded
// tile), changing only tiles editable(key) allows. Returns the keys of the tiles it changed.
export function stampTrail(tiles, editable, { kind, state = "in use", width = ROADS[kind].width }, points) {
  if (points.length < 2) return [];
  const tileAt = (ci, cj) => tiles.get(`${Math.floor(ci / CELLS)},${Math.floor(cj / CELLS)}`);
  const cellOf = (ci, cj) => (cj - Math.floor(cj / CELLS) * CELLS) * CELLS + ci - Math.floor(ci / CELLS) * CELLS;
  const heightAt = (x, z) => {
    const [ci, cj] = [Math.floor(x / CELL_FT), Math.floor(z / CELL_FT)];
    const tile = tileAt(ci, cj);
    return tile ? tile.layers.height[cellOf(ci, cj)] : SEA_FLOOR_FT;
  };
  const tags = [kind, ...(state === "in use" ? [] : [state])];
  const road = prepareRoad({ tags, width, route: { points: points.map(([x, z]) => [x / TILE_FT, z / TILE_FT]) } }, heightAt);
  const seed = hashString(JSON.stringify(points[0]));

  const xs = points.map((p) => p[0]);
  const zs = points.map((p) => p[1]);
  const [ci0, ci1] = [Math.floor((Math.min(...xs) - road.reach) / CELL_FT), Math.floor((Math.max(...xs) + road.reach) / CELL_FT)];
  const [cj0, cj1] = [Math.floor((Math.min(...zs) - road.reach) / CELL_FT), Math.floor((Math.max(...zs) + road.reach) / CELL_FT)];
  const changed = new Set();
  for (let cj = cj0; cj <= cj1; cj++) {
    for (let ci = ci0; ci <= ci1; ci++) {
      const key = `${Math.floor(ci / CELLS)},${Math.floor(cj / CELLS)}`;
      const tile = tiles.get(key);
      if (!tile || !editable(key)) continue;
      const k = cellOf(ci, cj);
      const { layers } = tile;
      // Water's left for the water tools.
      if (!Number.isNaN(layers.water[k])) continue;
      const ground = { h: layers.height[k] };
      roadAt([road], ground, (ci + 0.5) * CELL_FT, (cj + 0.5) * CELL_FT, seed);
      if (ground.h === layers.height[k] && !ground.road && !ground.paved) continue;
      layers.height[k] = ground.h;
      const [i, j] = [k % CELLS, Math.floor(k / CELLS)];
      if (ground.road && !(road.disused && hash2(ci, cj, seed) < ROAD.disusedTrees)) fellTree(tile, i, j);
      if (ground.paved) layers.terrain[k] = paletteIndex(tile, "path");
      if (road.traffic && ground.road && layers.clutter) layers.clutter[k] = 0;
      changed.add(key);
    }
  }
  if (road.traffic) {
    for (const [key, tile] of tiles) {
      if (!editable(key)) continue;
      const [tx, tz] = tile.coords;
      const near = roadsNear([road], tx * TILE_FT, tz * TILE_FT);
      if (!near.length) continue;
      tile.roads = [...(tile.roads ?? []), ...near];
      changed.add(key);
    }
  }
  return [...changed];
}

