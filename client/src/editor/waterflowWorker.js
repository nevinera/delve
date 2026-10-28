import { pourOver } from "./waterflow.js";
import { prepareShape } from "../world/generator.js";

// Works out where a source's water goes (waterflow.js pourOver) off the main thread.
let land = null; // { key, shape } for the latest land

self.onmessage = ({ data }) => {
  const { key, landKey, continent, seedKey, edited, sources, water } = data;
  if (land?.key !== landKey) land = { key: landKey, shape: prepareShape(continent, seedKey) };
  self.postMessage({ key, result: pourOver({ shape: land.shape, edited, sources, water }) });
};
