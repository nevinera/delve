import { TILE_FT } from "./constants.js";
import { landBlockAt, landPath } from "./paths.js";

// The land's shape: a height every LAND_FT ft across the continent, sculpted on the heights step.
// Everything is sea floor at SEA_FLOOR_FT until it's raised. Sea level is 0, so the coast is
// wherever the ground crosses it, and ground below DEEP_FT is deep ocean, which gets no tiles.
//
// Point (gx, gz) is at continent feet (gx * LAND_FT, gz * LAND_FT). Points are kept in square
// blocks of BLOCK a side (BLOCK_TILES tiles), only where something's been raised. Between points
// the ground follows a Catmull-Rom curve each way, held between its two nearest points, so it
// passes through every point smoothly without overshooting next to a steep step.
//
// The blocks are stored as raw little-endian float32s, a row at a time, at
// places/continents/<continent>/land/<bx>_<bz>.f32.

export const LAND_FT = 32;
export const PER_TILE = TILE_FT / LAND_FT;
export const BLOCK_TILES = 16;
export const BLOCK = PER_TILE * BLOCK_TILES;
export const SEA_FLOOR_FT = -50;
export const DEEP_FT = -30;

export const blockKey = (bx, bz) => (bx + 32768) * 65536 + (bz + 32768);
const blockOf = (key) => [Math.floor(key / 65536) - 32768, (key % 65536) - 32768];

export class LandGrid {
  // blocks: Map of blockKey -> Float32Array(BLOCK * BLOCK).
  constructor(blocks = new Map()) {
    this.blocks = blocks;
    this.last = { key: NaN, block: null };
  }

  // A grid from what a worker was sent: { blocks }, or nothing for all sea floor.
  static from(data) {
    return data instanceof LandGrid ? data : new LandGrid(data?.blocks ?? new Map());
  }

  // What to send a worker: the blocks, which copy across as they are.
  get data() {
    return { blocks: this.blocks };
  }

  // The block holding (bx, bz), or undefined.
  block(bx, bz) {
    const key = blockKey(bx, bz);
    if (this.last.key !== key) this.last = { key, block: this.blocks.get(key) };
    return this.last.block;
  }

  point(gx, gz) {
    const bx = Math.floor(gx / BLOCK);
    const bz = Math.floor(gz / BLOCK);
    const block = this.block(bx, bz);
    return block ? block[(gz - bz * BLOCK) * BLOCK + (gx - bx * BLOCK)] : SEA_FLOOR_FT;
  }

  // Sets a point, making its block when it's the first raised there.
  set(gx, gz, h) {
    const bx = Math.floor(gx / BLOCK);
    const bz = Math.floor(gz / BLOCK);
    let block = this.block(bx, bz);
    if (!block) {
      block = new Float32Array(BLOCK * BLOCK).fill(SEA_FLOOR_FT);
      this.blocks.set(blockKey(bx, bz), block);
      this.last = { key: NaN, block: null };
    }
    block[(gz - bz * BLOCK) * BLOCK + (gx - bx * BLOCK)] = h;
  }

  // The ground at continent feet (x, z).
  heightAt(x, z) {
    const u = x / LAND_FT;
    const v = z / LAND_FT;
    const gx = Math.floor(u);
    const gz = Math.floor(v);
    const [fu, fv] = [u - gx, v - gz];
    const rows = new Array(4);
    for (let j = 0; j < 4; j++) {
      const row = gz - 1 + j;
      rows[j] = curve(this.point(gx - 1, row), this.point(gx, row), this.point(gx + 1, row), this.point(gx + 2, row), fu);
    }
    return curve(rows[0], rows[1], rows[2], rows[3], fv);
  }

