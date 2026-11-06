// The faces the ground and caves' floors are drawn and walked as. Each square of a grid of corner
// heights is two flat triangles, split from its northeast corner to its southwest
// (create/ground.js's gridSquares, create/caveMesh.js's quad): the northwest one where
// fu + fv <= 1, the southeast one past it. fu and fv run 0 to 1 across the square, east and south.
// The game server has the same (game-server/internal/worlds/faces.go).

// The height at (fu, fv) on a square with these corners' heights.
export function faceHeight(nw, ne, sw, se, fu, fv) {
  return fu + fv <= 1 ? nw + (ne - nw) * fu + (sw - nw) * fv : se + (sw - se) * (1 - fu) + (ne - se) * (1 - fv);
}

// How steep the triangle (fu, fv) is in, rise over run, on a square `width` across.
export function faceSlope(nw, ne, sw, se, fu, fv, width) {
  const [dx, dz] = fu + fv <= 1 ? [ne - nw, sw - nw] : [se - sw, se - ne];
  return Math.hypot(dx, dz) / width;
}

// faceHeight and faceSlope from a grid of corner heights `side` a row, at (u, v) squares across
// it, kept on the grid.
const cornersAt = (heights, side, u, v) => {
  const [i, j] = [Math.max(0, Math.min(side - 2, Math.floor(u))), Math.max(0, Math.min(side - 2, Math.floor(v)))];
  const h = (a, b) => heights[(j + b) * side + i + a];
  return [h(0, 0), h(1, 0), h(0, 1), h(1, 1), u - i, v - j];
};
export const gridHeight = (heights, side, u, v) => faceHeight(...cornersAt(heights, side, u, v));
export const gridSlope = (heights, side, u, v, width) => faceSlope(...cornersAt(heights, side, u, v), width);
