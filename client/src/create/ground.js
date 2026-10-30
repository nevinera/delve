import * as THREE from "three";
import { CORNERS, decodePlatter, indexIn, platterOf } from "../v2/platter.js";
import { CHUNK_FT, PLATTER_TILES, TILE_CHUNKS, TILE_FT } from "../v2/sizes.js";

// The ground round the builder, drawn from tiles' renditions (v2/platter.js): each tile within
// RADIUS_FT a mesh of its 8×8 chunks, flat-shaded in their colors, with a skirt hanging from its
// edges to hide the gaps between tiles.

export const RADIUS_FT = 1024;
const SKIRT_FT = 24;
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

// A tile's mesh, in feet from its northwest corner.
export function tileGeometry(tile) {
  const positions = [];
  const colors = [];
  const color = new THREE.Color();
  const corner = (i, j) => [i * CHUNK_FT, tile.heights[j * CORNERS + i], j * CHUNK_FT];
  const chunkColor = (i, j, shade = 1) => {
    const k = (j * TILE_CHUNKS + i) * 3;
    color.setRGB((tile.colors[k] / 255) * shade, (tile.colors[k + 1] / 255) * shade, (tile.colors[k + 2] / 255) * shade, THREE.SRGBColorSpace);
    return [color.r, color.g, color.b];
  };
  const face = (points, rgb) => {
    for (const p of points) {
      positions.push(...p);
      colors.push(...rgb);
    }
  };
  for (let j = 0; j < TILE_CHUNKS; j++) {
    for (let i = 0; i < TILE_CHUNKS; i++) {
      const [a, b, c, d] = [corner(i, j), corner(i + 1, j), corner(i, j + 1), corner(i + 1, j + 1)];
      const rgb = chunkColor(i, j);
      face([a, c, b, b, c, d], rgb);
    }
  }
  // Skirts, along each edge: [the corners along it, the chunk beside each stretch].
  const n = TILE_CHUNKS;
  const edges = [
    [(k) => corner(k, 0), (k) => [k, 0]],
    [(k) => corner(n, k), (k) => [n - 1, k]],
    [(k) => corner(n - k, n), (k) => [n - 1 - k, n - 1]],
    [(k) => corner(0, n - k), (k) => [0, n - 1 - k]],
  ];
  for (const [along, chunk] of edges) {
    for (let k = 0; k < n; k++) {
      const [p, q] = [along(k), along(k + 1)];
      const [pd, qd] = [[p[0], p[1] - SKIRT_FT, p[2]], [q[0], q[1] - SKIRT_FT, q[2]]];
      face([p, pd, q, q, pd, qd], chunkColor(...chunk(k), SKIRT_SHADE));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// The meshes of the tiles round a point, made as they come within RADIUS_FT and dropped as they
// leave it.
export class Ground {
  constructor(scene, renditions) {
    this.renditions = renditions;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
    this.meshes = new Map(); // "tx,tz" -> mesh
  }

  update(x, z) {
    const wanted = new Set();
    const reach = Math.ceil(RADIUS_FT / TILE_FT);
    const [cx, cz] = [Math.floor(x / TILE_FT), Math.floor(z / TILE_FT)];
    for (let tz = cz - reach; tz <= cz + reach; tz++) {
      for (let tx = cx - reach; tx <= cx + reach; tx++) {
        // The nearest point of the tile to (x, z).
        const nx = Math.max(tx * TILE_FT, Math.min(x, (tx + 1) * TILE_FT));
        const nz = Math.max(tz * TILE_FT, Math.min(z, (tz + 1) * TILE_FT));
        if (Math.hypot(nx - x, nz - z) <= RADIUS_FT) wanted.add(`${tx},${tz}`);
      }
    }
    for (const [key, mesh] of this.meshes) {
      if (wanted.has(key)) continue;
      this.group.remove(mesh);
      mesh.geometry.dispose();
      this.meshes.delete(key);
    }
    for (const key of wanted) {
      if (this.meshes.has(key)) continue;
      const [tx, tz] = key.split(",").map(Number);
      const tile = this.renditions.tile(tx, tz);
      if (!tile) continue;
      const mesh = new THREE.Mesh(tileGeometry(tile), this.material);
      mesh.position.set(tx * TILE_FT, 0, tz * TILE_FT);
      this.group.add(mesh);
      this.meshes.set(key, mesh);
    }
  }
}
