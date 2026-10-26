// The 3d overview's heights: SAMPLES across each tile, one per pixel of its thumbnail, so the
// thumbnails can be laid over them. Each is the height in the middle of its block of cells, or the
// water's surface where that's higher, so lakes and the sea lie flat.
export const SAMPLES = 16;

export function overviewHeights(tile) {
  const { cells } = tile;
  const { height, water } = tile.layers;
  const block = cells / SAMPLES;
  const out = new Float32Array(SAMPLES * SAMPLES);
  for (let q = 0; q < SAMPLES; q++) {
    for (let p = 0; p < SAMPLES; p++) {
      let sum = 0;
      for (const j of [q * block + block / 2 - 1, q * block + block / 2]) {
        for (const i of [p * block + block / 2 - 1, p * block + block / 2]) {
          const k = j * cells + i;
          sum += Number.isNaN(water[k]) ? height[k] : Math.max(height[k], water[k]);
        }
      }
      out[q * SAMPLES + p] = sum / 4;
    }
  }
  return out;
}
