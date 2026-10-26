import { nextId } from "./features.js";

// Zones live at places/continents/<continent>/zones/<key>.json, each a name and a region. The key
// is fixed when the zone is made; the name can change. Everything drawn on the land, pins and
// paths alike, lives in the continent's sketch at places/continents/<continent>/sketch.json,
// since the land is generated as one piece and features cross zone edges. The sketch also keeps
// its watercourses, the rivers and pools its water sources make (waterflow.js), for the
// generator, and its road paths between road pins (roads.js). Older sketches hold rivers drawn by
// hand (format 1) or confirmed one source at a time (format 2), and roads drawn as lines (formats
// 1 to 3), which the editor drops.

export const ZONE_VERSION = 3;
export const SKETCH_VERSION = 4;
const SKETCH_ZONES = 2; // the zone format that held its own pins and lines
const ZONE_PATH = /^places\/continents\/([\w-]+)\/zones\/([\w-]+)\.json$/;

export function zonePath(continent, key) {
  return `places/continents/${continent}/zones/${key}.json`;
}

// The continent's zones in the current format, by key. Zones with their own pins and lines
// need moveIntoSketch first; older zone files are left alone (see olderZones).
export function listZones(world, continent) {
  return zoneFiles(world, continent)
    .filter((zone) => zone.version === ZONE_VERSION)
    .sort((a, b) => a.key.localeCompare(b.key));
}

// Keys of zone files from before regions (format 1), which the editor can't show or edit.
export function olderZones(world, continent) {
  return zoneFiles(world, continent)
    .filter((zone) => zone.version < SKETCH_ZONES)
    .map((zone) => zone.key)
    .sort();
}

function zoneFiles(world, continent) {
  const zones = [];
  for (const path of world.files.keys()) {
    const match = path.match(ZONE_PATH);
    if (match && match[1] === continent) zones.push({ key: match[2], ...world.readJson(path) });
  }
  return zones;
}

export function createZone(world, continent, name) {
  const base = slug(name) || "zone";
  let key = base;
  for (let n = 2; world.files.has(zonePath(continent, key)); n++) key = `${base}-${n}`;
  const zone = { version: ZONE_VERSION, name, region: [] };
  world.writeJson(zonePath(continent, key), zone);
  return { key, ...zone };
}

export function saveZone(world, continent, { key, ...zone }) {
  world.writeJson(zonePath(continent, key), zone);
}

// Removes only the zone file. Tiles generated inside the zone stay as they are.
export function removeZone(world, continent, key) {
  world.files.delete(zonePath(continent, key));
}

export function sketchPath(continent) {
  return `places/continents/${continent}/sketch.json`;
}

// The continent's pins, paths and watercourses: { version, pins, paths, watercourses }. Paths are
// { id, from, to, width, route, ... }, from and to the ids of road pins, and route { key, points,
// lengthFt, grade } (roads.js), key saying what it was worked out from. Watercourses are { key,
// rivers, pools } (waterflow.js simulateWater), the same way.
export function loadSketch(world, continent) {
  const sketch = world.readJson(sketchPath(continent)) ?? { version: SKETCH_VERSION, pins: [], paths: [] };
  sketch.paths ??= [];
  sketch.watercourses ??= { key: null, rivers: [], pools: [] };
  return sketch;
}

// Brings an older sketch up to date, dropping the lines it kept rivers and roads in. Returns how
// many rivers were drawn by hand, and how many roads were drawn.
export function upgradeSketch(sketch) {
  if (sketch.version >= SKETCH_VERSION) return { rivers: 0, roads: 0 };
  const strokes = sketch.strokes ?? [];
  const rivers = sketch.version < 2 ? strokes.filter((s) => s.kind === "river").length : 0;
  const roads = strokes.filter((s) => s.kind === "road").length;
  delete sketch.strokes;
  delete sketch.pools;
  for (const pin of sketch.pins) delete pin.confirmed;
  sketch.version = SKETCH_VERSION;
  return { rivers, roads };
}

export function saveSketch(world, continent, sketch) {
  world.writeJson(sketchPath(continent), sketch);
}

// Moves the pins out of zone files that held their own (format 2) into the sketch, renumbering any
// whose id is taken and leaving out the lines they drew rivers and roads with, and rewrites those
// zones in the current format. Returns the keys of the zones it moved.
export function moveIntoSketch(world, continent) {
  const moving = zoneFiles(world, continent).filter((zone) => zone.version === SKETCH_ZONES);
  if (!moving.length) return [];
  const sketch = loadSketch(world, continent);
  for (const { key, name, region, pins = [] } of moving) {
    for (const pin of pins) {
      const taken = sketch.pins.some((p) => p.id === pin.id);
      sketch.pins.push(taken ? { ...pin, id: nextId(sketch, "p") } : pin);
    }
    world.writeJson(zonePath(continent, key), { version: ZONE_VERSION, name, region });
  }
  saveSketch(world, continent, sketch);
  return moving.map((zone) => zone.key).sort();
}

export function slug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
