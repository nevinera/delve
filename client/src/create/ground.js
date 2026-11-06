import * as THREE from "three";
import { disposeGround, groundMaterial } from "../render/groundMaterial.js";
import { WATER_TYPES } from "../v2/water.js";
import { roadSegmentsIn } from "../v2/roads.js";
import { waterMaterial } from "../render/waterMaterial.js";
import { SHORE_FADE_FT, waterLookOf } from "./waterSurface.js";
import { PATTERNS, look, slopeOf } from "../v2/look.js";
import { CELL_CORNERS, TILE_CELLS } from "../v2/plate.js";
import { CORNERS, platterOfPlate } from "../v2/platter.js";
import { CELL_FT, CHUNK_CELLS, CHUNK_FT, PLATE_FT, PLATE_TILES, PLATTER_FT, PLATTER_PLATES, PLATTER_TILES, SEA_LEVEL_FT, TILE_CHUNKS, TILE_FT } from "../v2/sizes.js";
import { withGrid } from "./grid.js";
import { EMPTY_FT } from "./plateEdits.js";

// The ground round the builder, a tile at a time, finer the nearer the tile is to the builder's:
// - within FULL_TILES, drawn in full, smooth-shaded at cell scale with the patterns of its kinds of
//   ground, as walk mode draws it (render/groundMaterial.js)
// - within FINE_TILES, flat-shaded at cell scale (its chunks' renditions, v2/plate.js)
// - within COARSE_TILES, from its rendition, a part a chunk (v2/platter.js)
// - further, from its plate's rendition, a part a tile, out to plates within FAR_FT;
// - further still, the same, but a platter's plates in one mesh, out to plates within the
//   builder's reach: FAR_FT, and REACH_PER_FT more for each foot the builder's over the ground,
//   up to REACH_FT.
// All but the full ground are flat-shaded in their parts' colors.
// Flying higher over the ground than half a tier's square is wide, that tier isn't drawn at all.
// A tile's distance is in tiles, the most of how far it is east or west, north or south, and up
// or down (its ground's heights against the builder's, in tiles' widths), so each tier is a
// square round the builder's tile, and flying high, the ground below goes coarser too. What's drawn
// changes only when the builder leaves their tile, and then a plate at a time: each plate's ground
// is drawn in a few meshes, made again when how its tiles are drawn changes. Skirts hang from
// where tiles drawn differently meet, to hide the gaps between them. Tiles drawn from renditions
// have their water drawn from them too, a part a chunk, but the sea, which sea.js's plane stands
// in for there; tiles drawn from their plate's, lifted to its ground where that's higher, as it's
// drawn coarser than the water.

export const FULL_TILES = 4;
export const FINE_TILES = 8;
export const COARSE_TILES = 16;
export const FAR_FT = 24576;
export const REACH_FT = 160000; // about 30 miles
const REACH_PER_FT = 1.5;
const LEAVE_FT = 32; // how far past their tile's edge the builder goes before what's drawn changes
const SKIRT = 0.75; // how far a skirt hangs, as a share of a part's size
const SKIRT_SHADE = 0.6;
const BUILD_MS = 6; // how long a frame spends making plates
export { EMPTY_FT };
const TINT = 0.8; // how far toward its biome's color ground's mixed, showing biomes
const CHUNK_CELLS_HALF = CHUNK_CELLS / 2;

// Each sRGB byte's linear value.
const LINEAR = Float32Array.from({ length: 256 }, (_, v) => new THREE.Color().setRGB(v / 255, 0, 0, THREE.SRGBColorSpace).r);

// Triangles with a color each, gathered into a flat-shaded mesh's geometry. Flat shading works
// out its normals as it draws, so the geometry has none.
class Faces {
  constructor() {
    this.positions = new Float32Array(1 << 12);
    this.colors = new Float32Array(1 << 12);
    this.length = 0;
  }

  // An sRGB color from 0-255 bytes at `k`, darkened by `shade`, as linear RGB.
  rgb(bytes, k, shade = 1) {
    return [LINEAR[bytes[k]] * shade, LINEAR[bytes[k + 1]] * shade, LINEAR[bytes[k + 2]] * shade];
  }

  // `rgb` mixed toward `tint`'s color for biome `biome`, or as it is with no tint.
  static tinted(rgb, tint, biome) {
    if (!tint) return rgb;
    const color = tint[biome];
    return [0, 1, 2].map((m) => rgb[m] * (1 - TINT) + color[m] * TINT);
  }

  // A square from its corners: northwest, northeast, southwest, southeast.
  square(a, b, c, d, rgb) {
    this.add(a, rgb);
    this.add(c, rgb);
    this.add(b, rgb);
    this.add(b, rgb);
    this.add(c, rgb);
    this.add(d, rgb);
  }

  // A skirt hanging `depth` from the edge p to q.
  skirt(p, q, depth, rgb) {
    const [pd, qd] = [[p[0], p[1] - depth, p[2]], [q[0], q[1] - depth, q[2]]];
    this.square(p, q, pd, qd, rgb);
  }

  add(p, rgb) {
    this.room(3);
    const [at, positions, colors] = [this.length, this.positions, this.colors];
    positions[at] = p[0];
    positions[at + 1] = p[1];
    positions[at + 2] = p[2];
    colors[at] = rgb[0];
    colors[at + 1] = rgb[1];
    colors[at + 2] = rgb[2];
    this.length += 3;
  }

