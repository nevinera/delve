import { shapeGrid } from "./shapePreview.js";

// Works out a heights or biomes map off the main thread (shapePreview.js).
self.onmessage = ({ data }) => {
  const grid = shapeGrid(data.continent, data.seedKey, data.options);
  self.postMessage(grid, grid ? [grid.heights.buffer, grid.rgba.buffer] : []);
};
