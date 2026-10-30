import * as THREE from "three";
import { disposeGround, groundMaterial } from "../editor/groundMaterial.js";
import { CELL_CORNERS, TILE_CELLS, decodePlate, tileIndexInPlate } from "../v2/plate.js";
import { CORNERS, decodePlatter, indexIn, plateIndexIn, platterOf, platterOfPlate } from "../v2/platter.js";
import { CELL_FT, CHUNK_CELLS, CHUNK_FT, PLATE_FT, PLATE_TILES, PLATTER_TILES, TILE_CHUNKS, TILE_FT } from "../v2/sizes.js";

// The ground round the builder, finer the nearer it is:
// - within FULL_RADIUS_FT, chunks drawn in full, smooth-shaded at cell scale with the patterns of
//   their kinds of ground, as walk mode draws it (editor/groundMaterial.js)
// - within CHUNK_RADIUS_FT, chunks flat-shaded at cell scale (their renditions, v2/plate.js)
// - within TILE_RADIUS_FT, the rest of each tile from its rendition, a part a chunk (v2/platter.js)
// - out to FAR_FT, plates from their renditions, a part a tile, leaving out the tiles drawn closer.
// All but the full ground are flat-shaded in their parts' colors.
// Distances are to the nearest point of the box round each one's ground, so flying high, the
// ground below goes coarser too. Skirts hang from where finer and coarser ground meet, to hide the
// gaps between them.

export const FULL_RADIUS_FT = 1024;
export const CHUNK_RADIUS_FT = 2048;
export const TILE_RADIUS_FT = 4096;
export const FAR_FT = 24576;
const MOVE_FT = 32; // how far the builder goes before what's drawn is worked out again
const SKIRT = 0.75; // how far a skirt hangs, as a share of a coarse part's size
const SKIRT_SHADE = 0.6;
const KEEP_PLATES = 40; // plate files kept decoded
const BUILD_MS = 6; // how long a frame spends making tiles

// A continent's renditions, from its platter files, and its ground at cell scale, from its plate
// files, decoded as they're wanted.
export class Renditions {
  constructor() {
    this.platters = new Map(); // "px,pz" -> { coords, tiles, plates }
    this.plateFiles = new Map(); // "px,pz" -> gzipped bytes
    this.decoded = new Map(); // "px,pz" -> decoded plate file, the latest used last
  }

  addPlatter(bytes) {
    const platter = decodePlatter(bytes);
    this.platters.set(platter.coords.join(","), platter);
  }

  addPlate(coords, bytes) {
    this.plateFiles.set(coords.join(","), bytes);
  }

  tile(tx, tz) {
    return this.platters.get(platterOf(tx, tz).join(","))?.tiles.get(indexIn(tx, tz)) ?? null;
  }

  plate(px, pz) {
    return this.platters.get(platterOfPlate(px, pz).join(","))?.plates.get(plateIndexIn(px, pz)) ?? null;
  }

  // A tile's ground at cell scale, { heights, colors, terrain, forest, palette }, or null.
  cells(tx, tz) {
    const key = `${Math.floor(tx / PLATE_TILES)},${Math.floor(tz / PLATE_TILES)}`;
    let plate = this.decoded.get(key);
    if (plate) this.decoded.delete(key);
    else if (this.plateFiles.has(key)) plate = decodePlate(this.plateFiles.get(key));
    if (!plate) return null;
    this.decoded.set(key, plate);
    if (this.decoded.size > KEEP_PLATES) this.decoded.delete(this.decoded.keys().next().value);
    const tile = plate.tiles.get(tileIndexInPlate(tx, tz));
    if (tile) tile.palette = plate.palette;
    return tile ?? null;
  }

  // The ground's height at continent feet (x, z), straight between cell corners, or chunk corners
  // where there are no cells, or null where there's no tile.
  heightAt(x, z) {
    const [tx, tz] = [Math.floor(x / TILE_FT), Math.floor(z / TILE_FT)];
    const cells = this.cells(tx, tz);
    if (cells) return between(cells.heights, CELL_CORNERS, (x - tx * TILE_FT) / CELL_FT, (z - tz * TILE_FT) / CELL_FT);
    const tile = this.tile(tx, tz);
    return tile && between(tile.heights, CORNERS, (x - tx * TILE_FT) / CHUNK_FT, (z - tz * TILE_FT) / CHUNK_FT);
  }

