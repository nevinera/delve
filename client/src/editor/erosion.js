import { LAND_FT } from "../world/landGrid.js";

// Erosion over part of a land grid (world/landGrid.js), each returning the changes it makes,
// [[gx, gz, h], ...], as sculptTools.js does. `region` is a brush, { x, z, radius } in continent
// feet, working most at its middle and easing to nothing at its edge, or a box of grid points
// (see area()).
//
// - slump: ground steeper than `talus` degrees slides down to its lower neighbours, a little way
//   toward resting each pass, leaving scree slopes at the foot of cliffs and softening ridges.
// - water: raindrops land at random in the region and run downhill, picking up ground where they
//   speed up and dropping it where they slow, fill a hollow or reach the sea. Many drops cut
//   gullies and valleys and spread fans below them. After Hans Theobald Beyer's droplet model,
//   as in Sebastian Lague's hydraulic erosion, worked in grid cells, heights included.

const RAIN = {
  inertia: 0.05, // how much a drop keeps its heading rather than turning downhill
  capacity: 4, // sediment a drop can carry, per unit of speed, water and drop
  size: 0.02, // of Beyer's drop, since our slopes are far steeper than his
  minCapacity: 0.01,
  erode: 0.3, // of the room to carry more, taken each step
  deposit: 0.3, // of the excess, dropped each step
  evaporate: 0.02,
  gravity: 4,
  steps: 40,
  reach: 2, // cells around a drop that it wears away
};

// The region's points and weights, and the box around it with `margin` cells to spare. A region
// is a circle, { x, z, radius }, or a box of grid points, { gx0, gz0, gx1, gz1 }, with an optional
// weight(x, z) from 0 to 1 (1 everywhere by default). Points are `spacing` ft apart.
function area(region, margin, spacing) {
  if (region.radius === undefined) {
    const box = { gx0: region.gx0 - margin, gz0: region.gz0 - margin, size: Math.max(region.gx1 - region.gx0, region.gz1 - region.gz0) + 1 + 2 * margin };
    const weights = new Float32Array(box.size * box.size);
    for (let j = margin; j < box.size - margin; j++) {
      for (let i = margin; i < box.size - margin; i++) {
        const [gx, gz] = [box.gx0 + i, box.gz0 + j];
        if (gx <= region.gx1 && gz <= region.gz1) weights[j * box.size + i] = region.weight ? region.weight(gx * spacing, gz * spacing) : 1;
      }
    }
    return { box, weights };
  }
  const { x, z, radius } = region;
  const reach = Math.ceil(radius / spacing);
  const [cx, cz] = [Math.round(x / spacing), Math.round(z / spacing)];
  const box = { gx0: cx - reach - margin, gz0: cz - reach - margin, size: 2 * (reach + margin) + 1 };
  const weights = new Float32Array(box.size * box.size);
  for (let j = 0; j < box.size; j++) {
    for (let i = 0; i < box.size; i++) {
      const d = Math.hypot((box.gx0 + i) * spacing - x, (box.gz0 + j) * spacing - z) / radius;
      if (d < 1) weights[j * box.size + i] = 0.5 + 0.5 * Math.cos(Math.PI * d);
    }
  }
  return { box, weights };
}

// The box's heights from the grid, in ft.
function read(grid, { gx0, gz0, size }) {
  const heights = new Float64Array(size * size);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) heights[j * size + i] = grid.point(gx0 + i, gz0 + j);
  return heights;
}

// The changes between the box's heights in the grid and `heights`.
function changes(grid, { gx0, gz0, size }, heights) {
  const out = [];
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const h = heights[j * size + i];
      if (Math.abs(h - grid.point(gx0 + i, gz0 + j)) > 1e-4) out.push([gx0 + i, gz0 + j, h]);
    }
  }
  return out;
}

const AROUND = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// Slumping, `passes` times over (a fraction does a partial pass). The grid's points are `spacing`
// ft apart, a land grid's by default.
export function slump(grid, region, { talus = 35, passes = 1, spacing = LAND_FT } = {}) {
  const { box, weights } = area(region, 1, spacing);
  const heights = read(grid, box);
  const limit = Math.tan((talus * Math.PI) / 180) * spacing;
  for (let left = passes; left > 0; left--) slumpPass(box.size, heights, weights, limit, Math.min(1, left));
  return changes(grid, box, heights);
}

function slumpPass(size, heights, weights, limit, rate) {
  const moved = new Float64Array(heights.length);
  for (let j = 1; j < size - 1; j++) {
    for (let i = 1; i < size - 1; i++) {
      const k = j * size + i;
      const w = weights[k];
      if (!w) continue;
      let [most, total] = [0, 0];
      const excess = AROUND.map(([di, dj]) => {
        const e = heights[k] - heights[k + dj * size + di] - limit * Math.hypot(di, dj);
        if (e <= 0) return 0;
        [most, total] = [Math.max(most, e), total + e];
        return e;
      });
      if (!total) continue;
      // Half the steepest excess would bring that slope to resting.
      const move = 0.5 * most * Math.min(1, rate * w);
      moved[k] -= move;
      AROUND.forEach(([di, dj], n) => excess[n] && (moved[k + dj * size + di] += (move * excess[n]) / total));
    }
  }
  for (let k = 0; k < heights.length; k++) heights[k] += moved[k];
}

