import { gunzipSync } from "fflate";
import { decodeTile } from "../world/tileCodec.js";
import { overviewHeights } from "./overviewHeights.js";

// Reads tiles' coarse heights for the 3d overview off the main thread: each message carries a
// tile's gzipped file and is answered with its heights.
self.onmessage = ({ data: { key, gz } }) => {
  try {
    const heights = overviewHeights(decodeTile(gunzipSync(gz)));
    self.postMessage({ key, heights }, [heights.buffer]);
  } catch (err) {
    self.postMessage({ key, error: err.message });
  }
};
