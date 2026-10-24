// World scale, in feet. A cell is the unit tags are painted at; a tile is
// the unit the world is edited, stored and (later) streamed in.
export const CELL_FT = 8;
export const TILE_CELLS = 64;
export const TILE_FT = CELL_FT * TILE_CELLS;
export const WATER_LEVEL = 16;
export const MAX_HEIGHT = 120;

export const TERRAINS = ["grass", "dirt", "sand", "rock", "road", "mud", "moss"];
export const TERRAIN = Object.fromEntries(TERRAINS.map((name, i) => [name, i]));
export const THEMES = ["temperate", "swamp"];
export const THEME = Object.fromEntries(THEMES.map((name, i) => [name, i]));
