import { LAND_FT, landBounds } from "../world/landGrid.js";

// Pictures of a land grid without a GPU, for script/bones.mjs: a map from straight above, and a
// view from anywhere, drawn triangle by triangle. Each returns { width, height, rgb }, three
// bytes a pixel, row by row from the top left.
//
// The ground's coloured by height, as "earth" (lowland greens up through browns and greys to snow)
// or "heat" (the heights step's heat map), lit from the north-west. The sea's drawn over it,
// clearer where it's shallow.

const LIGHT = normalize([-1, 1.1, -0.7]);
const SKY = [168, 196, 222];
const SEA = [38, 92, 150];
const SEA_SHALLOW = [70, 170, 180];
const GRID_LINE = [255, 255, 255];
const LABEL = [20, 20, 20];

const EARTH = [
  [0, [196, 186, 140]],
  [6, [120, 160, 80]],
  [200, [80, 135, 60]],
  [600, [130, 140, 80]],
  [1100, [140, 115, 85]],
  [1800, [125, 115, 110]],
  [2600, [165, 160, 160]],
  [3200, [245, 245, 250]],
];
const HEAT = [
  [0.19, 0.07, 0.23],
  [0.27, 0.45, 0.93],
  [0.1, 0.81, 0.8],
  [0.45, 0.95, 0.35],
  [0.96, 0.84, 0.22],
  [0.92, 0.36, 0.08],
  [0.6, 0.06, 0.03],
  [0.98, 0.92, 0.92],
].map((c) => c.map((v) => v * 255));
const HEAT_TOP_FT = 21120;

// The ground's colour at height h, unlit.
function groundColor(h, colors) {
  if (h < 0) return [150, 140, 120];
  if (colors === "heat") {
    const f = Math.min(1, Math.log(1 + h / 20) / Math.log(1 + HEAT_TOP_FT / 20)) * 7;
    const k = Math.min(6, Math.floor(f));
    return mix(HEAT[k], HEAT[k + 1], f - k);
  }
  for (let i = 1; i < EARTH.length; i++) {
    if (h < EARTH[i][0]) return mix(EARTH[i - 1][1], EARTH[i][1], (h - EARTH[i - 1][0]) / (EARTH[i][0] - EARTH[i - 1][0]));
  }
  return EARTH[EARTH.length - 1][1];
}

// The sea over ground `depth` ft below it.
function underSea(ground, depth) {
  const clear = Math.exp(-depth / 25);
  return mix(mix(SEA, SEA_SHALLOW, clear), ground, clear * 0.5);
}

// The height at (x, z), between the grid's points: plain bilinear, quicker than heightAt.
function sampler(grid) {
  return (x, z) => {
    const [u, v] = [x / LAND_FT, z / LAND_FT];
    const [gx, gz] = [Math.floor(u), Math.floor(v)];
    const [fu, fv] = [u - gx, v - gz];
    const a = grid.point(gx, gz);
    const b = grid.point(gx + 1, gz);
    const c = grid.point(gx, gz + 1);
    const d = grid.point(gx + 1, gz + 1);
    return a + (b - a) * fu + (c - a) * fv + (a - b - c + d) * fu * fv;
  };
}

// The land from straight above, north up, over `bounds` ([x0, z0, x1, z1] ft; all the land by
// default), `width` pixels across. Grid lines every `gridFt` ft are labelled with their x and z
// in thousands of feet, and `contourFt` draws height lines.
export function renderMap(grid, { bounds = paddedBounds(grid), width = 1200, colors = "earth", gridFt = 5000, contourFt = 0 } = {}) {
  const [x0, z0, x1, z1] = bounds;
  const ftPerPx = (x1 - x0) / width;
  const height = Math.round((z1 - z0) / ftPerPx);
  const rgb = new Uint8Array(width * height * 3);
  const at = sampler(grid);
  const step = Math.max(LAND_FT, ftPerPx);
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const [x, z] = [x0 + (px + 0.5) * ftPerPx, z0 + (py + 0.5) * ftPerPx];
      const h = at(x, z);
      const n = normalize([at(x - step, z) - at(x + step, z), 2 * step, at(x, z - step) - at(x, z + step)]);
      let c = scale(groundColor(h, colors), 0.45 + 0.65 * Math.max(0, dot(n, LIGHT)));
      if (h < 0) c = underSea(c, -h);
      if (contourFt && h > 0 && Math.floor(h / contourFt) !== Math.floor(at(x + ftPerPx, z) / contourFt)) c = scale(c, 0.6);
      if (contourFt && h > 0 && Math.floor(h / contourFt) !== Math.floor(at(x, z + ftPerPx) / contourFt)) c = scale(c, 0.6);
      rgb.set(c.map(Math.round), (py * width + px) * 3);
    }
  }
  if (gridFt) drawGrid(rgb, width, height, bounds, gridFt);
  return { width, height, rgb, ftPerPx };
}

