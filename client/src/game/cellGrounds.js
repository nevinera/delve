// Ground textures for maps drawn in cells (see cellMap/): rendered in the
// render worker and cached (cellMap/cache.js), one map at a time - the
// player's current map first, then the zone's others in the background so
// crossing to one is instant.
import {cachedCellMapImage} from "../cellMap/cache";

// Sharp enough at walking height; capped so the texture fits the GPU.
export const GROUND_PIXELS_PER_FOOT = 16;

export function groundPixelsPerFoot({width, height}, maxTextureSize) {
  return Math.min(GROUND_PIXELS_PER_FOOT, maxTextureSize / Math.max(width, height));
}

// Renders a canvas for each map added, calling onGround(mapId, canvas,
// canopy) as each is ready. A map added with {layers: true} (one with
// decoration stamps) gets its tree crowns apart, as canopy, to draw over
// the stamps; else canopy is null. prefer(mapId) moves a map to the front
// of the line.
export class CellGroundQueue {
  constructor({pixelsPerFoot, onGround, render = renderGround}) {
    this._pixelsPerFoot = pixelsPerFoot;
    this._onGround = onGround;
    this._render = render;
    this._waiting = new Map();
    this._preferred = null;
    this._running = false;
    this._stopped = false;
  }

  add(mapId, cellMap, feetDimensions, {layers = false} = {}) {
    this._waiting.set(mapId, {cellMap, feetDimensions, layers});
  }

  // Starts rendering (if it hasn't), with mapId next.
  prefer(mapId) {
    this._preferred = mapId;
    if (!this._running) this._run();
  }

  stop() {
    this._stopped = true;
  }

  async _run() {
    this._running = true;
    while (this._waiting.size && !this._stopped) {
      const mapId = this._waiting.has(this._preferred) ? this._preferred : this._waiting.keys().next().value;
      const {cellMap, feetDimensions, layers} = this._waiting.get(mapId);
      this._waiting.delete(mapId);
      try {
        const {canvas, canopy} = await this._render(cellMap, this._pixelsPerFoot(feetDimensions), {layers});
        if (!this._stopped) await this._onGround(mapId, canvas, canopy);
      } catch (error) {
        console.warn(`Couldn't draw map ${mapId}'s cells`, error);
      }
    }
    this._running = false;
  }
}

// The render, copied onto a canvas (which textures like an image), and its
// canopy when it was rendered in layers.
async function renderGround(cellMap, pixelsPerFoot, {layers = false} = {}) {
  const {image, canopy} = await cachedCellMapImage(cellMap, {pixelsPerFoot, layers});
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext("2d").drawImage(image, 0, 0);
  return {canvas, canopy: canopy ?? null};
}