  // The middle of the tiles, as continent feet [x, z]: the tile nearest the middle of them all.
  middle() {
    const all = [];
    for (const { coords, tiles } of this.platters.values()) {
      for (const index of tiles.keys()) all.push([coords[0] * PLATTER_TILES + (index % PLATTER_TILES), coords[1] * PLATTER_TILES + Math.floor(index / PLATTER_TILES)]);
    }
    if (!all.length) return [0, 0];
    const mean = [0, 1].map((m) => all.reduce((s, t) => s + t[m], 0) / all.length);
    const [tx, tz] = all.reduce((best, t) => (Math.hypot(t[0] - mean[0], t[1] - mean[1]) < Math.hypot(best[0] - mean[0], best[1] - mean[1]) ? t : best));
    return [(tx + 0.5) * TILE_FT, (tz + 0.5) * TILE_FT];
  }
}

// A height straight between a grid's corners (`side` a row), at (u, v) in grid squares.
function between(heights, side, u, v) {
  const [i, j] = [Math.min(side - 2, Math.floor(u)), Math.min(side - 2, Math.floor(v))];
  const [fu, fv] = [u - i, v - j];
  const h = (a, b) => heights[(j + b) * side + i + a];
  const top = h(0, 0) + (h(1, 0) - h(0, 0)) * fu;
  const bottom = h(0, 1) + (h(1, 1) - h(0, 1)) * fu;
  return top + (bottom - top) * fv;
}

// Triangles with a color each, gathered into a mesh's geometry.
class Faces {
  constructor() {
    this.positions = [];
    this.colors = [];
    this.color = new THREE.Color();
  }

  // An sRGB color from 0-255 bytes at `k`, darkened by `shade`, as linear RGB.
  rgb(bytes, k, shade = 1) {
    this.color.setRGB((bytes[k] / 255) * shade, (bytes[k + 1] / 255) * shade, (bytes[k + 2] / 255) * shade, THREE.SRGBColorSpace);
    return [this.color.r, this.color.g, this.color.b];
  }

  // A square from its corners: northwest, northeast, southwest, southeast.
  square([a, b, c, d], rgb) {
    this.add([a, c, b, b, c, d], rgb);
  }

  // A skirt hanging `depth` from the edge p to q.
  skirt(p, q, depth, rgb) {
    const [pd, qd] = [[p[0], p[1] - depth, p[2]], [q[0], q[1] - depth, q[2]]];
    this.add([p, pd, q, q, pd, qd], rgb);
  }

  add(points, rgb) {
    for (const p of points) {
      this.positions.push(...p);
      this.colors.push(...rgb);
    }
  }

  geometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeVertexNormals();
    return geometry;
  }
}

// Each side of a square: the square beside it, and the side's two corners going clockwise seen
// from above.
const SIDES = [
  [0, -1, [0, 0], [1, 0]],
  [1, 0, [1, 0], [1, 1]],
  [0, 1, [1, 1], [0, 1]],
  [-1, 0, [0, 1], [0, 0]],
];

// A rendition's mesh, in feet from its northwest corner, its parts `partFt` across. drawn(i, j)
// says whether to draw part i east and j south. Skirts hang from each drawn part's sides that
// don't meet another drawn part.
export function renditionGeometry(rendition, partFt, drawn = () => true) {
  const n = TILE_CHUNKS;
  const faces = new Faces();
  const corner = (i, j) => [i * partFt, rendition.heights[j * CORNERS + i], j * partFt];
  const shown = (i, j) => i >= 0 && j >= 0 && i < n && j < n && drawn(i, j);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      if (!drawn(i, j)) continue;
      faces.square([corner(i, j), corner(i + 1, j), corner(i, j + 1), corner(i + 1, j + 1)], faces.rgb(rendition.colors, (j * n + i) * 3));
      for (const [di, dj, from, to] of SIDES) {
        if (shown(i + di, j + dj)) continue;
        faces.skirt(corner(i + from[0], j + from[1]), corner(i + to[0], j + to[1]), partFt * SKIRT, faces.rgb(rendition.colors, (j * n + i) * 3, SKIRT_SHADE));
      }
    }
  }
  return faces.geometry();
}

