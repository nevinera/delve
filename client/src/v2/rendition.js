import { CORNERS } from "./platter.js";
import { PLATE_TILES, TILE_CHUNKS } from "./sizes.js";

// Making renditions (platter.js) from the ones a level down.

export const SEA_FLOOR_FT = -50; // the ground's height where there are no tiles

// FNV-1a, 64 bits, of bytes or a string, as 16 hex digits.
export function hash64(data) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let h = 0xcbf29ce484222325n;
  for (const b of bytes) h = BigInt.asUintN(64, (h ^ BigInt(b)) * 0x100000001b3n);
  return h.toString(16).padStart(16, "0");
}

// A plate's rendition from its tiles': tileAt(i, j) gives the rendition of its tile i east and j
// south, or null where there's none. A corner's height is the tiles' that meet there, or the sea
// floor where none do. The hash is of the tiles' hashes. Null for a plate with no tiles.
export function plateRendition(tileAt) {
  const tiles = [];
  for (let j = 0; j < PLATE_TILES; j++) for (let i = 0; i < PLATE_TILES; i++) tiles.push(tileAt(i, j));
  if (!tiles.some(Boolean)) return null;
  const heights = new Float32Array(CORNERS * CORNERS);
  for (let j = 0; j < CORNERS; j++) {
    for (let i = 0; i < CORNERS; i++) {
      let [sum, n] = [0, 0];
      for (const [a, b] of [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]]) {
        const tile = a >= 0 && b >= 0 && a < PLATE_TILES && b < PLATE_TILES && tiles[b * PLATE_TILES + a];
        if (!tile) continue;
        sum += tile.heights[(j - b) * TILE_CHUNKS * CORNERS + (i - a) * TILE_CHUNKS];
        n++;
      }
      heights[j * CORNERS + i] = n ? sum / n : SEA_FLOOR_FT;
    }
  }
  const hash = hash64(tiles.map((tile) => tile?.hash ?? "0".repeat(16)).join(""));
  return { heights, hash };
}
