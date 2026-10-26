import { simulateFlow } from "./waterflow.js";
import { nearestOnStroke } from "./features.js";
import { pointInRegion } from "./region.js";
import { prepareShape, prepareWorld, shapeHeight, waterAt } from "../world/generator.js";
import { TILE_FT } from "../world/constants.js";

// Works out where a water source's water goes (waterflow.js) off the main thread. The ground is
// the land's rough shape, as the heights map shows it. Water already there is the sea, swamp
// pools, ponds and lakes, and the other sources' confirmed rivers and pools.
let land = null; // { key, shape, world } for the latest zones and pins

self.onmessage = ({ data }) => {
  const { id, key, continent, seedKey, source, width, water } = data;
  const landKey = JSON.stringify([continent, seedKey]);
  if (land?.key !== landKey) {
    land = { key: landKey, shape: prepareShape(continent, seedKey), world: prepareWorld({ ...continent, strokes: [], pools: [] }, seedKey) };
  }
  const kept = (x, z) => {
    const at = [x / TILE_FT, z / TILE_FT];
    return water.pools.some((p) => pointInRegion(at, p.region)) || water.rivers.some((r) => nearestOnStroke(r.points, at).dist * TILE_FT < r.width / 2 + 8);
  };
  const result = simulateFlow({
    source,
    width,
    heightAt: (x, z) => shapeHeight(land.shape, x, z),
    isWater: (x, z) => kept(x, z) || waterAt(land.world, x, z),
  });
  self.postMessage({ id, key, result });
};
