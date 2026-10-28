import { gunzipSync } from "fflate";
import { decodeTile } from "../world/tileCodec.js";
import { tileAt, tilePath } from "../world/paths.js";
import { tileDetailRgba } from "../world/tileImage.js";
import { CHUNK, THUMB_PX, THUMBS_VERSION, chunkOf, chunkPath, fingerprint, shrinkRgba, thumbChanges, thumbsDir, thumbsIndexPath } from "./thumbPixels.js";

const BATCH_MS = 12;

// The surface tile file at (tx, tz).
export const surfacePath = (continent, tx, tz) => tilePath(continent, "surface", tx, tz);

// The surface tiles a continent has in the world, as { tx, tz, path }.
export function surfaceTiles(world, continent) {
  const tiles = [];
  for (const path of world.files.keys()) {
    const at = tileAt(path);
    if (at && at.continent === continent && at.layer === "surface") tiles.push({ tx: at.tx, tz: at.tz, path });
  }
  return tiles;
}

// Each tile's picture, at two sizes. The small ones are kept in the world, a chunk of tiles to an
// image (thumbPixels.js), so a continent shows at once; tiles whose picture is out of date are
// redrawn in workers, nearest the view first, and saved again. The full-size ones (a pixel per
// cell) are drawn as tiles come into sight close enough to need them, and the most recently used
// are kept. onProgress runs as pictures arrive; onSaved after the small ones are written back.
const FINE_KEEP = 1024;
const SAVE_DELAY_MS = 1500;

export class Thumbnails {
  // near(): the tile [x, z] to redraw outward from.
  constructor({ onProgress, onSaved, near }) {
    this.onProgress = onProgress;
    this.onSaved = onSaved;
    this.near = near;
    this.pool = new ThumbPool((item, data) => this.arrived(item, data));
    this.run = null;
    this.reset();
  }

  reset() {
    this.tiles = new Set(); // "tx,tz" of every tile on the continent
    this.chunks = new Map(); // "cx,cz" -> canvas of the small pictures
    this.prints = new Map(); // "tx,tz" -> fingerprint of the tile file its small picture shows
    this.falls = new Map(); // "tx,tz" -> the tile's waterfalls (generator.js), where it has some
    this.fine = new Map(); // "tx,tz" -> full-size canvas, least recently used first
    this.changed = new Set(); // "cx,cz" of chunks to save
  }

  async load(world, continent) {
    this.pool.clear();
    clearTimeout(this.saveTimer);
    this.reset();
    const run = (this.run = { world, continent });
    const tiles = surfaceTiles(world, continent).map(({ tx, tz, path }) => ({ key: `${tx},${tz}`, gz: world.files.get(path) }));
    for (const { key } of tiles) this.tiles.add(key);
    const index = world.readJson(thumbsIndexPath(continent));
    const saved = index?.version === THUMBS_VERSION && index.px === THUMB_PX && index.chunk === CHUNK ? index.tiles : {};

    const dir = `${thumbsDir(continent)}/`;
    await Promise.all(
      [...world.files.keys()].map(async (path) => {
        const match = path.startsWith(dir) && path.slice(dir.length).match(/^(-?\d+)\/(-?\d+)\.png$/);
        if (!match) return;
        try {
          const bitmap = await createImageBitmap(new Blob([world.files.get(path)], { type: "image/png" }));
          if (this.run === run) this.chunk(Number(match[1]), Number(match[2])).getContext("2d").drawImage(bitmap, 0, 0);
          bitmap.close();
        } catch (err) {
          console.warn(`couldn't read ${path}: ${err.message}`);
        }
      }),
    );
    if (this.run !== run) return;

    for (const [key, { print, falls }] of Object.entries(saved)) {
      this.prints.set(key, print);
      if (falls?.length) this.falls.set(key, falls);
    }
    const { stale, gone } = thumbChanges(tiles, saved);
    for (const key of gone) this.forget(key);
    if (gone.length) this.saveSoon();
    this.onProgress?.();
    const [x, z] = this.near?.() ?? [0, 0];
    const distance = ({ key }) => {
      const [tx, tz] = key.split(",").map(Number);
      return (tx + 0.5 - x) ** 2 + (tz + 0.5 - z) ** 2;
    };
    stale.sort((a, b) => distance(a) - distance(b));
    this.pool.redraw(stale.map(({ key, gz }) => ({ key, gz, run })));
  }