// How a chunk is drawn: from its tile's rendition, flat at cell scale, or in full.
export const COARSE = 0;
export const FINE = 1;
export const FULL = 2;

// A tile's cells as one grid of vertices on their corners, in feet from its northwest corner,
// kept with the cells: each vertex the mean color of the cells round it, with normals for smooth
// shading. The cell-scale and full chunks of a tile pick their squares out of it (gridGeometry).
function cellGrid(cells) {
  if (cells.grid) return cells.grid;
  const side = CELL_CORNERS;
  const positions = new Float32Array(side * side * 3);
  const colors = new Float32Array(side * side * 3);
  const normals = new Float32Array(side * side * 3);
  const color = new THREE.Color();
  const h = (i, j) => cells.heights[Math.max(0, Math.min(side - 1, j)) * side + Math.max(0, Math.min(side - 1, i))];
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      const v = (j * side + i) * 3;
      positions.set([i * CELL_FT, h(i, j), j * CELL_FT], v);
      const sum = [0, 0, 0];
      let count = 0;
      for (const [a, b] of [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]]) {
        if (a < 0 || b < 0 || a >= TILE_CELLS || b >= TILE_CELLS) continue;
        for (let m = 0; m < 3; m++) sum[m] += cells.colors[(b * TILE_CELLS + a) * 3 + m];
        count++;
      }
      color.setRGB(sum[0] / count / 255, sum[1] / count / 255, sum[2] / count / 255, THREE.SRGBColorSpace);
      colors.set([color.r, color.g, color.b], v);
      const [nx, nz] = [(h(i - 1, j) - h(i + 1, j)) / (2 * CELL_FT), (h(i, j - 1) - h(i, j + 1)) / (2 * CELL_FT)];
      const length = Math.hypot(nx, 1, nz);
      normals.set([nx / length, 1 / length, nz / length], v);
    }
  }
  cells.grid = {
    position: new THREE.BufferAttribute(positions, 3),
    color: new THREE.BufferAttribute(colors, 3),
    normal: new THREE.BufferAttribute(normals, 3),
  };
  return cells.grid;
}

// The squares of a tile's cell grid in the chunks `chunks` lists ([i, j]), as a geometry sharing
// the grid's vertices. Null for none.
function gridGeometry(cells, chunks) {
  if (!chunks.length) return null;
  const side = CELL_CORNERS;
  const indices = new Uint16Array(chunks.length * CHUNK_CELLS * CHUNK_CELLS * 6);
  let n = 0;
  for (const [i, j] of chunks) {
    for (let b = j * CHUNK_CELLS; b < (j + 1) * CHUNK_CELLS; b++) {
      for (let a = i * CHUNK_CELLS; a < (i + 1) * CHUNK_CELLS; a++) {
        const [nw, ne, sw, se] = [b * side + a, b * side + a + 1, (b + 1) * side + a, (b + 1) * side + a + 1];
        indices.set([nw, sw, ne, ne, sw, se], n);
        n += 6;
      }
    }
  }
  const grid = cellGrid(cells);
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(grid)) geometry.setAttribute(name, attribute);
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return geometry;
}

