import { decodePlate } from "../v2/plate.js";

// Reads plate files off the main thread (ground.js's Renditions), handing back each plate's
// arrays rather than copies.
self.onmessage = ({ data: { key, bytes } }) => {
  try {
    const plate = decodePlate(bytes);
    const buffers = [...plate.tiles.values()].flatMap((tile) => [tile.heights.buffer, tile.colors.buffer, tile.terrain.buffer, tile.forest.buffer]);
    self.postMessage({ key, plate }, buffers);
  } catch (err) {
    self.postMessage({ key, error: err.message });
  }
};
