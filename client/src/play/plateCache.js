import { decodePlateTile, streamPlate } from "../world/plateCodec.js";
import { encodeTile } from "../world/tileCodec.js";

// Plates the play page has read, kept in the browser as tile files ready to draw (gzipped, as a
// world holds them), by the plate's hash from plates.json. A plate is downloaded once, across
// reloads and across releases that didn't change it. The cache holds the KEEP plates used most
// recently, about 40 MB, and drops the rest.
export const KEEP = 16;

const DB = "delve-plates";

// Gzips bytes with the browser's CompressionStream.
export async function gzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export class PlateCache {
  // store: an IndexedStore or a MemoryStore. now: the time, for which plate was used last.
  constructor(store, now = () => Date.now()) {
    this.store = store;
    this.now = now;
  }

  // The tiles of the plate with this hash, as [["tx,tz", gzipped tile file]]: from the store, or
  // read from the text that text() streams (an async iterable of strings) and stored as each tile
  // completes.
  async tiles(hash, text) {
    const plate = await this.store.plate(hash);
    if (plate) {
      await this.store.putPlate({ ...plate, usedAt: this.now() });
      const files = await this.store.tiles(hash, plate.tiles);
      if (files.every(Boolean)) return plate.tiles.map((key, i) => [key, files[i]]);
    }
    const out = [];
    let header = null;
    for await (const part of streamPlate(await text())) {
      if (header === null) {
        header = part;
        continue;
      }
      const key = part.coords.join(",");
      const file = await gzip(encodeTile(decodePlateTile(header, part.text)));
      await this.store.putTile(hash, key, file);
      out.push([key, file]);
    }
    // Written last, so a plate cut off partway isn't taken for a whole one.
    await this.store.putPlate({ hash, tiles: out.map(([key]) => key), usedAt: this.now() });
    await this.evict();
    return out;
  }

  // Drops all but the KEEP plates used most recently.
  async evict() {
    const plates = (await this.store.plates()).sort((a, b) => b.usedAt - a.usedAt);
    for (const plate of plates.slice(KEEP)) await this.store.deletePlate(plate);
  }
}

// Plates in memory, for when IndexedDB isn't there (a private window, say), and for tests.
export class MemoryStore {
  constructor() {
    this.platesByHash = new Map();
    this.files = new Map(); // "hash tx,tz" -> tile file
  }

  async plate(hash) {
    return this.platesByHash.get(hash) ?? null;
  }

  async plates() {
    return [...this.platesByHash.values()];
  }

  async putPlate(plate) {
    this.platesByHash.set(plate.hash, plate);
  }

  async deletePlate(plate) {
    this.platesByHash.delete(plate.hash);
    for (const key of plate.tiles) this.files.delete(`${plate.hash} ${key}`);
  }

  async tiles(hash, keys) {
    return keys.map((key) => this.files.get(`${hash} ${key}`) ?? null);
  }

  async putTile(hash, key, file) {
    this.files.set(`${hash} ${key}`, file);
  }
}

// Plates in IndexedDB: a "plates" store of { hash, tiles, usedAt }, and a "tiles" store of tile
// files by "hash tx,tz".
export class IndexedStore {
  static async open() {
    const db = await request(
      Object.assign(indexedDB.open(DB, 1), {
        onupgradeneeded: (e) => {
          e.target.result.createObjectStore("plates", { keyPath: "hash" });
          e.target.result.createObjectStore("tiles");
        },
      }),
    );
    return new IndexedStore(db);
  }

  constructor(db) {
    this.db = db;
  }

  async plate(hash) {
    return (await request(this.objects("plates").get(hash))) ?? null;
  }

  plates() {
    return request(this.objects("plates").getAll());
  }

  putPlate(plate) {
    return request(this.objects("plates", "readwrite").put(plate));
  }

  deletePlate(plate) {
    const tx = this.db.transaction(["plates", "tiles"], "readwrite");
    tx.objectStore("plates").delete(plate.hash);
    for (const key of plate.tiles) tx.objectStore("tiles").delete(`${plate.hash} ${key}`);
    return done(tx);
  }

  tiles(hash, keys) {
    const store = this.objects("tiles");
    return Promise.all(keys.map(async (key) => (await request(store.get(`${hash} ${key}`))) ?? null));
  }

  putTile(hash, key, file) {
    return request(this.objects("tiles", "readwrite").put(file, `${hash} ${key}`));
  }

  objects(name, mode = "readonly") {
    return this.db.transaction(name, mode).objectStore(name);
  }
}

// IndexedDB if it'll open, or memory.
export async function openStore() {
  try {
    return await IndexedStore.open();
  } catch {
    return new MemoryStore();
  }
}

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}
