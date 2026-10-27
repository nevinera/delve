import { CELL_FT } from "../world/constants.js";
import { fbm } from "../world/noise.js";
import { rain, slump } from "./erosion.js";

// The detail step's height brushes, worked cell by cell on generated tiles. `cells` gives
// height(ci, cj) and editable(ci, cj), in continent cells; a brush changes only editable cells,
// and returns its changes, [[ci, cj, h], ...], for the view to apply, keep for undoing and redraw.
//
// A brush works fully within `radius` ft of its middle, then eases to nothing over `falloff` ft
// past that, so raise and lower lift a plateau rather than a hump:
// - raise and lower move the ground by `strength` ft a second;
// - flatten pulls toward the height where the stroke began;
// - smooth pulls each cell toward its neighbours' average;
// - noise raises and lowers in lumps about half the brush across;
// - erode wears the ground away (erosion.js), by running water, strength / RAIN_PER drops a cell
//   each second, or by slumping where it's steeper than `talus` degrees.
// Flatten goes about strength / PULL_PER of the way each second.

export const DETAIL_TOOLS = ["raise", "lower", "flatten", "smooth", "noise", "erode"];
const SMOOTH_RATE = 6;
const PULL_PER = 10;
const NOISE_SEED = 0x51d3a7e1;
const RAIN_PER = 30;
const SLUMP_PER = 6;

// A brush's weight `d` ft from its middle: 1 out to the radius, easing to 0 over the falloff.
export function brushWeight(d, radius, falloff) {
  if (d <= radius) return 1;
  if (d >= radius + falloff) return 0;
  return 0.5 + 0.5 * Math.cos((Math.PI * (d - radius)) / falloff);
}

// The editable cells the brush reaches, each with its weight. A cell's middle is where it's measured.
function* within(cells, [x, z], radius, falloff) {
  const reach = Math.ceil((radius + falloff) / CELL_FT) + 1;
  const [ci0, cj0] = [Math.floor(x / CELL_FT), Math.floor(z / CELL_FT)];
  for (let cj = cj0 - reach; cj <= cj0 + reach; cj++) {
    for (let ci = ci0 - reach; ci <= ci0 + reach; ci++) {
      const w = brushWeight(Math.hypot((ci + 0.5) * CELL_FT - x, (cj + 0.5) * CELL_FT - z), radius, falloff);
      if (w > 0 && cells.editable(ci, cj)) yield [ci, cj, w];
    }
  }
}

// One frame of a brush at continent feet (x, z), dt seconds long. `from` is the height where the
// stroke began, for flatten.
export function detailBrush(cells, { tool, radius, falloff, strength, erosion, talus }, at, dt, from) {
  if (tool === "erode") return erode(cells, { radius, falloff, strength, erosion, talus }, at, dt);
  const changes = [];
  for (const [ci, cj, w] of within(cells, at, radius, falloff)) {
    const h = cells.height(ci, cj);
    let next = h;
    if (tool === "raise") next = h + strength * dt * w;
    else if (tool === "lower") next = h - strength * dt * w;
    else if (tool === "flatten") next = h + (from - h) * Math.min(1, (strength / PULL_PER) * dt * w);
    else if (tool === "smooth") {
      let sum = 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) sum += cells.height(ci + di, cj + dj);
      next = h + (sum / 4 - h) * Math.min(1, SMOOTH_RATE * dt * w);
    } else if (tool === "noise") {
      const lump = fbm((ci + 0.5) * CELL_FT, (cj + 0.5) * CELL_FT, NOISE_SEED, { wavelength: Math.max(CELL_FT * 2, radius / 2), octaves: 3 });
      next = h + lump * 2 * strength * dt * w;
    }
    if (next !== h) changes.push([ci, cj, next]);
  }
  return changes;
}

// Erosion over the brush, as a box of cells weighted by the brush, leaving uneditable cells be.
function erode(cells, { radius, falloff, strength, erosion, talus }, [x, z], dt) {
  const reach = Math.ceil((radius + falloff) / CELL_FT);
  const [ci, cj] = [Math.floor(x / CELL_FT), Math.floor(z / CELL_FT)];
  const region = {
    gx0: ci - reach,
    gz0: cj - reach,
    gx1: ci + reach,
    gz1: cj + reach,
    weight: (wx, wz) => {
      const [i, j] = [Math.round(wx / CELL_FT), Math.round(wz / CELL_FT)];
      return cells.editable(i, j) ? brushWeight(Math.hypot((i + 0.5) * CELL_FT - x, (j + 0.5) * CELL_FT - z), radius, falloff) : 0;
    },
  };
  const grid = { point: (i, j) => cells.height(i, j) };
  const changes =
    erosion === "slump"
      ? slump(grid, region, { talus, passes: (strength * dt) / SLUMP_PER, spacing: CELL_FT })
      : rain(grid, region, { drops: Math.round((Math.PI * ((radius + falloff / 2) / CELL_FT) ** 2 * strength * dt) / RAIN_PER), spacing: CELL_FT });
  return changes.filter(([i, j]) => cells.editable(i, j));
}
