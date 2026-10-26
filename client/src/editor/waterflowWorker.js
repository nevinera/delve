import { simulateWater } from "./waterflow.js";
import { prepareShape, prepareWorld, shapeHeight, waterAt } from "../world/generator.js";

// Works out where the continent's water goes (waterflow.js) off the main thread. The ground is the
// land's rough shape, as the heights map shows it. Water already there is the sea, swamp pools,
// ponds and lakes.
let land = null; // { key, shape, world } for the latest zones and pins

self.onmessage = ({ data }) => {
  const { key, continent, seedKey, sources } = data;
  const landKey = JSON.stringify([continent, seedKey]);
  if (land?.key !== landKey) {
    land = { key: landKey, shape: prepareShape(continent, seedKey), world: prepareWorld({ ...continent, strokes: [] }, seedKey) };
  }
  const result = simulateWater({
    sources,
    heightAt: (x, z) => shapeHeight(land.shape, x, z),
    isWater: (x, z) => waterAt(land.world, x, z),
    seed: land.shape.seed,
  });
  self.postMessage({ key, result });
};
