import { CELL_FT } from "../world/constants.js";
import { makePolyline, nearest, pointAt } from "../world/polyline.js";

// Channels dug by hand in the detail step, along a drawn line, `depth` ft below the ground and never
// rising along the way; their sides slope back up to the ground.

// The ground dug for a channel along `points` ([x, z] continent feet), `width` ft across and
// `depth` ft deep, as changes [[ci, cj, h], ...] to editable cells. `cells` gives height(ci, cj)
// and editable(ci, cj).
export function carveChannel(cells, points, { width, depth }) {
  if (points.length < 2) return [];
  const line = makePolyline(points);
  const heightAt = (x, z) => cells.height(Math.floor(x / CELL_FT), Math.floor(z / CELL_FT));
  // The bed along the line, a sample each cell, never rising.
  const count = Math.max(2, Math.ceil(line.length / CELL_FT) + 1);
  const bed = [];
  let deepest = depth;
  for (let n = 0; n < count; n++) {
    const ground = heightAt(...pointAt(line, Math.min(line.length, n * CELL_FT)));
    bed.push(n ? Math.min(ground - depth, bed[n - 1]) : ground - depth);
    deepest = Math.max(deepest, ground - bed[n]);
  }
  const bedAt = (along) => {
    const f = Math.max(0, Math.min(count - 1, along / CELL_FT));
    const i = Math.floor(f);
    return i >= count - 1 ? bed[count - 1] : bed[i] + (bed[i + 1] - bed[i]) * (f - i);
  };
  const half = width / 2;
  // Sides slope back up at 1:1, as far out as the channel's deepest.
  const reach = half + deepest + CELL_FT;
  const xs = points.map((p) => p[0]);
  const zs = points.map((p) => p[1]);
  const changes = [];
  for (let cj = Math.floor((Math.min(...zs) - reach) / CELL_FT); cj <= Math.floor((Math.max(...zs) + reach) / CELL_FT); cj++) {
    for (let ci = Math.floor((Math.min(...xs) - reach) / CELL_FT); ci <= Math.floor((Math.max(...xs) + reach) / CELL_FT); ci++) {
      if (!cells.editable(ci, cj)) continue;
      const n = nearest(line, (ci + 0.5) * CELL_FT, (cj + 0.5) * CELL_FT);
      if (n.dist > reach) continue;
      const target = bedAt(n.along) + Math.max(0, n.dist - half);
      const h = cells.height(ci, cj);
      if (target < h) changes.push([ci, cj, target]);
    }
  }
  return changes;
}
