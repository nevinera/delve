// Renders a cellmap to a canvas, and caches the result: in memory for this
// page, and in IndexedDB across visits. Any cache failure just re-renders.
import {buildScene} from "./scene";
import {paintScene} from "./paint";
import {hashString} from "./random";

// Bump when the renderer's output changes, so old cached images are ignored.
export const RENDER_VERSION = 1;

// iOS Safari won't draw a canvas past about 16.7M pixels.
const MAX_PIXELS = 16_000_000;

export function renderScale(scene, pixelsPerFoot) {
  const fit = Math.sqrt(MAX_PIXELS / (scene.width * scene.height));
  return Math.min(pixelsPerFoot, fit);
}

export function renderCellMap(map, {pixelsPerFoot = 10, createCanvas = defaultCanvas} = {}) {
  const scene = buildScene(map);
  const scale = renderScale(scene, pixelsPerFoot);
  const canvas = createCanvas(Math.round(scene.width * scale), Math.round(scene.height * scale));
  paintScene(canvas.getContext("2d"), scene, scale);
  return canvas;
}

function defaultCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function cacheKey(map, pixelsPerFoot) {
  return `v${RENDER_VERSION}:${pixelsPerFoot}:${hashString(JSON.stringify([map.grid, map.seed, map.cells]))}`;
}

const MEMORY_LIMIT = 8;
const memory = new Map();

// Resolves {image, source}: image is something drawImage takes, source is
// "memory", "stored" or "rendered".
export async function cachedCellMapImage(map, {pixelsPerFoot = 10} = {}) {
  const key = cacheKey(map, pixelsPerFoot);
  if (memory.has(key)) return {image: remember(key, memory.get(key)), source: "memory"};

  const stored = await readStored(key);
  if (stored) return {image: remember(key, stored), source: "stored"};

  const canvas = renderCellMap(map, {pixelsPerFoot});
  remember(key, canvas);
  writeStored(key, canvas);
  return {image: canvas, source: "rendered"};
}

function remember(key, image) {
  memory.delete(key);
  memory.set(key, image);
  while (memory.size > MEMORY_LIMIT) memory.delete(memory.keys().next().value);
  return image;
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
    return entry ? await createImageBitmap(entry.blob) : null;
  } catch {
    return null;
  }
}

async function writeStored(key, canvas) {
  try {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
    if (!blob) return;
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
