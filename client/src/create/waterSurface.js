import * as THREE from "three";
import { setWaterTime, waterMaterial } from "../editor/waterMaterial.js";
import { WATER_TYPES } from "../v2/water.js";
import { CELL_FT, TILE_FT } from "../v2/sizes.js";

// The water's surface (v2/water.js) on the tiles round the builder whose ground's drawn from their
// cells (ground.js's FULL and FINE tiers; coarser, the ground draws the water too): each
// tile's wet cells, and a cell more round them at the level of the water next to it, which the
// ground hides where it rises out of it, so the shore's where the two meet. Each corner's at the
// average level of the wet cells round it, so sloping water's smooth. The water fades in
// over its first SHORE_FADE_FT of depth there (editor/waterMaterial.js). Each type has its own look.
// Farther off, and where it's not drawn, sea.js's plane stands in for the sea.

const REACH_TILES = 8; // ground.js's FINE_TILES
const COARSE = 2; // ground.js's tier drawn from tiles' renditions
const LOOK_S = 0.25; // how often what's drawn is looked over
const CELLS = TILE_FT / CELL_FT;
const CORNERS = CELLS + 1;
const DEEP_FT = 1; // water this deep at each corner of a run of cells is drawn as one quad
export const SHORE_FADE_FT = 0.25; // how deep the water is where it's no longer faded at its shore
// How each type looks.
export const WATER_LOOKS = {
  sea: { color: 0x1f5a85, opacity: 0.9 },
  lake: { color: 0x3a78b8, opacity: 0.85 },
  pond: { color: 0x3c7a86, opacity: 0.85 },
  swamp: { color: 0x4d5a34, opacity: 0.92 },
  river: { color: 0x3a78b8, opacity: 0.85 },
  stream: { color: 0x4a8ac0, opacity: 0.8 },
};

export class WaterSurfaces {
  constructor(scene, renditions, renderer, ground) {
    this.renditions = renditions;
    this.ground = ground;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.materials = WATER_TYPES.map((type) => waterMaterial(renderer, { ...WATER_LOOKS[type], shoreFadeFt: SHORE_FADE_FT }));
    this.meshes = new Map(); // "tx,tz" -> { made from, meshes }
    this.drawn = new Set(); // "tx,tz" of the tiles whose water's drawn here, wet or not
    this.version = 0; // counts changes to `drawn`
    this.since = LOOK_S;
  }

