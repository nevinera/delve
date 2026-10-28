// The saved thumbnails: THUMB_PX pixels per tile, CHUNK tiles across each saved image, so a whole
// continent shows from a few files without reading its tiles. thumbs/index.json records, per tile,
// the fingerprint of the tile file its picture came from, so a changed tile is redrawn.

export const THUMB_PX = 16;
export const CHUNK = 16;
export const THUMBS_VERSION = 1;

import { chunkPath, thumbsDir, thumbsIndexPath } from "../world/paths.js";

export { chunkPath, thumbsDir, thumbsIndexPath };

// The chunk a tile is in, and the tile's place within it.
export function chunkOf(tx, tz) {
  const [cx, cz] = [Math.floor(tx / CHUNK), Math.floor(tz / CHUNK)];
  return { cx, cz, i: tx - cx * CHUNK, j: tz - cz * CHUNK };
}

// A gzipped file's fingerprint: its trailer, the CRC and length of what's inside.
export function fingerprint(gz) {
  let hex = "";
  for (let k = gz.length - 8; k < gz.length; k++) hex += gz[k].toString(16).padStart(2, "0");
  return hex;
}

// RGBA `cells` pixels square, averaged down to `px` square.
export function shrinkRgba(rgba, cells, px) {
  const out = new Uint8ClampedArray(px * px * 4);
  const block = cells / px;
  const sums = new Float64Array(px * px * 4);
  for (let y = 0; y < cells; y++) {
    const row = Math.floor(y / block) * px;
    for (let x = 0; x < cells; x++) {
      const o = (row + Math.floor(x / block)) * 4;
      const k = (y * cells + x) * 4;
      for (let c = 0; c < 4; c++) sums[o + c] += rgba[k + c];
    }
  }
  const counts = (cells / px) ** 2;
  for (let k = 0; k < sums.length; k++) out[k] = sums[k] / counts;
  return out;
}

// The tiles whose saved picture is missing or came from a different file, and the saved tiles that
// are gone. tiles: [{ key, gz }]; saved: thumbs/index.json's tiles.
export function thumbChanges(tiles, saved = {}) {
  const stale = tiles.filter(({ key, gz }) => saved[key]?.print !== fingerprint(gz));
  const present = new Set(tiles.map((t) => t.key));
  const gone = Object.keys(saved).filter((key) => !present.has(key));
  return { stale, gone };
}