// The land as seen from `eye` ([x, y, z] ft) looking at `at`, with heights drawn `exaggerate`
// times as tall. `stride` grid points make each triangle's side; more is quicker and coarser.
export function renderView(grid, { eye, at, fov = 50, width = 1200, height = 800, colors = "earth", exaggerate = 1, stride = 1 } = {}) {
  const fwd = normalize(sub(at, eye));
  const right = normalize(cross(fwd, [0, 1, 0]));
  const up = cross(right, fwd);
  const f = height / 2 / Math.tan((fov * Math.PI) / 360);
  const near = 1;
  const rgb = new Uint8Array(width * height * 3);
  const depth = new Float32Array(width * height).fill(Infinity);

  // Every grid point (at the stride) placed on screen and lit.
  const bounds = paddedBounds(grid);
  const [gx0, gz0] = [Math.floor(bounds[0] / LAND_FT), Math.floor(bounds[1] / LAND_FT)];
  const cols = Math.floor((bounds[2] - bounds[0]) / LAND_FT / stride) + 1;
  const rows = Math.floor((bounds[3] - bounds[1]) / LAND_FT / stride) + 1;
  const sx = new Float32Array(cols * rows);
  const sy = new Float32Array(cols * rows);
  const sz = new Float32Array(cols * rows);
  const color = new Float32Array(cols * rows * 3);
  const h = (gx, gz) => grid.point(gx, gz) * exaggerate;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const [gx, gz] = [gx0 + c * stride, gz0 + r * stride];
      const y = h(gx, gz);
      const v = sub([gx * LAND_FT, y, gz * LAND_FT], eye);
      const k = r * cols + c;
      sz[k] = dot(v, fwd);
      sx[k] = width / 2 + (dot(v, right) / sz[k]) * f;
      sy[k] = height / 2 - (dot(v, up) / sz[k]) * f;
      const n = normalize([h(gx - stride, gz) - h(gx + stride, gz), 2 * stride * LAND_FT, h(gx, gz - stride) - h(gx, gz + stride)]);
      color.set(scale(groundColor(y / exaggerate, colors), 0.45 + 0.65 * Math.max(0, dot(n, LIGHT))), k * 3);
    }
  }

  const triangle = (a, b, c) => {
    if (sz[a] < near || sz[b] < near || sz[c] < near) return;
    const [ax, ay, bx, by, cx, cy] = [sx[a], sy[a], sx[b], sy[b], sx[c], sy[c]];
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (!area) return;
    const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(ax, bx, cx)));
    const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(ay, by, cy)));
    const [ia, ib, ic] = [1 / sz[a], 1 / sz[b], 1 / sz[c]];
    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const [x, y] = [px + 0.5, py + 0.5];
        const wa = ((bx - x) * (cy - y) - (by - y) * (cx - x)) / area;
        const wb = ((cx - x) * (ay - y) - (cy - y) * (ax - x)) / area;
        const wc = 1 - wa - wb;
        if (wa < 0 || wb < 0 || wc < 0) continue;
        const z = 1 / (wa * ia + wb * ib + wc * ic);
        const p = py * width + px;
        if (z >= depth[p]) continue;
        depth[p] = z;
        for (let m = 0; m < 3; m++) rgb[p * 3 + m] = (wa * ia * color[a * 3 + m] + wb * ib * color[b * 3 + m] + wc * ic * color[c * 3 + m]) * z;
      }
    }
  };
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const k = r * cols + c;
      triangle(k, k + cols, k + 1);
      triangle(k + 1, k + cols, k + cols + 1);
    }
  }

  // The sea, the sky, and haze with distance.
  const far = Math.hypot(bounds[2] - bounds[0], bounds[3] - bounds[1]) * 4;
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const p = py * width + px;
      const ray = normalize(add(fwd, add(scale(right, (px + 0.5 - width / 2) / f), scale(up, (height / 2 - py - 0.5) / f))));
      const along = dot(ray, fwd);
      const seaZ = ray[1] < 0 ? (-eye[1] / ray[1]) * along : Infinity;
      let c = depth[p] < Infinity ? [rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2]] : null;
      let z = depth[p];
      if (seaZ < z) {
        // How deep the ground is under the water here, roughly, from how far past the surface it lies.
        // Past the land's blocks it's open sea over the sea floor.
        const below = c ? ((z - seaZ) / along) * -ray[1] : 50 * exaggerate;
        c = underSea(c ?? groundColor(-50, colors), below / exaggerate);
        z = seaZ;
      }
      if (!c) c = mix(SKY, [230, 236, 240], Math.max(0, 1 - Math.abs(ray[1]) * 4));
      else c = mix(c, SKY, Math.min(0.5, (z / far) ** 1.5));
      rgb.set(c.map(Math.round), p * 3);
    }
  }
  return { width, height, rgb };
}

