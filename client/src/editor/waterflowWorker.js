import { simulateWater } from "./waterflow.js";
import { prepareShape, seaAt, shapeHeight } from "../world/generator.js";

// Works out where the continent's water goes (waterflow.js) off the main thread, from the land
// grid alone: the ground is the land's rough shape, as the heights step shows it, and the only
// water already there is the sea.
let land = null; // { key, shape } for the latest land

self.onmessage = ({ data }) => {
  const { key, landKey, continent, seedKey, sources } = data;
  if (land?.key !== landKey) land = { key: landKey, shape: prepareShape(continent, seedKey) };
  const result = simulateWater({
    sources,
    heightAt: (x, z) => shapeHeight(land.shape, x, z),
    isWater: (x, z) => seaAt(land.shape, x, z),
    seed: land.shape.seed,
  });
  self.postMessage({ key, result });
};
