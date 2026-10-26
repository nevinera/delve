import { nextId } from "./features.js";

// Zones live at places/continents/<continent>/zones/<key>.json, each a name and a region. The key
// is fixed when the zone is made; the name can change. Everything drawn on the land, pins,
// strokes and pools alike, lives in the continent's sketch at
// places/continents/<continent>/sketch.json, since the land is generated as one piece and
// features cross zone edges. Rivers and pools come from water source pins (waterflow.js); sketches
// from before that (format 1) hold rivers drawn by hand, which the editor drops.

export const ZONE_VERSION = 3;
export const SKETCH_VERSION = 2;
const SKETCH_ZONES = 2; // the zone format that held its own pins and strokes
const ZONE_PATH = /^places\/continents\/([\w-]+)\/zones\/([\w-]+)\.json$/;

export function zonePath(continent, key) {
  return `places/continents/${continent}/zones/${key}.json`;
}

// The continent's zones in the current format, by key. Zones with their own pins and strokes
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

// The continent's pins, strokes and pools: { version, pins, strokes, pools }.
export function loadSketch(world, continent) {
  const sketch = world.readJson(sketchPath(continent)) ?? { version: SKETCH_VERSION, pins: [], strokes: [] };
  sketch.pools ??= [];
  return sketch;
}

// Drops the rivers drawn by hand from a sketch from before water sources. Returns how many.
export function dropDrawnRivers(sketch) {
  if (sketch.version >= SKETCH_VERSION) return 0;
  const drawn = sketch.strokes.filter((s) => s.kind === "river");
  sketch.strokes = sketch.strokes.filter((s) => s.kind !== "river");
  sketch.version = SKETCH_VERSION;
  return drawn.length;
}

export function saveSketch(world, continent, sketch) {
  world.writeJson(sketchPath(continent), sketch);
}

// Moves the pins and strokes out of zone files that held their own (format 2) into the sketch,
// renumbering any whose id is taken and leaving out hand-drawn rivers, and rewrites those zones in the current format. Returns the
// keys of the zones it moved.
export function moveIntoSketch(world, continent) {
  const moving = zoneFiles(world, continent).filter((zone) => zone.version === SKETCH_ZONES);
  if (!moving.length) return [];
  const sketch = loadSketch(world, continent);
  for (const { key, name, region, pins = [], strokes = [] } of moving) {
    const kept = strokes.filter((s) => s.kind !== "river");
    for (const [list, features, prefix] of [[sketch.pins, pins, "p"], [sketch.strokes, kept, "s"]]) {
      for (const feature of features) {
        const taken = [...sketch.pins, ...sketch.strokes].some((f) => f.id === feature.id);
        list.push(taken ? { ...feature, id: nextId(sketch, prefix) } : feature);
      }
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
