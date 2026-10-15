// Exits (see docs/schema/map.md#cellmap): gaps in a map's edge, where a
// zone's connections lead off it. Each is a run of edge cells on one side
// of the grid, at most one per side; Auto Barriers (mapEditor/cells/
// autoBarriers.js) makes each a line connection named for its side.

import {CELL_SIZE, geometryOf} from "./grid";

export const SIDES = ["north", "east", "south", "west"];

// How many cells run along a side, and the cell at index i along it.
export function sideLength(side, {cols, rows}) {
  return side === "north" || side === "south" ? cols : rows;
}

export function sideCell(side, i, {cols, rows}) {
  if (side === "north") return [i, 0];
  if (side === "south") return [i, rows - 1];
  if (side === "west") return [0, i];
  return [cols - 1, i];
}

export function exitCells({side, from, to}, grid) {
  return Array.from({length: to - from + 1}, (_, k) => sideCell(side, from + k, grid));
}

// The stretch of the map's edge an exit's cells span, as [a, b] in
// cellmap feet (y down), a nearer the side's start.
export function exitEdge({side, from, to}, grid) {
  const g = geometryOf(grid);
  const {width, height} = g.mapSize(grid);
  const [first, last] = [sideCell(side, from, grid), sideCell(side, to, grid)].map((cell) => g.cellCenter(...cell, CELL_SIZE));
  if (side === "north" || side === "south") {
    const r = g.halfWidth(CELL_SIZE);
    const y = side === "north" ? 0 : height;
    return [{x: Math.max(0, first.x - r), y}, {x: Math.min(width, last.x + r), y}];
  }
  const x = side === "west" ? 0 : width;
  return [{x, y: Math.max(0, first.y - CELL_SIZE / 2)}, {x, y: Math.min(height, last.y + CELL_SIZE / 2)}];
}

// Error messages for a map's exits, empty when they're fine.
export function validateExits(exits, grid) {
  if (exits === undefined) return [];
  if (!Array.isArray(exits)) return ["exits must be a list"];
  const seen = new Set();
  return exits.flatMap((exit, i) => {
    if (!SIDES.includes(exit?.side)) return [`exits[${i}].side must be one of: ${SIDES.join(", ")}`];
    if (seen.has(exit.side)) return [`exits[${i}] is a second exit on the ${exit.side} side`];
    seen.add(exit.side);
    const length = sideLength(exit.side, grid);
    const ok = Number.isInteger(exit.from) && Number.isInteger(exit.to) && exit.from >= 0 && exit.from <= exit.to && exit.to < length;
    return ok ? [] : [`exits[${i}] must run from one cell to another along its side, 0 to ${length - 1}`];
  });
}
