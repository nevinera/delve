import { biomeRelief, prepareShape, prepareWorld, shapeHeight } from "../world/generator.js";
import { BIOMES, biomesNear, climateAt } from "../world/biomes.js";
import { BIOME_COLORS } from "../world/tileImage.js";
import { TILE_FT } from "../world/constants.js";

// The heights and biomes maps: previews worked out straight from the zones, quick enough to redo
// on every edit, over the part of the continent in sight. The heights map is the land's rough shape
// from the height pins and coasts alone (generator.js shapeHeight), as an elevation heat map with
// contour lines. The biomes map colors the land by biome, blended at borders, shaded by each
// biome's broad hills and ridges (biomeRelief).
//
// A grid is { x0, z0, stepFt, nx, nz, heights, biomes, rgba }: sample (i, j) is at continent feet
// (x0 + i * stepFt, z0 + j * stepFt), heights[j * nx + i] is its ground, `biomes` says which map it
// is, and rgba is the map's picture, a pixel per sample, clear over the sea.

const MARGIN_FT = 2 * TILE_FT; // sea around the zoned area, without bounds
const MIN_STEP_FT = 2;

// continent: { zones, pins, strokes }, as generator.js prepareWorld takes it. bounds: [x0, z0, x1,
// z1] continent feet to cover, or the whole zoned area with some sea around it; side: samples
// along the longer side. Null when there's no land at all.
export function shapeGrid(continent, seedKey, { biomes = false, bounds = null, side = 360 } = {}) {
  const ctx = biomes ? prepareWorld(continent, seedKey) : prepareShape(continent, seedKey);
  const points = ctx.area.flat(2);
  if (!points.length) return null;
  const xs = points.map((p) => p[0]);
  const zs = points.map((p) => p[1]);
  const [x0, z0, x1, z1] = bounds ?? [Math.min(...xs) - MARGIN_FT, Math.min(...zs) - MARGIN_FT, Math.max(...xs) + MARGIN_FT, Math.max(...zs) + MARGIN_FT];
  const stepFt = Math.max(MIN_STEP_FT, Math.max(x1 - x0, z1 - z0) / side);
  const nx = Math.ceil((x1 - x0) / stepFt) + 1;
  const nz = Math.ceil((z1 - z0) / stepFt) + 1;
  const grid = { x0, z0, stepFt, nx, nz, heights: new Float32Array(nx * nz), biomes, rgba: new Uint8ClampedArray(nx * nz * 4) };
  if (!biomes) {
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) grid.heights[j * nx + i] = shapeHeight(ctx, x0 + i * stepFt, z0 + j * stepFt);
    }
    paint(grid, (k) => heightColor(grid.heights[k]), contours(grid));
    return grid;
  }
  const climate = coarseClimate(ctx, grid);
  const colors = new Float32Array(nx * nz * 3);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const [amp, rough, r, g, b] = climate(i, j);
      const [x, z] = [x0 + i * stepFt, z0 + j * stepFt];
      grid.heights[j * nx + i] = shapeHeight(ctx, x, z, biomeRelief(ctx, x, z, { amp, rough }));
      colors.set([r / 255, g / 255, b / 255], (j * nx + i) * 3);
    }
  }
  paint(grid, (k) => colors.subarray(k * 3, k * 3 + 3), () => 1);
  return grid;
}

// Fills the grid's picture: `color(k)` (0-1 RGB) times `line(i, j)`, hill-shaded with light from
// the north-west, and clear where the ground's under the sea.
function paint(grid, color, line) {
  const { nx, nz, heights, rgba, stepFt } = grid;
  const at = (i, j) => heights[Math.max(0, Math.min(nz - 1, j)) * nx + Math.max(0, Math.min(nx - 1, i))];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (!(heights[k] >= 0)) continue;
      const dx = (at(i + 1, j) - at(i - 1, j)) / (2 * stepFt);
      const dz = (at(i, j + 1) - at(i, j - 1)) / (2 * stepFt);
      const shade = Math.max(0.7, Math.min(1.25, 1 - (dx + dz) * 1.5)) * line(i, j);
      const [r, g, b] = color(k);
      rgba.set([r * shade * 255, g * shade * 255, b * shade * 255, 255], k * 4);
    }
  }
}

// Contour lines for the heights map, (i, j) => a darkening factor: a faint line every `minor` feet
// and a stronger one every five, spaced out as the samples spread so they don't run together.
function contours({ nx, nz, heights, stepFt }) {
  const minor = stepFt <= 40 ? 100 : stepFt <= 100 ? 200 : 500;
  const crosses = (k, every) => {
    const band = Math.floor(heights[k] / every);
    return (k % nx < nx - 1 && Math.floor(heights[k + 1] / every) !== band) || (k + nx < nx * nz && Math.floor(heights[k + nx] / every) !== band);
  };
  return (i, j) => {
    const k = j * nx + i;
    if (crosses(k, minor * 5)) return 0.62;
    return crosses(k, minor) ? 0.84 : 1;
  };
}

