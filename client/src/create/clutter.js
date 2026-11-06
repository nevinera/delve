import * as THREE from "three";
import { ClutterSet, prepareClutter, setClutterFocus, setClutterRadius } from "../render/clutterMeshes.js";
import { tileClutter } from "../v2/clutter.js";
import { RUNNING, slopeOf } from "../v2/look.js";
import { CELL_FT, TILE_FT } from "../v2/sizes.js";

// Clutter round the builder (v2/clutter.js): by the water, and on biomes' dry ground, drawn with
// the editor's shapes (render/clutterMeshes.js), fading away to nothing radiusFt off, from every
// tile that reaches into. What's in a tile is kept till its cells are dressed again or its water
// changes, and its pieces are prepared again then, looked for at most every REMAKE_S. Which pieces
// are drawn is picked again as the builder moves GATHER_FT.

const RADIUS_FT = 240;
const REMAKE_S = 0.5;
const GATHER_FT = 40; // what's drawn is picked again when the builder's moved this far
const CELLS = TILE_FT / CELL_FT;

export class Clutter {
  constructor(scene, renditions, { radiusFt = RADIUS_FT, density = 1 } = {}) {
    this.renditions = renditions;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.tiles = null; // [tx0, tz0, tx1, tz1], the tiles it's made from
    this.set = new ClutterSet(this.group);
    this.chunks = new Map(); // "tx,tz" -> { tx, tz, id, slots, born }, each tile's pieces prepared
    this.setRadius(radiusFt, density);
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
    if (cells.cluttered?.colors === cells.colors && cells.cluttered.water === cells.water && cells.cluttered.covered === covered && cells.cluttered.road === cells.road) return cells.cluttered;
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
    // None under slabs or on roads.
    const open = ({ x, z }) => {
      const k = Math.floor((z - z0) / CELL_FT) * CELLS + Math.floor((x - x0) / CELL_FT);
      return !covered.has(k) && !cells.road?.[k];
    };
    cells.cluttered = { instances: covered.size || cells.road ? instances.filter(open) : instances, colors: cells.colors, water: cells.water, covered, road: cells.road, id: (Clutter.ids = (Clutter.ids ?? 0) + 1) };
    return cells.cluttered;
  }

  // How far off it's drawn, and the share of it drawn, 0 to 1.
  setRadius(radiusFt, density = 1) {
    if (radiusFt === this.radiusFt && density === this.density) return;
    [this.radiusFt, this.density] = [radiusFt, density];
    setClutterRadius(radiusFt);
    this.since = REMAKE_S;
    this.gathered = null;
  }

  // Each frame, with the builder at continent feet (x, z), and `shown` whether the ground near is
  // drawn finely enough to stand things on. A tile's pieces are prepared when it comes in reach
  // or changes, one tile a frame, nearest first, and fade in as they're first drawn.
  tick(dt, x, z, shown) {
    setClutterFocus(x, z);
    this.group.visible = shown;
    if (!shown) return;
    const reach = this.radiusFt + GATHER_FT;
    const [tx0, tz0, tx1, tz1] = (this.tiles = [x - reach, z - reach, x + reach, z + reach].map((ft) => Math.floor(ft / TILE_FT)));
    let changed = false;
    for (const [key, chunk] of this.chunks) {
      if (chunk.tx < tx0 || chunk.tx > tx1 || chunk.tz < tz0 || chunk.tz > tz1) {
        this.chunks.delete(key);
        changed = true;
      }
    }
    if ((this.since += dt) >= REMAKE_S) {
      this.since = 0;
      const near = [];
      for (let tz = tz0; tz <= tz1; tz++) for (let tx = tx0; tx <= tx1; tx++) near.push([tx, tz, Math.hypot((tx + 0.5) * TILE_FT - x, (tz + 0.5) * TILE_FT - z)]);
      for (const [tx, tz] of near.sort((a, b) => a[2] - b[2])) {
        if (!this.renditions.tile(tx, tz)) continue;
        const f = this.fill(tx, tz);
        const key = `${tx},${tz}`;
        if (!f || this.chunks.get(key)?.id === f.id) continue;
        this.chunks.set(key, { tx, tz, id: f.id, slots: prepareClutter(f.instances, [0, 0]), born: performance.now() / 1000 });
        changed = true;
        // One a frame: look again next frame for the next.
        this.since = REMAKE_S;
        break;
      }
    }
    if (changed || !this.gathered || Math.hypot(x - this.gathered[0], z - this.gathered[1]) > GATHER_FT) {
      this.gathered = [x, z];
      this.set.gather([...this.chunks.values()], x, z, this.radiusFt, this.density, GATHER_FT);
    }
  }

  clear() {
    this.set.dispose();
    this.chunks.clear();
  }
}
