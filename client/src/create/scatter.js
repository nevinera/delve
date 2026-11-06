import * as THREE from "three";
import { objectMeshes, seatLong, setObjectSight } from "../render/objectMeshes.js";
import { setTreeSight, treeMeshes, trunkRadius } from "../render/treeMeshes.js";
import { objectShape, pushOut, treeShape } from "../v2/blocking.js";
import { boulders, courseBox } from "../v2/courses.js";
import { fillSlots } from "../v2/fill.js";
import { makeObject } from "../world/objects.js";
import { RUNNING, slopeOf } from "../v2/look.js";
import { TILE_CELLS } from "../v2/plate.js";
import { CELL_FT, TILE_FT } from "../v2/sizes.js";

// What fills the tiles' object slots round the builder (v2/fill.js): trees and objects, out to
// REACH_TILES tiles from theirs, drawn with the editor's models as its 3D view draws them: trees
// within NEAR_TILES in full, their crowns simpler further off, and past that cheap stand-ins, a
// trunk and a crown of a few flat faces each. What fills a tile is kept till its
// ground moves, the biomes change (its cells are dressed again) or its water changes, and the meshes are made again
// when the builder leaves their tile or what fills the tiles changes, at most every REMAKE_S.
// Walking, the builder's pushed out of their trunks and footprints (v2/blocking.js).

const NEAR_TILES = 3;
const REACH_TILES = 7;
const REMAKE_S = 0.5;
const SLOPE_FT = 2; // how far either way the ground's slope is taken under a slot
const SHORE_FT = 16; // how far from water a slot can be on the shore
// As the editor's 3D view has them (render/renderView.js's SIGHT): how far off crowns turn simpler,
// the change taken across CANOPY_BAND_FT, and how far off small and large objects are drawn.
const CANOPY_FT = [300, 450];
const CANOPY_BAND_FT = 40;
const OBJECT_FT = [500, 1000];

export class Scatter {
  constructor(scene, renditions) {
    this.renditions = renditions;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.drawn = ""; // what the meshes were made from: the builder's tile and each tile's fill
    this.since = REMAKE_S;
  }

  // What fills tile (tx, tz)'s slots, or null where its cells aren't read.
  fill(tx, tz) {
    const r = this.renditions;
    if (!r.hasCells(tx, tz)) return null;
    const cells = r.cells(tx, tz);
    if (!cells?.slots) return null;
    const covered = r.coveredCells(tx, tz, cells);
    if (cells.filled?.colors === cells.colors && cells.filled.water === cells.water && cells.filled.covered === covered && cells.filled.road === cells.road) return cells.filled;
    const ground = (x, z) => r.heightAt(x, z) ?? 0;
    const biomes = r.biomeTile(tx, tz);
    const filled = fillSlots(
      cells.slots,
      tx,
      tz,
      (i, j) => biomes[j * 64 + i],
      (x, z) => {
        const s = SLOPE_FT;
        const [nw, ne, sw, se] = [ground(x - s, z - s), ground(x + s, z - s), ground(x - s, z + s), ground(x + s, z + s)];
        const height = (nw + ne + sw + se) / 4;
        // The water there, or the highest near enough to make it shore, and whether any near runs.
        const here = r.waterCellAt(x, z);
        const near = [[0, 0], [SHORE_FT, 0], [-SHORE_FT, 0], [0, SHORE_FT], [0, -SHORE_FT]].map(([dx, dz]) => r.waterCellAt(x + dx, z + dz)).filter(Boolean);
        const running = near.some(([, type]) => RUNNING[type]);
        const level = Math.max(...near.map(([l]) => l));
        const water = here && here[0] > height ? { wet: true, level: here[0], type: here[1], running } : near.length ? { wet: false, level, running } : null;
        return { height, slope: slopeOf(nw, ne, sw, se, 2 * s), water };
      },
    );
    // Boulders across courses' cascades' steps in the tile.
    const [x0, z0] = [tx * TILE_FT, tz * TILE_FT];
    for (const course of r.waterFile?.courses ?? []) {
      const b = courseBox(course);
      if (b[0] > x0 + TILE_FT || b[2] < x0 || b[1] > z0 + TILE_FT || b[3] < z0) continue;
      for (const { x, z, size, yaw, roll } of boulders(course)) {
        if (x >= x0 && x < x0 + TILE_FT && z >= z0 && z < z0 + TILE_FT) filled.objects.push(makeObject(roll(0) < 0.3 ? "mossyBoulder" : "boulder", [x, z], yaw, size, roll));
      }
    }
    // Nothing grows under slabs or on roads.
    const open = (x, z) => {
      const k = Math.floor((z - z0) / CELL_FT) * TILE_CELLS + Math.floor((x - x0) / CELL_FT);
      return !covered.has(k) && !cells.road?.[k];
    };
    filled.trees = filled.trees.filter((tree) => open(tree.x, tree.z));
    filled.objects = filled.objects.filter((object) => open(...object.at));
    for (const tree of filled.trees) tree.ground = ground(tree.x, tree.z);
    // Standing on the lowest ground under them, sunk a little, and logs lying along it.
    for (const object of filled.objects) {
      const [x, z] = object.at;
      if (object.footprint.capsule) {
        Object.assign(object, seatLong(object, ground));
        continue;
      }
      const reach = object.footprint.circle ?? Math.min(...(object.footprint.rect ?? [0])) / 2;
      object.y = Math.min(ground(x, z), ground(x + reach, z), ground(x - reach, z), ground(x, z + reach), ground(x, z - reach)) - 0.1 * object.height;
    }
    filled.shapes = [...filled.trees.map((tree) => treeShape(tree, trunkRadius(tree.kind, tree.size))), ...filled.objects.map(objectShape).filter(Boolean)];
    filled.colors = cells.colors;
    filled.water = cells.water;
    filled.covered = covered;
    filled.road = cells.road;
    filled.id = (Scatter.ids = (Scatter.ids ?? 0) + 1);
    cells.filled = filled;
    return filled;
  }

