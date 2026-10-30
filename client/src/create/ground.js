import * as THREE from "three";
import { CELL_CORNERS, TILE_CELLS, decodePlate, tileIndexInPlate } from "../v2/plate.js";
import { CORNERS, decodePlatter, indexIn, plateIndexIn, platterOf, platterOfPlate } from "../v2/platter.js";
import { CELL_FT, CHUNK_CELLS, CHUNK_FT, PLATE_FT, PLATE_TILES, PLATTER_TILES, TILE_CHUNKS, TILE_FT } from "../v2/sizes.js";

// The ground round the builder, flat-shaded in its parts' colors, finer the nearer it is:
// - within CHUNK_RADIUS_FT, chunks at cell scale (their renditions, v2/plate.js)
// - within TILE_RADIUS_FT, the rest of each tile from its rendition, a part a chunk (v2/platter.js)
// - out to FAR_FT, plates from their renditions, a part a tile, leaving out the tiles drawn closer.
// Distances are to the nearest point of the box round each one's ground, so flying high, the
// ground below goes coarser too. Skirts hang from where finer and coarser ground meet, to hide the
// gaps between them.

export const CHUNK_RADIUS_FT = 1024;
export const TILE_RADIUS_FT = 4096;
export const FAR_FT = 24576;
const MOVE_FT = 32; // how far the builder goes before what's drawn is worked out again
const SKIRT = 0.75; // how far a skirt hangs, as a share of a coarse part's size
const SKIRT_SHADE = 0.6;
const KEEP_PLATES = 16; // plate files kept decoded

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

  // A tile's ground at cell scale, { heights, colors }, or null.
  cells(tx, tz) {
    const key = `${Math.floor(tx / PLATE_TILES)},${Math.floor(tz / PLATE_TILES)}`;
    let plate = this.decoded.get(key);
    if (plate) this.decoded.delete(key);
    else if (this.plateFiles.has(key)) plate = decodePlate(this.plateFiles.get(key));
    if (!plate) return null;
    this.decoded.set(key, plate);
    if (this.decoded.size > KEEP_PLATES) this.decoded.delete(this.decoded.keys().next().value);
    return plate.tiles.get(tileIndexInPlate(tx, tz)) ?? null;
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

// A tile's mesh, in feet from its northwest corner: the chunks fine(i, j) says at cell scale from
// `cells`, and the rest from its rendition. Skirts hang from the tile's edges, and wherever a fine
// chunk meets a coarse one.
export function tileGeometry(rendition, cells, fine) {
  const n = TILE_CHUNKS;
  const faces = new Faces();
  const depth = CHUNK_FT * SKIRT;
  const isFine = (i, j) => Boolean(cells) && fine(i, j);
  const chunkCorner = (i, j) => [i * CHUNK_FT, rendition.heights[j * CORNERS + i], j * CHUNK_FT];
  const cellCorner = (i, j) => [i * CELL_FT, cells.heights[j * CELL_CORNERS + i], j * CELL_FT];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const here = isFine(i, j);
      const meets = (di, dj) => i + di >= 0 && j + dj >= 0 && i + di < n && j + dj < n && isFine(i + di, j + dj) === here;
      if (!here) {
        const rgb = faces.rgb(rendition.colors, (j * n + i) * 3);
        faces.square([chunkCorner(i, j), chunkCorner(i + 1, j), chunkCorner(i, j + 1), chunkCorner(i + 1, j + 1)], rgb);
        for (const [di, dj, from, to] of SIDES) {
          if (!meets(di, dj)) faces.skirt(chunkCorner(i + from[0], j + from[1]), chunkCorner(i + to[0], j + to[1]), depth, faces.rgb(rendition.colors, (j * n + i) * 3, SKIRT_SHADE));
        }
        continue;
      }
      const [ci, cj] = [i * CHUNK_CELLS, j * CHUNK_CELLS];
      for (let b = 0; b < CHUNK_CELLS; b++) {
        for (let a = 0; a < CHUNK_CELLS; a++) {
          const [x, z] = [ci + a, cj + b];
          faces.square([cellCorner(x, z), cellCorner(x + 1, z), cellCorner(x, z + 1), cellCorner(x + 1, z + 1)], faces.rgb(cells.colors, (z * TILE_CELLS + x) * 3));
        }
      }
      // Skirts along the chunk's sides that meet coarse ground, a cell at a time, in the color of
      // the cell beside each stretch.
      for (const [di, dj, from, to] of SIDES) {
        if (meets(di, dj)) continue;
        const step = [to[0] - from[0], to[1] - from[1]];
        for (let k = 0; k < CHUNK_CELLS; k++) {
          const p = [ci + from[0] * CHUNK_CELLS + step[0] * k, cj + from[1] * CHUNK_CELLS + step[1] * k];
          const q = [p[0] + step[0], p[1] + step[1]];
          const cell = [Math.min(p[0], q[0]) - (di > 0 ? 1 : 0), Math.min(p[1], q[1]) - (dj > 0 ? 1 : 0)];
          faces.skirt(cellCorner(...p), cellCorner(...q), depth, faces.rgb(cells.colors, (cell[1] * TILE_CELLS + cell[0]) * 3, SKIRT_SHADE));
        }
      }
    }
  }
  return faces.geometry();
}

