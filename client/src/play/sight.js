import { treeCrown, treeHeight, trunkRadius } from "../render/treeMeshes.js";
import { OBJECT_TYPES, blocks, builtOf } from "../world/objects.js";
import { slabEnters } from "../world/slabs.js";

// Line of sight, by the rules game-server/internal/worlds/sight.go keeps too, tested against the
// same cases (testdata/sight.json). Clutter doesn't block sight.

const EYE_FT = 5; // sight starts this far over the feet of who's looking
const CHEST_FT = 3.5; // and ends this far over the feet of what they look at
const ENDS_FT = 2; // the ground this near either end doesn't block: low ceilings, steep ground
const STEP_FT = 0.5; // how often along the line it looks
const TRUNK_TOP = 0.9; // a trunk's top, as a share of its tree's height
const LEEWAY_FT = 0.25; // as the server's footprints

export const CROWN_REACH_FT = 50; // the widest crown of all

// Whether you can see through objects of a type. An object that isn't known blocks: it has a
// footprint or it wouldn't be asked about.
export function seenThrough(type) {
  const built = builtOf(type);
  return built ? built.blocksSight === false : OBJECT_TYPES[type]?.blocksSight === false;
}

// A tree as sight has it, standing at `bottom`: { holds(x, y, z) }.
export function treeSolid({ x, z, kind, size }, bottom) {
  const height = treeHeight(kind, size);
  const trunk = trunkRadius(kind, size) - LEEWAY_FT;
  const crown = treeCrown(kind, size);
  return {
    holds(px, py, pz) {
      const up = py - bottom;
      const away = Math.hypot(px - x, pz - z);
      if (up >= 0 && up <= height * TRUNK_TOP && away < trunk) return true;
      if (!crown) return false;
      const half = (crown.to - crown.from) / 2;
      const share = (up - crown.from - half) / half;
      return Math.abs(share) < 1 && away < crown.radius * Math.sqrt(1 - share * share);
    },
  };
}

// An object as sight has it, standing at `bottom`: its upright footprint.
export function objectSolid(object, bottom) {
  return {
    holds(x, y, z) {
      const up = y - bottom;
      return up >= 0 && up <= object.height && blocks(object, x, z, -LEEWAY_FT);
    },
  };
}

// Whether the line between two points misses them all. rock(x, y, z) is whether a point's in the
// ground. What either end is in doesn't block it.
export function sightClear(a, b, { rock, solids, slabs }) {
  if (slabs.some((slab) => slabEnters(slab, a, b))) return false;
  const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const steps = Math.max(1, Math.ceil(length / STEP_FT));
  const inWay = solids.filter((s) => !s.holds(...a) && !s.holds(...b));
  for (let n = 0; n <= steps; n++) {
    const u = n / steps;
    const [x, y, z] = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
    const along = u * length;
    if (along >= ENDS_FT && along <= length - ENDS_FT && rock(x, y, z)) return false;
    if (inWay.some((s) => s.holds(x, y, z))) return false;
  }
  return true;
}

// Whether someone with their feet at `from` can see what has its feet at `to`.
export function seesFeet(from, to, world) {
  return sightClear([from[0], from[1] + EYE_FT, from[2]], [to[0], to[1] + CHEST_FT, to[2]], world);
}
