import { setBuiltObjects } from "../world/objects.js";
import { packPlate, unpackPlate } from "./plates.js";

// Packs and unpacks plates off the main thread (plates.js PlatePool). "library" registers the
// world's own kinds of objects, which unpacking needs to size them.
self.onmessage = ({ data }) => {
  if (data.type === "library") return setBuiltObjects(data.objects, data.images, data.structures);
  try {
    if (data.type === "unpack") {
      const result = unpackPlate(data.path, data.bytes);
      self.postMessage({ id: data.id, result }, result.map(([, gz]) => gz.buffer));
    } else self.postMessage({ id: data.id, result: packPlate(data.coords, data.layer, data.tiles) });
  } catch (err) {
    self.postMessage({ id: data.id, error: err.message });
  }
};
