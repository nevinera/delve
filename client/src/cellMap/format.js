// The cellmap format (see plans/cell-editor.md): a grid of cells, one
// character each, that the renderer turns into a map image.

export const FORMAT = "cellmap";
export const VERSION = 1;

export const TERRAINS = {
  ".": "meadow",
  T: "trees",
};

const MAX_DIMENSION = 200;

// Returns a list of error messages, empty when the map is valid.
export function validateCellMap(map) {
  if (!map || typeof map !== "object") return ["must be an object"];
  const errors = [];
  if (map.format !== FORMAT) errors.push(`format must be "${FORMAT}"`);
  if (map.version !== VERSION) errors.push(`version must be ${VERSION}`);
  if (!Number.isInteger(map.seed)) errors.push("seed must be an integer");

  const grid = map.grid;
  if (!grid || typeof grid !== "object") return [...errors, "grid is required"];
  if (grid.type !== "hex") errors.push(`grid.type must be "hex"`);
  for (const key of ["cols", "rows"]) {
    if (!Number.isInteger(grid[key]) || grid[key] < 1 || grid[key] > MAX_DIMENSION) {
      errors.push(`grid.${key} must be an integer from 1 to ${MAX_DIMENSION}`);
    }
  }
  if (!(typeof grid.cellSize === "number" && grid.cellSize > 0)) errors.push("grid.cellSize must be a positive number");

  if (!Array.isArray(map.cells)) return [...errors, "cells must be a list of row strings"];
  if (map.cells.length !== grid.rows) errors.push(`cells has ${map.cells.length} rows, grid.rows is ${grid.rows}`);
  map.cells.forEach((row, r) => {
    if (typeof row !== "string") return errors.push(`cells[${r}] must be a string`);
    if (row.length !== grid.cols) errors.push(`cells[${r}] has ${row.length} cells, grid.cols is ${grid.cols}`);
    const bad = [...new Set([...row].filter((ch) => !(ch in TERRAINS)))];
    if (bad.length) errors.push(`cells[${r}] has unknown cells: ${bad.map((ch) => JSON.stringify(ch)).join(", ")}`);
  });
  return errors;
}

// The terrain at (col, row), clamping to the nearest cell off the grid so
// regions run past the map's edge instead of outlining it.
export function terrainAt(map, col, row) {
  const r = Math.min(map.grid.rows - 1, Math.max(0, row));
  const c = Math.min(map.grid.cols - 1, Math.max(0, col));
  return TERRAINS[map.cells[r][c]];
}
