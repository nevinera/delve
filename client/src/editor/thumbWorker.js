import { gunzipSync } from "fflate";
import { decodeTile } from "../world/tileCodec.js";
import { tileRgba } from "../world/tileImage.js";
import { shrinkRgba, THUMB_PX } from "./thumbPixels.js";

// Draws tiles' thumbnails off the main thread: each message carries a tile's gzipped file and is
// answered with its full thumbnail, the small one that's saved, and its waterfalls.

self.onmessage = ({ data: { key, gz } }) => {
  try {
    const tile = decodeTile(gunzipSync(gz));
    const rgba = tileRgba(tile);
    const small = shrinkRgba(rgba, tile.cells, THUMB_PX);
    self.postMessage({ key, rgba, small, cells: tile.cells, falls: tile.falls ?? [] }, [rgba.buffer, small.buffer]);
  } catch (err) {
    self.postMessage({ key, error: err.message });
  }
};
