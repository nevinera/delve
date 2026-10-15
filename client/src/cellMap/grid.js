// The geometry of a cell map's grid, by grid type ("hex" or "square"; see
// hexGrid.js and squareGrid.js). gridOf(type) gives one interface to both,
// so code that works on cells - the format, the editor, the generator - need
// not know which it has. Everything is in cellmap feet, y down.
import * as hex from "./hexGrid";
import * as square from "./squareGrid";

export const CELL_SIZE = hex.CELL_SIZE;
export const GRID_TYPES = ["hex", "square"];

const GRIDS = {
  hex: {
    type: "hex",
    // Edges around a cell (and so neighbors, and corners).
    edges: 6,
    mapSize: hex.mapSize,
    cellCenter: hex.cellCenter,
    cellPoint: hex.cellPoint,
    cellCorners: hex.cellCorners,
    neighbor: hex.neighbor,
    cellAt: hex.cellAt,
    pointAt: hex.pointAt,
    distance: hex.hexDistance,
    line: hex.hexLine,
    rays: hex.hexRays,
    gridFor: hex.gridFor,
    // Half a cell's extent along x: how far its sides are from its center.
    halfWidth: (cellSize = CELL_SIZE) => hex.hexRadius(cellSize),
    // Cell corners as points of a lattice shared by neighboring cells, so
    // they agree on them exactly: corner i of a cell, as integers.
    corner(col, row, i) {
      const [dx, dy] = HEX_CORNER_STEPS[i];
      return [2 + 3 * col + dx, 1 + 2 * row + (col & 1) + dy];
    },
    latticeFeet([lx, ly], cellSize = CELL_SIZE) {
      return {x: (lx * hex.hexRadius(cellSize)) / 2, y: (ly * cellSize) / 2};
    },
  },
  square: {
    type: "square",
    edges: 4,
    mapSize: square.mapSize,
    cellCenter: square.cellCenter,
    cellPoint: square.cellPoint,
    cellCorners: square.cellCorners,
    neighbor: square.neighbor,
    cellAt: square.cellAt,
    pointAt: square.pointAt,
    distance: square.squareDistance,
    line: square.squareLine,
    rays: square.squareRays,
    gridFor: square.gridFor,
    halfWidth: (cellSize = CELL_SIZE) => cellSize / 2,
    corner(col, row, i) {
      const [dx, dy] = SQUARE_CORNERS[i];
      return [col + dx, row + dy];
    },
    latticeFeet([lx, ly], cellSize = CELL_SIZE) {
      return {x: lx * cellSize, y: ly * cellSize};
    },
  },
};

// Corners in a lattice of (r/2, s/2) steps, r the corner radius and s the
// cell size.
const HEX_CORNER_STEPS = [[2, 0], [1, 1], [-1, 1], [-2, 0], [-1, -1], [1, -1]];
const SQUARE_CORNERS = [[1, 0], [1, 1], [0, 1], [0, 0]];

export function gridOf(type = "hex") {
  const grid = GRIDS[type];
  if (!grid) throw new Error(`unknown grid type ${JSON.stringify(type)}`);
  return grid;
}

// The geometry of a grid object ({type, cols, rows}).
export const geometryOf = (grid) => gridOf(grid?.type);

export const mapSizeOf = (grid, cellSize = CELL_SIZE) => geometryOf(grid).mapSize(grid, cellSize);
