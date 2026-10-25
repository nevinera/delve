// Zones live at places/continents/<continent>/zones/<key>.json. The key is fixed when the zone is
// made; the name can change.

export const ZONE_VERSION = 2;
const ZONE_PATH = /^places\/continents\/([\w-]+)\/zones\/([\w-]+)\.json$/;

export function zonePath(continent, key) {
  return `places/continents/${continent}/zones/${key}.json`;
}

export function listZones(world, continent) {
  const zones = [];
  for (const path of world.files.keys()) {
    const match = path.match(ZONE_PATH);
    if (match && match[1] === continent) zones.push({ key: match[2], ...world.readJson(path) });
  }
  return zones.sort((a, b) => a.key.localeCompare(b.key));
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

export function slug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
