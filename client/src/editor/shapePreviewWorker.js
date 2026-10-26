import { shapeGrid } from "./shapePreview.js";

// Works out a preview off the main thread (shapePreview.js).
self.onmessage = ({ data }) => {
  const grid = shapeGrid(data.zones, data.seedKey, data.options);
  self.postMessage(grid, grid ? [grid.heights.buffer, ...(grid.colors ? [grid.colors.buffer] : [])] : []);
};
