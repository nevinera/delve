import { BiomeMap, bakePlate } from "../v2/biomes.js";
import { decodePlate, encodePlate } from "../v2/plate.js";
import { encodePlatter } from "../v2/platter.js";
import { WaterMap, bakeWater } from "../v2/water.js";

// Reads plate files off the main thread (ground.js's Renditions), handing back each plate's
// arrays rather than copies, and writes plate and platter files, for saving, with plates' biomes
// worked out from the biome areas sent last and their water from the bodies sent last.
let biomes = new BiomeMap();
let water = new WaterMap();
self.onmessage = ({ data }) => {
  if (data.biomes) {
    biomes = new BiomeMap(data.biomes);
    return;
  }
  if (data.water) {
    water = new WaterMap(data.water);
    return;
  }
  if (data.write) {
    if (data.write === "plate") {
      // With each tile's water as it's baked, for drawing.
      const bytes = encodePlate(bakeWater(bakePlate(data.value, biomes), water));
      const waters = [...data.value.tiles].map(([index, tile]) => [index, tile.water]);
      self.postMessage({ id: data.id, bytes, waters }, [bytes.buffer, ...waters.flatMap(([, w]) => (w ? [w.level.buffer, w.type.buffer] : []))]);
      return;
    }
    const bytes = encodePlatter(data.value);
    self.postMessage({ id: data.id, bytes }, [bytes.buffer]);
    return;
  }
  const { key, bytes } = data;
  try {
    const plate = decodePlate(bytes);
    const buffers = [...plate.tiles.values()].flatMap((tile) => [tile.heights.buffer, tile.terrain.buffer, tile.biome.buffer, tile.slots.buffer, ...(tile.water ? [tile.water.level.buffer, tile.water.type.buffer] : [])]);
    self.postMessage({ key, plate }, buffers);
  } catch (err) {
    self.postMessage({ key, error: err.message });
  }
};
