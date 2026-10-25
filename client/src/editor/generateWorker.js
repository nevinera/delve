import { gzipSync } from "fflate";
import { generateTile, prepareWorld } from "../world/generator.js";
import { encodeTile } from "../world/tileCodec.js";
import { tileRgba } from "../world/tileImage.js";

// Generates tiles off the main thread. "prepare" sets up the continent's zones once per run;
// each "tile" message answers with the gzipped tile file and its thumbnail pixels.

let ctx = null;

self.onmessage = ({ data }) => {
  if (data.type === "prepare") {
    ctx = prepareWorld(data.zones, data.seedKey);
    return;
  }
  const { tx, tz } = data;
  const tile = generateTile(ctx, tx, tz);
  // mtime 0 keeps the same tile byte-identical from run to run.
  const gz = gzipSync(encodeTile(tile), { level: 9, mtime: 0 });
  const rgba = tileRgba(tile);
  self.postMessage({ tx, tz, gz, rgba, cells: tile.cells }, [gz.buffer, rgba.buffer]);
};
