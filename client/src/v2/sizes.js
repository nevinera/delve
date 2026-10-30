// The sizes of a version 2 world's ground, each 8×8 of the one below. Positions are feet in
// continent space: x east, z south, y up.

export const CELL_FT = 4;
export const CHUNK_CELLS = 8;
export const CHUNK_FT = CELL_FT * CHUNK_CELLS; // 32
export const TILE_CHUNKS = 8;
export const TILE_FT = CHUNK_FT * TILE_CHUNKS; // 256
export const PLATE_TILES = 8;
export const PLATE_FT = TILE_FT * PLATE_TILES; // 2,048
export const PLATTER_PLATES = 8;
export const PLATTER_TILES = PLATE_TILES * PLATTER_PLATES; // 64
export const PLATTER_FT = PLATE_FT * PLATTER_PLATES; // 16,384

export const SEA_LEVEL_FT = 0;