// The land's blocks, with a little sea around.
export function paddedBounds(grid) {
  const bounds = landBounds(grid);
  if (!bounds) throw new Error("there's no land to draw");
  // Trim to the points above deep water, which the blocks hold plenty of.
  let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let gz = bounds[1] / LAND_FT; gz < bounds[3] / LAND_FT; gz += 4) {
    for (let gx = bounds[0] / LAND_FT; gx < bounds[2] / LAND_FT; gx += 4) {
      if (grid.point(gx, gz) < -30) continue;
      [x0, z0, x1, z1] = [Math.min(x0, gx), Math.min(z0, gz), Math.max(x1, gx), Math.max(z1, gz)];
    }
  }
  if (x0 === Infinity) return bounds;
  const pad = Math.max(x1 - x0, z1 - z0) * LAND_FT * 0.04 + 1000;
  return [x0 * LAND_FT - pad, z0 * LAND_FT - pad, x1 * LAND_FT + pad, z1 * LAND_FT + pad];
}

// --- the map's grid and its labels ---

function drawGrid(rgb, width, height, [x0, z0, x1, z1], every) {
  const ftPerPx = (x1 - x0) / width;
  const put = (px, py, c, a) => {
    if (px < 0 || py < 0 || px >= width || py >= height) return;
    const k = (py * width + px) * 3;
    for (let m = 0; m < 3; m++) rgb[k + m] = rgb[k + m] + (c[m] - rgb[k + m]) * a;
  };
  for (let x = Math.ceil(x0 / every) * every; x <= x1; x += every) {
    const px = Math.round((x - x0) / ftPerPx);
    for (let py = 0; py < height; py++) put(px, py, GRID_LINE, 0.35);
    label(put, `${x / 1000}`, px + 3, 3);
  }
  for (let z = Math.ceil(z0 / every) * every; z <= z1; z += every) {
    const py = Math.round((z - z0) / ftPerPx);
    for (let px = 0; px < width; px++) put(px, py, GRID_LINE, 0.35);
    label(put, `${z / 1000}`, 3, py + 3);
  }
}

// 3x5 digits, a minus and a point, drawn twice size on a pale box.
const GLYPHS = {
  0: "111101101101111", 1: "010110010010111", 2: "111001111100111", 3: "111001111001111", 4: "101101111001001",
  5: "111100111001111", 6: "111100111101111", 7: "111001001001001", 8: "111101111101111", 9: "111101111001111",
  "-": "000000111000000", ".": "000000000000010",
};

function label(put, text, x, y) {
  const w = text.length * 8 + 2;
  for (let j = -1; j < 11; j++) for (let i = -1; i < w; i++) put(x + i, y + j, [255, 255, 255], 0.7);
  [...text].forEach((ch, n) => {
    const glyph = GLYPHS[ch];
    if (!glyph) return;
    for (let k = 0; k < 15; k++) {
      if (glyph[k] !== "1") continue;
      const [gx, gy] = [x + n * 8 + (k % 3) * 2, y + Math.floor(k / 3) * 2];
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) put(gx + dx, gy + dy, LABEL, 1);
    }
  });
}

// --- vectors ---

function mix(a, b, t) {
  return a.map((v, i) => v + (b[i] - v) * t);
}
function scale(a, s) {
  return a.map((v) => v * s);
}
function add(a, b) {
  return a.map((v, i) => v + b[i]);
}
function sub(a, b) {
  return a.map((v, i) => v - b[i]);
}
function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function normalize(a) {
  const l = Math.hypot(...a);
  return a.map((v) => v / l);
}
