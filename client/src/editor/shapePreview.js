import { biomeRelief, prepareShape, prepareWorld, shapeHeight } from "../world/generator.js";
import { BIOMES, biomesNear, climateAt } from "../world/biomes.js";
import { BIOME_COLORS } from "../world/tileImage.js";
import { TILE_FT } from "../world/constants.js";

// Previews of the whole continent, sampled on a coarse grid over the zoned area, quick enough to
// redo on every edit. The heights preview is the land's shape from the height pins and coasts
// alone (generator.js shapeHeight). The biomes preview adds each biome's broad hills and ridges
// (biomeRelief), and colors the ground by biome, blended at borders.
//
// A grid is { x0, z0, stepFt, nx, nz, heights, biomes, colors }: heights[j * nx + i] is the ground
// at continent feet (x0 + i * stepFt, z0 + j * stepFt); `biomes` says which preview it is, and
// for the biomes preview, colors holds each sample's RGB.

const MARGIN_FT = 2 * TILE_FT; // sea drawn around the zoned area
const MIN_STEP_FT = 64;
const MAX_SIDE = 360; // samples along the longer side

export function shapeGrid(zones, seedKey, { biomes = false } = {}) {
  const ctx = biomes ? prepareWorld(zones, seedKey) : prepareShape(zones, seedKey);
  const points = ctx.area.flat(2);
  if (!points.length) return null;
  const xs = points.map((p) => p[0]);
  const zs = points.map((p) => p[1]);
  const [x0, z0] = [Math.min(...xs) - MARGIN_FT, Math.min(...zs) - MARGIN_FT];
  const [x1, z1] = [Math.max(...xs) + MARGIN_FT, Math.max(...zs) + MARGIN_FT];
  const stepFt = Math.max(MIN_STEP_FT, Math.ceil(Math.max(x1 - x0, z1 - z0) / MAX_SIDE / 8) * 8);
  const nx = Math.ceil((x1 - x0) / stepFt) + 1;
  const nz = Math.ceil((z1 - z0) / stepFt) + 1;
  const grid = { x0, z0, stepFt, nx, nz, heights: new Float32Array(nx * nz), biomes, colors: null };
  if (!biomes) {
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) grid.heights[j * nx + i] = shapeHeight(ctx, x0 + i * stepFt, z0 + j * stepFt);
    }
    return grid;
  }
  const climate = coarseClimate(ctx, grid);
  grid.colors = new Uint8Array(nx * nz * 3);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const [amp, rough, r, g, b] = climate(i, j);
      const [x, z] = [x0 + i * stepFt, z0 + j * stepFt];
      grid.heights[j * nx + i] = shapeHeight(ctx, x, z, biomeRelief(ctx, x, z, { amp, rough }));
      grid.colors.set([r, g, b], (j * nx + i) * 3);
    }
  }
  return grid;
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

// The grid's ground at continent feet (x, z), interpolated, or NaN off the grid.
export function gridHeight({ x0, z0, stepFt, nx, nz, heights }, x, z) {
  const u = (x - x0) / stepFt;
  const v = (z - z0) / stepFt;
  if (!(u >= 0 && v >= 0 && u <= nx - 1 && v <= nz - 1)) return NaN;
  const i = Math.min(nx - 2, Math.floor(u));
  const j = Math.min(nz - 2, Math.floor(v));
  const [fu, fv] = [u - i, v - j];
  const at = (di, dj) => heights[(j + dj) * nx + i + di];
  return (at(0, 0) * (1 - fu) + at(1, 0) * fu) * (1 - fv) + (at(0, 1) * (1 - fu) + at(1, 1) * fu) * fv;
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

  request(zones, seedKey, options) {
    this.next = { zones: structuredClone(zones), seedKey, options };
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
        console.warn(`heights preview failed: ${e.message}`);
      };
    }
    this.worker.postMessage(message);
  }
}

// Mesh data for a grid (three-free, like terrainMesh.js): a vertex per sample, colored by biome
// or else by height, in feet relative to `origin`.
export function previewMesh(grid, origin) {
  const { x0, z0, stepFt, nx, nz, heights } = grid;
  const positions = new Float32Array(nx * nz * 3);
  const colors = new Float32Array(nx * nz * 3);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const v = j * nx + i;
      positions.set([x0 + i * stepFt - origin[0], heights[v], z0 + j * stepFt - origin[1]], v * 3);
      colors.set(grid.colors ? [...grid.colors.subarray(v * 3, v * 3 + 3)].map((c) => c / 255) : heightColor(heights[v]), v * 3);
    }
  }
  const indices = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let n = 0;
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const v = j * nx + i;
      indices.set([v, v + nx, v + 1, v + 1, v + nx, v + nx + 1], n);
      n += 6;
    }
  }
  return { positions, colors, indices };
}

// A map-style tint by height (ft): sand at the shore, greens up through the lowlands, browns in the
// hills, grey rock, then snow.
const TINTS = [
  [-60, [0.55, 0.5, 0.38]],
  [6, [0.82, 0.76, 0.55]],
  [20, [0.42, 0.6, 0.3]],
  [300, [0.55, 0.62, 0.33]],
  [1200, [0.58, 0.47, 0.32]],
  [4000, [0.5, 0.48, 0.46]],
  [9000, [0.95, 0.95, 0.97]],
];

export function heightColor(h) {
  if (h <= TINTS[0][0]) return TINTS[0][1];
  for (let k = 1; k < TINTS.length; k++) {
    const [top, rgb] = TINTS[k];
    if (h > top) continue;
    const [bottom, low] = TINTS[k - 1];
    const t = (h - bottom) / (top - bottom);
    return low.map((c, i) => c + (rgb[i] - c) * t);
  }
  return TINTS.at(-1)[1];
}
