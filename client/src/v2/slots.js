import { hash2 } from "../world/noise.js";
import { TILE_FT } from "./sizes.js";

// Object slots: places in a tile where something could stand, scattered once when the tile's made
// and kept in its plate file (plate.js), so moving the ground or changing the biome never moves
// them. What fills each, if anything, is worked out from the biome under it and its roll (fill.js).
//
// A slot is SLOT_BYTES bytes: x and z in feet across the tile (0 to 255, standing at the middle of
// that foot), its size (an index into SLOT_SIZES) and its roll (0 to 255). A tile's are kept
// largest first.

export const SLOT_SIZES = ["small", "medium", "large"];
export const SLOT_BYTES = 4;
// Each size's slots: one a square `every` ft wide, anywhere in it.
const GRIDS = [
  { size: 2, every: 32 },
  { size: 1, every: 16 },
  { size: 0, every: 16 },
];
export const SEED = 0x736c6f74;

// Tile (tx, tz)'s slots, scattered the same every time.
export function makeSlots(tx, tz) {
  const count = GRIDS.reduce((sum, { every }) => sum + (TILE_FT / every) ** 2, 0);
  const slots = new Uint8Array(count * SLOT_BYTES);
  let at = 0;
  for (const { size, every } of GRIDS) {
    const n = TILE_FT / every;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const [ci, cj] = [tx * n + i, tz * n + j];
        const seed = SEED + size * 4;
        slots[at] = i * every + Math.floor(hash2(ci, cj, seed) * every);
        slots[at + 1] = j * every + Math.floor(hash2(ci, cj, seed + 1) * every);
        slots[at + 2] = size;
        slots[at + 3] = Math.floor(hash2(ci, cj, seed + 2) * 256);
        at += SLOT_BYTES;
      }
    }
  }
  return slots;
}
