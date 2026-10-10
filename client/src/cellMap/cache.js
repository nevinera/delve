// Gets a cellmap's image, fastest first: from memory, from IndexedDB, or
// rendered - in a worker when the browser can paint in one, else here. Any
// cache failure just means rendering again.
import {cacheKey, renderCellMap} from "./render";

const MEMORY_LIMIT = 8;
const memory = new Map();

// Resolves {image, source, timings, stats, stored}: image is something
// drawImage takes; source is "memory", "stored" or "rendered"; timings are
// ms per step; stored resolves {encode} once a fresh render is cached.
export async function cachedCellMapImage(map, {pixelsPerFoot = 10} = {}) {
  const key = cacheKey(map, pixelsPerFoot);
  if (memory.has(key)) {
    const entry = remember(key, memory.get(key));
    return {...entry, source: "memory", timings: {}, stored: Promise.resolve(null)};
  }

  let started = performance.now();
  const blob = await readStored(key);
  if (blob) {
    const read = performance.now() - started;
    started = performance.now();
    try {
      const image = await createImageBitmap(blob);
      const entry = remember(key, {image, stats: {width: image.width, height: image.height}});
      return {...entry, source: "stored", timings: {read, decode: performance.now() - started}, stored: Promise.resolve(null)};
    } catch {
      // A bad stored image is re-rendered below.
    }
  }

  const {image, timings, stats, encoded} = await render(map, pixelsPerFoot);
  remember(key, {image, stats});
  const stored = encoded.then(async ({blob, encode}) => {
    if (blob) await writeStored(key, blob);
    return {encode};
  }).catch(() => null);
  return {image, stats, source: "rendered", timings, stored};
}

function remember(key, entry) {
  memory.delete(key);
  memory.set(key, entry);
  while (memory.size > MEMORY_LIMIT) memory.delete(memory.keys().next().value);
  return entry;
}

// Falls back to rendering here for good if the worker fails, e.g. on a
// browser that has OffscreenCanvas but can't paint 2D in a worker.
let workerBroken = false;

async function render(map, pixelsPerFoot) {
  if (workerBroken || typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return renderHere(map, pixelsPerFoot);
  try {
    return await renderInWorker(map, pixelsPerFoot);
  } catch {
    workerBroken = true;
    return renderHere(map, pixelsPerFoot);
  }
}

function renderHere(map, pixelsPerFoot) {
  const {canvas, timings, stats} = renderCellMap(map, {pixelsPerFoot});
  const started = performance.now();
  const encoded = new Promise((resolve) => canvas.toBlob((blob) => resolve({blob, encode: performance.now() - started}), "image/webp", 0.9));
  return {image: canvas, timings: {...timings, thread: "main"}, stats, encoded};
}

let worker = null;
let nextId = 0;
const pending = new Map();

function renderInWorker(map, pixelsPerFoot) {
  if (!worker) {
    worker = new Worker(new URL("./renderWorker.js", import.meta.url), {type: "module"});
    worker.onmessage = ({data}) => pending.get(data.id)?.(data);
    worker.onerror = () => {
      for (const reply of pending.values()) reply({error: "worker failed"});
    };
  }
  const id = nextId++;
  const started = performance.now();
  return new Promise((resolve, reject) => {
    let resolveEncoded;
    const encoded = new Promise((r) => (resolveEncoded = r));
    pending.set(id, (data) => {
      if (data.error) {
        pending.delete(id);
        reject(new Error(data.error));
      } else if (data.image) {
        resolve({image: data.image, stats: data.stats, timings: {...data.timings, thread: "worker", wall: performance.now() - started}, encoded});
      } else {
        pending.delete(id);
        resolveEncoded({blob: data.blob, encode: data.encode});
      }
    });
    worker.postMessage({id, map, pixelsPerFoot});
  });
}

const DB_NAME = "delve-cellmap";
const STORE = "renders";
const STORED_LIMIT = 30;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readStored(key) {
  try {
    const db = await openDb();
    const entry = await request(db.transaction(STORE).objectStore(STORE).get(key));
    db.close();
    return entry?.blob ?? null;
  } catch {
    return null;
  }
}

async function writeStored(key, blob) {
  try {
    const db = await openDb();
    const store = db.transaction(STORE, "readwrite").objectStore(STORE);
    await request(store.put({blob, at: Date.now()}, key));
    const keys = await request(store.getAllKeys());
    if (keys.length > STORED_LIMIT) {
      const entries = await Promise.all(keys.map(async (k) => [k, (await request(store.get(k))).at]));
      entries.sort((a, b) => a[1] - b[1]);
      for (const [k] of entries.slice(0, keys.length - STORED_LIMIT)) store.delete(k);
    }
    db.close();
  } catch {
    // A failed store only means the next visit renders it again.
  }
}
