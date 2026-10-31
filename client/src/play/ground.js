import { trunkRadius } from "../editor/treeMeshes.js";
import { EMPTY_FT } from "../create/ground.js";
import { TILE_FT } from "../v2/sizes.js";
import { blocks } from "../world/objects.js";
import { slabFootholds, slabHitsTrunk } from "../world/slabs.js";

// The ground the play page's walker (editor/walker.js) walks on: a version 2 world's, as /create
// draws it and the game server checks it (game-server/internal/worlds/ground.go). Heights come
// from plate files once they're read, pressed down by level slabs; off the tiles is the sea's bed.
// Slabs, objects placed by hand, and the trees and objects in tiles' slots are in the way.
// Positions are continent feet.

const NEAR_FT = 64; // how far round a walker slabs and objects are looked at
const STEP_FT = 1.5; // as the walker steps up onto slabs
const EYE_FT = 5.5;

export class PlayGround {
  // renditions: create/ground.js's Renditions; placed: create/placed.js's Placed; things and
  // scatter: create/things.js's and scatter.js's, for objects' heights and what fills slots.
  constructor({ renditions, placed, things, scatter }) {
    Object.assign(this, { renditions, placed, things, scatter });
  }

  // The ground's height, or null on a tile whose plate file isn't read yet.
  groundAt(x, z) {
    const [tx, tz] = [Math.floor(x / TILE_FT), Math.floor(z / TILE_FT)];
    if (!this.renditions.tile(tx, tz)) return EMPTY_FT;
    if (!this.renditions.hasCells(tx, tz)) return null;
    return this.renditions.heightAt(x, z);
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

  // What pulls the camera in front of it: trees and things placed by hand.
  sightBlockers() {
    return [...this.scatter.group.children, ...this.things.group.children];
  }
}
