// Square-grid geometry, with the same interface as hexGrid.js (see grid.js).
// Cell (col, row) covers [col, col + 1) x [row, row + 1) cell sizes, origin
// top-left, y down, in feet. Edges are numbered clockwise on screen from the
// right-hand one: east, south, west, north (edge i runs from corner i to
// corner i + 1; corner 0 is the top right).
import {CELL_SIZE} from "./hexGrid";

export function mapSize({cols, rows}, cellSize = CELL_SIZE) {
  return {width: cols * cellSize, height: rows * cellSize};
}

export function cellCenter(col, row, cellSize = CELL_SIZE) {
  return {x: (col + 0.5) * cellSize, y: (row + 0.5) * cellSize};
}

// A point in cell coordinates: whole numbers are cell centers.
export const cellPoint = cellCenter;

const CORNERS = [[1, 0], [1, 1], [0, 1], [0, 0]];

export function cellCorners(col, row, cellSize = CELL_SIZE) {
  return CORNERS.map(([dx, dy]) => ({x: (col + dx) * cellSize, y: (row + dy) * cellSize}));
}

const NEIGHBORS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

export function neighbor(col, row, edge) {
  const [dc, dr] = NEIGHBORS[edge];
  return [col + dc, row + dr];
}

export function cellAt(x, y, cellSize = CELL_SIZE) {
  return [Math.floor(x / cellSize), Math.floor(y / cellSize)];
}

export function pointAt(x, y, cellSize = CELL_SIZE) {
  return [x / cellSize - 0.5, y / cellSize - 0.5];
}

// Steps between two cells, diagonals counting as one, so a brush of reach n
// covers a square.
export function squareDistance([c1, r1], [c2, r2]) {
  return Math.max(Math.abs(c1 - c2), Math.abs(r1 - r2));
}

// The cells from one cell to another, both included, when they share a row
// or column; otherwise null.
export function squareLine([c1, r1], [c2, r2]) {
  if (c1 !== c2 && r1 !== r2) return null;
  const steps = Math.max(Math.abs(c2 - c1), Math.abs(r2 - r1));
  return Array.from({length: steps + 1}, (_, k) => [c1 + Math.sign(c2 - c1) * k, r1 + Math.sign(r2 - r1) * k]);
}

// Every cell 1 to max steps from a cell along its row or column.
export function squareRays([col, row], max) {
  return NEIGHBORS.flatMap(([dc, dr]) => Array.from({length: max}, (_, k) => [col + dc * (k + 1), row + dr * (k + 1)]));
}

export function gridFor({width, height}, cellSize = CELL_SIZE) {
  return {cols: Math.max(1, Math.round(width / cellSize)), rows: Math.max(1, Math.round(height / cellSize))};
}
