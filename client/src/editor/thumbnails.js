import { gunzipSync } from "fflate";
import { decodeTile } from "../world/tileCodec.js";
import { biomeRgba, tileRgba } from "../world/tileImage.js";

const TILE_PATH = /^places\/continents\/([\w-]+)\/tiles\/surface\/(-?\d+)\/(-?\d+)\.dlt\.gz$/;
const BATCH_MS = 12;

export function tilePath(continent, tx, tz) {
  return `places/continents/${continent}/tiles/surface/${tx}/${tz}.dlt.gz`;
}

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
    this.biomes = new Map(); // "tx,tz" -> canvas of the biome layer
    this.loading = null;
  }

  load(world, continent) {
    this.images.clear();
    this.biomes.clear();
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
          const tile = decodeTile(gunzipSync(world.files.get(path)));
          this.images.set(`${tx},${tz}`, rgbaCanvas(tileRgba(tile), tile.cells));
          this.biomes.set(`${tx},${tz}`, rgbaCanvas(biomeRgba(tile), tile.cells));
        } catch (err) {
          console.warn(`couldn't read ${path}: ${err.message}`);
        }
      }
      this.onProgress?.();
      if (queue.length) setTimeout(step, 0);
    };
    step();
  }

  // A freshly generated or edited tile's pictures, from tileRgba and biomeRgba. Without biome
  // pixels, the biome picture stays as it was.
  set(tx, tz, rgba, cells, biomes) {
    this.images.set(`${tx},${tz}`, rgbaCanvas(rgba, cells));
    if (biomes) this.biomes.set(`${tx},${tz}`, rgbaCanvas(biomes, cells));
  }

  get(tx, tz) {
    return this.images.get(`${tx},${tz}`);
  }

  biome(tx, tz) {
    return this.biomes.get(`${tx},${tz}`);
  }

  get size() {
    return this.images.size;
  }
}

function rgbaCanvas(rgba, cells) {
  const canvas = document.createElement("canvas");
  canvas.width = cells;
  canvas.height = cells;
  canvas.getContext("2d").putImageData(new ImageData(rgba, cells, cells), 0, 0);
  return canvas;
}

