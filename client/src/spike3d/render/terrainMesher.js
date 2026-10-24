import * as THREE from "three";
import { CELL_FT, TERRAIN, TERRAINS } from "../world/constants.js";
import { fbm, smoothstep, valueNoise } from "../world/noise.js";

export const CHUNK_CELLS = 32;
const SUBDIV = 2; // vertices per cell edge
const STEP = CELL_FT / SUBDIV;
const VERTS = CHUNK_CELLS * SUBDIV + 1;
const SKIRT_BOTTOM = -30;

// What's drawn: the gameplay height plus a little noise, more on steep
// ground. A pure function of position, so neighbouring chunks agree on
// their shared edge and normals stay seamless.
export function renderHeight(world, x, z) {
  const base = world.heightAt(x, z);
  const amp = 0.35 + 2.4 * smoothstep(0.45, 0.95, world.slopeAt(x, z, 2));
  return base + (fbm(x / 10, z / 10, 3, 77) - 0.5) * 2 * amp;
}

// Soft splat weights at a point: bilinear over the four nearest cells'
// one-hot terrain, sampled at a noise-warped position, squared and
// normalised so edges read clearly but aren't pixel-straight.
const scratchWeights = new Float32Array(TERRAINS.length);
export function splatAt(world, x, z) {
  const wx = x + (valueNoise(x / 14, z / 14, 91) - 0.5) * 9;
  const wz = z + (valueNoise(x / 14, z / 14, 92) - 0.5) * 9;
  const u = wx / CELL_FT - 0.5, v = wz / CELL_FT - 0.5;
  const i = Math.floor(u), j = Math.floor(v);
  const tu = u - i, tv = v - j;
  const wts = scratchWeights.fill(0);
  wts[world.terrain[world.index(i, j)]] += (1 - tu) * (1 - tv);
  wts[world.terrain[world.index(i + 1, j)]] += tu * (1 - tv);
  wts[world.terrain[world.index(i, j + 1)]] += (1 - tu) * tv;
  wts[world.terrain[world.index(i + 1, j + 1)]] += tu * tv;
  let sum = 0;
  for (let k = 0; k < wts.length; k++) sum += (wts[k] *= wts[k]);
  for (let k = 0; k < wts.length; k++) wts[k] /= sum;
  return wts;
}

let sharedIndex = null;
function chunkIndex() {
  if (sharedIndex) return sharedIndex;
  const q = VERTS - 1;
  const idx = new Uint32Array(q * q * 6);
  let k = 0;
  for (let z = 0; z < q; z++) {
    for (let x = 0; x < q; x++) {
      const a = z * VERTS + x, b = a + 1, c = a + VERTS, d = c + 1;
      // alternate the diagonal so slopes don't all crease the same way
      if ((x + z) & 1) idx.set([a, c, b, b, c, d], k);
      else idx.set([a, c, d, a, d, b], k);
      k += 6;
    }
  }
  sharedIndex = new THREE.BufferAttribute(idx, 1);
  return sharedIndex;
}

// The terrain as square chunks of 32x32 cells (one draw call each,
// frustum-culled by three), rebuilt only when an edit touches them.
export class TerrainMesher {
  constructor(world, material, parent) {
    this.world = world;
    this.material = material;
    this.group = new THREE.Group();
    parent.add(this.group);
    this.cols = world.w / CHUNK_CELLS;
    this.rows = world.h / CHUNK_CELLS;
    this.chunks = new Map();
    this.dirty = new Set();
    this.skirt = null;
    this.skirtMaterial = new THREE.MeshLambertMaterial({vertexColors: true});
  }

  buildAll() {
    for (let cz = 0; cz < this.rows; cz++) for (let cx = 0; cx < this.cols; cx++) this.dirty.add(`${cx},${cz}`);
    this.rebuildDirty(Infinity);
  }

