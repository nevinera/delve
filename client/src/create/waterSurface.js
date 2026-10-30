import * as THREE from "three";
import { setWaterTime, waterMaterial } from "../editor/waterMaterial.js";
import { WATER_TYPES } from "../v2/water.js";
import { courseBox, flowOf } from "../v2/courses.js";
import { RUNNING } from "../v2/look.js";
import { CELL_FT, TILE_FT } from "../v2/sizes.js";

// The water's surface (v2/water.js) on the tiles round the builder whose ground's drawn from their
// cells (ground.js's FULL and FINE tiers; coarser, the ground draws the water too): each
// tile's wet cells, and a cell more round them at the level of the water next to it, which the
// ground hides where it rises out of it, so the shore's where the two meet. Each corner's at the
// average level of the wet cells round it near its cell's, so sloping water's smooth. The water fades in
// over its first SHORE_FADE_FT of depth there (editor/waterMaterial.js). Each type has its own look.
// Farther off, and where it's not drawn, sea.js's plane stands in for the sea.

const REACH_TILES = 8; // ground.js's FINE_TILES
const COARSE = 2; // ground.js's tier drawn from tiles' renditions
const LOOK_S = 0.25; // how often what's drawn is looked over
const CELLS = TILE_FT / CELL_FT;
const CORNERS = CELLS + 1;
const LIP_FT = 3; // a course's water this much higher or lower than a cell's is over a fall from it
const STEP_FT = 1.5; // water this much higher or lower than a cell's isn't smoothed into it
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
    this.materials = WATER_TYPES.map((type) => waterMaterial(renderer, { ...WATER_LOOKS[type], shoreFadeFt: SHORE_FADE_FT, deep: true }));
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
          // Only where the ground rises out of it, to hide its edge; not where it falls away, as
          // under a fall's lip, where it'd hang in the air.
          const c = j * CORNERS + i;
          if (Math.max(heights[c], heights[c + 1], heights[c + CORNERS], heights[c + CORNERS + 1]) < best) continue;
        }
        if (Number.isNaN(best)) continue;
        level[j * CELLS + i] = best;
        type[j * CELLS + i] = kind;
        any = true;
      }
    }
    if (!any) return [];
    const [x0, z0] = [tx * TILE_FT, tz * TILE_FT];
    const running = this.running(tx, tz);
    // Each corner's level, for a cell at level l of type `kind`: a course's, from the course,
    // straight down it, where that's within LIP_FT of l, so cells either side of a fall's lip each
    // keep to their own side; else the average of the wet cells' round it within STEP_FT of l.
    const cornerOf = (ci, cj, l, kind) => {
      const c = (cj * CORNERS + ci) * 4;
      if (running && RUNNING[kind] && !Number.isNaN(running[c + 3])) return Math.abs(running[c + 3] - l) <= LIP_FT ? running[c + 3] : l;
      let [sum, n] = [0, 0];
      for (const [i, j] of [[ci - 1, cj - 1], [ci, cj - 1], [ci - 1, cj], [ci, cj]]) {
        const [v] = levelAt(i, j);
        if (Math.abs(v - l) <= STEP_FT) [sum, n] = [sum + v, n + 1];
      }
      return n ? sum / n : l;
    };
    // Quads along each row: deep runs at one level and type as one.
    const byType = WATER_TYPES.map(() => ({ positions: [], depths: [], flow: [] }));
    const deep = (i, j, l, kind) => l - heights[j * CORNERS + i] >= DEEP_FT && cornerOf(i, j, l, kind) === l;
    const deepCell = (i, j, l, kind) => deep(i, j, l, kind) && deep(i + 1, j, l, kind) && deep(i, j + 1, l, kind) && deep(i + 1, j + 1, l, kind);
    for (let j = 0; j < CELLS; j++) {
      for (let i = 0; i < CELLS; ) {
        const k = j * CELLS + i;
        const l = level[k];
        if (Number.isNaN(l)) {
          i++;
          continue;
        }
        let end = i + 1;
        if (deepCell(i, j, l, type[k])) while (end < CELLS && level[j * CELLS + end] === l && type[j * CELLS + end] === type[k] && deepCell(end, j, l, type[k])) end++;
        // Running water's drawn a cell at a time, for its flow at each corner.
        if (running) end = i + 1;
        const { positions, depths, flow } = byType[type[k]];
        const corner = (ci, cj) => {
          const at = cornerOf(ci, cj, l, type[k]);
          positions.push(x0 + ci * CELL_FT, at, z0 + cj * CELL_FT);
          depths.push(at - heights[cj * CORNERS + ci]);
          const c = (cj * CORNERS + ci) * 4;
          const runs = running && RUNNING[type[k]] && !Number.isNaN(running[c]);
          flow.push(runs ? running[c] : 0, runs ? running[c + 1] : 0, runs ? running[c + 2] : 0);
        };
        for (const [ci, cj] of [[i, j], [i, j + 1], [end, j], [end, j], [i, j + 1], [end, j + 1]]) corner(ci, cj);
        i = end;
      }
    }
    return byType.flatMap(({ positions, depths, flow }, t) => {
      if (!positions.length) return [];
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      g.setAttribute("depth", new THREE.Float32BufferAttribute(depths, 1));
      g.setAttribute("flow", new THREE.Float32BufferAttribute(flow, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(Float32Array.from({ length: positions.length }, (_, n) => (n % 3 === 1 ? 1 : 0)), 3));
      const mesh = new THREE.Mesh(g, this.materials[t]);
      mesh.renderOrder = 1;
      return [mesh];
    });
  }

  // How the water runs at each of tile (tx, tz)'s corners near a course's water, and its surface
  // there, as flowOf has them, from the course nearest: 4 numbers a corner, the flow's 3 and the
  // level, NaN where none's near; or null where no course is near the tile.
  running(tx, tz) {
    const [x0, z0] = [tx * TILE_FT, tz * TILE_FT];
    const near = (this.renditions.waterFile?.courses ?? []).filter((course) => {
      const b = courseBox(course);
      return b[0] <= x0 + TILE_FT && b[2] >= x0 && b[1] <= z0 + TILE_FT && b[3] >= z0;
    });
    if (!near.length) return null;
    const out = new Float32Array(CORNERS * CORNERS * 4).fill(NaN);
    let any = false;
    for (let cj = 0; cj < CORNERS; cj++) {
      for (let ci = 0; ci < CORNERS; ci++) {
        let best = null;
        for (const course of near) {
          const found = flowOf(course, x0 + ci * CELL_FT, z0 + cj * CELL_FT);
          if (found && (!best || found.d < best.d)) best = found;
        }
        if (!best) continue;
        out.set([...best.flow, best.level], (cj * CORNERS + ci) * 4);
        any = true;
      }
    }
    return any ? out : null;
  }

  remove(key) {
    for (const mesh of this.meshes.get(key).meshes) {
      mesh.geometry.dispose();
      this.group.remove(mesh);
    }
    this.meshes.delete(key);
  }
}