  // Each frame, with the builder at continent feet (x, z), and `shown` whether the ground near is
  // drawn finely enough to stand things on.
  tick(dt, x, z, shown) {
    setTreeSight(x, z, CANOPY_FT, { band: CANOPY_BAND_FT });
    setObjectSight(x, z, ...OBJECT_FT);
    this.group.visible = shown;
    if (!shown || (this.since += dt) < REMAKE_S) return;
    this.since = 0;
    const [ax, az] = [Math.floor(x / TILE_FT), Math.floor(z / TILE_FT)];
    const [near, far] = [[], []];
    for (let tz = az - REACH_TILES; tz <= az + REACH_TILES; tz++) {
      for (let tx = ax - REACH_TILES; tx <= ax + REACH_TILES; tx++) {
        if (!this.renditions.tile(tx, tz)) continue;
        const filled = this.fill(tx, tz);
        if (filled) (Math.max(Math.abs(tx - ax), Math.abs(tz - az)) <= NEAR_TILES ? near : far).push(filled);
      }
    }
    const drawn = `${ax},${az}:${near.map((f) => f.id)}:${far.map((f) => f.id)}`;
    if (drawn === this.drawn) return;
    this.drawn = drawn;
    this.clear();
    const all = [...near, ...far];
    const meshes = [...treeMeshes(near.flatMap((f) => f.trees)), ...treeMeshes(far.flatMap((f) => f.trees), { far: true }), ...objectMeshes(all.flatMap((f) => f.objects), null, [0, 0])];
    for (const mesh of meshes) {
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
  }

  // (x, z) pushed out of the trees and objects round it, for a walker `radius` ft round, [x, z].
  pushOut(x, z, radius) {
    const [ax, az] = [Math.floor(x / TILE_FT), Math.floor(z / TILE_FT)];
    const shapes = [];
    for (let tz = az - 1; tz <= az + 1; tz++) {
      for (let tx = ax - 1; tx <= ax + 1; tx++) {
        if (!this.renditions.tile(tx, tz)) continue;
        const filled = this.fill(tx, tz);
        if (filled) shapes.push(...filled.shapes);
      }
    }
    return pushOut(x, z, radius, shapes);
  }

  clear() {
    for (const mesh of this.group.children) mesh.dispose?.();
    this.group.clear();
  }
}
