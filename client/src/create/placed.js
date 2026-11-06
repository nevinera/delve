import { strFromU8, strToU8 } from "fflate";
import { PLATE_FT } from "../v2/sizes.js";
import { footprintOf, makeObject, specOf } from "../world/objects.js";
import { slabHome } from "../world/slabs.js";

// The objects and slabs placed by hand (.agents/formats.md), kept in a file for each plate
// they're in:
//
//   places/continents/<continent>/placed/<px>_<pz>.json
//   { "version": 1, "objects": [...], "slabs": [...] }
//
// An object is in the plate its `at` is in, a slab in the one its home corner is in (slabHome).
// Objects are kept as the world's tiles keep them (world/objects.js), with their footprint and
// height worked out from their type as they're read, and saved with them for the game server. What's changed is kept to save again, and
// each change can be undone, up to UNDOS of them.

export const placedPath = (continent, [px, pz]) => `places/continents/${continent}/placed/${px}_${pz}.json`;
export const PLACED_PATH = /^places\/continents\/([\w-]+)\/placed\/(-?\d+)_(-?\d+)\.json$/;
const UNDOS = 100;

const round = (v, places = 2) => Math.round(v * 10 ** places) / 10 ** places + 0;
export const isSlab = (thing) => Array.isArray(thing.outline);
// Where a thing's kept by, [x, z].
export const homeOf = (thing) => (isSlab(thing) ? [slabHome(thing)[0], slabHome(thing)[2]] : thing.at);
const plateKey = ([x, z]) => `${Math.floor(x / PLATE_FT)},${Math.floor(z / PLATE_FT)}`;

