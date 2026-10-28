import { packPlate, unpackPlate } from "./plates.js";

// Packs and unpacks plates off the main thread (plates.js PlatePool). "sizes" gives the kinds of
// objects' sizes for the packs after it.
let sizes = {};
self.onmessage = ({ data }) => {
  if (data.type === "sizes") return void (sizes = data.sizes);
  try {
    if (data.type === "unpack") {
      const result = unpackPlate(data.path, data.bytes);
      self.postMessage({ id: data.id, result }, result.map(([, gz]) => gz.buffer));
    } else self.postMessage({ id: data.id, result: packPlate(data.coords, data.layer, data.tiles, sizes) });
  } catch (err) {
    self.postMessage({ id: data.id, error: err.message });
  }
};
