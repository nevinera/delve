import { CELL_FT } from "../world/constants.js";

export const NAV_FT = 2;
export const BLOCKED = 0;
export const WALK = 1;
export const WADE = 2;

export const MAX_SLOPE = 0.9; // rise over run, about 42 degrees
export const MAX_WADE_DEPTH = 3.5;
const WADE_DEPTH = 0.5;

// The movement grid: every 2ft square is blocked, walkable or wadeable,
// plus how far it is from anything blocked (so a big unit can ask "do I
// fit here?" without a separate grid per size) and how tall any solid
// structure on it is (for line of sight).
export class NavGrid {
  constructor(world) {
    this.world = world;
    this.w = world.widthFt / NAV_FT;
    this.h = world.depthFt / NAV_FT;
    const n = this.w * this.h;
    this.walk = new Uint8Array(n);
    this.clearance = new Float32Array(n); // feet from this square's center to the nearest blocked edge
    this.occluder = new Float32Array(n); // top of a solid structure, or 0
    this.version = 0;
  }

  build(blockers) {
    this.update({x0: 0, z0: 0, x1: this.w - 1, z1: this.h - 1}, blockers);
  }

  // rect is in nav squares, inclusive.
  update(rect, blockers) {
    const {world, w} = this;
    const water = world.waterLevel;
    const x0 = Math.max(0, rect.x0), z0 = Math.max(0, rect.z0);
    const x1 = Math.min(this.w - 1, rect.x1), z1 = Math.min(this.h - 1, rect.z1);
    // Corner heights, shared between neighbouring squares.
    const cw = x1 - x0 + 2;
    const corners = new Float32Array(cw * (z1 - z0 + 2));
    for (let z = z0; z <= z1 + 1; z++) {
      for (let x = x0; x <= x1 + 1; x++) corners[(z - z0) * cw + (x - x0)] = world.heightAt(x * NAV_FT, z * NAV_FT);
    }
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const k = (z - z0) * cw + (x - x0);
        const a = corners[k], b = corners[k + 1], c = corners[k + cw], d = corners[k + cw + 1];
        const gx = (b + d - a - c) / (2 * NAV_FT);
        const gz = (c + d - a - b) / (2 * NAV_FT);
        const depth = water - (a + b + c + d) / 4;
        const i = z * w + x;
        this.occluder[i] = 0;
        if (Math.hypot(gx, gz) > MAX_SLOPE || depth > MAX_WADE_DEPTH) this.walk[i] = BLOCKED;
        else this.walk[i] = depth > WADE_DEPTH ? WADE : WALK;
      }
    }
    const ft = {x0: x0 * NAV_FT, z0: z0 * NAV_FT, x1: (x1 + 1) * NAV_FT, z1: (z1 + 1) * NAV_FT};
    for (const b of blockers) {
      if (blockerOverlaps(b, ft)) this.stamp(b, x0, z0, x1, z1);
    }
    this.computeClearance();
    this.version++;
  }

  stamp(b, rx0, rz0, rx1, rz1) {
    const reach = b.shape === "circle" ? b.r : Math.hypot(b.hw, b.hd);
    const x0 = Math.max(rx0, Math.floor((b.x - reach) / NAV_FT));
    const x1 = Math.min(rx1, Math.floor((b.x + reach) / NAV_FT));
    const z0 = Math.max(rz0, Math.floor((b.z - reach) / NAV_FT));
    const z1 = Math.min(rz1, Math.floor((b.z + reach) / NAV_FT));
    const c = Math.cos(b.rot || 0), s = Math.sin(b.rot || 0);
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const px = (x + 0.5) * NAV_FT - b.x;
        const pz = (z + 0.5) * NAV_FT - b.z;
        let inside;
        if (b.shape === "circle") {
          inside = px * px + pz * pz <= (b.r + NAV_FT / 2) ** 2;
        } else {
          // world -> local, the inverse of three's rotation.y
          const lx = px * c - pz * s;
          const lz = px * s + pz * c;
          inside = Math.abs(lx) <= b.hw + NAV_FT / 2 && Math.abs(lz) <= b.hd + NAV_FT / 2;
        }
        if (!inside) continue;
        const i = z * this.w + x;
        this.walk[i] = BLOCKED;
        if (b.top) this.occluder[i] = Math.max(this.occluder[i], b.top);
      }
    }
  }

  // Two-pass chamfer distance transform (3-4 weights), with the world's
  // edge counting as blocked.
  computeClearance() {
    const {w, h, walk, clearance: d} = this;
    const INF = 1e9;
    for (let i = 0; i < d.length; i++) d[i] = walk[i] === BLOCKED ? 0 : INF;
    const at = (x, z) => (x < 0 || z < 0 || x >= w || z >= h ? 0 : d[z * w + x]);
    for (let z = 0; z < h; z++) {
      for (let x = 0; x < w; x++) {
        const i = z * w + x;
        if (d[i] === 0) continue;
        d[i] = Math.min(d[i], at(x - 1, z) + 3, at(x, z - 1) + 3, at(x - 1, z - 1) + 4, at(x + 1, z - 1) + 4);
      }
    }
    for (let z = h - 1; z >= 0; z--) {
      for (let x = w - 1; x >= 0; x--) {
        const i = z * w + x;
        if (d[i] === 0) continue;
        d[i] = Math.min(d[i], at(x + 1, z) + 3, at(x, z + 1) + 3, at(x + 1, z + 1) + 4, at(x - 1, z + 1) + 4);
      }
    }
    // squares -> feet, measured to the blocked square's edge rather than its center
    for (let i = 0; i < d.length; i++) d[i] = d[i] === 0 ? 0 : (d[i] / 3) * NAV_FT - NAV_FT / 2;
  }

  squareAt(x, z) {
    const sx = Math.floor(x / NAV_FT);
    const sz = Math.floor(z / NAV_FT);
    if (sx < 0 || sz < 0 || sx >= this.w || sz >= this.h) return -1;
    return sz * this.w + sx;
  }

  canStand(x, z, radius) {
    const i = this.squareAt(x, z);
    return i >= 0 && this.clearance[i] >= radius;
  }

  // Nav squares a cell-rect edit can affect (bicubic reads 2 cells out).
  static rectForCells(rect) {
    const per = CELL_FT / NAV_FT;
    return {x0: (rect.x0 - 2) * per, z0: (rect.z0 - 2) * per, x1: (rect.x1 + 3) * per - 1, z1: (rect.z1 + 3) * per - 1};
  }
}

function blockerOverlaps(b, ft) {
  const reach = b.shape === "circle" ? b.r : Math.hypot(b.hw, b.hd);
  return b.x + reach >= ft.x0 && b.x - reach <= ft.x1 && b.z + reach >= ft.z0 && b.z - reach <= ft.z1;
}