  // Every tile with ground above deep ocean in it or on its edge, as "tx,tz" keys.
  tiles() {
    const keys = new Set();
    for (const key of this.blocks.keys()) {
      const [bx, bz] = blockOf(key);
      for (let tz = bz * BLOCK_TILES; tz < (bz + 1) * BLOCK_TILES; tz++) {
        for (let tx = bx * BLOCK_TILES; tx < (bx + 1) * BLOCK_TILES; tx++) {
          if (this.tileMapped(tx, tz)) keys.add(`${tx},${tz}`);
        }
      }
    }
    // Tiles on a block's edge can be mapped by ground just across it, in a neighbour that's all
    // sea floor; those are found from the other side.
    for (const key of [...keys]) {
      const [tx, tz] = key.split(",").map(Number);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        if (!keys.has(`${tx + dx},${tz + dz}`) && this.tileMapped(tx + dx, tz + dz)) keys.add(`${tx + dx},${tz + dz}`);
      }
    }
    return keys;
  }

  tileMapped(tx, tz) {
    for (let gz = tz * PER_TILE - 1; gz <= (tz + 1) * PER_TILE + 1; gz++) {
      for (let gx = tx * PER_TILE - 1; gx <= (tx + 1) * PER_TILE + 1; gx++) if (this.point(gx, gz) >= DEEP_FT) return true;
    }
    return false;
  }

  // A number that changes whenever any height does.
  hash() {
    let h = 0x811c9dc5;
    for (const key of [...this.blocks.keys()].sort((a, b) => a - b)) {
      h = Math.imul(h ^ key, 0x01000193);
      const words = new Int32Array(this.blocks.get(key).buffer);
      for (let i = 0; i < words.length; i++) h = Math.imul(h ^ words[i], 0x01000193);
    }
    return h >>> 0;
  }
}

// A Catmull-Rom curve through p1 (t = 0) and p2 (t = 1), held between them.
function curve(p0, p1, p2, p3, t) {
  const v = p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
  return Math.max(Math.min(p1, p2), Math.min(Math.max(p1, p2), v));
}

export { landPath };

// The continent's land from the world's files (a Map of path -> bytes).
export function loadLand(files, continent) {
  const blocks = new Map();
  for (const [path, bytes] of files) {
    const at = landBlockAt(path);
    if (!at || at.continent !== continent || bytes.length !== BLOCK * BLOCK * 4) continue;
    const block = new Float32Array(BLOCK * BLOCK);
    new Uint8Array(block.buffer).set(bytes);
    blocks.set(blockKey(at.bx, at.bz), block);
  }
  return new LandGrid(blocks);
}

// Writes the land's blocks to the world's files, dropping files for blocks it no longer has.
export function saveLand(files, continent, land) {
  for (const path of [...files.keys()]) {
    const at = landBlockAt(path);
    if (at && at.continent === continent && !land.blocks.has(blockKey(at.bx, at.bz))) files.delete(path);
  }
  for (const [key, block] of land.blocks) {
    const [bx, bz] = blockOf(key);
    files.set(landPath(continent, bx, bz), new Uint8Array(block.buffer.slice(0)));
  }
}

// Points (as [gx, gz]) whose heights differ between two grids, within blocks either has.
export function changedPoints(a, b) {
  const out = [];
  for (const key of new Set([...a.blocks.keys(), ...b.blocks.keys()])) {
    const [bx, bz] = blockOf(key);
    const [pa, pb] = [a.blocks.get(key), b.blocks.get(key)];
    for (let k = 0; k < BLOCK * BLOCK; k++) {
      if ((pa ? pa[k] : SEA_FLOOR_FT) !== (pb ? pb[k] : SEA_FLOOR_FT)) out.push([bx * BLOCK + (k % BLOCK), bz * BLOCK + Math.floor(k / BLOCK)]);
    }
  }
  return out;
}

// The span of the blocks, in continent feet [x0, z0, x1, z1], or null with none.
export function landBounds(land) {
  if (!land.blocks.size) return null;
  const blocks = [...land.blocks.keys()].map(blockOf);
  const side = BLOCK * LAND_FT;
  return [Math.min(...blocks.map((b) => b[0])) * side, Math.min(...blocks.map((b) => b[1])) * side, (Math.max(...blocks.map((b) => b[0])) + 1) * side, (Math.max(...blocks.map((b) => b[1])) + 1) * side];
}
