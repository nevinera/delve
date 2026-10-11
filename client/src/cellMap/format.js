// The cellmap format (see docs/schema/map.md): a grid of cells, one
// character each, plus trails drawn across them, that the renderer turns
// into a map image. It sits inline in a map file as `cellMap`. Trails are
// lines through points in cell coordinates, [col, row] (see hexGrid.js's
// cellPoint), with a width in cells. The theme picks the look, the cell
// alphabet and the grid types it supports (themes.json, shared with the
// Ruby validator); colors override the theme's palette.
import THEMES from "./themes.json";
import {validateBridges} from "./bridges";

export {THEMES};
export const VERSION = 1;

const MAX_DIMENSION = 200;

// Returns a list of error messages, empty when the map is valid.
export function validateCellMap(map) {
  if (!map || typeof map !== "object") return ["must be an object"];
  const errors = [];
  if (map.version !== VERSION) errors.push(`version must be ${VERSION}`);
  if (!Number.isInteger(map.seed)) errors.push("seed must be an integer");
  const theme = THEMES[map.theme];
  if (!theme) return [...errors, `theme must be one of: ${Object.keys(THEMES).join(", ")}`];
  errors.push(...validateColors(map.colors, theme));

  const grid = map.grid;
  if (!grid || typeof grid !== "object") return [...errors, "grid is required"];
  if (!theme.grids.includes(grid.type)) errors.push(`grid.type must be one of: ${theme.grids.join(", ")}`);
  for (const key of ["cols", "rows"]) {
    if (!Number.isInteger(grid[key]) || grid[key] < 1 || grid[key] > MAX_DIMENSION) {
      errors.push(`grid.${key} must be an integer from 1 to ${MAX_DIMENSION}`);
    }
  }

  if (!Array.isArray(map.cells)) return [...errors, "cells must be a list of row strings"];
  if (map.cells.length !== grid.rows) errors.push(`cells has ${map.cells.length} rows, grid.rows is ${grid.rows}`);
  map.cells.forEach((row, r) => {
    if (typeof row !== "string") return errors.push(`cells[${r}] must be a string`);
    if (row.length !== grid.cols) errors.push(`cells[${r}] has ${row.length} cells, grid.cols is ${grid.cols}`);
    const bad = [...new Set([...row].filter((ch) => !(ch in theme.terrains)))];
    if (bad.length) errors.push(`cells[${r}] has unknown cells: ${bad.map((ch) => JSON.stringify(ch)).join(", ")}`);
  });

  errors.push(...validateBridges(map.bridges, grid));
  if (map.trails === undefined) return errors;
  if (!Array.isArray(map.trails)) return [...errors, "trails must be a list"];
  map.trails.forEach((trail, i) => {
    if (trail?.type !== undefined && !theme.paths.includes(trail.type)) errors.push(`trails[${i}].type must be one of: ${theme.paths.join(", ")}`);
    if (!(typeof trail?.width === "number" && trail.width > 0)) errors.push(`trails[${i}].width must be a positive number`);
    const points = trail?.points;
    if (!Array.isArray(points) || points.length < 2) return errors.push(`trails[${i}].points must list at least two points`);
    if (!points.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))) errors.push(`trails[${i}].points must each be [col, row]`);
  });
  return errors;
}

function validateColors(colors, theme) {
  if (colors === undefined) return [];
  if (!colors || typeof colors !== "object" || Array.isArray(colors)) return ["colors must be an object"];
  return Object.entries(colors).flatMap(([key, value]) => {
    if (!(key in theme.colors)) return [`colors.${key} is not one of the theme's colors: ${Object.keys(theme.colors).join(", ")}`];
    return /^#[0-9a-f]{6}$/i.test(value) ? [] : [`colors.${key} must be a "#rrggbb" color`];
  });
}

// The cell alphabet of a map's theme. Every theme has the same letters
// and terrains (a cave's "trees" are its rock), so a map can change theme;
// labels are what the theme calls them.
export function terrainsOf(map) {
  return THEMES[map.theme].terrains;
}

export function terrainLabel(theme, terrain) {
  return THEMES[theme].labels?.[terrain] ?? terrain;
}

// The letter a new map, and new cells, start as: the theme's trees (or
// rock), carved into.
export function fillOf(theme) {
  return THEMES[theme].fill;
}

// The terrain at (col, row), clamping to the nearest cell off the grid so
// regions run past the map's edge instead of outlining it.
export function terrainAt(map, col, row) {
  const r = Math.min(map.grid.rows - 1, Math.max(0, row));
  const c = Math.min(map.grid.cols - 1, Math.max(0, col));
  return THEMES[map.theme].terrains[map.cells[r][c]];
}
