// Renders a cellmap to a canvas, timing each step. cache.js wraps this
// with a worker and caching.
import {buildScene} from "./scene";
import {paintScene} from "./paint";
import {buildSprites} from "./sprites";
import {GLADE} from "./style";
import {hashString} from "./random";

// Bump when the renderer's output changes, so old cached images are ignored.
export const RENDER_VERSION = 4;

// iOS Safari won't draw a canvas past about 16.7M pixels.
const MAX_PIXELS = 16_000_000;

export function renderScale(scene, pixelsPerFoot) {
  const fit = Math.sqrt(MAX_PIXELS / (scene.width * scene.height));
  return Math.min(pixelsPerFoot, fit);
}

// Sprites depend only on the style, cell size and scale, so they're kept
// for the next render of any map that shares them.
const spriteSets = new Map();

// Returns {canvas, timings, stats}: timings in ms for each step, stats
// on the size of what was drawn.
export function renderCellMap(map, {pixelsPerFoot = 10, createCanvas = defaultCanvas, style = GLADE} = {}) {
  const timings = {};
  const time = (step, fn) => {
    const started = performance.now();
    const result = fn();
    timings[step] = performance.now() - started;
    return result;
  };

  const scene = time("scene", () => buildScene(map, style));
  const scale = renderScale(scene, pixelsPerFoot);
  const spriteKey = `${style.key}:${scene.cellSize}:${scale}`;
  const sprites = time("sprites", () => {
    if (!spriteSets.has(spriteKey)) spriteSets.set(spriteKey, buildSprites(style, scene.cellSize, scale, createCanvas));
    return spriteSets.get(spriteKey);
  });
  const canvas = createCanvas(Math.round(scene.width * scale), Math.round(scene.height * scale));
  time("paint", () => paintScene(canvas.getContext("2d"), scene, scale, style, sprites));
  const stats = {width: canvas.width, height: canvas.height};
  for (const kind of ["crowns", "patches", "tufts", "tallTufts", "pools", "reeds"]) stats[kind] = scene[kind].length;
  return {canvas, timings, stats};
}

function defaultCanvas(width, height) {
  if (typeof document === "undefined") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function cacheKey(map, pixelsPerFoot) {
  return `v${RENDER_VERSION}:${pixelsPerFoot}:${hashString(JSON.stringify([map.grid, map.seed, map.cells, map.trails ?? []]))}`;
}
