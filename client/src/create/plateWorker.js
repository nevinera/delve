import { BiomeMap } from "../v2/biomes.js";
import { decodePlate } from "../v2/plate.js";
import { encodePlatter } from "../v2/platter.js";
import { WaterMap } from "../v2/water.js";
import { loadZipper } from "../v2/zstd.js";
import { bakedPlate, plateEdges } from "./plateEdits.js";

// Reads plate files off the main thread (ground.js's Renditions), handing back each plate's
// arrays rather than copies, and writes plate and platter files, for saving, with plates' biomes
// worked out from the biome areas sent last and their water from the bodies sent last. A plate
// to write comes as its tiles, or as its file and the edits to put in it. Writing waits for
// zstd's writer (v2/zstd.js) to load.
const zipper = loadZipper();
let biomes = new BiomeMap();
let water = new WaterMap();
self.onmessage = ({ data }) => {
  if (data.biomes) {
    biomes = new BiomeMap(data.biomes);
    return;
  }
  if (data.water) {
    water = new WaterMap(data.water.bodies, data.water.courses);
    return;
  }
  if (data.edgesOf) {
    try {
      self.postMessage({ id: data.id, edges: plateEdges(data.edgesOf) });
    } catch (err) {
      self.postMessage({ id: data.id, error: err.message });
    }
    return;
  }
  if (data.write) {
    // With the biomes and water sent before it, not those sent while the writer loads.
    const [biomesNow, waterNow] = [biomes, water];
    zipper.then(() => write(data, biomesNow, waterNow));
    return;
  }
  const { key, bytes } = data;
  try {
    const plate = decodePlate(bytes);
    const buffers = [...plate.tiles.values()].flatMap((tile) => [tile.heights.buffer, tile.terrain.buffer, tile.biome.buffer, tile.slots.buffer, ...(tile.water ? [tile.water.level.buffer, tile.water.type.buffer] : []), ...(tile.cut ? [tile.cut.buffer] : [])]);
    self.postMessage({ key, plate }, buffers);
  } catch (err) {
    self.postMessage({ key, error: err.message });
  }
};

function write(data, biomes, water) {
  try {
    if (data.write === "plate") {
      // With each tile's water as it's baked, for drawing.
      const { bytes, waters } = bakedPlate(data.value, biomes, water);
      const buffers = (waters ?? []).flatMap(([, ...each]) => each.flatMap((w) => (w ? [w.level.buffer, w.type.buffer] : [])));
      self.postMessage({ id: data.id, bytes, waters }, bytes ? [bytes.buffer, ...buffers] : buffers);
      return;
    }
    const bytes = encodePlatter(data.value);
    self.postMessage({ id: data.id, bytes }, [bytes.buffer]);
  } catch (err) {
    self.postMessage({ id: data.id, error: err.message });
  }
}
