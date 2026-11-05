import * as THREE from "three";
import { setWaterTime, waterMaterial } from "../render/waterMaterial.js";
import { BIOME_NAMES } from "../v2/biomes.js";
import { WATER_TYPES } from "../v2/water.js";
import { courseBox, flowOf } from "../v2/courses.js";
import { RUNNING } from "../v2/look.js";
import { CELL_FT, TILE_FT } from "../v2/sizes.js";

// The water's surface (v2/water.js) on the tiles round the builder whose ground's drawn from their
// cells (ground.js's FULL and FINE tiers; coarser, the ground draws the water too): each
// tile's wet cells, and a cell more round them at the level of the water next to it, which the
// ground hides where it rises out of it, so the shore's where the two meet. Each corner's at the
// average level of the wet cells round it near its cell's, so sloping water's smooth. The water fades in
// over its first SHORE_FADE_FT of depth there (render/waterMaterial.js). Each type has its own look.
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

// How water looks in a biome, over how its type does, for the biomes it's different in: only how it
// looks, so a character wades through frozen water or lava as through any other.
// `surfaceFalls` is for what runs down the ground over a drop instead of falling clear of it.
const ICE = { color: 0xe2f2fa, opacity: 0.98, still: 1, surfaceFalls: true };
const BIOME_WATER = {
  "bamboo grove": { color: 0x4f9c8c },
  "snowy forest": ICE,
  highlands: { color: 0x3c3428, opacity: 0.92 },
  savanna: { color: 0x6d8a5e },
  "red canyon": { color: 0x8a6a48, opacity: 0.9 },
  "sand desert": { color: 0x2f9fae },
  "salt flats": { color: 0x9fd8d0, opacity: 0.8 },
  jungle: { color: 0x3f7a58 },
  "primeval valley": { color: 0x5cbba4 },
  "tropical coast": { color: 0x27b5b8, opacity: 0.8 },
  "sandy beach": { color: 0x3498b8, opacity: 0.8 },
  snowfield: ICE,
  "frozen tundra": ICE,
  glacier: { color: 0xb6e0f6, opacity: 0.98, still: 1, surfaceFalls: true },
  mangrove: { color: 0x5f5230, opacity: 0.93 },
  "fungal marsh": { color: 0x2c9a96, emissive: 0x0a2c2c },
  "haunted woods": { color: 0x2a3036, opacity: 0.93 },
  "plague lands": { color: 0x6c7a28, opacity: 0.94 },
  "volcanic waste": { color: 0xc8440c, opacity: 1, still: 0.25, emissive: 0x962800, surfaceFalls: true },
  "corrupted waste": { color: 0x58c044, opacity: 0.95, emissive: 0x16400c },
  "enchanted glade": { color: 0x6a80d0, emissive: 0x101838 },
  "crystal forest": { color: 0x9a7ae0, emissive: 0x1c1038 },
};
const BIOME_LOOKS = BIOME_NAMES.map((name) => BIOME_WATER[name] ?? null);

// How water of type `type` (an index into WATER_TYPES) looks in biome `biome` (into BIOME_NAMES).
export const waterLookOf = (type, biome) => ({ ...WATER_LOOKS[WATER_TYPES[type]], ...BIOME_LOOKS[biome] });

export class WaterSurfaces {
  constructor(scene, renditions, renderer, ground) {
    this.renditions = renditions;
    this.ground = ground;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.renderer = renderer;
    this.materials = new Map(); // "type,look" -> the material for water of that type and look
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

  // The material for water of `type` in `biome`, biomes with the same look sharing it.
  materialOf(type, biome) {
    const key = `${type},${BIOME_LOOKS.indexOf(BIOME_LOOKS[biome])}`;
    if (!this.materials.has(key)) this.materials.set(key, waterMaterial(this.renderer, { ...waterLookOf(type, biome), shoreFadeFt: SHORE_FADE_FT, deep: true }));
    return this.materials.get(key);
  }

  // The meshes for tile (tx, tz)'s water, one for each type and look in it.
  make(tx, tz, { water, heights }) {
    const biomes = this.renditions.biomeTile(tx, tz);
    const lookOf = (k) => BIOME_LOOKS.indexOf(BIOME_LOOKS[biomes[k]]);
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
    // keep to their own side. A corner past a lip, below the cell's, where the ground's fallen
    // away, is brought down to the ground, or the water below if that's higher, so a lip across
    // the cells doesn't leave squares of water hanging over it. Else the average of the wet
    // cells' round it within STEP_FT of l.
    const cornerOf = (ci, cj, l, kind) => {
      const c = (cj * CORNERS + ci) * 4;
      if (running && RUNNING[kind] && !Number.isNaN(running[c + 3])) {
        const at = running[c + 3];
        if (Math.abs(at - l) <= LIP_FT) return at;
        return at < l ? Math.max(at, Math.min(l, heights[cj * CORNERS + ci])) : l;
      }
      let [sum, n] = [0, 0];
      for (const [i, j] of [[ci - 1, cj - 1], [ci, cj - 1], [ci - 1, cj], [ci, cj]]) {
        const [v] = levelAt(i, j);
        if (Math.abs(v - l) <= STEP_FT) [sum, n] = [sum + v, n + 1];
      }
      return n ? sum / n : l;
    };
    // Quads along each row: deep runs at one level and type as one.
    const byLook = new Map(); // "type,look" -> { material, positions, depths, flow }
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
        if (deepCell(i, j, l, type[k])) while (end < CELLS && level[j * CELLS + end] === l && type[j * CELLS + end] === type[k] && lookOf(j * CELLS + end) === lookOf(k) && deepCell(end, j, l, type[k])) end++;
        // Running water's drawn a cell at a time, for its flow at each corner.
        if (running) end = i + 1;
        const key = `${type[k]},${lookOf(k)}`;
        if (!byLook.has(key)) byLook.set(key, { material: this.materialOf(type[k], biomes[k]), positions: [], depths: [], flow: [] });
        const { positions, depths, flow } = byLook.get(key);
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
    return [...byLook.values()].map(({ material, positions, depths, flow }) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      g.setAttribute("depth", new THREE.Float32BufferAttribute(depths, 1));
      g.setAttribute("flow", new THREE.Float32BufferAttribute(flow, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(Float32Array.from({ length: positions.length }, (_, n) => (n % 3 === 1 ? 1 : 0)), 3));
      const mesh = new THREE.Mesh(g, material);
      mesh.renderOrder = 1;
      return mesh;
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
