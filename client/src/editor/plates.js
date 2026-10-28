import { gunzipSync, gzipSync, strFromU8, strToU8 } from "fflate";
import { decodePlateTile, encodePlate, plateOf, platePath, readHeader, splitPlate } from "../world/plateCodec.js";
import { decodeTile, encodeTile } from "../world/tileCodec.js";
import { kindSizes } from "../world/objects.js";
import { isPlatePath, isPlatesIndex, plateAt, platesIndexPath, tileAt, tilePath } from "../world/paths.js";

// A world keeps its tiles in plates (world/plateCodec.js, docs/formats/plates.md), with an index per
// continent listing each plate's hash, so clients only fetch plates that changed. The editor works
// on one file per tile (tileCodec.js, gzipped) and turns them into plates only to store the world.

export const PLATES_INDEX_VERSION = 1;

export { isPlatePath, plateAt, platesIndexPath };

// The tile files (paths to gzipped tiles) that belong in a plate.
export function tilesInPlate(files, { continent, layer, coords: [px, pz] }) {
  const paths = [];
  for (const path of files.keys()) {
    const at = tileAt(path);
    if (!at || at.continent !== continent || at.layer !== layer) continue;
    const [qx, qz] = plateOf(at.tx, at.tz);
    if (qx === px && qz === pz) paths.push(path);
  }
  return paths;
}

// One plate's tiles, as [tile path, gzipped tile] pairs.
export function unpackPlate(path, bytes) {
  const plate = plateAt(path);
  const { header, tiles } = splitPlate(strFromU8(bytes));
  return tiles.map(({ text }) => {
    const tile = decodePlateTile(header, text);
    return [tilePath(plate.continent, plate.layer, ...tile.coords), gzipSync(encodeTile(tile), { level: 6, mtime: 0 })];
  });
}

// A plate's text from its gzipped tiles.
export function packPlate(coords, layer, tiles, sizes) {
  return encodePlate(coords, layer, tiles.map((bytes) => decodeTile(gunzipSync(bytes))), sizes);
}

// The files with every plate split into tile files, and the plate indexes dropped. pool: a
// PlatePool, or none to work here.
export async function unpackPlates(files, { pool = new PlatePool(), onProgress } = {}) {
  const out = new Map();
  const plates = [];
  for (const [path, bytes] of files) {
    if (isPlatesIndex(path)) continue;
    if (isPlatePath(path)) plates.push([path, bytes]);
    else out.set(path, bytes);
  }
  if (!plates.length) return out;
  let done = 0;
  await Promise.all(plates.map(async ([path, bytes]) => {
    for (const [tile, gz] of await pool.unpack(path, bytes)) out.set(tile, gz);
    onProgress?.({ done: ++done, total: plates.length });
  }));
  return out;
}

// The files as a world stores them: tile files grouped into plates, and each continent's plate
// index. Plates size each kind of object from `sizes` (world/objects.js kindSizes, so the kinds
// registered now). `cache` (a Map, kept between calls) holds each plate with the tile files it came
// from, so a plate whose tiles are the same files as last time, and whose kinds are the same sizes,
// isn't made again, and is the same bytes.
export async function packPlates(files, { cache = new Map(), pool = new PlatePool(), sizes = kindSizes(), onProgress } = {}) {
  pool.sizes(sizes);
  const out = new Map();
  const plates = new Map(); // plate path -> { continent, layer, coords, members: [tile path] }
  for (const [path, bytes] of files) {
    const at = tileAt(path);
    if (!at) {
      if (!isPlatesIndex(path)) out.set(path, bytes);
      continue;
    }
    const { continent, layer } = at;
    const coords = plateOf(at.tx, at.tz);
    const plate = platePath(continent, layer, ...coords);
    if (!plates.has(plate)) plates.set(plate, { continent, layer, coords, members: [] });
    plates.get(plate).members.push(path);
  }
  const sorted = [...plates].sort(([a], [b]) => (a < b ? -1 : 1));
  let done = 0;
  await Promise.all(sorted.map(async ([path, { layer, coords, members }]) => {
    const sources = members.sort().map((member) => files.get(member));
    const kept = cache.get(path);
    if (!kept || kept.sources.length !== sources.length || kept.sources.some((s, i) => s !== sources[i]) || kept.sizes !== sizesKey(kept.kinds, sizes)) {
      const text = await pool.pack(coords, layer, sources);
      const { kinds } = readHeader(text);
      cache.set(path, { sources, kinds, sizes: sizesKey(kinds, sizes), bytes: strToU8(text), hash: plateHash(text) });
    }
    onProgress?.({ done: ++done, total: sorted.length });
  }));
  const indexes = new Map(); // continent -> { "layer/px_pz": hash }
  for (const [path, { continent, layer, coords }] of sorted) {
    out.set(path, cache.get(path).bytes);
    if (!indexes.has(continent)) indexes.set(continent, {});
    indexes.get(continent)[`${layer}/${coords.join("_")}`] = cache.get(path).hash;
  }
  for (const [continent, plateHashes] of indexes) {
    out.set(platesIndexPath(continent), strToU8(`${JSON.stringify({ version: PLATES_INDEX_VERSION, plates: plateHashes }, null, 2)}\n`));
  }
  return out;
}

const sizesKey = (kinds, sizes) => JSON.stringify(kinds.map((type) => sizes[type] ?? null));

// Packs and unpacks plates on a few workers, or here where there are no workers (tests, scripts).
export class PlatePool {
  constructor() {
    this.size = typeof Worker === "undefined" ? 0 : Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
    this.workers = [];
    this.waiting = new Map(); // job id -> resolve
    this.queue = [];
    this.nextId = 0;
  }

  // The kinds' sizes later packs use (packPlate), sent to the workers once.
  sizes(sizes) {
    this.kindSizes = sizes;
    if (!this.size) return;
    this.start();
    for (const { worker } of this.workers) worker.postMessage({ type: "sizes", sizes });
  }

  unpack(path, bytes) {
    if (!this.size) return Promise.resolve(unpackPlate(path, bytes));
    return this.job({ type: "unpack", path, bytes });
  }

  pack(coords, layer, tiles) {
    if (!this.size) return Promise.resolve(packPlate(coords, layer, tiles, this.kindSizes));
    return this.job({ type: "pack", coords, layer, tiles });
  }

  start() {
    while (this.workers.length < this.size) {
      const slot = { worker: new Worker(new URL("./plateWorker.js", import.meta.url), { type: "module" }), busy: false };
      slot.worker.onmessage = ({ data }) => {
        slot.busy = false;
        const { resolve, reject } = this.waiting.get(data.id);
        this.waiting.delete(data.id);
        if (data.error) reject(new Error(data.error));
        else resolve(data.result);
        this.feed();
      };
      this.workers.push(slot);
    }
  }

  job(message) {
    this.start();
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.waiting.set(id, { resolve, reject });
      this.queue.push({ id, ...message });
      this.feed();
    });
  }

  feed() {
    for (const slot of this.workers) {
      if (slot.busy || !this.queue.length) continue;
      slot.busy = true;
      slot.worker.postMessage(this.queue.shift());
    }
  }
}

// A 64-bit hash of a plate's text, as hex: what clients key their caches by.
export function plateHash(text) {
  let [h1, h2] = [0xdeadbeef, 0x41c6ce57];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}