// A tile's ground, in feet from its northwest corner, with each chunk drawn as tier(i, j) says:
// { coarse, fine, full } geometries, each null where there's none of it. coarse has the COARSE
// chunks from the tile's rendition, and the skirts that hang from the tile's edges and wherever
// chunks drawn differently meet; fine and full the FINE and FULL chunks' squares from `cells`.
// Without cells, every chunk is COARSE.
export function tileGeometries(rendition, cells, tier) {
  const n = TILE_CHUNKS;
  const faces = new Faces();
  const depth = CHUNK_FT * SKIRT;
  const tierAt = (i, j) => (cells ? tier(i, j) : COARSE);
  const chunkCorner = (i, j) => [i * CHUNK_FT, rendition.heights[j * CORNERS + i], j * CHUNK_FT];
  const cellCorner = (i, j) => [i * CELL_FT, cells.heights[j * CELL_CORNERS + i], j * CELL_FT];
  const lists = { [FINE]: [], [FULL]: [] };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const here = tierAt(i, j);
      const open = (di, dj) => !(i + di >= 0 && j + dj >= 0 && i + di < n && j + dj < n && tierAt(i + di, j + dj) === here);
      if (here !== COARSE) {
        lists[here].push([i, j]);
        chunkSkirts(faces, i, j, open, cellCorner, (k) => faces.rgb(cells.colors, k * 3, SKIRT_SHADE));
        continue;
      }
      faces.square([chunkCorner(i, j), chunkCorner(i + 1, j), chunkCorner(i, j + 1), chunkCorner(i + 1, j + 1)], faces.rgb(rendition.colors, (j * n + i) * 3));
      for (const [di, dj, from, to] of SIDES) {
        if (open(di, dj)) faces.skirt(chunkCorner(i + from[0], j + from[1]), chunkCorner(i + to[0], j + to[1]), depth, faces.rgb(rendition.colors, (j * n + i) * 3, SKIRT_SHADE));
      }
    }
  }
  return {
    coarse: faces.positions.length ? faces.geometry() : null,
    fine: cells && gridGeometry(cells, lists[FINE]),
    full: cells && gridGeometry(cells, lists[FULL]),
  };
}

// Skirts along a chunk's sides that `open(di, dj)` says meet other ground, a cell at a time, in
// the color colorOf(k) gives for the cell k beside each stretch.
function chunkSkirts(faces, i, j, open, cellCorner, colorOf) {
  const depth = CHUNK_FT * SKIRT;
  const [ci, cj] = [i * CHUNK_CELLS, j * CHUNK_CELLS];
  for (const [di, dj, from, to] of SIDES) {
    if (!open(di, dj)) continue;
    const step = [to[0] - from[0], to[1] - from[1]];
    for (let k = 0; k < CHUNK_CELLS; k++) {
      const p = [ci + from[0] * CHUNK_CELLS + step[0] * k, cj + from[1] * CHUNK_CELLS + step[1] * k];
      const q = [p[0] + step[0], p[1] + step[1]];
      const cell = [Math.min(p[0], q[0]) - (di > 0 ? 1 : 0), Math.min(p[1], q[1]) - (dj > 0 ? 1 : 0)];
      faces.skirt(cellCorner(...p), cellCorner(...q), depth, colorOf(cell[1] * TILE_CELLS + cell[0]));
    }
  }
}

// The tile-shaped stand-in groundMaterial wants for a tile's cells: the kinds of ground at each
// cell's middle.
function groundTile(tx, tz, cells) {
  return { coords: [tx, tz], cells: TILE_CELLS, cellFt: CELL_FT, palettes: { terrain: cells.palette }, layers: { terrain: cells.terrain, forest: cells.forest }, roads: [] };
}

// The meshes round a point: tiles within TILE_RADIUS_FT, with their chunks within
// CHUNK_RADIUS_FT at cell scale and within FULL_RADIUS_FT in full, and plates out to FAR_FT.
// Moving works out what each tile should look like; tiles are then made (or made again) a few at a
// time, nearest first, within BUILD_MS a frame (build), each kept as it was until it's replaced.
export class Ground {
  constructor(scene, renditions, renderer) {
    this.renditions = renditions;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.renderer = renderer;
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
    this.meshes = new Map(); // "tx,tz" -> a tile's meshes, its userData.tiers how its chunks are drawn
    this.plates = new Map(); // "px,pz" -> a plate's mesh, its userData.hidden the tiles it leaves out
    this.wanted = new Map(); // "tx,tz" -> how its chunks should be drawn ("index:tier,...")
    this.pending = []; // "tx,tz" of tiles to make, nearest first
    this.at = null;
    this.platesStale = false;
    // Which kinds of ground are shown, each in its range (toggle).
    this.shown = { full: true, fine: true, tile: true, plate: true };
    this.fineChunks = 0;
    this.fullChunks = 0;
  }

  // Works out what's to be drawn round continent feet (x, y, z), again only once that's MOVE_FT
  // from where it was last worked out, then makes some of it.
  update(x, y, z) {
    if (!this.at || Math.hypot(x - this.at[0], y - this.at[1], z - this.at[2]) >= MOVE_FT) this.plan(x, y, z);
    this.build();
  }