// Rolls 0 to 1, the same each time for the same (x, z).
function rollAt([x, z]) {
  let seed = (Math.round(x * 100) * 73856093) ^ (Math.round(z * 100) * 19349663);
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// An object with its footprint and height worked out, and a built-in kind without colors given
// some, the same each time for where it is; or null for a type that isn't known.
export function readyObject(object) {
  const spec = specOf(object.type);
  if (!spec) return null;
  const colors = object.colors ?? (spec.built ? undefined : makeObject(object.type, object.at, object.yaw, object.scale, rollAt(object.at)).colors);
  return { ...object, ...(colors ? { colors } : {}), footprint: footprintOf(object.type, object.scale), height: spec.height * object.scale };
}

// An object of a kind the world hasn't got, as a placed file holds it: kept as it is, so saving
// doesn't lose it and it comes back with its kind. It stands in the way as its file says, and
// nothing draws it but what asks to (Things' showMissing).
export function standIn(object) {
  const plain = !object.footprint;
  return { ...object, footprint: object.footprint ?? { open: 1 }, height: object.height ?? 2, plain };
}

// Whether an object's kind is one the world hasn't got.
export const isMissing = (object) => !specOf(object.type);

// A footprint's sizes rounded as the file keeps them.
const keptFootprint = (footprint) => Object.fromEntries(Object.entries(footprint).map(([shape, v]) => [shape, Array.isArray(v) ? v.map((n) => round(n, 3)) : round(v, 3)]));

// An object as the file keeps it.
function keptObject({ type, at, y, yaw, scale, colors, texts, template, road, cave, footprint, height, plain }) {
  return {
    type,
    at: at.map((v) => round(v)),
    ...(Number.isFinite(y) ? { y: round(y) } : {}),
    yaw: round(((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2), 4),
    scale: round(scale),
    ...(colors ? { colors } : {}),
    ...(texts && Object.keys(texts).length ? { texts } : {}),
    ...(template ? { template } : {}),
    ...(road ? { road } : {}),
    ...(cave ? { cave } : {}),
    ...(footprint && !plain ? { footprint: keptFootprint(footprint), height: round(height, 3) } : {}),
  };
}

export class Placed {
  constructor() {
    this.plates = new Map(); // "px,pz" -> { objects, slabs }
    this.changed = new Set(); // "px,pz" of plates changed since they were saved
    this.version = 0; // counts changes, to tell when what's drawn is stale
    this.undos = [];
    // caveOf(thing): the cave network a thing's in, or null; caveProblem(net): why things can't
    // go in that network, or null; onRefuse(text): told when a change is refused for it.
    this.caveOf = null;
    this.caveProblem = () => null;
    this.onRefuse = () => {};
  }

  // Tags `things` with the cave networks they're in, giving why one can't be there, or null.
  tagCaves(things) {
    if (!this.caveOf) return null;
    for (const thing of things) {
      const cave = this.caveOf(thing);
      if (cave) thing.cave = cave;
      else delete thing.cave;
    }
    for (const thing of things) {
      const problem = thing.cave && this.caveProblem(thing.cave);
      if (problem) return problem;
    }
    return null;
  }

  // Takes plate (px, pz)'s file's bytes.
  load([px, pz], bytes) {
    const json = JSON.parse(strFromU8(bytes));
    const plate = this.plate(`${px},${pz}`);
    plate.objects.push(...(json.objects ?? []).map((object) => readyObject(object) ?? standIn(object)));
    plate.slabs.push(...(json.slabs ?? []));
    this.version++;
  }

  // How many placed objects are of kinds the world hasn't got.
  missingCount() {
    let count = 0;
    for (const { objects } of this.plates.values()) count += objects.filter(isMissing).length;
    return count;
  }

  plate(key) {
    if (!this.plates.has(key)) this.plates.set(key, { objects: [], slabs: [] });
    return this.plates.get(key);
  }

  // The objects and slabs in plates within `reach` ft of (x, z), { objects, slabs }.
  near(x, z, reach) {
    const out = { objects: [], slabs: [] };
    for (let pz = Math.floor((z - reach) / PLATE_FT); pz <= Math.floor((z + reach) / PLATE_FT); pz++) {
      for (let px = Math.floor((x - reach) / PLATE_FT); px <= Math.floor((x + reach) / PLATE_FT); px++) {
        const plate = this.plates.get(`${px},${pz}`);
        if (!plate) continue;
        out.objects.push(...plate.objects);
        out.slabs.push(...plate.slabs);
      }
    }
    return out;
  }

  add(thing) {
    const key = plateKey(homeOf(thing));
    this.plate(key)[isSlab(thing) ? "slabs" : "objects"].push(thing);
    this.changed.add(key);
  }

  remove(thing) {
    for (const [key, plate] of this.plates) {
      const list = plate[isSlab(thing) ? "slabs" : "objects"];
      const at = list.indexOf(thing);
      if (at < 0) continue;
      list.splice(at, 1);
      this.changed.add(key);
      return;
    }
  }

  kept(entry) {
    this.undos.push(entry);
    if (this.undos.length > UNDOS) this.undos.shift();
    this.version++;
  }

  // Places `things`, objects and slabs. Gives whether it did.
  put(things) {
    if (!things.length) return false;
    const problem = this.tagCaves(things);
    if (problem) {
      this.onRefuse(problem);
      return false;
    }
    for (const thing of things) this.add(thing);
    this.kept({ added: things });
    return true;
  }

  // Makes the objects and slabs roads put in the placed files (those with `road`) `things`, keeping
  // those already there that are the same, and taking away the rest. Not a change undo goes back
  // over: the roads' own undo does that. Gives whether anything changed.
  setRoadThings(things) {
    const key = (thing) => JSON.stringify(isSlab(thing) ? thing : { type: thing.type, at: thing.at, y: thing.y, yaw: thing.yaw, scale: thing.scale, road: thing.road });
    const had = new Map();
    for (const plate of this.plates.values()) for (const thing of [...plate.objects, ...plate.slabs]) if (thing.road) had.set(key(thing), thing);
    const wanted = new Map(things.map((thing) => [key(thing), thing]));
    let changed = false;
    for (const [k, thing] of had) {
      if (wanted.has(k)) continue;
      this.remove(thing);
      changed = true;
    }
    for (const [k, thing] of wanted) {
      if (had.has(k)) continue;
      this.add(isSlab(thing) ? thing : (readyObject(thing) ?? standIn(thing)));
      changed = true;
    }
    if (changed) this.version++;
    return changed;
  }

  // Takes `things` away.
  take(things) {
    if (!things.length) return;
    for (const thing of things) this.remove(thing);
    this.kept({ removed: things });
  }

  // Takes `before` away and places `after` in their stead, as one change.
  swap(before, after) {
    const problem = this.tagCaves(after);
    if (problem) return this.onRefuse(problem);
    for (const thing of before) this.remove(thing);
    for (const thing of after) this.add(thing);
    this.kept({ added: after, removed: before });
  }

  // Changes `things` with change(copy, thing), made on a copy of each, kept with the plates they're in after. Changes made
  // together (`join`) undo as one, as for a drag. A change that would put one where it can't be,
  // in a cave, isn't made.
  alter(things, change, join = false) {
    if (!things.length) return;
    const changed = things.map((thing) => {
      const copy = structuredClone(thing);
      change(copy, thing);
      return copy;
    });
    const problem = this.tagCaves(changed);
    if (problem) return this.onRefuse(problem);
    const last = this.undos.at(-1);
    const entry = join && last?.altered ? last : { altered: new Map() };
    things.forEach((thing, i) => {
      if (!entry.altered.has(thing)) entry.altered.set(thing, structuredClone(thing));
      this.remove(thing);
      for (const key of Object.keys(thing)) delete thing[key];
      Object.assign(thing, changed[i]);
      this.add(thing);
    });
    if (entry === last) this.version++;
    else this.kept(entry);
  }

  // Takes away everything placed in cave network `net`, for good: it can't be undone, and the
  // undos are cleared, since they could put things back in rock carved again.
  dropCave(net) {
    let dropped = 0;
    for (const [key, plate] of this.plates) {
      for (const list of [plate.objects, plate.slabs]) {
        const kept = list.filter((thing) => thing.cave !== net);
        if (kept.length === list.length) continue;
        dropped += list.length - kept.length;
        list.splice(0, list.length, ...kept);
        this.changed.add(key);
      }
    }
    if (dropped) {
      this.undos = [];
      this.version++;
    }
    return dropped;
  }

  // Undoes the last change. Gives whether there was one.
  undo() {
    const entry = this.undos.pop();
    if (!entry) return false;
    for (const thing of entry.added ?? []) this.remove(thing);
    for (const thing of entry.removed ?? []) this.add(thing);
    for (const [thing, before] of entry.altered ?? []) {
      this.remove(thing);
      for (const key of Object.keys(thing)) delete thing[key];
      Object.assign(thing, before);
      this.add(thing);
    }
    this.version++;
    return true;
  }

  // The files of the plates changed since they were saved, path -> bytes, or null for those with
  // nothing left in them.
  unsavedFiles(continent) {
    const files = new Map();
    for (const key of this.changed) {
      const { objects, slabs } = this.plate(key);
      const path = placedPath(continent, key.split(",").map(Number));
      files.set(path, objects.length || slabs.length ? strToU8(`${JSON.stringify({ version: 1, objects: objects.map(keptObject), slabs }, null, 1)}\n`) : null);
    }
    this.changed.clear();
    return files;
  }
}
