// Renders a cellmap to a canvas, timing each step. cache.js wraps this
// with a worker and caching.
import {buildScene} from "./scene";
import {paintScene} from "./paint";
import {buildSprites} from "./sprites";
import {resolveStyle} from "./style";
import {buildDungeonScene, paintDungeon} from "./dungeon";
import {hashString} from "./random";

// Bump when the renderer's output changes, so old cached images are ignored.
export const RENDER_VERSION = 11;

// iOS Safari won't draw a canvas past about 16.7M pixels.
const MAX_PIXELS = 16_000_000;

export function renderScale(scene, pixelsPerFoot) {
  const fit = Math.sqrt(MAX_PIXELS / (scene.width * scene.height));
  return Math.min(pixelsPerFoot, fit);
}

// Sprites depend only on the style (its key covers color overrides), cell
// size and scale, so they're kept for the next render of any map that
// shares them.
const spriteSets = new Map();
const SPRITE_SETS = 8;

// Returns {canvas, timings, stats}: timings in ms for each step, stats
// on the size of what was drawn. With layers, the tree crowns go on their
// own transparent canvas, canopy, to draw over whatever goes between.
export function renderCellMap(map, {pixelsPerFoot = 10, createCanvas = defaultCanvas, style = resolveStyle(map), layers = false} = {}) {
  const timings = {};
  const time = (step, fn) => {
    const started = performance.now();
    const result = fn();
    timings[step] = performance.now() - started;
    return result;
  };

  if (style.renderer === "dungeon") return renderDungeon(map, {pixelsPerFoot, createCanvas, style, layers, time, timings});

  const scene = time("scene", () => buildScene(map, style));
  const scale = renderScale(scene, pixelsPerFoot);
  const spriteKey = `${style.key}:${scene.cellSize}:${scale}`;
  const sprites = time("sprites", () => {
    const set = spriteSets.get(spriteKey) ?? buildSprites(style, scene.cellSize, scale, createCanvas);
    spriteSets.delete(spriteKey);
    spriteSets.set(spriteKey, set);
    if (spriteSets.size > SPRITE_SETS) spriteSets.delete(spriteSets.keys().next().value);
    return set;
  });
  const canvas = createCanvas(Math.round(scene.width * scale), Math.round(scene.height * scale));
  const canopy = layers ? createCanvas(canvas.width, canvas.height) : null;
  time("paint", () => paintScene(canvas.getContext("2d"), scene, scale, style, sprites, {canopyCtx: canopy?.getContext("2d")}));
  const stats = {width: canvas.width, height: canvas.height};
  for (const kind of ["crowns", "hatches", "patches", "tufts", "tallTufts", "hummocks", "reeds"]) stats[kind] = scene[kind].length;
  return {canvas, canopy, timings, stats};
}

function renderDungeon(map, {pixelsPerFoot, createCanvas, style, layers, time, timings}) {
  const scene = time("scene", () => buildDungeonScene(map, style.dungeon));
  const scale = renderScale(scene, pixelsPerFoot);
  const canvas = createCanvas(Math.round(scene.width * scale), Math.round(scene.height * scale));
  const canopy = layers ? createCanvas(canvas.width, canvas.height) : null;
  time("paint", () => paintDungeon(canvas.getContext("2d"), scene, scale, style));
  return {canvas, canopy, timings, stats: {width: canvas.width, height: canvas.height}};
}

function defaultCanvas(width, height) {
  if (typeof document === "undefined") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function cacheKey(map, pixelsPerFoot, layers = false) {
  return `v${RENDER_VERSION}:${pixelsPerFoot}${layers ? ":layers" : ""}:${hashString(JSON.stringify([map.theme, map.colors ?? {}, map.grid, map.seed, map.cells, map.trails ?? [], map.bridges ?? []]))}`;
}
