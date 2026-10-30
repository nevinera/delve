import { CELL_FT, TILE_FT } from "../v2/sizes.js";

// A stroke drawn on the ground, like with a marker: the points it passed through, [x, z]
// continent feet. Its points start a cell apart. When there'd be more than STROKE_MAX_POINTS,
// every other one's dropped and the rest are kept twice as far apart, up to a tile apart. It stops
// growing once it's STROKE_MAX_FT long.

export const STROKE_MAX_FT = 42240; // 8 miles
export const STROKE_MAX_POINTS = 1024;

export class Stroke {
  constructor(x, z) {
    this.points = [[x, z]];
    this.step = CELL_FT; // how far apart its points are kept
    this.length = 0; // how far the pointer's gone, in ft
    this.full = false; // whether it's as long as a stroke goes
    this.at = [x, z]; // where the pointer is
  }

  // Carries the stroke on to (x, z).
  add(x, z) {
    if (this.full) return;
    const [ax, az] = this.at;
    let d = Math.hypot(x - ax, z - az);
    if (!d) return;
    if (this.length + d >= STROKE_MAX_FT) {
      const t = (STROKE_MAX_FT - this.length) / d;
      [x, z, d] = [ax + (x - ax) * t, az + (z - az) * t, STROKE_MAX_FT - this.length];
      this.full = true;
    }
    // Along the way, a point each `step` from the last one kept.
    const parts = Math.ceil(d / (this.step / 4));
    for (let k = 1; k <= parts; k++) {
      const [px, pz] = [ax + ((x - ax) * k) / parts, az + ((z - az) * k) / parts];
      const [lx, lz] = this.points.at(-1);
      if (Math.hypot(px - lx, pz - lz) < this.step) continue;
      this.points.push([px, pz]);
      if (this.points.length > STROKE_MAX_POINTS && this.step < TILE_FT) {
        this.points = this.points.filter((_, i) => i % 2 === 0);
        this.step *= 2;
      }
    }
    this.length += d;
    this.at = [x, z];
    if (this.full) this.end();
  }

  // Ends the stroke where the pointer is.
  end() {
    const [lx, lz] = this.points.at(-1);
    if (lx !== this.at[0] || lz !== this.at[1]) this.points.push([...this.at]);
  }
}