  // Another's faces, moved (ox, oz).
  append(other, ox, oz) {
    this.room(other.length);
    const at = this.length;
    this.positions.set(other.positions.subarray(0, other.length), at);
    this.colors.set(other.colors.subarray(0, other.length), at);
    for (let v = at; v < at + other.length; v += 3) {
      this.positions[v] += ox;
      this.positions[v + 2] += oz;
    }
    this.length += other.length;
  }

  room(more) {
    if (this.length + more <= this.positions.length) return;
    let size = this.positions.length * 2;
    while (size < this.length + more) size *= 2;
    for (const name of ["positions", "colors"]) {
      const grown = new Float32Array(size);
      grown.set(this[name]);
      this[name] = grown;
    }
  }

  // The geometry, or null with no faces.
  geometry() {
    if (!this.length) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.positions.slice(0, this.length), 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(this.colors.slice(0, this.length), 3));
    return geometry;
  }
}

// How a tile is drawn, finest first: in full, flat at cell scale, from its rendition, or from its
// plate's.
export const FULL = 0;
export const FINE = 1;
export const COARSE = 2;
export const PLATE = 3;

// Each side of a tile: the tile beside it, and the side's two corners going clockwise seen from
// above, as [east, south] shares of the tile.
const SIDES = [
  [0, -1, [0, 0], [1, 0]],
  [1, 0, [1, 0], [1, 1]],
  [0, 1, [1, 1], [0, 1]],
  [-1, 0, [0, 1], [0, 0]],
];

// A tile's cells as one grid of vertices on their corners, in feet from its plate's northwest
// corner, the tile (ox, oz) feet from there, kept with the cells: each vertex the mean color of
// the cells round it, with normals for smooth shading; at `heights`, the cells' own or pressed
// (Renditions' pressedHeights).
function cellGrid(cells, ox, oz, heights = cells.heights) {
  if (cells.grid?.heights === heights) return cells.grid;
  const side = CELL_CORNERS;
  const positions = new Float32Array(side * side * 3);
  const colors = new Float32Array(side * side * 3);
  const normals = new Float32Array(side * side * 3);
  const h = (i, j) => heights[Math.max(0, Math.min(side - 1, j)) * side + Math.max(0, Math.min(side - 1, i))];
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      const v = (j * side + i) * 3;
      positions[v] = ox + i * CELL_FT;
      positions[v + 1] = h(i, j);
      positions[v + 2] = oz + j * CELL_FT;
      let count = 0;
      for (let b = Math.max(0, j - 1); b <= Math.min(TILE_CELLS - 1, j); b++) {
        for (let a = Math.max(0, i - 1); a <= Math.min(TILE_CELLS - 1, i); a++) {
          const k = (b * TILE_CELLS + a) * 3;
          for (let m = 0; m < 3; m++) colors[v + m] += LINEAR[cells.colors[k + m]];
          count++;
        }
      }
      for (let m = 0; m < 3; m++) colors[v + m] /= count;
      const [nx, nz] = [(h(i - 1, j) - h(i + 1, j)) / (2 * CELL_FT), (h(i, j - 1) - h(i, j + 1)) / (2 * CELL_FT)];
      const length = Math.hypot(nx, 1, nz);
      normals[v] = nx / length;
      normals[v + 1] = 1 / length;
      normals[v + 2] = nz / length;
    }
  }
  cells.grid = { position: positions, color: colors, normal: normals };
  Object.defineProperty(cells.grid, "heights", { value: heights }); // not an attribute
  return cells.grid;
}

// The squares of a cell grid, as indexes of its vertices, from `base` on.
function gridSquares(base, out = new Uint32Array(TILE_CELLS * TILE_CELLS * 6), at = 0) {
  const side = CELL_CORNERS;
  for (let b = 0; b < TILE_CELLS; b++) {
    for (let a = 0; a < TILE_CELLS; a++) {
      const nw = base + b * side + a;
      out[at] = nw;
      out[at + 1] = out[at + 4] = nw + side;
      out[at + 2] = out[at + 3] = nw + 1;
      out[at + 5] = nw + side + 1;
      at += 6;
    }
  }
  return out;
}
const SQUARES = gridSquares(0);
let plateSquares = null; // the squares of a plate's tiles' grids, one after another

// The tile-shaped stand-in groundMaterial wants for a tile's cells: the pattern at each cell's
// middle (Renditions' dress).
const NO_FOREST = new Uint8Array(TILE_CELLS * TILE_CELLS);
// roads: the roads drawn over it, as roads.js's roadSegmentsIn has them.
function groundTile(tx, tz, cells, roads = []) {
  return { coords: [tx, tz], cells: TILE_CELLS, cellFt: CELL_FT, palettes: { terrain: PATTERNS }, layers: { terrain: cells.kinds, forest: NO_FOREST }, roads };
}