  // rect in cells. Bicubic heights and splat blending both reach two
  // cells past an edit.
  markDirty(rect) {
    const c0x = Math.max(0, Math.floor((rect.x0 - 2) / CHUNK_CELLS));
    const c1x = Math.min(this.cols - 1, Math.floor((rect.x1 + 2) / CHUNK_CELLS));
    const c0z = Math.max(0, Math.floor((rect.z0 - 2) / CHUNK_CELLS));
    const c1z = Math.min(this.rows - 1, Math.floor((rect.z1 + 2) / CHUNK_CELLS));
    for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) this.dirty.add(`${cx},${cz}`);
  }

  // Rebuilds up to max dirty chunks; returns the rebuilt chunks' cell rects.
  rebuildDirty(max = 4) {
    const rebuilt = [];
    for (const key of this.dirty) {
      if (rebuilt.length >= max) break;
      this.dirty.delete(key);
      const [cx, cz] = key.split(",").map(Number);
      this.buildChunk(cx, cz);
      rebuilt.push({x0: cx * CHUNK_CELLS, z0: cz * CHUNK_CELLS, x1: (cx + 1) * CHUNK_CELLS - 1, z1: (cz + 1) * CHUNK_CELLS - 1});
    }
    if (rebuilt.some((r) => r.x0 === 0 || r.z0 === 0 || r.x1 === this.world.w - 1 || r.z1 === this.world.h - 1)) this.buildSkirt();
    return rebuilt;
  }

  buildChunk(cx, cz) {
    const world = this.world;
    const ox = cx * CHUNK_CELLS * CELL_FT;
    const oz = cz * CHUNK_CELLS * CELL_FT;
    // heights with a one-vertex border, for normals
    const B = VERTS + 2;
    const hs = new Float32Array(B * B);
    for (let z = 0; z < B; z++) {
      for (let x = 0; x < B; x++) hs[z * B + x] = renderHeight(world, ox + (x - 1) * STEP, oz + (z - 1) * STEP);
    }
    const n = VERTS * VERTS;
    const pos = new Float32Array(n * 3);
    const nor = new Float32Array(n * 3);
    const splatA = new Float32Array(n * 4);
    const splatB = new Float32Array(n * 4);
    for (let z = 0; z < VERTS; z++) {
      for (let x = 0; x < VERTS; x++) {
        const i = z * VERTS + x;
        const wx = ox + x * STEP, wz = oz + z * STEP;
        const hb = (z + 1) * B + (x + 1);
        pos[i * 3] = wx;
        pos[i * 3 + 1] = hs[hb];
        pos[i * 3 + 2] = wz;
        const nx = hs[hb - 1] - hs[hb + 1];
        const nz = hs[hb - B] - hs[hb + B];
        const ny = 2 * STEP;
        const len = Math.hypot(nx, ny, nz);
        nor[i * 3] = nx / len;
        nor[i * 3 + 1] = ny / len;
        nor[i * 3 + 2] = nz / len;
        const s = splatAt(world, wx, wz);
        splatA.set([s[TERRAIN.grass], s[TERRAIN.dirt], s[TERRAIN.sand], s[TERRAIN.road]], i * 4);
        splatB.set([s[TERRAIN.mud], s[TERRAIN.moss], world.swampAt(wx, wz), 0], i * 4);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    geo.setAttribute("aSplatA", new THREE.BufferAttribute(splatA, 4));
    geo.setAttribute("aSplatB", new THREE.BufferAttribute(splatB, 4));
    geo.setIndex(chunkIndex());
    geo.computeBoundingSphere();
    geo.computeBoundingBox();

    const key = `${cx},${cz}`;
    const old = this.chunks.get(key);
    if (old) {
      old.geometry.dispose();
      old.geometry = geo;
    } else {
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      this.chunks.set(key, mesh);
    }
  }

  // Hides chunks wholly beyond range (the fog's far edge).
  cull(x, z, range) {
    const size = CHUNK_CELLS * CELL_FT;
    for (const [key, mesh] of this.chunks) {
      const [cx, cz] = key.split(",").map(Number);
      const dx = Math.max(cx * size - x, 0, x - (cx + 1) * size);
      const dz = Math.max(cz * size - z, 0, z - (cz + 1) * size);
      mesh.visible = dx * dx + dz * dz < range * range;
    }
  }

  // The diorama skirt: earth walls down from the world's edge.
  buildSkirt() {
    const world = this.world;
    const W = world.widthFt, D = world.depthFt;
    const edges = [
      {from: [0, 0], to: [W, 0], out: [0, -1]},
      {from: [W, 0], to: [W, D], out: [1, 0]},
      {from: [W, D], to: [0, D], out: [0, 1]},
      {from: [0, D], to: [0, 0], out: [-1, 0]},
    ];
    const pos = [], nor = [], col = [], idx = [];
    const top = new THREE.Color(0x5a4630), bottom = new THREE.Color(0x2b2118);
    for (const e of edges) {
      const len = Math.hypot(e.to[0] - e.from[0], e.to[1] - e.from[1]);
      const steps = Math.round(len / STEP);
      const base = pos.length / 3;
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const x = e.from[0] + (e.to[0] - e.from[0]) * t;
        const z = e.from[1] + (e.to[1] - e.from[1]) * t;
        pos.push(x, renderHeight(world, x, z), z, x, SKIRT_BOTTOM, z);
        nor.push(e.out[0], 0, e.out[1], e.out[0], 0, e.out[1]);
        col.push(top.r, top.g, top.b, bottom.r, bottom.g, bottom.b);
        if (k < steps) {
          const a = base + k * 2;
          idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    if (this.skirt) {
      this.skirt.geometry.dispose();
      this.skirt.geometry = geo;
    } else {
      this.skirt = new THREE.Mesh(geo, this.skirtMaterial);
      this.skirtMaterial.side = THREE.DoubleSide;
      this.group.add(this.skirt);
    }
  }
}
