import * as THREE from "three";
import { objectMeshes, setObjectSight } from "../editor/objectMeshes.js";
import { setTreeSight, treeMeshes, trunkRadius } from "../editor/treeMeshes.js";
import { objectShape, pushOut, treeShape } from "../v2/blocking.js";
import { fillSlots } from "../v2/fill.js";
import { slopeOf } from "../v2/look.js";
import { TILE_FT } from "../v2/sizes.js";

// What fills the tiles' object slots round the builder (v2/fill.js): trees and objects, out to
// REACH_TILES tiles from theirs, drawn with the editor's models. What fills a tile is kept till its
// ground moves or the biomes change (its cells are dressed again), and the meshes are made again
// when the builder leaves their tile or what fills the tiles changes, at most every REMAKE_S.
// Walking, the builder's pushed out of their trunks and footprints (v2/blocking.js).

const REACH_TILES = 6;
const REMAKE_S = 0.5;
const SLOPE_FT = 2; // how far either way the ground's slope is taken under a slot
const TREE_STAGES = [250, 600, 1100]; // how far off crowns turn simpler (editor/treeMeshes.js)
const OBJECT_FT = [1200, 1600]; // how far off small and large objects are drawn

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
    if (cells.filled?.colors === cells.colors) return cells.filled;
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
        return { height: (nw + ne + sw + se) / 4, slope: slopeOf(nw, ne, sw, se, 2 * s) };
      },
    );
    for (const tree of filled.trees) tree.ground = ground(tree.x, tree.z);
    // Standing on the lowest ground under them, sunk a little.
    for (const object of filled.objects) {
      const [x, z] = object.at;
      const reach = object.footprint.circle ?? Math.min(...(object.footprint.rect ?? [0])) / 2;
      object.y = Math.min(ground(x, z), ground(x + reach, z), ground(x - reach, z), ground(x, z + reach), ground(x, z - reach)) - 0.1 * object.height;
    }
    filled.shapes = [...filled.trees.map((tree) => treeShape(tree, trunkRadius(tree.kind, tree.size))), ...filled.objects.map(objectShape).filter(Boolean)];
    filled.colors = cells.colors;
    filled.id = (Scatter.ids = (Scatter.ids ?? 0) + 1);
    cells.filled = filled;
    return filled;
  }

  // Each frame, with the builder at continent feet (x, z), and `shown` whether the ground near is
  // drawn finely enough to stand things on.
  tick(dt, x, z, shown) {
    setTreeSight(x, z, TREE_STAGES);
    setObjectSight(x, z, ...OBJECT_FT);
    this.group.visible = shown;
    if (!shown || (this.since += dt) < REMAKE_S) return;
    this.since = 0;
    const [ax, az] = [Math.floor(x / TILE_FT), Math.floor(z / TILE_FT)];
    const fills = [];
    for (let tz = az - REACH_TILES; tz <= az + REACH_TILES; tz++) {
      for (let tx = ax - REACH_TILES; tx <= ax + REACH_TILES; tx++) {
        if (!this.renditions.tile(tx, tz)) continue;
        const filled = this.fill(tx, tz);
        if (filled) fills.push(filled);
      }
    }
    const drawn = fills.map((f) => f.id).join(",");
    if (drawn === this.drawn) return;
    this.drawn = drawn;
    this.clear();
    const trees = fills.flatMap((f) => f.trees);
    const objects = fills.flatMap((f) => f.objects);
    for (const mesh of [...treeMeshes(trees), ...objectMeshes(objects, null, [0, 0])]) {
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
