import { CELL_FT, TILE_CELLS, WATER_LEVEL, THEME } from "./constants.js";

// Catmull-Rom through p1..p2.
function cr(p0, p1, p2, p3, t) {
  return p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
}

const THEME_BLUR_CELLS = 4;

// The whole loaded world as flat per-cell layers. Tiles are a storage and
// editing unit (see tileCodec.js); in memory the world is one grid so
// everything that reads across a tile seam (height smoothing, theme
// blending, pathing) just works.
//
// Positions are in feet: x east, z south, y up. Cell (gx, gz) covers
// [gx*8, gx*8+8) and its height sits at the cell center.
export class World {
  constructor(cols = 3, rows = 3) {
    this.cols = cols;
    this.rows = rows;
    this.w = cols * TILE_CELLS;
    this.h = rows * TILE_CELLS;
    this.widthFt = this.w * CELL_FT;
    this.depthFt = this.h * CELL_FT;
    const n = this.w * this.h;
    this.height = new Float32Array(n);
    this.terrain = new Uint8Array(n);
    this.forest = new Uint8Array(n); // 0-255 density
    this.theme = new Uint8Array(n);
    this.swamp = new Float32Array(n); // theme, blurred: how swampy a spot looks
    this.objects = []; // {type: "hut", x, z, rot}
    this.waterLevel = WATER_LEVEL;
    this.listeners = new Set();
  }

  index(gx, gz) {
    gx = gx < 0 ? 0 : gx >= this.w ? this.w - 1 : gx;
    gz = gz < 0 ? 0 : gz >= this.h ? this.h - 1 : gz;
    return gz * this.w + gx;
  }

  cellAt(x, z) {
    return this.index(Math.floor(x / CELL_FT), Math.floor(z / CELL_FT));
  }

  // The gameplay ground height: bicubic through the cell-center heights.
  // This is the function the server will need to match exactly, so
  // anything purely cosmetic (render noise) stays out of it.
  heightAt(x, z) {
    const u = x / CELL_FT - 0.5;
    const v = z / CELL_FT - 0.5;
    const i = Math.floor(u);
    const j = Math.floor(v);
    const tu = u - i;
    const tv = v - j;
    const {w, h, height} = this;
    const cx = (k) => Math.min(w - 1, Math.max(0, i - 1 + k));
    const x0 = cx(0), x1 = cx(1), x2 = cx(2), x3 = cx(3);
    const rows = [0, 0, 0, 0];
    for (let r = 0; r < 4; r++) {
      const base = Math.min(h - 1, Math.max(0, j - 1 + r)) * w;
      rows[r] = cr(height[base + x0], height[base + x1], height[base + x2], height[base + x3], tu);
    }
    return cr(rows[0], rows[1], rows[2], rows[3], tv);
  }

  // Ground slope as rise over run.
  slopeAt(x, z, eps = 1) {
    const dx = this.heightAt(x + eps, z) - this.heightAt(x - eps, z);
    const dz = this.heightAt(x, z + eps) - this.heightAt(x, z - eps);
    return Math.hypot(dx, dz) / (2 * eps);
  }

  swampAt(x, z) {
    const u = x / CELL_FT - 0.5;
    const v = z / CELL_FT - 0.5;
    const i = Math.floor(u);
    const j = Math.floor(v);
    const tu = u - i;
    const tv = v - j;
    const s = this.swamp;
    const a = s[this.index(i, j)], b = s[this.index(i + 1, j)];
    const c = s[this.index(i, j + 1)], d = s[this.index(i + 1, j + 1)];
    return (a * (1 - tu) + b * tu) * (1 - tv) + (c * (1 - tu) + d * tu) * tv;
  }

  // Rebuilds the blurred theme field (two box blurs, so roughly a tent).
  refreshThemeField() {
    const {w, h} = this;
    let src = new Float32Array(w * h);
    for (let i = 0; i < src.length; i++) src[i] = this.theme[i] === THEME.swamp ? 1 : 0;
    for (let pass = 0; pass < 2; pass++) {
      src = blurAxis(src, w, h, THEME_BLUR_CELLS, true);
      src = blurAxis(src, w, h, THEME_BLUR_CELLS, false);
    }
    this.swamp.set(src);
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // rect is in cells, inclusive: {x0, z0, x1, z1}. layers names what changed.
  changed(rect, layers) {
    for (const fn of this.listeners) fn(rect, layers);
  }
}

function blurAxis(src, w, h, r, horizontal) {
  const out = new Float32Array(w * h);
  const len = horizontal ? w : h;
  const lines = horizontal ? h : w;
  for (let line = 0; line < lines; line++) {
    const at = (k) => {
      k = k < 0 ? 0 : k >= len ? len - 1 : k;
      return horizontal ? src[line * w + k] : src[k * w + line];
    };
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += at(k);
    for (let k = 0; k < len; k++) {
      out[horizontal ? line * w + k : k * w + line] = sum / (2 * r + 1);
      sum += at(k + r + 1) - at(k - r);
    }
  }
  return out;
}
