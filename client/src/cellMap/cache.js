// Gets a cellmap's image, fastest first: from memory, from IndexedDB, or
// rendered - in a worker when the browser can paint in one, else here. Any
// cache failure just means rendering again.
import {cacheKey, renderCellMap} from "./render";

const MEMORY_LIMIT = 8;
const memory = new Map();

// Resolves {image, canopy, source, timings, stats, stored}: image is
// something drawImage takes; source is "memory", "stored" or "rendered";
// timings are ms per step; stored resolves {encode} once a fresh render is
// cached. persist: false keeps it in memory only, for previews that change
// often. layers: true leaves the tree crowns out of image, as canopy (see
// render.js), else canopy is null.
export async function cachedCellMapImage(map, {pixelsPerFoot = 10, persist = true, layers = false} = {}) {
  const key = cacheKey(map, pixelsPerFoot, layers);
  if (memory.has(key)) {
    const entry = remember(key, memory.get(key));
    return {...entry, source: "memory", timings: {}, stored: Promise.resolve(null)};
  }

  let started = performance.now();
  const stored = persist ? await readStored(key) : null;
  if (stored?.blob && (!layers || stored.canopy)) {
    const read = performance.now() - started;
    started = performance.now();
    try {
      const image = await createImageBitmap(stored.blob);
      const canopy = layers ? await createImageBitmap(stored.canopy) : null;
      const entry = remember(key, {image, canopy, stats: {width: image.width, height: image.height}});
      return {...entry, source: "stored", timings: {read, decode: performance.now() - started}, stored: Promise.resolve(null)};
    } catch {
      // A bad stored image is re-rendered below.
    }
  }

  const {image, canopy, timings, stats, encoded} = await render(map, pixelsPerFoot, persist, layers);
  remember(key, {image, canopy, stats});
  const storing = encoded.then(async ({blob, canopyBlob, encode}) => {
    if (blob && persist) await writeStored(key, blob, canopyBlob);
    return {encode};
  }).catch(() => null);
  return {image, canopy, stats, source: "rendered", timings, stored: storing};
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

async function render(map, pixelsPerFoot, encode, layers) {
  if (workerBroken || typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return renderHere(map, pixelsPerFoot, encode, layers);
  try {
    return await renderInWorker(map, pixelsPerFoot, encode, layers);
  } catch {
    workerBroken = true;
    return renderHere(map, pixelsPerFoot, encode, layers);
  }
}

const toWebp = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));

function renderHere(map, pixelsPerFoot, encode, layers) {
  const {canvas, canopy, timings, stats} = renderCellMap(map, {pixelsPerFoot, layers});
  const started = performance.now();
  const encoded = !encode ? Promise.resolve({blob: null, encode: 0})
    : Promise.all([toWebp(canvas), canopy && toWebp(canopy)]).then(([blob, canopyBlob]) => ({blob, canopyBlob, encode: performance.now() - started}));
  return {image: canvas, canopy, timings: {...timings, thread: "main"}, stats, encoded};
}

let worker = null;
let nextId = 0;
const pending = new Map();

function renderInWorker(map, pixelsPerFoot, encode, layers) {
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
        resolve({image: data.image, canopy: data.canopy ?? null, stats: data.stats, timings: {...data.timings, thread: "worker", wall: performance.now() - started}, encoded});
      } else {
        pending.delete(id);
        resolveEncoded({blob: data.blob, canopyBlob: data.canopyBlob ?? null, encode: data.encode});
      }
    });
    worker.postMessage({id, map, pixelsPerFoot, encode, layers});
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
    return entry ?? null;
  } catch {
    return null;
  }
}

async function writeStored(key, blob, canopy = null) {
  try {
    const db = await openDb();
    const store = db.transaction(STORE, "readwrite").objectStore(STORE);
    await request(store.put({blob, ...(canopy ? {canopy} : {}), at: Date.now()}, key));
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
