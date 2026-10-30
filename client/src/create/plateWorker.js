import { decodePlate, encodePlate } from "../v2/plate.js";
import { encodePlatter } from "../v2/platter.js";

// Reads plate files off the main thread (ground.js's Renditions), handing back each plate's
// arrays rather than copies, and writes plate and platter files, for saving.
self.onmessage = ({ data }) => {
  if (data.write) {
    const bytes = data.write === "plate" ? encodePlate(data.value) : encodePlatter(data.value);
    self.postMessage({ id: data.id, bytes }, [bytes.buffer]);
    return;
  }
  const { key, bytes } = data;
  try {
    const plate = decodePlate(bytes);
    const buffers = [...plate.tiles.values()].flatMap((tile) => [tile.heights.buffer, tile.colors.buffer, tile.terrain.buffer, tile.forest.buffer]);
    self.postMessage({ key, plate }, buffers);
  } catch (err) {
    self.postMessage({ key, error: err.message });
  }
};
