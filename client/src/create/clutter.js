import * as THREE from "three";
import { clutterMeshes, gatherClutter, setClutterFocus, setClutterRadius } from "../render/clutterMeshes.js";
import { tileClutter } from "../v2/clutter.js";
import { RUNNING, slopeOf } from "../v2/look.js";
import { CELL_FT, TILE_FT } from "../v2/sizes.js";

// Clutter round the builder (v2/clutter.js): by the water, and on biomes' dry ground, drawn with the editor's shapes (render/clutterMeshes.js), shrinking away to nothing
// RADIUS_FT off. What's in a tile is kept till its cells are dressed again or its water changes,
// and the meshes are made again when the builder leaves their tile or that changes, at most every
// REMAKE_S, and only those within reach drawn as the builder moves.

const RADIUS_FT = 240;
const REACH_TILES = 1;
const REMAKE_S = 0.5;
const GATHER_FT = 40; // what's drawn is picked again when the builder's moved this far
const CELLS = TILE_FT / CELL_FT;

export class Clutter {
  constructor(scene, renditions) {
    this.renditions = renditions;
    this.group = new THREE.Group();
    scene.add(this.group);
    setClutterRadius(RADIUS_FT);
    this.drawn = "";
    this.gathered = null;
    this.since = REMAKE_S;
  }

  // Tile (tx, tz)'s clutter, or null where its cells aren't read.
  fill(tx, tz) {
    const r = this.renditions;
    if (!r.hasCells(tx, tz)) return null;
    const cells = r.cells(tx, tz);
    if (!cells?.colors) return null;
    const covered = r.coveredCells(tx, tz, cells);
    if (cells.cluttered?.colors === cells.colors && cells.cluttered.water === cells.water && cells.cluttered.covered === covered) return cells.cluttered;
    const [near, runs] = r.nearWater(tx, tz, cells.water);
    const biomes = r.biomeTile(tx, tz);
    const h = cells.heights;
    const C = CELLS + 1;
    const instances = tileClutter(
      tx,
      tz,
      (i, j) => {
        const k = j * CELLS + i;
        const c = j * C + i;
        const [nw, ne, sw, se] = [h[c], h[c + 1], h[c + C], h[c + C + 1]];
        const wet = cells.water && !Number.isNaN(cells.water.level[k]);
        const water = wet
          ? { wet, level: cells.water.level[k], type: cells.water.type[k], running: RUNNING[cells.water.type[k]] }
          : Number.isNaN(near[k])
            ? null
            : { wet, level: near[k], running: !Number.isNaN(runs[k]) };
        return { height: (nw + ne + sw + se) / 4, slope: slopeOf(nw, ne, sw, se, CELL_FT), biome: biomes[k], water };
      },
      (x, z) => r.heightAt(x, z) ?? 0,
    );
    // Nothing grows under slabs.
    const [x0, z0] = [tx * TILE_FT, tz * TILE_FT];
    const open = ({ x, z }) => !covered.has(Math.floor((z - z0) / CELL_FT) * CELLS + Math.floor((x - x0) / CELL_FT));
    cells.cluttered = { instances: covered.size ? instances.filter(open) : instances, colors: cells.colors, water: cells.water, covered, id: (Clutter.ids = (Clutter.ids ?? 0) + 1) };
    return cells.cluttered;
  }

  // Each frame, with the builder at continent feet (x, z), and `shown` whether the ground near is
  // drawn finely enough to stand things on.
  tick(dt, x, z, shown) {
    setClutterFocus(x, z);
    this.group.visible = shown;
    if (!shown) return;
    if ((this.since += dt) >= REMAKE_S) {
      this.since = 0;
      const [ax, az] = [Math.floor(x / TILE_FT), Math.floor(z / TILE_FT)];
      const filled = [];
      for (let tz = az - REACH_TILES; tz <= az + REACH_TILES; tz++) {
        for (let tx = ax - REACH_TILES; tx <= ax + REACH_TILES; tx++) {
          if (!this.renditions.tile(tx, tz)) continue;
          const f = this.fill(tx, tz);
          if (f?.instances.length) filled.push(f);
        }
      }
      const drawn = `${ax},${az}:${filled.map((f) => f.id)}`;
      if (drawn !== this.drawn) {
        this.drawn = drawn;
        this.clear();
        const instances = filled.flatMap((f) => f.instances);
        for (const mesh of instances.length ? clutterMeshes(instances, [0, 0]) : []) {
          mesh.frustumCulled = false;
          this.group.add(mesh);
        }
        this.gathered = null;
      }
    }
    if (!this.gathered || Math.hypot(x - this.gathered[0], z - this.gathered[1]) > GATHER_FT) {
      this.gathered = [x, z];
      gatherClutter(this.group.children, x, z, RADIUS_FT + GATHER_FT);
    }
  }

  clear() {
    for (const mesh of this.group.children) mesh.dispose?.();
    this.group.clear();
  }
}