// The meshes round the builder, a group for each plate within FAR_FT: when the builder leaves
// their tile, or a plate file's been read, each plate's tiles' tiers are worked out again (plan), and plates whose tiers
// changed are made again a few at a time, nearest first, within BUILD_MS a frame (build), each
// kept as it was until it's replaced.
export class Ground {
  // farFt and reachFt: how far off plates are drawn, and how far off anything's drawn high up, for
  // a view that sees less far than FAR_FT and REACH_FT (the play page's fog, say).
  constructor(scene, renditions, renderer, { farFt = FAR_FT, reachFt = REACH_FT } = {}) {
    this.renditions = renditions;
    this.farFt = farFt;
    this.reachFt = reachFt;
    // Tiles drawn coarser till their cells were read can now be drawn finer.
    renditions.onRead = () => (this.stale = true);
    this.group = new THREE.Group();
    scene.add(this.group);
    this.renderer = renderer;
    // The flat-shaded ground's material by what it draws, each with the grid's squares that fine.
    const flat = (finest) => withGrid(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }), finest);
    this.materials = { plate: flat(TILE_FT), tile: flat(CHUNK_FT), fine: flat(CELL_FT) };
    this.plates = new Map(); // "px,pz" -> a plate's group, its userData.tiers how its tiles are drawn
    this.wanted = new Map(); // "px,pz" -> how its tiles should be drawn, a digit each, "-" for none
    this.pending = []; // "px,pz" of plates to make, nearest first
    this.moved = new Set(); // "px,pz" of plates whose ground moved, made next frame whatever it takes
    this.anchor = null; // the builder's tile and height in tiles' widths, [tx, ty, tz]
    this.stale = false; // whether what's drawn wants working out again, wherever the builder is
    this.finest = FULL; // the finest tier drawn, by how high the builder is (finestAt)
    this.reach = farFt; // how far off ground's drawn, by how high the builder is
    // Which kinds of ground are shown (toggle).
    this.shown = { full: true, fine: true, tile: true, plate: true, water: true };
    this.water = null; // the material water drawn from renditions is drawn with
    this.counts = [0, 0, 0, 0]; // tiles drawn each way
    this.tint = null; // showing biomes, each biome's linear RGB, by index into BIOME_NAMES
    this.tints = 0; // counts changes to how ground's tinted, to tell tinted faces kept are stale
    this.holes = null; // (tx, tz) => the cells of a tile not to draw in full, a Set of indices, or null
  }

  // Draws all but the ground in full tinted by biome, with `tint` (each biome's linear RGB), or
  // not, with null.
  setTint(tint) {
    this.tint = tint;
    this.retint();
  }

  // Makes every plate again, a few a frame, for biomes that changed.
  retint() {
    this.tints++;
    for (const group of this.plates.values()) group.userData.tiers = null;
    this.stale = true;
  }

  // Works out what's to be drawn round continent feet (x, y, z) when that's left the tile it was
  // last worked out for, or the finest tier drawn there changes, then makes some of it.
  update(x, y, z) {
    const a = this.anchor;
    const out = (v, at) => v < at * TILE_FT - LEAVE_FT || v > (at + 1) * TILE_FT + LEAVE_FT;
    for (const key of this.renditions.wetPlates) {
      for (const group of [this.plates.get(key), this.plates.get(platterKeyOf(key))]) if (group) group.userData.tiers = null;
      this.stale = true;
    }
    this.renditions.wetPlates.clear();
    if (!a || this.stale || out(x, a[0]) || out(y, a[1]) || out(z, a[2]) || this.finestAt(x, y, z) !== this.finest) this.plan(x, y, z);
    this.build();
  }

  // The finest tier drawn with the builder at continent feet (x, y, z): none whose square is less
  // than twice as wide as the builder is high over the ground.
  finestAt(x, y, z) {
    const above = y - (this.renditions.heightAt(x, z) ?? SEA_LEVEL_FT);
    const wide = (tiles) => (2 * tiles + 1) * TILE_FT;
    const finest = [FULL_TILES, FINE_TILES, COARSE_TILES].findIndex((tiles) => wide(tiles) > 2 * above);
    return finest < 0 ? PLATE : finest;
  }

  // How tile (tx, tz) is drawn, or null where it has no ground.
  tier(tx, tz) {
    const ys = span(this.renditions.tile(tx, tz));
    if (!ys) return null;
    const [ax, ay, az] = this.anchor;
    const [lo, hi] = [Math.floor(ys[0] / TILE_FT), Math.floor(ys[1] / TILE_FT)];
    const d = Math.max(Math.abs(tx - ax), Math.abs(tz - az), ay > hi ? ay - hi : ay < lo ? lo - ay : 0);
    let t = d > COARSE_TILES ? PLATE : d > FINE_TILES ? COARSE : d > FULL_TILES ? FINE : FULL;
    t = Math.max(t, this.finest);
    return t < COARSE && !this.renditions.hasCells(tx, tz) ? COARSE : t;
  }

  plan(x, y, z) {
    this.stale = false;
    this.anchor = [Math.floor(x / TILE_FT), Math.floor(y / TILE_FT), Math.floor(z / TILE_FT)];
    this.finest = this.finestAt(x, y, z);
    const [ax, , az] = this.anchor;
    const reach = Math.ceil(this.farFt / PLATE_FT);
    const [cx, cz] = [Math.floor(x / PLATE_FT), Math.floor(z / PLATE_FT)];
    const wanted = new Map();
    const distance = new Map();
    for (let pz = cz - reach; pz <= cz + reach; pz++) {
      for (let px = cx - reach; px <= cx + reach; px++) {
        if (!this.renditions.plate(px, pz)) continue;
        const dx = x - Math.max(px * PLATE_FT, Math.min(x, (px + 1) * PLATE_FT));
        const dz = z - Math.max(pz * PLATE_FT, Math.min(z, (pz + 1) * PLATE_FT));
        if (Math.hypot(dx, dz) > this.farFt) continue;
        const key = `${px},${pz}`;
        distance.set(key, Math.hypot(dx, dz));
        // A plate well clear of the builder's tile is drawn all from its rendition, but for the
        // skirts round tiles drawn finer beside it.
        const clear = (lo, at) => at < lo - COARSE_TILES - 1 || at > lo + PLATE_TILES + COARSE_TILES;
        if (clear(px * PLATE_TILES, ax) || clear(pz * PLATE_TILES, az)) {
          wanted.set(key, "far");
          continue;
        }
        let tiers = "";
        for (let j = -1; j <= PLATE_TILES; j++) for (let i = -1; i <= PLATE_TILES; i++) tiers += this.tier(px * PLATE_TILES + i, pz * PLATE_TILES + j) ?? "-";
        wanted.set(key, tiers);
      }
    }
    // Past farFt, out to its reach, a platter's plates at a time, a 1 for each of its plates
    // drawn, row order.
    const high = Math.max(0, y - (this.renditions.heightAt(x, z) ?? SEA_LEVEL_FT));
    this.reach = Math.min(this.reachFt, this.farFt + REACH_PER_FT * high);
    const span = Math.ceil(this.reach / PLATTER_FT);
    const [qx, qz] = [Math.floor(x / PLATTER_FT), Math.floor(z / PLATTER_FT)];
    for (let ppz = qz - span; this.reach > this.farFt && ppz <= qz + span; ppz++) {
      for (let ppx = qx - span; ppx <= qx + span; ppx++) {
        let [plates, nearest] = ["", Infinity];
        for (let j = 0; j < PLATTER_PLATES; j++) {
          for (let i = 0; i < PLATTER_PLATES; i++) {
            const [px, pz] = [ppx * PLATTER_PLATES + i, ppz * PLATTER_PLATES + j];
            const d = Math.hypot(x - Math.max(px * PLATE_FT, Math.min(x, (px + 1) * PLATE_FT)), z - Math.max(pz * PLATE_FT, Math.min(z, (pz + 1) * PLATE_FT)));
            const drawn = d > this.farFt && d <= this.reach && Boolean(this.renditions.plate(px, pz));
            plates += drawn ? "1" : "0";
            if (drawn) nearest = Math.min(nearest, d);
          }
        }
        if (nearest === Infinity) continue;
        const key = `platter:${ppx},${ppz}`;
        wanted.set(key, plates);
        distance.set(key, nearest);
      }
    }
    this.wanted = wanted;
    for (const key of [...this.plates.keys()]) if (!wanted.has(key)) this.drop(key);
    this.pending = [...wanted].filter(([key, tiers]) => this.plates.get(key)?.userData.tiers !== tiers).map(([key]) => key);
    this.pending.sort((a, b) => distance.get(a) - distance.get(b));
  }

  // Makes the plates waiting to be made, nearest first, for up to BUILD_MS.
  build() {
    const start = performance.now();
    while (this.pending.length && (this.moved.has(this.pending[0]) || performance.now() - start < BUILD_MS)) {
      const key = this.pending.shift();
      this.moved.delete(key);
      const made = this.makePlate(key, this.wanted.get(key));
      this.drop(key);
      this.group.add(made);
      this.plates.set(key, made);
    }
    this.counts = [0, 0, 0, 0];
    for (const group of this.plates.values()) group.userData.counts.forEach((n, t) => (this.counts[t] += n));
  }

  // A plate's group, its tiles drawn as `tiers` says: for the plate's tiles and a ring of tiles
  // round them, a tier each, row order, "-" for none, or "far" for every tile from the plate's
  // rendition.
  makePlate(key, tiers) {
    if (key.startsWith("platter:")) return this.makePlatter(key, tiers);
    const [px, pz] = key.split(",").map(Number);
    const plate = this.renditions.plate(px, pz);
    const side = PLATE_TILES + 2;
    const tierAt = (i, j) => {
      if (tiers === "far") return this.renditions.tile(px * PLATE_TILES + i, pz * PLATE_TILES + j) ? PLATE : null;
      const t = tiers[(j + 1) * side + i + 1];
      return t === "-" ? null : Number(t);
    };
    const group = new THREE.Group();
    group.position.set(px * PLATE_FT, 0, pz * PLATE_FT);
    group.userData = { tiers, counts: [0, 0, 0, 0] };
    const far = new Faces(); // PLATE tiles and their skirts
    const near = new Faces(); // COARSE tiles, and every finer tile's skirts
    const fine = []; // [i, j, cells] of FINE tiles
    const water = { positions: [], depths: [], colors: [] }; // the water of tiles drawn from renditions
    // The tiles in full the plate had, to keep those still drawn in full.
    const before = new Map();
    for (const mesh of this.plates.get(key)?.children ?? []) if (mesh.userData.kind === "full") before.set(mesh.userData.tile, mesh);
    for (let j = 0; j < PLATE_TILES; j++) {
      for (let i = 0; i < PLATE_TILES; i++) {
        const [tx, tz] = [px * PLATE_TILES + i, pz * PLATE_TILES + j];
        let t = tierAt(i, j);
        if (t === null) continue;
        const cells = t < COARSE && this.renditions.cells(tx, tz);
        if (t < COARSE && !cells) t = COARSE;
        group.userData.counts[t]++;
        const [ox, oz] = [i * TILE_FT, j * TILE_FT];
        // The tile's ground as a grid of `n` parts a side: the height at corner (a, b), and part
        // (a, b)'s color, darkened by `shade`.
        let n, height, color, faces, depth;
        const tint = this.tint;
        if (t === PLATE) {
          [n, faces, depth] = [1, far, TILE_FT * SKIRT];
          height = (a, b) => plate.heights[(j + b) * CORNERS + i + a];
          const biome = this.renditions.biomes.at((tx + 0.5) * TILE_FT, (tz + 0.5) * TILE_FT);
          const rgb = this.partRgb(biome, height, 0, 0, 1, TILE_FT, tx * TILE_FT, tz * TILE_FT, tileWater(this.renditions.tile(tx, tz)));
          color = (a, b, shade) => Faces.tinted(rgb.map((v) => v * shade), tint, biome);
        } else if (t === COARSE) {
          const tile = this.renditions.tile(tx, tz);
          [n, faces, depth] = [TILE_CHUNKS, near, CHUNK_FT * SKIRT];
          height = (a, b) => tile.heights[b * CORNERS + a];
          const biomes = this.renditions.biomeTile(tx, tz);
          color = (a, b, shade) => {
            const biome = biomes[(b * CHUNK_CELLS + CHUNK_CELLS_HALF) * TILE_CELLS + a * CHUNK_CELLS + CHUNK_CELLS_HALF];
            return Faces.tinted(this.partRgb(biome, height, a, b, 1, CHUNK_FT, tx * TILE_FT, tz * TILE_FT, partWaterAt(tile, a, b)).map((v) => v * shade), tint, biome);
          };
        } else {
          [n, faces, depth] = [TILE_CELLS, near, CHUNK_FT * SKIRT];
          const heights = this.renditions.pressedHeights(tx, tz, cells);
          height = (a, b) => heights[b * CELL_CORNERS + a];
          const biomes = tint && t === FINE && this.renditions.biomeTile(tx, tz);
          color = (a, b, shade) => Faces.tinted(near.rgb(cells.colors, (b * TILE_CELLS + a) * 3, shade), biomes && tint, biomes && biomes[b * TILE_CELLS + a]);
          if (t === FINE) fine.push(biomes ? this.tintedGrid(cells, ox, oz, biomes, heights) : cellGrid(cells, ox, oz, heights));
          else this.addFull(group, tx, tz, cells, ox, oz, before, heights);
        }
        const part = TILE_FT / n;
        const corner = (a, b) => [ox + a * part, height(a, b), oz + b * part];
        if (t === PLATE) faces.square(corner(0, 0), corner(1, 0), corner(0, 1), corner(1, 1), color(0, 0, 1));
        if (t >= COARSE) {
          const tile = this.renditions.tile(tx, tz);
          // Where the plate's rendition draws the ground, `u` and `v` 0 to 1 across the tile.
          const drawn = t === PLATE && ((u, v) => (1 - v) * ((1 - u) * height(0, 0) + u * height(1, 0)) + v * ((1 - u) * height(0, 1) + u * height(1, 1)));
          if (tile.water) addWater(water, tile, ox, oz, drawn, () => this.renditions.biomeTile(tx, tz));
        }
        if (t === COARSE) faces.append(this.tileFaces(tx, tz), ox, oz);
        for (const [di, dj, from, to] of SIDES) {
          if (tierAt(i + di, j + dj) === t) continue;
          const step = [to[0] - from[0], to[1] - from[1]];
          for (let k = 0; k < n; k++) {
            const p = [from[0] * n + step[0] * k, from[1] * n + step[1] * k];
            const q = [p[0] + step[0], p[1] + step[1]];
            const cell = [Math.min(p[0], q[0]) - (di > 0 ? 1 : 0), Math.min(p[1], q[1]) - (dj > 0 ? 1 : 0)];
            faces.skirt(corner(...p), corner(...q), depth, color(...cell, SKIRT_SHADE));
          }
        }
      }
    }
    this.add(group, far.geometry(), this.materials.plate, "plate");
    this.add(group, near.geometry(), this.materials.tile, "tile");
    this.add(group, fineGeometry(fine), this.materials.fine, "fine");
    if (water.positions.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(water.positions, 3));
      g.setAttribute("depth", new THREE.Float32BufferAttribute(water.depths, 1));
      g.setAttribute("color", new THREE.Float32BufferAttribute(water.colors, 3));
      g.setAttribute("flow", new THREE.Float32BufferAttribute(new Float32Array(water.positions.length), 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(Float32Array.from({ length: water.positions.length }, (_, n) => (n % 3 === 1 ? 1 : 0)), 3));
      if (!this.water) {
        this.water = waterMaterial(this.renderer, { color: 0xffffff, opacity: 0.88, shoreFadeFt: SHORE_FADE_FT });
        this.water.vertexColors = true;
      }
      this.add(group, g, this.water, "water").renderOrder = 1;
    }
    return group;
  }

  // The plates of platter `key`, "platter:ppx,ppz", that `plates` has a 1 for, as one mesh, from
  // their renditions, a part a tile, with skirts round them.
  makePlatter(key, plates) {
    const [ppx, ppz] = key.slice("platter:".length).split(",").map(Number);
    const group = new THREE.Group();
    group.position.set(ppx * PLATTER_FT, 0, ppz * PLATTER_FT);
    group.userData = { tiers: plates, counts: [0, 0, 0, 0] };
    const faces = new Faces();
    const [tx0, tz0] = [ppx * PLATTER_TILES, ppz * PLATTER_TILES];
    // Whether tile (i, j) of the platter's drawn here.
    const drawn = (i, j) =>
      i >= 0 && j >= 0 && i < PLATTER_TILES && j < PLATTER_TILES && plates[Math.floor(j / PLATE_TILES) * PLATTER_PLATES + Math.floor(i / PLATE_TILES)] === "1" && Boolean(this.renditions.tile(tx0 + i, tz0 + j));
    for (let j = 0; j < PLATTER_TILES; j++) {
      for (let i = 0; i < PLATTER_TILES; i++) {
        if (!drawn(i, j)) continue;
        const [tx, tz] = [tx0 + i, tz0 + j];
        const plate = this.renditions.plate(Math.floor(tx / PLATE_TILES), Math.floor(tz / PLATE_TILES));
        const [pi, pj] = [i % PLATE_TILES, j % PLATE_TILES];
        const height = (a, b) => plate.heights[(pj + b) * CORNERS + pi + a];
        const biome = this.renditions.biomes.at((tx + 0.5) * TILE_FT, (tz + 0.5) * TILE_FT);
        const rgb = this.partRgb(biome, height, 0, 0, 1, TILE_FT, tx * TILE_FT, tz * TILE_FT, tileWater(this.renditions.tile(tx, tz)));
        const color = (shade) => Faces.tinted(rgb.map((v) => v * shade), this.tint, biome);
        const corner = (a, b) => [(i + a) * TILE_FT, height(a, b), (j + b) * TILE_FT];
        faces.square(corner(0, 0), corner(1, 0), corner(0, 1), corner(1, 1), color(1));
        group.userData.counts[PLATE]++;
        for (const [di, dj, from, to] of SIDES) if (!drawn(i + di, j + dj)) faces.skirt(corner(...from), corner(...to), TILE_FT * SKIRT, color(SKIRT_SHADE));
      }
    }
    this.add(group, faces.geometry(), this.materials.plate, "plate");
    return group;
  }

  // The linear RGB of the part (a, b) of a rendition, `n` corners a side apart in height(a, b),
  // the part `width` ft across, its rendition's corner at (x0, z0): the look of biome `biome` there,
  // with `water` on or near it as look.js's groundClass has it.
  partRgb(biome, height, a, b, n, width, x0, z0, water = null) {
    const [nw, ne, sw, se] = [height(a, b), height(a + n, b), height(a, b + n), height(a + n, b + n)];
    const { rgb } = look(biome, slopeOf(nw, ne, sw, se, width), (nw + ne + sw + se) / 4, x0 + (a + 0.5) * width, z0 + (b + 0.5) * width, water);
    return [LINEAR[rgb[0]], LINEAR[rgb[1]], LINEAR[rgb[2]]];
  }

  // A tile's rendition's squares, in feet from its northwest corner, in their biomes' looks, tinted
  // when biomes are shown, kept with it till its ground moves or how it looks changes.
  tileFaces(tx, tz) {
    const tile = this.renditions.tile(tx, tz);
    const key = `${this.renditions.looks},${this.tint ? this.tints : -1}`;
    if (tile.faces?.key === key && tile.faces.water === tile.water) return tile.faces;
    const biomes = this.renditions.biomeTile(tx, tz);
    const height = (a, b) => tile.heights[b * CORNERS + a];
    const faces = new Faces();
    const corner = (a, b) => [a * CHUNK_FT, height(a, b), b * CHUNK_FT];
    for (let b = 0; b < TILE_CHUNKS; b++) {
      for (let a = 0; a < TILE_CHUNKS; a++) {
        const biome = biomes[(b * CHUNK_CELLS + CHUNK_CELLS_HALF) * TILE_CELLS + a * CHUNK_CELLS + CHUNK_CELLS_HALF];
        const rgb = Faces.tinted(this.partRgb(biome, height, a, b, 1, CHUNK_FT, tx * TILE_FT, tz * TILE_FT, partWaterAt(tile, a, b)), this.tint, biome);
        faces.square(corner(a, b), corner(a + 1, b), corner(a, b + 1), corner(a + 1, b + 1), rgb);
      }
    }
    faces.key = key;
    faces.water = tile.water;
    tile.faces = faces;
    return faces;
  }

  // A tile's cell grid with its colors tinted by `biomes`, its cells' biomes, each corner by the
  // cells round it, kept with its cells till the tint changes.
  tintedGrid(cells, ox, oz, biomes, heights) {
    const grid = cellGrid(cells, ox, oz, heights);
    if (cells.tinted?.tints === this.tints && cells.tinted.grid === grid) return cells.tinted.tinted;
    const side = CELL_CORNERS;
    const color = new Float32Array(grid.color.length);
    for (let j = 0; j < side; j++) {
      for (let i = 0; i < side; i++) {
        const v = (j * side + i) * 3;
        const mixed = [0, 0, 0];
        let count = 0;
        for (let b = Math.max(0, j - 1); b <= Math.min(TILE_CELLS - 1, j); b++) {
          for (let a = Math.max(0, i - 1); a <= Math.min(TILE_CELLS - 1, i); a++) {
            const c = this.tint[biomes[b * TILE_CELLS + a]];
            for (let m = 0; m < 3; m++) mixed[m] += c[m];
            count++;
          }
        }
        for (let m = 0; m < 3; m++) color[v + m] = grid.color[v + m] * (1 - TINT) + (mixed[m] / count) * TINT;
      }
    }
    const tinted = { ...grid, color };
    cells.tinted = { tints: this.tints, grid, tinted };
    return tinted;
  }

  // A tile drawn in full into a plate's group, (ox, oz) feet into it: the mesh from `before`
  // ("tx,tz" -> mesh) when it's there.
  addFull(group, tx, tz, cells, ox, oz, before, heights) {
    const grid = cellGrid(cells, ox, oz, heights);
    // Cells the caves draw are left out.
    const holes = this.holes?.(tx, tz) ?? null;
    const holesKey = holes ? [...holes].join(",") : "";
    const geometry = () => {
      const made = new THREE.BufferGeometry();
      for (const [name, values] of Object.entries(grid)) made.setAttribute(name, new THREE.BufferAttribute(values, 3));
      made.setIndex(new THREE.BufferAttribute(holes ? SQUARES.filter((_, n) => !holes.has(Math.floor(n / 6))) : SQUARES, 1));
      return made;
    };
    const roads = roadSegmentsIn(this.renditions.roadFile.roads ?? [], [tx * TILE_FT, tz * TILE_FT, (tx + 1) * TILE_FT, (tz + 1) * TILE_FT]);
    const material = () => withGrid(groundMaterial(this.renderer, { tile: groundTile(tx, tz, cells, roads), origin: [0, 0] }), CELL_FT);
    const kept = before.get(`${tx},${tz}`);
    if (kept) {
      group.add(kept);
      if (kept.userData.holes !== holesKey) {
        kept.geometry.dispose();
        kept.geometry = geometry();
        kept.userData.holes = holesKey;
      }
      // Moved ground, or ground that looks different: its new shape, and its patterns again.
      if (kept.userData.grid !== grid) {
        kept.geometry.dispose();
        kept.geometry = geometry();
        kept.userData.grid = grid;
      }
      if (kept.userData.look !== grid || kept.userData.roads !== this.renditions.roadsVersion) {
        disposeGround(kept.material);
        kept.material = material();
        [kept.userData.look, kept.userData.roads] = [grid, this.renditions.roadsVersion];
      }
      return;
    }
    const mesh = this.add(group, geometry(), material(), "full");
    mesh.userData.tile = `${tx},${tz}`;
    [mesh.userData.look, mesh.userData.roads] = [grid, this.renditions.roadsVersion];
    mesh.userData.grid = grid;
    mesh.userData.holes = holesKey;
  }

  add(group, geometry, material, kind) {
    if (!geometry) return null;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.kind = kind;
    mesh.visible = this.shown[kind];
    group.add(mesh);
    return mesh;
  }

  // Makes plates ("px,pz") again next frame, for ground that's moved: all of them, so ground
  // moved either side of a plate's edge shows moving together.
  refresh(keys) {
    // Plates made where there were none are worked into what's drawn.
    if ([...keys].some((key) => !this.wanted.has(key) && !this.wanted.has(platterKeyOf(key)))) this.stale = true;
    const again = [...new Set([...keys].flatMap((key) => [key, platterKeyOf(key)]))].filter((key) => this.wanted.has(key));
    for (const key of again) {
      const group = this.plates.get(key);
      if (group) group.userData.tiers = null;
      this.moved.add(key);
    }
    this.pending = [...again, ...this.pending.filter((key) => !again.includes(key))];
  }

  // Shows or hides one kind of ground: "full", "fine" (tiles at cell scale), "tile" (tiles'
  // renditions, with the skirts) or "plate", wherever it's drawn.
  toggle(kind) {
    this.shown[kind] = !this.shown[kind];
    this.group.traverse((mesh) => {
      if (mesh.isMesh && mesh.userData.kind === kind) mesh.visible = this.shown[kind];
    });
  }

  // Tile (tx, tz)'s mesh where it's drawn in full, or null.
  fullMesh(tx, tz) {
    const group = this.plates.get(`${Math.floor(tx / PLATE_TILES)},${Math.floor(tz / PLATE_TILES)}`);
    return group?.children.find((mesh) => mesh.userData.kind === "full" && mesh.userData.tile === `${tx},${tz}`) ?? null;
  }

  drop(key) {
    const object = this.plates.get(key);
    if (!object) return;
    this.group.remove(object);
    object.traverse((mesh) => {
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      if (mesh.userData.kind === "full") disposeGround(mesh.material);
    });
    this.plates.delete(key);
  }
}