  // A freshly generated tile's picture, from tileRgba, its gzipped file and its waterfalls.
  set(tx, tz, { rgba, cells, gz, falls }) {
    this.tiles.add(`${tx},${tz}`);
    this.draw(`${tx},${tz}`, { rgba, small: shrinkRgba(rgba, cells, THUMB_PX), cells, falls, print: fingerprint(gz) });
  }

  // Draws a tile's picture again from its file, after it's changed.
  redraw(tx, tz, gz) {
    if (!this.run) return;
    this.tiles.add(`${tx},${tz}`);
    this.pool.redraw([{ key: `${tx},${tz}`, gz, run: this.run }]);
  }

  // Whether the tile exists.
  has(tx, tz) {
    return this.tiles.has(`${tx},${tz}`);
  }

  // The canvas holding chunk (cx, cz)'s small pictures, made if `make`.
  chunk(cx, cz, make = true) {
    const key = `${cx},${cz}`;
    if (!this.chunks.has(key) && make) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = CHUNK * THUMB_PX;
      this.chunks.set(key, canvas);
    }
    return this.chunks.get(key);
  }

  // The tile's full-size picture, or null while it's drawn.
  get(tx, tz) {
    const key = `${tx},${tz}`;
    const image = this.fine.get(key);
    if (image) {
      this.fine.delete(key);
      this.fine.set(key, image);
      return image;
    }
    if (this.run && this.tiles.has(key)) this.pool.want({ key, gz: this.run.world.files.get(surfacePath(this.run.continent, tx, tz)), run: this.run, fine: true });
    return null;
  }

  // Drops full-size pictures asked for since the last call, so panning away stops their drawing.
  forgetQueued() {
    this.pool.forgetWanted();
  }

  get size() {
    return this.tiles.size;
  }

  arrived(item, data) {
    if (item.run !== this.run) return;
    if (data.error) {
      console.warn(`couldn't read tile ${item.key}: ${data.error}`);
      return;
    }
    if (item.fine) {
      this.keepFine(item.key, rgbaCanvas(data.rgba, data.cells));
      this.progressSoon();
      return;
    }
    this.draw(item.key, { ...data, print: fingerprint(item.gz) });
  }

  draw(key, { rgba, small, cells, falls, print }) {
    const [tx, tz] = key.split(",").map(Number);
    const { cx, cz, i, j } = chunkOf(tx, tz);
    this.chunk(cx, cz).getContext("2d").putImageData(new ImageData(small, THUMB_PX, THUMB_PX), i * THUMB_PX, j * THUMB_PX);
    this.changed.add(`${cx},${cz}`);
    this.prints.set(key, print);
    if (falls?.length) this.falls.set(key, falls);
    else this.falls.delete(key);
    this.keepFine(key, rgbaCanvas(rgba, cells));
    this.saveSoon();
    this.progressSoon();
  }

  // Clears a tile that's gone from its chunk.
  forget(key) {
    const [tx, tz] = key.split(",").map(Number);
    const { cx, cz, i, j } = chunkOf(tx, tz);
    this.chunk(cx, cz, false)?.getContext("2d").clearRect(i * THUMB_PX, j * THUMB_PX, THUMB_PX, THUMB_PX);
    this.changed.add(`${cx},${cz}`);
    this.prints.delete(key);
    this.falls.delete(key);
  }

  keepFine(key, canvas) {
    this.fine.delete(key);
    this.fine.set(key, canvas);
    if (this.fine.size > FINE_KEEP) this.fine.delete(this.fine.keys().next().value);
  }

  progressSoon() {
    this.frame ??= requestAnimationFrame(() => {
      this.frame = null;
      this.onProgress?.();
    });
  }

  saveSoon() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save(), SAVE_DELAY_MS);
  }

  // Writes the changed chunks and the index into the world. A chunk with no tiles left is removed.
  async save() {
    const run = this.run;
    const { world, continent } = run;
    const occupied = new Set([...this.tiles].map((key) => {
      const { cx, cz } = chunkOf(...key.split(",").map(Number));
      return `${cx},${cz}`;
    }));
    const changed = [...this.changed];
    this.changed.clear();
    for (const key of changed) {
      const [cx, cz] = key.split(",").map(Number);
      const canvas = this.chunks.get(key);
      if (!occupied.has(key) || !canvas) {
        world.files.delete(chunkPath(continent, cx, cz));
        continue;
      }
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (this.run !== run) return;
      world.files.set(chunkPath(continent, cx, cz), new Uint8Array(await blob.arrayBuffer()));
    }
    const tiles = {};
    for (const key of [...this.prints.keys()].sort()) {
      const falls = this.falls.get(key);
      tiles[key] = falls ? { print: this.prints.get(key), falls } : { print: this.prints.get(key) };
    }
    world.writeJson(thumbsIndexPath(continent), { version: THUMBS_VERSION, px: THUMB_PX, chunk: CHUNK, tiles });
    this.onSaved?.();
  }
}

