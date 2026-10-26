// World scale (plans/design.md, "Scale"). Coordinates are feet in continent space: x east, z
// south, y up. Tile (tx, tz) covers [tx * TILE_FT, (tx + 1) * TILE_FT) on each axis.
export const CELLS = 64;
export const CELL_FT = 8;
export const TILE_FT = CELLS * CELL_FT;

// Roads wider than CART_WIDTH_FT carry carts, so they're held to a gentler grade (rise over run).
export const CART_WIDTH_FT = 8;
export const GRADES = { cart: 0.1, foot: 0.25 };
export function gradeCap(widthFt) {
  return widthFt > CART_WIDTH_FT ? GRADES.cart : GRADES.foot;
}

// Kinds of water, the tile's water palette: the sea, and fresh water (rivers, lakes, pools).
export const WATER_KINDS = ["sea", "fresh"];