  plan(x, y, z) {
    this.at = [x, y, z];
    const tiles = within([x, y, z], TILE_RADIUS_FT, TILE_FT, (tx, tz) => span(this.renditions.tile(tx, tz)));
    // How the chunks near enough to draw at cell scale are drawn, by tile: "tx,tz" -> [chunk index
    // in the tile, FINE or FULL] pairs.
    const near = new Map();
    const local = (c) => c - Math.floor(c / TILE_CHUNKS) * TILE_CHUNKS;
    const chunkSpan = (cx, cz) => {
      const tile = this.renditions.tile(Math.floor(cx / TILE_CHUNKS), Math.floor(cz / TILE_CHUNKS));
      if (!tile) return null;
      const [i, j] = [local(cx), local(cz)];
      const hs = [tile.heights[j * CORNERS + i], tile.heights[j * CORNERS + i + 1], tile.heights[(j + 1) * CORNERS + i], tile.heights[(j + 1) * CORNERS + i + 1]];
      return [Math.min(...hs), Math.max(...hs)];
    };
    const full = within([x, y, z], FULL_RADIUS_FT, CHUNK_FT, chunkSpan);
    for (const key of within([x, y, z], CHUNK_RADIUS_FT, CHUNK_FT, chunkSpan)) {
      const [cx, cz] = key.split(",").map(Number);
      const tileKey = `${Math.floor(cx / TILE_CHUNKS)},${Math.floor(cz / TILE_CHUNKS)}`;
      if (!near.has(tileKey)) near.set(tileKey, []);
      near.get(tileKey).push([local(cz) * TILE_CHUNKS + local(cx), full.has(key) ? FULL : FINE]);
    }
    this.wanted = new Map([...tiles].map((key) => [key, (near.get(key) ?? []).sort((a, b) => a[0] - b[0]).map(([k, t]) => `${k}:${t}`).join()]));
    for (const key of [...this.meshes.keys()]) if (!this.wanted.has(key)) this.drop(this.meshes, key);
    const distance = (key) => {
      const [tx, tz] = key.split(",").map(Number);
      return Math.hypot((tx + 0.5) * TILE_FT - x, (tz + 0.5) * TILE_FT - z);
    };
    this.pending = [...this.wanted].filter(([key, tiers]) => this.meshes.get(key)?.userData.tiers !== tiers).map(([key]) => key);
    this.pending.sort((a, b) => distance(a) - distance(b));
    this.platesStale = true;
  }

  // Makes the tiles waiting to be made, nearest first, for up to BUILD_MS, then the plates once
  // none are waiting.
  build() {
    const start = performance.now();
    while (this.pending.length && performance.now() - start < BUILD_MS) {
      const key = this.pending.shift();
      const made = this.makeTile(key, this.wanted.get(key));
      this.drop(this.meshes, key);
      if (made) {
        this.group.add(made);
        this.meshes.set(key, made);
      }
    }
    const meshes = [...this.meshes.values()];
    this.fineChunks = meshes.reduce((sum, group) => sum + group.userData.fine, 0);
    this.fullChunks = meshes.reduce((sum, group) => sum + group.userData.full, 0);
    if (this.pending.length || !this.platesStale) return;
    this.platesStale = false;
    const [x, y, z] = this.at;
    const far = within([x, y, z], FAR_FT, PLATE_FT, (px, pz) => span(this.renditions.plate(px, pz)));
    // A plate made again when the tiles it leaves out change.
    for (const key of far) if (this.plates.get(key)?.userData.hidden !== this.hiddenIn(key)) this.drop(this.plates, key);
    this.sync(this.plates, far, (key) => {
      const [px, pz] = key.split(",").map(Number);
      const plate = this.renditions.plate(px, pz);
      if (!plate) return null;
      const tileAt = (i, j) => [px * PLATE_TILES + i, pz * PLATE_TILES + j];
      const drawn = (i, j) => Boolean(this.renditions.tile(...tileAt(i, j))) && !this.meshes.has(tileAt(i, j).join());
      const mesh = new THREE.Mesh(renditionGeometry(plate, TILE_FT, drawn), this.material);
      mesh.position.set(px * PLATE_FT, 0, pz * PLATE_FT);
      mesh.userData = { hidden: this.hiddenIn(key), kind: "plate" };
      mesh.visible = this.shown.plate;
      return mesh;
    });
  }

