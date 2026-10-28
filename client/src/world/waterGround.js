import { CELLS, CELL_FT } from "./constants.js";

// The ground water runs and pools over (plans/water.md): the land grid, except in tiles shaped by
// hand, where it's the lowest of the four cells round each point, so a trench a cell wide still
// catches the water. landAt(xFt, zFt) is the land grid; edited maps "tx,tz" to a hand-shaped tile's
// height layer.
export function waterGround(landAt, edited) {
  if (!edited?.size) return landAt;
  return (x, z) => {
    const [ci, cj] = [Math.round(x / CELL_FT), Math.round(z / CELL_FT)];
    let low = Infinity;
    for (const [a, b] of [[ci - 1, cj - 1], [ci, cj - 1], [ci - 1, cj], [ci, cj]]) {
      const [tx, tz] = [Math.floor(a / CELLS), Math.floor(b / CELLS)];
      const height = edited.get(`${tx},${tz}`);
      if (height) low = Math.min(low, height[(b - tz * CELLS) * CELLS + a - tx * CELLS]);
    }
    return low < Infinity ? low : landAt(x, z);
  };
}
