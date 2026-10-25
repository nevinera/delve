// Zones live at places/continents/<continent>/zones/<key>.json. The key is fixed when the zone is
// made; the name can change.

export const ZONE_VERSION = 2;
const ZONE_PATH = /^places\/continents\/([\w-]+)\/zones\/([\w-]+)\.json$/;

export function zonePath(continent, key) {
  return `places/continents/${continent}/zones/${key}.json`;
}

// The continent's zones in the current format, by key. Older zone files are left alone; see
// olderZones.
export function listZones(world, continent) {
  return zoneFiles(world, continent)
    .filter((zone) => zone.version === ZONE_VERSION)
    .sort((a, b) => a.key.localeCompare(b.key));
}

// Keys of zone files from before regions (format 1), which the editor can't show or edit.
export function olderZones(world, continent) {
  return zoneFiles(world, continent)
    .filter((zone) => zone.version !== ZONE_VERSION)
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
  const zone = { version: ZONE_VERSION, name, region: [], strokes: [], pins: [] };
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

export function slug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
