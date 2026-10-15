// Bridges (see docs/schema/map.md#cellmap): wooden decks over water, each
// a straight run of cells from one to another. The scene draws them, and
// Auto Barriers (mapEditor/cells/autoBarriers.js) rails them, from the
// same deck.
import {CELL_SIZE, gridOf} from "./grid";

// The longest a bridge can be, in steps from end to end.
export const MAX_BRIDGE_LENGTH = 8;

// Half the deck's width, in feet: room for a unit (2.2 ft across its
// middle) between its rails.
export const DECK_HALF_WIDTH = 3;
// On a square grid the deck is 4 feet wide, to fit a one-cell corridor.
const SQUARE_DECK_HALF_WIDTH = 2;

// How far the deck runs past the middle of its end cells, in feet.
const DECK_OVERHANG = 1;

export function bridgeCells({from, to}, gridType = "hex") {
  return gridOf(gridType).line(from, to) ?? [];
}

// The deck as {a, b, halfWidth}: the ends of its middle line, in cellmap
// feet (y down).
export function bridgeDeck({from, to}, gridType = "hex") {
  const {cellCenter} = gridOf(gridType);
  const a = cellCenter(...from, CELL_SIZE);
  const b = cellCenter(...to, CELL_SIZE);
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / l;
  const uy = (b.y - a.y) / l;
  return {
    a: {x: a.x - ux * DECK_OVERHANG, y: a.y - uy * DECK_OVERHANG},
    b: {x: b.x + ux * DECK_OVERHANG, y: b.y + uy * DECK_OVERHANG},
    halfWidth: gridType === "square" ? SQUARE_DECK_HALF_WIDTH : DECK_HALF_WIDTH,
  };
}

// Error messages for a map's bridges, empty when they're fine.
export function validateBridges(bridges, grid) {
  if (bridges === undefined) return [];
  if (!Array.isArray(bridges)) return ["bridges must be a list"];
  return bridges.flatMap((bridge, i) => {
    const cell = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isInteger) && p[0] >= 0 && p[1] >= 0 && p[0] < grid.cols && p[1] < grid.rows;
    const bad = ["from", "to"].filter((end) => !cell(bridge?.[end]));
    if (bad.length) return bad.map((end) => `bridges[${i}].${end} must be a cell on the grid, [col, row]`);
    const cells = gridOf(grid.type).line(bridge.from, bridge.to);
    if (!cells) return [`bridges[${i}] must run straight along the cells`];
    if (cells.length < 2 || cells.length > MAX_BRIDGE_LENGTH + 1) return [`bridges[${i}] must reach 1 to ${MAX_BRIDGE_LENGTH} cells from its start`];
    return [];
  });
}