// The water on or near part (a, b) of tile rendition `tile`, as look.js's groundClass has it: the
// part's own, or the highest of the parts round it in the tile, or null.
function partWaterAt({ water }, a, b) {
  if (!water) return null;
  const n = TILE_CHUNKS;
  const k = b * n + a;
  if (!Number.isNaN(water.level[k])) return { wet: true, level: water.level[k], type: water.type[k] };
  let level = -Infinity;
  for (let j = Math.max(0, b - 1); j <= Math.min(n - 1, b + 1); j++) for (let i = Math.max(0, a - 1); i <= Math.min(n - 1, a + 1); i++) if (water.level[j * n + i] > level) level = water.level[j * n + i];
  return level > -Infinity ? { wet: false, level } : null;
}

// The same for a whole tile: wet where most of its parts are, of the type most of them are.
function tileWater(tile) {
  const water = tile?.water;
  if (!water) return null;
  const counts = new Map();
  let [wet, level] = [0, -Infinity];
  water.level.forEach((l, k) => {
    if (Number.isNaN(l)) return;
    wet++;
    level = Math.max(level, l);
    counts.set(water.type[k], (counts.get(water.type[k]) ?? 0) + 1);
  });
  if (!wet) return null;
  const type = [...counts].reduce((best, c) => (c[1] > best[1] ? c : best))[0];
  return { wet: wet * 2 >= water.level.length, level, type };
}

