import { faceSlope } from "./faces.js";
import { STEEP_DEG } from "./look.js";
import { CORNERS } from "./platter.js";
import { CELL_FT, CHUNK_CELLS, PLATE_TILES, TILE_CHUNKS } from "./sizes.js";

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

const STEEP_SLOPE = Math.tan((STEEP_DEG * Math.PI) / 180);
const CELLS = TILE_CHUNKS * CHUNK_CELLS;
export const STEEP_STEPS = 63; // a part's steep share, in 63rds

// How much of each of a tile's 64 chunks is too steep to climb, from its 65×65 corner heights: the
// share of its cells whose two triangles are both too steep, in 63rds. Null where none are.
export function steepParts(heights) {
  const counts = new Uint8Array(TILE_CHUNKS * TILE_CHUNKS);
  let any = false;
  for (let j = 0; j < CELLS; j++) {
    for (let i = 0; i < CELLS; i++) {
      const c = j * (CELLS + 1) + i;
      const [nw, ne, sw, se] = [heights[c], heights[c + 1], heights[c + CELLS + 1], heights[c + CELLS + 2]];
      if (faceSlope(nw, ne, sw, se, 0.25, 0.25, CELL_FT) < STEEP_SLOPE || faceSlope(nw, ne, sw, se, 0.75, 0.75, CELL_FT) < STEEP_SLOPE) continue;
      counts[Math.floor(j / CHUNK_CELLS) * TILE_CHUNKS + Math.floor(i / CHUNK_CELLS)]++;
      any = true;
    }
  }
  return any ? counts.map((n) => Math.round((n * STEEP_STEPS) / (CHUNK_CELLS * CHUNK_CELLS))) : null;
}
