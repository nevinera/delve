import * as THREE from "three";
import { CORNERS, decodePlatter, indexIn, plateIndexIn, platterOf, platterOfPlate } from "../v2/platter.js";
import { CHUNK_FT, PLATE_FT, PLATE_TILES, PLATTER_TILES, TILE_CHUNKS, TILE_FT } from "../v2/sizes.js";

// The ground round the builder, drawn from renditions (v2/platter.js), flat-shaded in their
// parts' colors: each tile within RADIUS_FT as a mesh of its 8×8 chunks, and past that, out to
// FAR_FT, each plate as a mesh of its 8×8 tiles, leaving out the tiles drawn close up. Distances
// are to the nearest point of the box round each one's ground, so flying high, the ground below
// goes to plates too. Skirts hang from the edges to hide the gaps between meshes.

export const RADIUS_FT = 1024;
export const FAR_FT = 24576;
const MOVE_FT = 32; // how far the builder goes before what's drawn is worked out again
const SKIRT = 0.75; // how far a skirt hangs, as a share of a part's size
const SKIRT_SHADE = 0.6;

// A continent's tile renditions, from its platter files.
export class Renditions {
  constructor() {
    this.platters = new Map(); // "px,pz" -> { coords, tiles }
  }

  add(bytes) {
    const platter = decodePlatter(bytes);
    this.platters.set(platter.coords.join(","), platter);
  }

  tile(tx, tz) {
    return this.platters.get(platterOf(tx, tz).join(","))?.tiles.get(indexIn(tx, tz)) ?? null;
  }

  plate(px, pz) {
    return this.platters.get(platterOfPlate(px, pz).join(","))?.plates.get(plateIndexIn(px, pz)) ?? null;
  }

  // The ground's height at continent feet (x, z), straight between chunk corners, or null where
  // there's no tile.
  heightAt(x, z) {
    const [tx, tz] = [Math.floor(x / TILE_FT), Math.floor(z / TILE_FT)];
    const tile = this.tile(tx, tz);
    if (!tile) return null;
    const u = (x - tx * TILE_FT) / CHUNK_FT;
    const v = (z - tz * TILE_FT) / CHUNK_FT;
    const [i, j] = [Math.min(TILE_CHUNKS - 1, Math.floor(u)), Math.min(TILE_CHUNKS - 1, Math.floor(v))];
    const [fu, fv] = [u - i, v - j];
    const h = (a, b) => tile.heights[(j + b) * CORNERS + i + a];
    const top = h(0, 0) + (h(1, 0) - h(0, 0)) * fu;
    const bottom = h(0, 1) + (h(1, 1) - h(0, 1)) * fu;
    return top + (bottom - top) * fv;
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

// A rendition's mesh, in feet from its northwest corner, its parts `partFt` across. drawn(i, j)
// says whether to draw part i east and j south. Skirts hang from each drawn part's sides that
// don't meet another drawn part.
export function renditionGeometry(rendition, partFt, drawn = () => true) {
  const n = TILE_CHUNKS;
  const skirtFt = partFt * SKIRT;
  const positions = [];
  const colors = [];
  const color = new THREE.Color();
  const corner = (i, j) => [i * partFt, rendition.heights[j * CORNERS + i], j * partFt];
  const partColor = (i, j, shade = 1) => {
    const k = (j * n + i) * 3;
    color.setRGB((rendition.colors[k] / 255) * shade, (rendition.colors[k + 1] / 255) * shade, (rendition.colors[k + 2] / 255) * shade, THREE.SRGBColorSpace);
    return [color.r, color.g, color.b];
  };
  const face = (points, rgb) => {
    for (const p of points) {
      positions.push(...p);
      colors.push(...rgb);
    }
  };
  const shown = (i, j) => i >= 0 && j >= 0 && i < n && j < n && drawn(i, j);
  // Each side of a part: the part beside it, and its two corners going clockwise seen from above.
  const SIDES = [
    [0, -1, [0, 0], [1, 0]],
    [1, 0, [1, 0], [1, 1]],
    [0, 1, [1, 1], [0, 1]],
    [-1, 0, [0, 1], [0, 0]],
  ];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      if (!drawn(i, j)) continue;
      const [a, b, c, d] = [corner(i, j), corner(i + 1, j), corner(i, j + 1), corner(i + 1, j + 1)];
      face([a, c, b, b, c, d], partColor(i, j));
      for (const [di, dj, from, to] of SIDES) {
        if (shown(i + di, j + dj)) continue;
        const [p, q] = [corner(i + from[0], j + from[1]), corner(i + to[0], j + to[1])];
        const [pd, qd] = [[p[0], p[1] - skirtFt, p[2]], [q[0], q[1] - skirtFt, q[2]]];
        face([p, pd, q, q, pd, qd], partColor(i, j, SKIRT_SHADE));
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// The meshes round a point: tiles within RADIUS_FT, and plates out to FAR_FT, made as they come
// in range and dropped as they leave it.
export class Ground {
  constructor(scene, renditions) {
    this.renditions = renditions;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
    this.meshes = new Map(); // "tx,tz" -> a tile's mesh
    this.plates = new Map(); // "px,pz" -> a plate's mesh, its userData.hidden the tiles it leaves out
    this.at = null;
  }

  // Draws the ground round continent feet (x, y, z), again only once that's MOVE_FT from where it
  // was last worked out.
  update(x, y, z) {
    if (this.at && Math.hypot(x - this.at[0], y - this.at[1], z - this.at[2]) < MOVE_FT) return;
    this.at = [x, y, z];
    const tileSpan = (tx, tz) => span(this.renditions.tile(tx, tz));
    const near = within([x, y, z], RADIUS_FT, TILE_FT, tileSpan);
    this.sync(this.meshes, near, (key) => {
      const [tx, tz] = key.split(",").map(Number);
      const tile = this.renditions.tile(tx, tz);
      return tile && this.mesh(renditionGeometry(tile, CHUNK_FT), tx * TILE_FT, tz * TILE_FT);
    });
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

  // Which of a plate's tiles ("px,pz") are drawn close up, so the plate leaves them out.
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