  // A tile's meshes, its chunks drawn as `tiers` says, or null where it has no rendition.
  makeTile(key, tiers) {
    const [tx, tz] = key.split(",").map(Number);
    const tile = this.renditions.tile(tx, tz);
    if (!tile) return null;
    const chunks = new Map(tiers ? tiers.split(",").map((pair) => pair.split(":").map(Number)) : []);
    const cells = chunks.size ? this.renditions.cells(tx, tz) : null;
    const { coarse, fine, full } = tileGeometries(tile, cells, (i, j) => chunks.get(j * TILE_CHUNKS + i) ?? COARSE);
    const group = new THREE.Group();
    group.position.set(tx * TILE_FT, 0, tz * TILE_FT);
    const add = (geometry, material, kind) => {
      if (!geometry) return;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.kind = kind;
      mesh.visible = this.shown[kind];
      group.add(mesh);
    };
    add(coarse, this.material, "tile");
    add(fine, this.material, "fine");
    add(full, full && groundMaterial(this.renderer, { tile: groundTile(tx, tz, cells), origin: [0, 0] }), "full");
    const counts = cells ? [...chunks.values()] : [];
    group.userData = { tiers, fine: counts.filter((t) => t === FINE).length, full: counts.filter((t) => t === FULL).length };
    return group;
  }

  // Shows or hides one kind of ground: "full", "fine" (chunks at cell scale), "tile" (tiles'
  // renditions, with the skirts) or "plate", wherever it's drawn.
  toggle(kind) {
    this.shown[kind] = !this.shown[kind];
    this.group.traverse((mesh) => {
      if (mesh.isMesh && mesh.userData.kind === kind) mesh.visible = this.shown[kind];
    });
  }

  // Which of a plate's tiles ("px,pz") are drawn closer, so the plate leaves them out.
  hiddenIn(key) {
    const [px, pz] = key.split(",").map(Number);
    const hidden = [];
    for (let j = 0; j < PLATE_TILES; j++) for (let i = 0; i < PLATE_TILES; i++) if (this.meshes.has(`${px * PLATE_TILES + i},${pz * PLATE_TILES + j}`)) hidden.push(j * PLATE_TILES + i);
    return hidden.join();
  }

  // Makes the meshes in `wanted` that `meshes` lacks with make(key), which may give null, and
  // drops the ones not wanted.
  sync(meshes, wanted, make) {
    for (const key of [...meshes.keys()]) if (!wanted.has(key)) this.drop(meshes, key);
    for (const key of wanted) {
      if (meshes.has(key)) continue;
      const mesh = make(key);
      if (!mesh) continue;
      this.group.add(mesh);
      meshes.set(key, mesh);
    }
  }

  drop(meshes, key) {
    const object = meshes.get(key);
    if (!object) return;
    this.group.remove(object);
    object.traverse((mesh) => {
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      if (mesh.material !== this.material) disposeGround(mesh.material);
    });
    meshes.delete(key);
  }
}

// The lowest and highest of a rendition's heights, or null for none.
function span(rendition) {
  if (!rendition) return null;
  rendition.span ??= [Math.min(...rendition.heights), Math.max(...rendition.heights)];
  return rendition.span;
}

// The squares `size` across ("i,j") whose ground comes within `radius` of continent feet
// [x, y, z]: spanOf(i, j) gives the lowest and highest of a square's ground, or null where it has
// none.
function within([x, y, z], radius, size, spanOf) {
  const out = new Set();
  const reach = Math.ceil(radius / size);
  const [ci, cj] = [Math.floor(x / size), Math.floor(z / size)];
  for (let j = cj - reach; j <= cj + reach; j++) {
    for (let i = ci - reach; i <= ci + reach; i++) {
      const ys = spanOf(i, j);
      if (!ys) continue;
      const dx = x - Math.max(i * size, Math.min(x, (i + 1) * size));
      const dz = z - Math.max(j * size, Math.min(z, (j + 1) * size));
      const dy = y - Math.max(ys[0], Math.min(y, ys[1]));
      if (Math.hypot(dx, dy, dz) <= radius) out.add(`${i},${j}`);
    }
  }
  return out;
}
