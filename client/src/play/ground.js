import { trunkRadius } from "../render/treeMeshes.js";
import { EMPTY_FT } from "../create/ground.js";
import { TILE_FT } from "../v2/sizes.js";
import { blocks } from "../world/objects.js";
import { slabFootholds, slabHitsTrunk } from "../world/slabs.js";
import { CROWN_REACH_FT, objectSolid, seesFeet, seenThrough, treeSolid } from "./sight.js";

// The ground the play page's walker (play/walker.js) walks on: a version 2 world's, as /create
// draws it and the game server checks it (game-server/internal/worlds/ground.go). Heights come
// from plate files once they're read, pressed down by level slabs; off the tiles is the sea's bed.
// Caves' floors are ground too, and where a cave's mouth opens the ground it isn't. Slabs, cave
// rock, objects placed by hand, and the trees and objects in tiles' slots are in the way.
// Positions are continent feet.

const NEAR_FT = 64; // how far round a walker slabs and objects are looked at
const STEP_FT = 1.5; // as the walker steps up onto slabs
const EYE_FT = 5.5;

export class PlayGround {
  // renditions: create/renditions.js's Renditions; placed: create/placed.js's Placed; things and
  // scatter: create/things.js's and scatter.js's, for objects' heights and what fills slots;
  // caves: create/caves.js's Caves.
  constructor({ renditions, placed, things, scatter, caves }) {
    Object.assign(this, { renditions, placed, things, scatter, caves });
  }

  // The height to stand at no higher than `under`, the ground's or a cave's floor (Caves'
  // groundAt), or null on a tile whose plate file isn't read yet.
  groundAt(x, z, under = Infinity) {
    const [tx, tz] = [Math.floor(x / TILE_FT), Math.floor(z / TILE_FT)];
    if (!this.renditions.tile(tx, tz)) return EMPTY_FT;
    if (!this.renditions.hasCells(tx, tz)) return null;
    return this.caves.groundAt(x, z, under);
  }

  // How steep the face groundAt stands on at (x, z) is, rise over run (Caves' slopeAt).
  slopeAt(x, z, under = Infinity) {
    const [tx, tz] = [Math.floor(x / TILE_FT), Math.floor(z / TILE_FT)];
    if (!this.renditions.tile(tx, tz) || !this.renditions.hasCells(tx, tz)) return 0;
    return this.caves.slopeAt(x, z, under);
  }

  waterAt(x, z) {
    return this.renditions.waterAt(x, z);
  }

  footholds(x, z, steepest) {
    return this.placed.near(x, z, NEAR_FT).slabs.flatMap((slab) => slabFootholds(slab, x, z, steepest));
  }

  // Whether a slab, a tree, or an object is in the way of a walker `radius` round moving from `pos`
  // (its feet) to (x, z). What it's already in doesn't hold it. Objects placed by hand are in the
  // way from the feet to the eyes, and a jump clears low ones; what's in slots is in the way
  // whatever the height, as the game server has it.
  inWay(x, z, pos, radius) {
    const { objects, slabs } = this.placed.near(x, z, NEAR_FT);
    const body = (bx, bz) => ({ x: bx, z: bz, radius, ground: pos.y + STEP_FT, top: pos.y + EYE_FT });
    const [there, here] = [body(x, z), body(pos.x, pos.z)];
    if (slabs.some((slab) => slabHitsTrunk(slab, there) && !slabHitsTrunk(slab, here))) return true;
    if (this.inRock(x, z, pos.y, radius) && !this.inRock(pos.x, pos.z, pos.y, radius)) return true;
    const into = (object) => blocks(object, x, z, radius) && !blocks(object, pos.x, pos.z, radius);
    for (const object of objects) {
      if (!object.footprint || !into(object)) continue;
      const bottom = this.things.objectY(object);
      if (pos.y <= bottom + object.height * 0.9 && pos.y + EYE_FT >= bottom) return true;
    }
    const [ax, az] = [Math.floor(x / TILE_FT), Math.floor(z / TILE_FT)];
    for (let tz = az - 1; tz <= az + 1; tz++) {
      for (let tx = ax - 1; tx <= ax + 1; tx++) {
        if (!this.renditions.tile(tx, tz)) continue;
        const filled = this.scatter.fill(tx, tz);
        if (!filled) continue;
        for (const tree of filled.trees) {
          const r = trunkRadius(tree.kind, tree.size) + radius;
          if (Math.hypot(x - tree.x, z - tree.z) < r && Math.hypot(pos.x - tree.x, pos.z - tree.z) >= r) return true;
        }
        if (filled.objects.some(into)) return true;
      }
    }
    return false;
  }

  // Whether cave rock's anywhere from a step over feet at `y` up to the eyes, at (x, z) or `radius`
  // off it along the axes, as /create keeps the builder out of it.
  inRock(x, z, y, radius) {
    return [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => this.caves.inRock(x + dx * radius, z + dz * radius, y + STEP_FT, y + EYE_FT));
  }

  // Whether someone with their feet at `from` can see what has its feet at `to` (both continent
  // [x, y, z]), by the game server's rules.
  sees(from, to) {
    const [mx, mz] = [(from[0] + to[0]) / 2, (from[2] + to[2]) / 2];
    const by = Math.hypot(to[0] - from[0], to[2] - from[2]) / 2 + CROWN_REACH_FT;
    const { objects, slabs } = this.placed.near(mx, mz, by);
    const solids = [];
    const addObject = (object) => {
      if (object.footprint && !seenThrough(object.type)) solids.push(objectSolid(object, this.things.objectY(object)));
    };
    objects.forEach(addObject);
    for (let tz = Math.floor((mz - by) / TILE_FT); tz <= Math.floor((mz + by) / TILE_FT); tz++) {
      for (let tx = Math.floor((mx - by) / TILE_FT); tx <= Math.floor((mx + by) / TILE_FT); tx++) {
        const filled = this.renditions.tile(tx, tz) && this.scatter.fill(tx, tz);
        if (!filled) continue;
        for (const tree of filled.trees) solids.push(treeSolid(tree, this.renditions.heightAt(tree.x, tree.z) ?? 0));
        filled.objects.forEach(addObject);
      }
    }
    const rock = (x, y, z) => {
      const ground = this.renditions.heightAt(x, z);
      return ground !== null && ground !== undefined && y < ground && this.caves.solid(x, y, z);
    };
    return seesFeet(from, to, { rock, solids, slabs });
  }

  // Where the camera can be, looking from `head` to `at` (Vector3s), short of cave rock between.
  clear(head, at) {
    return this.caves.clear(head, at);
  }

  // What pulls the camera in front of it: trees and things placed by hand.
  sightBlockers() {
    return [...this.scatter.group.children, ...this.things.group.children];
  }
}