// Finding the biome is the slow part, so it's done on every other sample each way, in blocks that
// each test only the rivers and edges near them, and blended between. Returns (i, j) => [amp,
// rough, r, g, b] for grid sample (i, j).
const COARSE = 2;
const BLOCK = 8; // coarse samples per side of a block

function coarseClimate(ctx, { x0, z0, stepFt, nx, nz }) {
  const step = stepFt * COARSE;
  const cx = Math.ceil((nx - 1) / COARSE) + 1;
  const cz = Math.ceil((nz - 1) / COARSE) + 1;
  const values = new Float32Array(cx * cz * 5);
  const colors = BIOMES.map((name) => BIOME_COLORS[name]);
  for (let bj = 0; bj < cz; bj += BLOCK) {
    for (let bi = 0; bi < cx; bi += BLOCK) {
      const [bx, bz] = [x0 + bi * step, z0 + bj * step];
      const near = biomesNear(ctx.biomes, [bx, bz, bx + BLOCK * step, bz + BLOCK * step]);
      for (let j = bj; j < Math.min(cz, bj + BLOCK); j++) {
        for (let i = bi; i < Math.min(cx, bi + BLOCK); i++) {
          const { biome, second, weight, profile } = climateAt(near, x0 + i * step, z0 + j * step);
          const [a, b] = [colors[biome], colors[second]];
          const rgb = a.map((c, k) => b[k] + (c - b[k]) * weight);
          values.set([profile.amp, profile.rough, ...rgb], (j * cx + i) * 5);
        }
      }
    }
  }
  const out = new Array(5);
  return (i, j) => {
    const [u, v] = [i / COARSE, j / COARSE];
    const [ci, cj] = [Math.min(cx - 2, Math.floor(u)), Math.min(cz - 2, Math.floor(v))];
    const [fu, fv] = [u - ci, v - cj];
    for (let k = 0; k < 5; k++) {
      const at = (di, dj) => values[((cj + dj) * cx + ci + di) * 5 + k];
      out[k] = (at(0, 0) * (1 - fu) + at(1, 0) * fu) * (1 - fv) + (at(0, 1) * (1 - fu) + at(1, 1) * fu) * fv;
    }
    return out;
  };
}

// An elevation heat map by height (ft): dark blue at sea level up through cyan, green, yellow and
// red to near-white at the top. It runs on a log scale, like the height slider, so low plains and
// tall mountains both show their shape.
const HEAT = [
  [0.19, 0.07, 0.23],
  [0.27, 0.45, 0.93],
  [0.1, 0.81, 0.8],
  [0.45, 0.95, 0.35],
  [0.96, 0.84, 0.22],
  [0.92, 0.36, 0.08],
  [0.6, 0.06, 0.03],
  [0.98, 0.92, 0.92],
];
const KNEE_FT = 20;
const TOP_FT = 21120;

export function heightColor(h) {
  const t = Math.log1p(Math.max(0, h) / KNEE_FT) / Math.log1p(TOP_FT / KNEE_FT);
  const f = Math.min(1, t) * (HEAT.length - 1);
  const k = Math.min(HEAT.length - 2, Math.floor(f));
  return HEAT[k].map((c, i) => c + (HEAT[k + 1][i] - c) * (f - k));
}

// Runs shapeGrid in a worker. Only the latest request matters: one runs at a time, and requests
// made meanwhile collapse into one that runs after it.
export class ShapePreview {
  constructor(onGrid) {
    this.onGrid = onGrid;
    this.worker = null;
    this.busy = false;
    this.next = null;
  }

  request(continent, seedKey, options) {
    this.next = { continent: structuredClone(continent), seedKey, options };
    if (!this.busy) this.send();
  }

  send() {
    const message = this.next;
    this.next = null;
    if (!message) return;
    this.busy = true;
    if (!this.worker) {
      this.worker = new Worker(new URL("./shapePreviewWorker.js", import.meta.url), { type: "module" });
      this.worker.onmessage = ({ data }) => {
        this.busy = false;
        if (!this.next) this.onGrid(data);
        this.send();
      };
      this.worker.onerror = (e) => {
        this.busy = false;
        console.warn(`map preview failed: ${e.message}`);
      };
    }
    this.worker.postMessage(message);
  }
}
