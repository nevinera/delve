import { shapeGrid } from "./shapePreview.js";

// Works out the heights preview off the main thread (shapePreview.js).
self.onmessage = ({ data }) => {
  const grid = shapeGrid(data.zones, data.seedKey);
  self.postMessage(grid, grid ? [grid.heights.buffer] : []);
};
