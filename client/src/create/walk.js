import { CASCADE_STEEP } from "../v2/courses.js";
import { CELL_FT, TILE_FT } from "../v2/sizes.js";
import { SWIM_FT } from "./builder.js";
import { WALK_DEG } from "./growth.js";

// Planning's path tool's search: the shortest way on foot or swimming from one point to another,
// no longer than `most` ft, over the ground's cells. A step's to one of the 8 cells round a cell,
// CELL_FT straight or about 1.41 of that across. It's walked onto a cell whose face is no steeper
// than WALK_DEG, whichever way it's crossed, climbing or dropping no more than that face would
// across CELL_FT; or swum where both cells' water is deeper than SWIM_FT: swimmers are at its
// surface, so getting out wants a bank near its level, and they can swim down a cascade or a falls
// but not up one, where its surface rises more steeply than CASCADE_STEEP. Where there are no tiles is open sea. It's
// searched a few thousand cells at a time (step()), nearest first by how far they are on foot and
// how far they'd still be in a straight line (A*), so it spreads from the start like water, leaning
// toward the end, and it's done when it gets there or nothing's left that could within `most`.
// Each tile it reaches is kept, in TILE_BYTES, as it reads it; it gives up past MOST_TILES.

const TILE_CELLS = TILE_FT / CELL_FT;
const CELLS = TILE_CELLS * TILE_CELLS;
const CORNERS = TILE_CELLS + 1;
// The 8 steps: [di, dj, how far, in half feet]: 8 straight, 11 across, about 8 × 1.41.
const STEPS = [
  [1, 0, 8],
  [-1, 0, 8],
  [0, 1, 8],
  [0, -1, 8],
  [1, 1, 11],
  [-1, -1, 11],
  [1, -1, 11],
  [-1, 1, 11],
];
const HALF_FT = 2; // costs and heights are kept in half feet
const UNSEEN = 0xffff;
const START = 15;
const CLOSED = 0x80;
const DEEP = 0x40;
const STEEP = 0x20; // its face is too steep to walk on
const WAY = 0x0f; // which of STEPS came into a cell
const STEEPEST = Math.tan((WALK_DEG * Math.PI) / 180); // rise over run
const MOST_STEP = CELL_FT * STEEPEST * HALF_FT; // the most a step climbs or drops, in half feet
export const MOST_TILES = 8000;
export const TILE_BYTES = CELLS * 5;

const cellKey = (tx, tz) => (tx + 32768) * 65536 + (tz + 32768);

export class WalkSearch {
  // from and to: continent feet [x, z]; cellsOf(tx, tz): the tile's ground, { heights, CORNERS ×
  // CORNERS corners, water: { level } or null }, null while it's being read, or undefined where
  // there's no tile. onReach(i, j, ft, swum): called for each cell reached, by continent cell,
  // with how far it is on foot and whether it's swum.
  constructor({ from, to, most, cellsOf, onReach = () => {} }) {
    Object.assign(this, { cellsOf, onReach });
    this.most = Math.min(UNSEEN - 1, Math.round(most * HALF_FT));
    this.start = from.map((v) => Math.floor(v / CELL_FT));
    this.end = to.map((v) => Math.floor(v / CELL_FT));
    this.tiles = []; // each tile reached: { tx, tz, height: Int16 half feet, g: Uint16 half feet, way: Uint8 }
    this.slots = new Map(); // cellKey of a tile -> its index in tiles
    this.heap = new Heap();
    this.state = "searching"; // then "found", "none" or "too far"
    this.reached = 0;
    this.path = null;
  }

  // The tile (tx, tz) as kept, kept now if it can be, or null while it's being read.
  tile(tx, tz) {
    const key = cellKey(tx, tz);
    const slot = this.slots.get(key);
    if (slot !== undefined) return this.tiles[slot];
    const cells = this.cellsOf(tx, tz);
    if (cells === null) return null;
    const tile = { tx, tz, slot: this.tiles.length, height: new Int16Array(CELLS), g: new Uint16Array(CELLS).fill(UNSEEN), way: new Uint8Array(CELLS) };
    for (let k = 0; k < CELLS; k++) {
      if (!cells) {
        tile.way[k] = DEEP;
        continue;
      }
      const [i, j] = [k % TILE_CELLS, Math.floor(k / TILE_CELLS)];
      const c = j * CORNERS + i;
      const [nw, ne, sw, se] = [cells.heights[c], cells.heights[c + 1], cells.heights[c + CORNERS], cells.heights[c + CORNERS + 1]];
      const ground = (nw + ne + sw + se) / 4;
      const water = cells.water?.level[k];
      const deep = water - ground > SWIM_FT;
      tile.height[k] = Math.round((deep ? water : ground) * HALF_FT);
      if (deep) tile.way[k] = DEEP;
      else if (Math.hypot(ne + se - nw - sw, sw + se - nw - ne) / (2 * CELL_FT) > STEEPEST) tile.way[k] = STEEP;
    }
    this.slots.set(key, tile.slot);
    this.tiles.push(tile);
    return tile;
  }

  // The tile and the index in it of continent cell (i, j), or null while it's being read.
  at(i, j) {
    const [tx, tz] = [Math.floor(i / TILE_CELLS), Math.floor(j / TILE_CELLS)];
    const tile = this.tile(tx, tz);
    return tile && [tile, (j - tz * TILE_CELLS) * TILE_CELLS + (i - tx * TILE_CELLS)];
  }

