import { inside } from "../v2/biomes.js";

// Spawn areas, in spawns.json's `spawnAreas`: each points at an area (v2/regions.js) by id, and
// lists its spawns. /create scatters each spawn's mobs inside the area as ordinary placed mobs, each
// with a `spawnArea` naming the spawn area it came from, and scatters them again when the area
// moves or changes shape or the spawns change. A mob edited by hand loses its `spawnArea`, and is
// left alone from then on. The game server only reads the placed mobs.

export const DENSITY_FT = 512; // a spawn's density is how many mobs per square this many feet across
const APART_FT = 20; // how far apart packs, and mobs on their own, stand at least
const PACK_FT = 8; // how far a pack's mobs stand from its first
const TRIES = 40; // how many spots to try for each pack before giving up on it
export const MOST_MOBS = 2000; // the most one spawn area scatters

const round = (v) => Math.round(v * 10) / 10;

// The area inside a polygon of [x, z] corners, in square feet.
export function polygonArea(points) {
  let twice = 0;
  for (let k = 0, j = points.length - 1; k < points.length; j = k++) twice += points[j][0] * points[k][1] - points[k][0] * points[j][1];
  return Math.abs(twice) / 2;
}

// How many mobs a spawn of `density` puts in `points`.
export const mobsFor = (density, points) => Math.max(0, Math.round((density * polygonArea(points)) / DENSITY_FT ** 2));

// A new spawn: what the mob tool would put down, one per 512 ft square.
export const newSpawn = (creature, levels = 1, respawn = 300) => ({ creature, density: 1, levels, respawn });

// The placed mobs for `spawnArea` inside `points`. standAt(x, z) gives the height of dry ground
// that's not too steep to walk there, or null. id() gives a new placed id, packId() a new pack id.
export function scatter(spawnArea, points, { standAt, id, packId, random = Math.random }) {
  const xs = points.map((p) => p[0]);
  const zs = points.map((p) => p[1]);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const used = []; // [x, z] of each pack's first mob
  const ground = (x, z) => (inside(points, x, z) ? standAt(x, z) : null);
  const spot = () => {
    for (let t = 0; t < TRIES; t++) {
      const [x, z] = [x0 + random() * (x1 - x0), z0 + random() * (z1 - z0)];
      if (used.some(([ux, uz]) => Math.hypot(ux - x, uz - z) < APART_FT)) continue;
      const y = ground(x, z);
      if (y !== null) return [x, y, z];
    }
    return null;
  };
  const near = ([cx, , cz]) => {
    for (let t = 0; t < TRIES; t++) {
      const [angle, far] = [random() * 2 * Math.PI, PACK_FT * (0.4 + 0.6 * random())];
      const [x, z] = [cx + Math.cos(angle) * far, cz + Math.sin(angle) * far];
      const y = ground(x, z);
      if (y !== null) return [x, y, z];
    }
    return null;
  };
  const out = [];
  for (const spawn of spawnArea.spawns ?? []) {
    if (!spawn.creature) continue;
    let left = Math.min(mobsFor(spawn.density ?? 0, points), MOST_MOBS - out.length);
    while (left > 0) {
      const [lo, hi] = spawn.pack ?? [1, 1];
      const size = Math.min(left, lo + Math.floor(random() * (hi - lo + 1)));
      left -= size;
      const first = spot();
      if (!first) continue;
      used.push([first[0], first[2]]);
      const pack = size > 1 ? packId() : null;
      for (let k = 0; k < size; k++) {
        const at = k === 0 ? first : (near(first) ?? first);
        const mob = { id: id(), creature: spawn.creature, at: at.map(round), yaw: Math.floor(random() * 360), levels: spawn.levels ?? 1, respawn: spawn.respawn ?? 300 };
        if (spawn.wander !== undefined && spawn.wander !== null) mob.wander = spawn.wander;
        if (pack) mob.pack = pack;
        mob.spawnArea = spawnArea.id;
        out.push(mob);
      }
    }
  }
  return out;
}
