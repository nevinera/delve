import { tilesTouched } from "./region.js";
import { listZones, olderZones } from "./zones.js";

// places/continents/<continent>/index.json says which tiles exist, which layers each has, and which
// zones touch it, so nothing has to probe for missing tiles (plans/design.md, "Worlds and zone
// exits"). It's rebuilt from the world's files and zones, so it can't drift from them.

export const INDEX_VERSION = 2;
const TILE_PATH = /^places\/continents\/([\w-]+)\/tiles\/([\w-]+)\/(-?\d+)\/(-?\d+)\.dlt\.gz$/;

export function indexPath(continent) {
  return `places/continents/${continent}/index.json`;
}

export function buildIndex(world, continent) {
  const layers = new Map(); // "x,z" -> Set of layer names
  for (const path of world.files.keys()) {
    const match = path.match(TILE_PATH);
    if (!match || match[1] !== continent) continue;
    const key = `${match[3]},${match[4]}`;
    if (!layers.has(key)) layers.set(key, new Set());
    layers.get(key).add(match[2]);
  }

  const zonesAt = new Map(); // "x,z" -> zone keys
  for (const zone of listZones(world, continent)) {
    for (const [tx, tz] of tilesTouched(zone.region)) {
      const key = `${tx},${tz}`;
      if (!zonesAt.has(key)) zonesAt.set(key, []);
      zonesAt.get(key).push(zone.key);
    }
  }

  // Zone files in the older format have no region, so keep what the old index said about them.
  const older = new Set(olderZones(world, continent));
  const previous = world.readJson(indexPath(continent))?.tiles ?? {};
  const olderAt = (key) => [previous[key]?.zone, ...(previous[key]?.zones ?? [])].filter((z) => older.has(z));

  const tiles = {};
  for (const key of [...layers.keys()].sort(compareCoords)) {
    tiles[key] = {
      zones: [...new Set([...(zonesAt.get(key) ?? []), ...olderAt(key)])].sort(),
      layers: [...layers.get(key)].sort(),
    };
  }
  return { version: INDEX_VERSION, tiles };
}

// Rewrites every continent's index that has tiles or had an index before.
export function updateIndexes(world) {
  for (const { key } of world.info.continents) {
    const index = buildIndex(world, key);
    if (Object.keys(index.tiles).length || world.files.has(indexPath(key))) world.writeJson(indexPath(key), index);
  }
}

function compareCoords(a, b) {
  const [ax, az] = a.split(",").map(Number);
  const [bx, bz] = b.split(",").map(Number);
  return ax - bx || az - bz;
}
