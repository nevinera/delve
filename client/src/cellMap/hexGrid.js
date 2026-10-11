// Flat-top hex geometry in "odd-q" offset coordinates: odd columns sit half
// a cell lower. Map space is in feet, origin top-left, y down.

const SQRT3 = Math.sqrt(3);

// Every cell map's cells are this many feet across the flats, so trees and
// grass are always the same size. The functions below take a cellSize for
// the geometry, and default to it.
export const CELL_SIZE = 5;

// cellSize is the flat-to-flat width; the corner radius follows from it.
export function hexRadius(cellSize) {
  return cellSize / SQRT3;
}

export function mapSize({cols, rows}, cellSize = CELL_SIZE) {
  const r = hexRadius(cellSize);
  return {width: 1.5 * r * cols + 0.5 * r, height: cellSize * rows + (cols > 1 ? cellSize / 2 : 0)};
}

export function cellCenter(col, row, cellSize) {
  const r = hexRadius(cellSize);
  return {x: r + 1.5 * r * col, y: cellSize / 2 + cellSize * row + (col & 1 ? cellSize / 2 : 0)};
}

// A point in cell coordinates: whole numbers are cell centers, and fractions
// interpolate between them - including the half-cell drop of odd columns, so
// a point moving across columns moves smoothly.
export function cellPoint(col, row, cellSize) {
  const r = hexRadius(cellSize);
  const c0 = Math.floor(col);
  const t = col - c0;
  const drop = (c0 & 1 ? 1 - t : t) * (cellSize / 2);
  return {x: r + 1.5 * r * col, y: cellSize / 2 + cellSize * row + drop};
}

// Corner i is at 60*i degrees, clockwise on screen from the right-hand one.
export function cellCorners(col, row, cellSize) {
  const {x, y} = cellCenter(col, row, cellSize);
  const r = hexRadius(cellSize);
  return [0, 1, 2, 3, 4, 5].map((i) => ({x: x + r * Math.cos((Math.PI / 3) * i), y: y + r * Math.sin((Math.PI / 3) * i)}));
}

// The neighbor across edge i (corner i to corner i+1): down-right, down,
// down-left, up-left, up, up-right.
const EVEN_COL = [[1, 0], [0, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const ODD_COL = [[1, 1], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, 0]];

export function neighbor(col, row, edge) {
  const [dc, dr] = (col & 1 ? ODD_COL : EVEN_COL)[edge];
  return [col + dc, row + dr];
}

// The cell containing a point, by checking the nearest few centers.
export function cellAt(x, y, cellSize) {
  const r = hexRadius(cellSize);
  const approxCol = Math.round((x - r) / (1.5 * r));
  let best = null;
  for (let col = approxCol - 1; col <= approxCol + 1; col++) {
    const approxRow = Math.round((y - cellSize / 2 - (col & 1 ? cellSize / 2 : 0)) / cellSize);
    for (let row = approxRow - 1; row <= approxRow + 1; row++) {
      const c = cellCenter(col, row, cellSize);
      const d = (c.x - x) ** 2 + (c.y - y) ** 2;
      if (!best || d < best.d) best = {col, row, d};
    }
  }
  return [best.col, best.row];
}

// The inverse of cellPoint: the cell coordinates of a point in feet.
export function pointAt(x, y, cellSize) {
  const r = hexRadius(cellSize);
  const col = (x - r) / (1.5 * r);
  const c0 = Math.floor(col);
  const t = col - c0;
  const drop = (c0 & 1 ? 1 - t : t) * (cellSize / 2);
  return [col, (y - cellSize / 2 - drop) / cellSize];
}

// Steps between two cells, through neighbors.
export function hexDistance([c1, r1], [c2, r2]) {
  const cube = (col, row) => {
    const x = col;
    const z = row - (col - (col & 1)) / 2;
    return [x, -x - z, z];
  };
  const a = cube(c1, r1);
  const b = cube(c2, r2);
  return Math.max(...a.map((v, i) => Math.abs(v - b[i])));
}

// The size a grid needs to cover about width x height feet.
export function gridFor({width, height}, cellSize = CELL_SIZE) {
  const r = hexRadius(cellSize);
  return {cols: Math.max(1, Math.round((width / r - 0.5) / 1.5)), rows: Math.max(1, Math.round(height / cellSize - 0.5))};
}
