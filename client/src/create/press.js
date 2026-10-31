import { CELL_CORNERS, TILE_CELLS } from "../v2/plate.js";
import { CELL_FT, TILE_FT } from "../v2/sizes.js";
import { slabBottom, slabTop } from "../world/slabs.js";

// Level slabs press the ground down where they lie in it: every corner of each cell a slab covers
// any of is drawn and walked on no higher than the slab's bottom. The ground kept in plate files
// stays as it is. The ground drops steeply in the cell round a slab's edge, and has no upright
// faces.

const LEVEL = 0.01; // feet a slab's top may rise across it and still be level

// The slab's outline from above, [[x, z], ...], and its bottom's height, or null for one that
// isn't level.
export function pressing(slab) {
  const top = slabTop(slab);
  const ys = top.map((p) => p[1]);
  if (Math.max(...ys) - Math.min(...ys) > LEVEL) return null;
  return { outline: top.map(([x, , z]) => [x, z]), bottom: slabBottom(slab)[0][1] };
}

// What `slabs` press on tile (tx, tz) or its edge corners, as pressing() has them.
export function pressesOver(slabs, tx, tz) {
  const [x0, z0, x1, z1] = [tx * TILE_FT - CELL_FT, tz * TILE_FT - CELL_FT, (tx + 1) * TILE_FT + CELL_FT, (tz + 1) * TILE_FT + CELL_FT];
  return slabs.map(pressing).filter((press) => {
    if (!press) return false;
    const xs = press.outline.map((p) => p[0]);
    const zs = press.outline.map((p) => p[1]);
    return Math.min(...xs) < x1 && Math.max(...xs) > x0 && Math.min(...zs) < z1 && Math.max(...zs) > z0;
  });
}

// The corners of tile (tx, tz) that `presses` (pressing()'s) press down, as corner index -> the
// height it's pressed to, the lowest where they overlap; empty where they press none.
export function pressedCorners(presses, tx, tz) {
  const pressed = new Map();
  const [x0, z0] = [tx * TILE_FT, tz * TILE_FT];
  for (const press of presses) {
    const xs = press.outline.map((p) => p[0]);
    const zs = press.outline.map((p) => p[1]);
    // Cells round the tile's edge count too, to press its edge corners as the tile beside it does.
    const [i0, i1] = [Math.max(-1, Math.floor((Math.min(...xs) - x0) / CELL_FT)), Math.min(TILE_CELLS, Math.floor((Math.max(...xs) - x0) / CELL_FT))];
    const [j0, j1] = [Math.max(-1, Math.floor((Math.min(...zs) - z0) / CELL_FT)), Math.min(TILE_CELLS, Math.floor((Math.max(...zs) - z0) / CELL_FT))];
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (!overlaps(press.outline, x0 + i * CELL_FT, z0 + j * CELL_FT)) continue;
        for (const [a, b] of [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]]) {
          if (a < 0 || b < 0 || a >= CELL_CORNERS || b >= CELL_CORNERS) continue;
          const k = b * CELL_CORNERS + a;
          pressed.set(k, Math.min(pressed.get(k) ?? Infinity, press.bottom));
        }
      }
    }
  }
  return pressed;
}

// `heights` (a tile's corners) with `pressed` corners no higher than they're pressed to: a copy,
// or `heights` itself where none are pressed.
export function pressHeights(heights, pressed) {
  if (!pressed.size) return heights;
  const out = Float32Array.from(heights);
  for (const [k, h] of pressed) if (out[k] > h) out[k] = h;
  return out;
}

// Whether the polygon [[x, z], ...] covers any of the cell with its northwest corner at (x, z),
// beyond touching its edge.
export function overlaps(polygon, x, z) {
  const square = [[x, z], [x + CELL_FT, z], [x + CELL_FT, z + CELL_FT], [x, z + CELL_FT]];
  if (inside(polygon, [x + CELL_FT / 2, z + CELL_FT / 2])) return true;
  if (polygon.some(([px, pz]) => px > x && px < x + CELL_FT && pz > z && pz < z + CELL_FT)) return true;
  for (let n = 0; n < polygon.length; n++) {
    const [p, q] = [polygon[n], polygon[(n + 1) % polygon.length]];
    for (let m = 0; m < 4; m++) if (crosses(p, q, square[m], square[(m + 1) % 4])) return true;
  }
  return false;
}

function inside(polygon, [x, z]) {
  let into = false;
  for (let n = 0, m = polygon.length - 1; n < polygon.length; m = n++) {
    const [[ax, az], [bx, bz]] = [polygon[n], polygon[m]];
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) into = !into;
  }
  return into;
}

// Whether segments pq and rs cross, not counting where they only touch.
function crosses(p, q, r, s) {
  const side = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  return side(p, q, r) * side(p, q, s) < 0 && side(r, s, p) * side(r, s, q) < 0;
}
