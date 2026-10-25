// World scale (plans/design.md, "Scale"). Coordinates are feet in continent space: x east, z
// south, y up. Tile (tx, tz) covers [tx * TILE_FT, (tx + 1) * TILE_FT) on each axis.
export const CELLS = 64;
export const CELL_FT = 8;
export const TILE_FT = CELLS * CELL_FT;

// Kinds of water, the tile's water palette: the sea, and fresh water (rivers, lakes, pools).
export const WATER_KINDS = ["sea", "fresh"];
