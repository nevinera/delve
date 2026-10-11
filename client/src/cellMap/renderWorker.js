// Renders cellmaps off the main thread (see cache.js), so the page stays
// responsive. Replies twice per request: the image as soon as it's painted,
// then the encoded file for the cache (if asked for).
import {renderCellMap} from "./render";

self.onmessage = async ({data: {id, map, pixelsPerFoot, encode = true}}) => {
  try {
    const {canvas, timings, stats} = renderCellMap(map, {pixelsPerFoot, createCanvas: (w, h) => new OffscreenCanvas(w, h)});
    let started = performance.now();
    const image = await createImageBitmap(canvas);
    timings.transfer = performance.now() - started;
    self.postMessage({id, image, timings, stats}, [image]);

    if (!encode) return self.postMessage({id, blob: null, encode: 0});
    started = performance.now();
    const blob = await canvas.convertToBlob({type: "image/webp", quality: 0.9});
    self.postMessage({id, blob, encode: performance.now() - started});
  } catch (error) {
    self.postMessage({id, error: String(error)});
  }
};