// `drops` raindrops over the region, each `size` times as heavy as a brush's. `random` gives
// numbers from 0 to 1, Math.random by default. The grid's points are `spacing` ft apart.
export function rain(grid, region, { drops, size: heavy = 1, random = Math.random, spacing = LAND_FT } = {}) {
  const { box, weights } = area(region, RAIN.reach + 1, spacing);
  const { size } = box;
  // Worked in cells: heights too, so slopes come out as they are.
  const heights = read(grid, box).map((h) => h / spacing);
  const wear = wearKernel(RAIN.reach);
  const at = (x, z) => {
    const [i, j] = [Math.floor(x), Math.floor(z)];
    const [u, v] = [x - i, z - j];
    const k = j * size + i;
    const [a, b, c, d] = [heights[k], heights[k + 1], heights[k + size], heights[k + size + 1]];
    const w = weights[k] * (1 - u) * (1 - v) + weights[k + 1] * u * (1 - v) + weights[k + size] * (1 - u) * v + weights[k + size + 1] * u * v;
    return { k, u, v, w, h: a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v, gx: (b - a) * (1 - v) + (d - c) * v, gz: (c - a) * (1 - u) + (d - b) * u };
  };
  const inside = (x, z) => x >= RAIN.reach && z >= RAIN.reach && x < size - RAIN.reach - 1 && z < size - RAIN.reach - 1;
  const drop = (cell, amount) => {
    const { k, u, v } = cell;
    heights[k] += amount * (1 - u) * (1 - v);
    heights[k + 1] += amount * u * (1 - v);
    heights[k + size] += amount * (1 - u) * v;
    heights[k + size + 1] += amount * u * v;
  };

  for (let n = 0; n < drops; n++) {
    let [x, z] = [random() * (size - 1), random() * (size - 1)];
    if (!inside(x, z) || random() > weights[Math.round(z) * size + Math.round(x)]) continue;
    let [dx, dz, speed, water, load] = [0, 0, 1, 1, 0];
    for (let step = 0; step < RAIN.steps; step++) {
      const here = at(x, z);
      // It ends in the sea.
      if (here.h < 0 || !here.w) break;
      dx = dx * RAIN.inertia - here.gx * (1 - RAIN.inertia);
      dz = dz * RAIN.inertia - here.gz * (1 - RAIN.inertia);
      const length = Math.hypot(dx, dz);
      if (!length) break;
      [dx, dz] = [dx / length, dz / length];
      const [nx, nz] = [x + dx, z + dz];
      if (!inside(nx, nz)) break;
      const rise = at(nx, nz).h - here.h;
      // It carries less toward the region's edge, so it sheds its load on the way out.
      const room = Math.max(-rise * speed * water * RAIN.capacity, RAIN.minCapacity) * RAIN.size * heavy * here.w;
      if (load > room || rise > 0) {
        // Uphill it fills the hollow it's in; otherwise it sheds what it can't carry.
        const amount = rise > 0 ? Math.min(rise, load) : (load - room) * RAIN.deposit;
        load -= amount;
        drop(here, amount);
      } else {
        // Never digs deeper than the drop ahead, so it doesn't leave pits.
        const amount = Math.min((room - load) * RAIN.erode, -rise);
        const [ci, cj] = [Math.floor(x), Math.floor(z)];
        for (const [di, dj, share] of wear) {
          const k = (cj + dj) * size + ci + di;
          const take = amount * share * weights[k];
          heights[k] -= take;
          load += take;
        }
      }
      speed = Math.sqrt(Math.max(0, speed * speed - rise * RAIN.gravity));
      water *= 1 - RAIN.evaporate;
      [x, z] = [nx, nz];
    }
    // Whatever it still carries settles where it ends.
    if (load) drop(at(x, z), load);
  }
  return changes(grid, box, heights.map((h) => h * spacing));
}

// The cells around a drop it wears away, and each one's share, closer ones more.
function wearKernel(reach) {
  const cells = [];
  for (let dj = -reach; dj <= reach + 1; dj++) {
    for (let di = -reach; di <= reach + 1; di++) {
      const w = Math.max(0, reach - Math.hypot(di - 0.5, dj - 0.5));
      if (w > 0) cells.push([di, dj, w]);
    }
  }
  const total = cells.reduce((sum, c) => sum + c[2], 0);
  return cells.map(([di, dj, w]) => [di, dj, w / total]);
}