  // How far (i, j) is from the end at least, in half feet.
  left(i, j) {
    const [di, dj] = [Math.abs(i - this.end[0]), Math.abs(j - this.end[1])];
    return 8 * Math.max(di, dj) + 3 * Math.min(di, dj);
  }

  // Searches `count` cells more at most. Gives its state, "waiting" while a tile's being read.
  step(count) {
    if (this.state !== "searching") return this.state;
    if (!this.reached && !this.heap.size) {
      const start = this.at(...this.start);
      if (!start) return "waiting";
      const [tile, k] = start;
      tile.g[k] = 0;
      tile.way[k] = (tile.way[k] & (DEEP | STEEP)) | START;
      this.heap.push(tile.slot * CELLS + k, this.left(...this.start));
    }
    for (let n = 0; n < count; n++) {
      if (!this.heap.size) return (this.state = "none");
      const [id, f] = this.heap.pop();
      const tile = this.tiles[Math.floor(id / CELLS)];
      const k = id % CELLS;
      if (tile.way[k] & CLOSED) continue;
      const [i, j] = [tile.tx * TILE_CELLS + (k % TILE_CELLS), tile.tz * TILE_CELLS + Math.floor(k / TILE_CELLS)];
      // Every tile round it read first.
      for (const [di, dj] of STEPS) {
        if (this.at(i + di, j + dj)) continue;
        this.heap.push(id, f);
        return "waiting";
      }
      if (this.tiles.length > MOST_TILES) return (this.state = "too far");
      tile.way[k] |= CLOSED;
      this.reached++;
      this.onReach(i, j, tile.g[k] / HALF_FT, Boolean(tile.way[k] & DEEP));
      if (i === this.end[0] && j === this.end[1]) {
        this.path = this.trace(tile, k, i, j);
        return (this.state = "found");
      }
      const [g, h, deep] = [tile.g[k], tile.height[k], tile.way[k] & DEEP];
      STEPS.forEach(([di, dj, cost], way) => {
        const [next, m] = this.at(i + di, j + dj);
        if (next.way[m] & CLOSED) return;
        const swum = deep && next.way[m] & DEEP;
        if (!swum && (next.way[m] & STEEP || Math.abs(next.height[m] - h) > MOST_STEP)) return;
        if (swum && next.height[m] - h > cost * CASCADE_STEEP) return;
        const to = g + cost;
        const guess = to + this.left(i + di, j + dj);
        if (to >= next.g[m] || guess > this.most) return;
        next.g[m] = to;
        next.way[m] = (next.way[m] & (DEEP | STEEP)) | way;
        this.heap.push(next.slot * CELLS + m, guess);
      });
    }
    return "searching";
  }

  // The way from the start to cell k of `tile`, (i, j), as [{ x, z, swum }, ...] at the middles
  // of the cells where it turns or starts or stops swimming, and its length and how much was swum,
  // in feet: { points, ft, swumFt }.
  trace(tile, k, i, j) {
    const cells = [];
    let [t, m, a, b] = [tile, k, i, j];
    for (;;) {
      const way = t.way[m] & WAY;
      cells.push({ i: a, j: b, swum: Boolean(t.way[m] & DEEP), way });
      if (way === START) break;
      [a, b] = [a - STEPS[way][0], b - STEPS[way][1]];
      [t, m] = this.at(a, b);
    }
    cells.reverse();
    let swumFt = 0;
    cells.forEach((c, n) => n && c.swum && cells[n - 1].swum && (swumFt += (STEPS[c.way][2] / 8) * CELL_FT));
    const points = cells.filter((c, n) => n === 0 || n === cells.length - 1 || c.way !== cells[n + 1].way || c.swum !== cells[n - 1].swum || c.swum !== cells[n + 1].swum);
    return {
      points: points.map(({ i: a, j: b, swum }) => ({ x: (a + 0.5) * CELL_FT, z: (b + 0.5) * CELL_FT, swum })),
      ft: tile.g[k] / HALF_FT,
      swumFt,
    };
  }
}

// A binary heap of ids by their values, lowest first.
class Heap {
  constructor() {
    [this.ids, this.values, this.size] = [[], [], 0];
  }

  push(id, value) {
    let n = this.size++;
    while (n > 0) {
      const up = (n - 1) >> 1;
      if (this.values[up] <= value) break;
      [this.ids[n], this.values[n]] = [this.ids[up], this.values[up]];
      n = up;
    }
    [this.ids[n], this.values[n]] = [id, value];
  }

  pop() {
    const top = [this.ids[0], this.values[0]];
    const [id, value] = [this.ids[--this.size], this.values[this.size]];
    let n = 0;
    for (;;) {
      let child = 2 * n + 1;
      if (child >= this.size) break;
      if (child + 1 < this.size && this.values[child + 1] < this.values[child]) child++;
      if (this.values[child] >= value) break;
      [this.ids[n], this.values[n]] = [this.ids[child], this.values[child]];
      n = child;
    }
    [this.ids[n], this.values[n]] = [id, value];
    this.ids.length = this.values.length = this.size;
    return top;
  }
}