  // Each frame, with the builder at continent feet (x, z), and `shown` whether the ground near is
  // drawn finely enough.
  tick(dt, x, z, shown) {
    setWaterTime(performance.now() / 1000);
    this.group.visible = shown;
    if ((this.since += dt) < LOOK_S) return;
    this.since = 0;
    const [ax, az] = [Math.floor(x / TILE_FT), Math.floor(z / TILE_FT)];
    const drawn = new Set();
    const r = this.renditions;
    for (let tz = az - REACH_TILES; tz <= az + REACH_TILES; tz++) {
      for (let tx = ax - REACH_TILES; tx <= ax + REACH_TILES; tx++) {
        if (!shown || !this.ground.anchor || !r.tile(tx, tz) || !r.hasCells(tx, tz) || !(this.ground.tier(tx, tz) < COARSE)) continue;
        const cells = r.cells(tx, tz);
        if (!cells) continue;
        const key = `${tx},${tz}`;
        drawn.add(key);
        // Made again when its water or ground, or a neighbour's water, changes.
        const from = [cells.water, cells.colors, ...[[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dx, dz]) => this.waterOf(tx + dx, tz + dz))];
        const had = this.meshes.get(key);
        if (had && had.from.every((v, k) => v === from[k])) continue;
        if (had) this.remove(key);
        const meshes = this.make(tx, tz, cells);
        for (const mesh of meshes) this.group.add(mesh);
        this.meshes.set(key, { from, meshes });
      }
    }
    for (const key of this.meshes.keys()) if (!drawn.has(key)) this.remove(key);
    if (drawn.size !== this.drawn.size || [...drawn].some((key) => !this.drawn.has(key))) {
      this.drawn = drawn;
      this.version++;
    }
  }

  // Tile (tx, tz)'s water, where its cells are read, or null.
  waterOf(tx, tz) {
    const r = this.renditions;
    return r.tile(tx, tz) && r.hasCells(tx, tz) ? (r.cells(tx, tz)?.water ?? null) : null;
  }

  // The meshes for tile (tx, tz)'s water, one for each type in it.
  make(tx, tz, { water, heights }) {
    // The level and type each cell's drawn at: its own, or a wet neighbour's, the highest.
    const level = new Float32Array(CELLS * CELLS).fill(NaN);
    const type = new Uint8Array(CELLS * CELLS);
    const levelAt = (i, j) => {
      let [w, a, b] = [water, i, j];
      if (i < 0 || j < 0 || i >= CELLS || j >= CELLS) {
        const [dx, dz] = [Math.floor(i / CELLS), Math.floor(j / CELLS)];
        w = this.waterOf(tx + dx, tz + dz);
        [a, b] = [i - dx * CELLS, j - dz * CELLS];
      }
      return w ? [w.level[b * CELLS + a], w.type[b * CELLS + a]] : [NaN, 0];
    };
    let any = false;
    for (let j = 0; j < CELLS; j++) {
      for (let i = 0; i < CELLS; i++) {
        let [best, kind] = levelAt(i, j);
        if (Number.isNaN(best)) {
          for (let dj = -1; dj <= 1; dj++) {
            for (let di = -1; di <= 1; di++) {
              const [l, t] = levelAt(i + di, j + dj);
              if (!Number.isNaN(l) && !(l <= best)) [best, kind] = [l, t];
            }
          }
        }
        if (Number.isNaN(best)) continue;
        level[j * CELLS + i] = best;
        type[j * CELLS + i] = kind;
        any = true;
      }
    }
    if (!any) return [];
    // Each corner's level: the average of the wet cells' round it, so a sloping course's water is
    // one surface, not steps; where none's wet, the level its cell's drawn at.
    const corners = new Float32Array(CORNERS * CORNERS);
    for (let cj = 0; cj < CORNERS; cj++) {
      for (let ci = 0; ci < CORNERS; ci++) {
        let [sum, n] = [0, 0];
        for (const [i, j] of [[ci - 1, cj - 1], [ci, cj - 1], [ci - 1, cj], [ci, cj]]) {
          const [l] = levelAt(i, j);
          if (!Number.isNaN(l)) [sum, n] = [sum + l, n + 1];
        }
        corners[cj * CORNERS + ci] = n ? sum / n : NaN;
      }
    }
    // Quads along each row: deep runs at one level and type as one.
    const byType = WATER_TYPES.map(() => ({ positions: [], depths: [] }));
    const cornerOf = (ci, cj, l) => {
      const c = corners[cj * CORNERS + ci];
      return Number.isNaN(c) ? l : c;
    };
    const deep = (i, j, l) => l - heights[j * CORNERS + i] >= DEEP_FT && cornerOf(i, j, l) === l;
    const deepCell = (i, j, l) => deep(i, j, l) && deep(i + 1, j, l) && deep(i, j + 1, l) && deep(i + 1, j + 1, l);
    const [x0, z0] = [tx * TILE_FT, tz * TILE_FT];
    for (let j = 0; j < CELLS; j++) {
      for (let i = 0; i < CELLS; ) {
        const k = j * CELLS + i;
        const l = level[k];
        if (Number.isNaN(l)) {
          i++;
          continue;
        }
        let end = i + 1;
        if (deepCell(i, j, l)) while (end < CELLS && level[j * CELLS + end] === l && type[j * CELLS + end] === type[k] && deepCell(end, j, l)) end++;
        const { positions, depths } = byType[type[k]];
        const corner = (ci, cj) => {
          const at = cornerOf(ci, cj, l);
          positions.push(x0 + ci * CELL_FT, at, z0 + cj * CELL_FT);
          depths.push(at - heights[cj * CORNERS + ci]);
        };
        for (const [ci, cj] of [[i, j], [i, j + 1], [end, j], [end, j], [i, j + 1], [end, j + 1]]) corner(ci, cj);
        i = end;
      }
    }
    return byType.flatMap(({ positions, depths }, t) => {
      if (!positions.length) return [];
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      g.setAttribute("depth", new THREE.Float32BufferAttribute(depths, 1));
      g.setAttribute("flow", new THREE.Float32BufferAttribute(new Float32Array(positions.length), 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(Float32Array.from({ length: positions.length }, (_, n) => (n % 3 === 1 ? 1 : 0)), 3));
      const mesh = new THREE.Mesh(g, this.materials[t]);
      mesh.renderOrder = 1;
      return [mesh];
    });
  }

  remove(key) {
    for (const mesh of this.meshes.get(key).meshes) {
      mesh.geometry.dispose();
      this.group.remove(mesh);
    }
    this.meshes.delete(key);
  }
}