// The key a plate's drawn under past FAR_FT: its platter's.
const platterKeyOf = (key) => `platter:${platterOfPlate(...key.split(",").map(Number)).join(",")}`;

// Each side of a plate, and how far the plate past it is.
const SEA = WATER_TYPES.indexOf("sea");
// The color of water of a type in a biome, kept once worked out.
const partColors = new Map();
function partColor(kind, biome) {
  const key = kind * 256 + biome;
  if (!partColors.has(key)) partColors.set(key, new THREE.Color(waterLookOf(kind, biome).color).toArray());
  return partColors.get(key);
}
const LIFT_FT = 1; // how far over the ground drawn from a plate's rendition its water's lifted

// Adds the water of `tile`'s rendition (as platter.js has it) to `out`, but the sea: each wet part,
// and a part more round them at the level of the water next to it, the tile's corner at (ox, oz).
// With `drawn(u, v)`, where the ground's drawn across the tile, the water's lifted over it.
// `biomes()` gives the tile's cells' biomes, for how its water looks, asked for only where it's wet.
function addWater(out, { heights, water }, ox, oz, drawn, biomes) {
  const n = TILE_CHUNKS;
  const at = (a, b) => (a < 0 || b < 0 || a >= n || b >= n || water.type[b * n + a] === SEA ? NaN : water.level[b * n + a]);
  for (let b = 0; b < n; b++) {
    for (let a = 0; a < n; a++) {
      let [level, kind] = [at(a, b), water.type[b * n + a]];
      if (Number.isNaN(level)) {
        for (let db = -1; db <= 1; db++) {
          for (let da = -1; da <= 1; da++) {
            const l = at(a + da, b + db);
            if (!Number.isNaN(l) && !(l <= level)) [level, kind] = [l, water.type[(b + db) * n + a + da]];
          }
        }
      }
      if (Number.isNaN(level)) continue;
      const color = partColor(kind, biomes()[(b * CHUNK_CELLS + CHUNK_CELLS_HALF) * TILE_CELLS + a * CHUNK_CELLS + CHUNK_CELLS_HALF]);
      const corner = (ca, cb) => {
        const y = drawn ? Math.max(level, drawn(ca / n, cb / n) + LIFT_FT) : level;
        out.positions.push(ox + ca * CHUNK_FT, y, oz + cb * CHUNK_FT);
        out.depths.push(level - heights[cb * CORNERS + ca]);
        out.colors.push(...color);
      };
      for (const [ca, cb] of [[a, b], [a, b + 1], [a + 1, b], [a + 1, b], [a, b + 1], [a + 1, b + 1]]) corner(ca, cb);
    }
  }
}

// The cell grids of the tiles drawn flat at cell scale in a plate, as one geometry, or null for
// none.
function fineGeometry(grids) {
  if (!grids.length) return null;
  const count = CELL_CORNERS * CELL_CORNERS * 3;
  const positions = new Float32Array(grids.length * count);
  const colors = new Float32Array(grids.length * count);
  grids.forEach((grid, n) => {
    positions.set(grid.position, n * count);
    colors.set(grid.color, n * count);
  });
  if (!plateSquares) {
    plateSquares = new Uint32Array(PLATE_TILES * PLATE_TILES * SQUARES.length);
    for (let n = 0; n < PLATE_TILES * PLATE_TILES; n++) gridSquares((n * count) / 3, plateSquares, n * SQUARES.length);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(plateSquares.subarray(0, grids.length * SQUARES.length), 1));
  return geometry;
}

// The lowest and highest of a rendition's heights, or null for none.
function span(rendition) {
  if (!rendition) return null;
  rendition.span ??= [Math.min(...rendition.heights), Math.max(...rendition.heights)];
  return rendition.span;
}