// The meshes round a point: tiles within TILE_RADIUS_FT, with their chunks within
// CHUNK_RADIUS_FT at cell scale, and plates out to FAR_FT, made as they come in range and dropped
// as they leave it.
export class Ground {
  constructor(scene, renditions) {
    this.renditions = renditions;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
    this.meshes = new Map(); // "tx,tz" -> a tile's mesh, its userData.fine the chunks at cell scale
    this.plates = new Map(); // "px,pz" -> a plate's mesh, its userData.hidden the tiles it leaves out
    this.at = null;
    this.fineChunks = 0;
  }

  // Draws the ground round continent feet (x, y, z), again only once that's MOVE_FT from where it
  // was last worked out.
  update(x, y, z) {
    if (this.at && Math.hypot(x - this.at[0], y - this.at[1], z - this.at[2]) < MOVE_FT) return;
    this.at = [x, y, z];
    const tiles = within([x, y, z], TILE_RADIUS_FT, TILE_FT, (tx, tz) => span(this.renditions.tile(tx, tz)));
    // The chunks near enough to draw at cell scale, by tile: "tx,tz" -> chunk indexes in the tile.
    const fine = new Map();
    const local = (c) => c - Math.floor(c / TILE_CHUNKS) * TILE_CHUNKS;
    const chunkSpan = (cx, cz) => {
      const tile = this.renditions.tile(Math.floor(cx / TILE_CHUNKS), Math.floor(cz / TILE_CHUNKS));
      if (!tile) return null;
      const [i, j] = [local(cx), local(cz)];
      const hs = [tile.heights[j * CORNERS + i], tile.heights[j * CORNERS + i + 1], tile.heights[(j + 1) * CORNERS + i], tile.heights[(j + 1) * CORNERS + i + 1]];
      return [Math.min(...hs), Math.max(...hs)];
    };
    for (const key of within([x, y, z], CHUNK_RADIUS_FT, CHUNK_FT, chunkSpan)) {
      const [cx, cz] = key.split(",").map(Number);
      const tileKey = `${Math.floor(cx / TILE_CHUNKS)},${Math.floor(cz / TILE_CHUNKS)}`;
      if (!fine.has(tileKey)) fine.set(tileKey, []);
      fine.get(tileKey).push(local(cz) * TILE_CHUNKS + local(cx));
    }
    const fineOf = (key) => (fine.get(key) ?? []).sort((a, b) => a - b).join();
    for (const key of tiles) if (this.meshes.has(key) && this.meshes.get(key).userData.fine !== fineOf(key)) this.drop(this.meshes, key);
    this.sync(this.meshes, tiles, (key) => {
      const [tx, tz] = key.split(",").map(Number);
      const tile = this.renditions.tile(tx, tz);
      if (!tile) return null;
      const chunks = new Set(fine.get(key) ?? []);
      const cells = chunks.size ? this.renditions.cells(tx, tz) : null;
      const mesh = this.mesh(tileGeometry(tile, cells, (i, j) => chunks.has(j * TILE_CHUNKS + i)), tx * TILE_FT, tz * TILE_FT);
      mesh.userData.fine = fineOf(key);
      mesh.userData.drawnFine = cells ? chunks.size : 0;
      return mesh;
    });
    this.fineChunks = [...this.meshes.values()].reduce((sum, mesh) => sum + mesh.userData.drawnFine, 0);
    const far = within([x, y, z], FAR_FT, PLATE_FT, (px, pz) => span(this.renditions.plate(px, pz)));
    // A plate made again when the tiles it leaves out change.
    for (const key of far) if (this.plates.get(key)?.userData.hidden !== this.hiddenIn(key)) this.drop(this.plates, key);
    this.sync(this.plates, far, (key) => {
      const [px, pz] = key.split(",").map(Number);
      const plate = this.renditions.plate(px, pz);
      if (!plate) return null;
      const tileAt = (i, j) => [px * PLATE_TILES + i, pz * PLATE_TILES + j];
      const drawn = (i, j) => Boolean(this.renditions.tile(...tileAt(i, j))) && !this.meshes.has(tileAt(i, j).join());
      const mesh = this.mesh(renditionGeometry(plate, TILE_FT, drawn), px * PLATE_FT, pz * PLATE_FT);
      mesh.userData.hidden = this.hiddenIn(key);
      return mesh;
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
    const mesh = meshes.get(key);
    if (!mesh) return;
    this.group.remove(mesh);
    mesh.geometry.dispose();
    meshes.delete(key);
  }

  mesh(geometry, x, z) {
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.position.set(x, 0, z);
    return mesh;
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