// Workers that draw thumbnails (thumbWorker.js). Redraws all run, in the order given; wanted
// full-size pictures run after them, and can be dropped while they wait.
class ThumbPool {
  constructor(onResult) {
    this.onResult = onResult;
    this.size = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
    this.workers = [];
    this.idle = [];
    this.redraws = [];
    this.wanted = new Map(); // key -> item
    this.busy = new Set(); // keys being drawn
  }

  redraw(items) {
    this.redraws.push(...items);
    this.feed();
  }

  want(item) {
    if (this.busy.has(item.key) || !item.gz) return;
    this.wanted.set(item.key, item);
    this.feed();
  }

  forgetWanted() {
    this.wanted.clear();
  }

  clear() {
    this.redraws = [];
    this.wanted.clear();
  }

  feed() {
    while (this.redraws.length || this.wanted.size) {
      if (!this.idle.length && this.workers.length < this.size) this.spawn();
      if (!this.idle.length) return;
      const item = this.redraws.shift() ?? this.takeWanted();
      const worker = this.idle.pop();
      worker.item = item;
      this.busy.add(item.key);
      worker.postMessage({ key: item.key, gz: item.gz });
    }
  }

  takeWanted() {
    const [key, item] = this.wanted.entries().next().value ?? [];
    this.wanted.delete(key);
    return item;
  }

  spawn() {
    const worker = new Worker(new URL("./thumbWorker.js", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }) => {
      const { item } = worker;
      worker.item = null;
      this.busy.delete(item.key);
      this.idle.push(worker);
      this.onResult(item, data);
      this.feed();
    };
    worker.onerror = (e) => console.warn(`thumbnail worker failed: ${e.message}`);
    this.workers.push(worker);
    this.idle.push(worker);
  }
}

// Close-up pictures of tiles (tileDetailRgba), for when only a few tiles are in sight. get()
// answers null for one that isn't drawn yet and draws it soon after, a batch at a time, calling
// onReady after each batch. The most recently used are kept.
const DETAIL_PX = 4;
const DETAIL_KEEP = 200;

export class TileDetails {
  // tileBytes(tx, tz): the tile's gzipped file, or undefined.
  constructor(tileBytes, onReady) {
    this.tileBytes = tileBytes;
    this.onReady = onReady;
    this.images = new Map(); // "tx,tz" -> canvas, least recently used first
    this.queue = new Set();
    this.timer = null;
  }

  get(tx, tz) {
    const key = `${tx},${tz}`;
    const image = this.images.get(key);
    if (image) {
      this.images.delete(key);
      this.images.set(key, image);
      return image;
    }
    this.queue.add(key);
    this.timer ??= setTimeout(() => this.drawSome(), 0);
    return null;
  }

  // Forgets a tile's picture, after it changes.
  drop(tx, tz) {
    this.images.delete(`${tx},${tz}`);
  }

  clear() {
    this.images.clear();
    this.queue.clear();
  }

  drawSome() {
    this.timer = null;
    const start = performance.now();
    for (const key of this.queue) {
      if (performance.now() - start > BATCH_MS) break;
      this.queue.delete(key);
      const [tx, tz] = key.split(",").map(Number);
      const bytes = this.tileBytes(tx, tz);
      if (!bytes) continue;
      try {
        const tile = decodeTile(gunzipSync(bytes));
        this.images.set(key, rgbaCanvas(tileDetailRgba(tile, DETAIL_PX), tile.cells * DETAIL_PX));
      } catch (err) {
        console.warn(`couldn't read tile ${key}: ${err.message}`);
      }
      if (this.images.size > DETAIL_KEEP) this.images.delete(this.images.keys().next().value);
    }
    this.onReady?.();
    if (this.queue.size) this.timer = setTimeout(() => this.drawSome(), 0);
  }

  // Drops queued tiles nobody asked for since the last call, so panning away stops their drawing.
  forgetQueued() {
    this.queue.clear();
  }
}

function rgbaCanvas(rgba, cells) {
  const canvas = document.createElement("canvas");
  canvas.width = cells;
  canvas.height = cells;
  canvas.getContext("2d").putImageData(new ImageData(rgba, cells, cells), 0, 0);
  return canvas;
}

