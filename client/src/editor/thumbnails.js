import { gunzipSync } from "fflate";
import { decodeTile } from "../world/tileCodec.js";
import { tileRgba } from "../world/tileImage.js";

const TILE_PATH = /^places\/continents\/([\w-]+)\/tiles\/surface\/(-?\d+)\/(-?\d+)\.dlt\.gz$/;
const BATCH_MS = 12;

// The surface tiles a continent has in the world, as { tx, tz, path }.
export function surfaceTiles(world, continent) {
  const tiles = [];
  for (const path of world.files.keys()) {
    const match = path.match(TILE_PATH);
    if (match && match[1] === continent) tiles.push({ tx: Number(match[2]), tz: Number(match[3]), path });
  }
  return tiles;
}

// One small image per existing tile, decoded a batch at a time so a big world doesn't freeze the
// page. onProgress runs after each batch so the map can redraw.
export class Thumbnails {
  constructor(onProgress) {
    this.onProgress = onProgress;
    this.images = new Map(); // "tx,tz" -> canvas
    this.loading = null;
  }

  load(world, continent) {
    this.images.clear();
    const queue = surfaceTiles(world, continent);
    const run = { cancelled: false };
    if (this.loading) this.loading.cancelled = true;
    this.loading = run;

    const step = () => {
      if (run.cancelled) return;
      const start = performance.now();
      while (queue.length && performance.now() - start < BATCH_MS) {
        const { tx, tz, path } = queue.pop();
        try {
          this.images.set(`${tx},${tz}`, toCanvas(decodeTile(gunzipSync(world.files.get(path)))));
        } catch (err) {
          console.warn(`couldn't read ${path}: ${err.message}`);
        }
      }
      this.onProgress?.();
      if (queue.length) setTimeout(step, 0);
    };
    step();
  }

  get(tx, tz) {
    return this.images.get(`${tx},${tz}`);
  }

  get size() {
    return this.images.size;
  }
}

function toCanvas(tile) {
  const canvas = document.createElement("canvas");
  canvas.width = tile.cells;
  canvas.height = tile.cells;
  canvas.getContext("2d").putImageData(new ImageData(tileRgba(tile), tile.cells, tile.cells), 0, 0);
  return canvas;
}
