import { hash2 } from "../world/noise.js";
import { makeObject, reachOf, specOf } from "../world/objects.js";
import { BIOME_NAMES } from "./biomes.js";
import FILL from "./fill.json";
import { SLOPE_DEG, groundClass } from "./look.js";
import { TILE_FT } from "./sizes.js";
import { SEED, SLOT_BYTES, SLOT_SIZES } from "./slots.js";

// What fills object slots (slots.js), by fill.json: the same for whoever reads the tile. Slots on
// banks, shores and in shallows take theirs from its `banks`, slots on steep ground or under
// deeper water stay empty, and bigger things are placed first, so smaller ones that would crowd
// them are left out.

// How much room trees of each size (1 to 3) keep round them, in ft: about half their crowns.
const TREE_ROOM = [0, 8, 12, 17];
const ROOM_BUCKET_FT = 32;
const SHALLOW_FT = 1.5; // how deep water can be over a slot for it to be filled

// What fills a slot of `size` (an index into SLOT_SIZES) with `roll` in biome `biome` (an index
// into BIOME_NAMES): a fill.json entry, or null. `fine`, 0 to 1, splits the roll finer, so shares
// can be less than a roll's 1/256.
export function fillOf(biome, size, roll, fine = 0.5) {
  return pickFrom(FILL.biomes[BIOME_NAMES[biome]]?.[SLOT_SIZES[size]] ?? [], roll, fine);
}

// What fills a slot of `size` by running water, or still, in biome `biome`, with `roll` and `fine`
// as fillOf has them: the biome's own banks if it has any, or the usual ones.
export function bankFillOf(running, size, roll, fine = 0.5, biome = 0) {
  const banks = FILL.biomeBanks?.[BIOME_NAMES[biome]] ?? FILL.banks;
  return pickFrom(banks[running ? "running" : "still"]?.[SLOT_SIZES[size]] ?? [], roll, fine);
}

function pickFrom(entries, roll, fine) {
  let past = (roll + fine) / 256;
  for (const entry of entries) {
    if (past < entry.share) return entry;
    past -= entry.share;
  }
  return null;
}

// What stands in tile (tx, tz)'s `slots`: { trees: [{ x, z, kind, size }], objects: world/objects.js
// objects }, continent feet. biomeAt(i, j) gives the biome of the tile's cell (i, j); groundAt(x, z)
// the ground's { height, slope, water } there, slope in degrees and water as look.js's groundClass
// has it.
export function fillSlots(slots, tx, tz, biomeAt, groundAt) {
  const trees = [];
  const objects = [];
  const room = new Map(); // bucket -> [x, z, r] of what's placed
  const crowded = (x, z, r) => {
    const [bi, bj] = [Math.floor(x / ROOM_BUCKET_FT), Math.floor(z / ROOM_BUCKET_FT)];
    for (let j = bj - 1; j <= bj + 1; j++) {
      for (let i = bi - 1; i <= bi + 1; i++) {
        for (const [px, pz, pr] of room.get(`${i},${j}`) ?? []) if (Math.hypot(px - x, pz - z) < pr + r) return true;
      }
    }
    return false;
  };
  const keep = (x, z, r) => {
    const key = `${Math.floor(x / ROOM_BUCKET_FT)},${Math.floor(z / ROOM_BUCKET_FT)}`;
    if (!room.has(key)) room.set(key, []);
    room.get(key).push([x, z, r]);
  };
  for (let at = 0; at < slots.length; at += SLOT_BYTES) {
    const [sx, sz, size, roll] = [slots[at], slots[at + 1], slots[at + 2], slots[at + 3]];
    const [x, z] = [tx * TILE_FT + sx + 0.5, tz * TILE_FT + sz + 0.5];
    // The roll split finer by where the slot is.
    const fine = hash2(Math.floor(x), Math.floor(z), SEED + 32);
    const { height, slope, water } = groundAt(x, z);
    const kind = groundClass(slope, height, water);
    if (kind === "steep" || (kind === "bed" && water.level - height > SHALLOW_FT)) continue;
    const biome = biomeAt(sx >> 2, sz >> 2);
    const entry = kind === "bank" || kind === "shore" || kind === "bed" ? bankFillOf(water.running, size, roll, fine, biome) : fillOf(biome, size, roll, fine);
    if (!entry) continue;
    const pick = (n) => hash2(Math.floor(x), Math.floor(z), SEED + 16 + n);
    if (entry.tree) {
      const r = TREE_ROOM[entry.size];
      if (crowded(x, z, r)) continue;
      keep(x, z, r);
      trees.push({ x, z, kind: entry.tree, size: entry.size });
      continue;
    }
    const spec = specOf(entry.object);
    if (!spec) continue;
    const [least, most] = entry.scales ?? spec.size;
    const scale = least + (most - least) * pick(0);
    const object = makeObject(entry.object, [x, z], pick(1) * Math.PI * 2, scale, (n) => pick(2 + n));
    // Logs would stick out of hillsides.
    if (object.footprint.capsule && slope >= SLOPE_DEG) continue;
    const r = reachOf(object);
    if (crowded(x, z, r)) continue;
    keep(x, z, r);
    objects.push(object);
  }
  return { trees, objects };
}
