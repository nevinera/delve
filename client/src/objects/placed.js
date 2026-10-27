import { gunzipSync } from "fflate";
import { surfaceTiles } from "../editor/thumbnails.js";
import { decodeTile } from "../world/tileCodec.js";

// How many objects of the given types (a Set) are placed in a world, in every continent's tiles.
export function placedCount(world, types) {
  let count = 0;
  for (const { key: continent } of world.info.continents) {
    for (const { path } of surfaceTiles(world, continent)) {
      const tile = decodeTile(gunzipSync(world.files.get(path)));
      count += (tile.objects ?? []).filter((o) => types.has(o.type)).length;
    }
  }
  return count;
}
