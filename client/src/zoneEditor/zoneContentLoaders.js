import {keyFromRef} from "./mapRef";

// Every GitHub read Build::ZonesController#edit/#available_maps used to do
// server-side, now done here client-side (see plans/editor-git.md).

// Resolves a relative path against a file's own location in the repo -
// same URL trick every other editor's own resolveRepoPath/
// resolveRelativePath uses.
function resolveRelativePath(basePath, relativePath) {
  const url = new URL(relativePath, `https://_/${basePath}`);
  return url.pathname.replace(/^\//, "");
}

// Only `name`/`elvl`/`private` are editable so far - the rest of the
// schema's fields are stubbed in, JS port of Build::ZonesController#blank_zone.
function blankZone(key) {
  const name = key
    .split("/")
    .pop()
    .replace(/[_-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
  return {
    name, description: null, elvl: null, private: null, maps: [],
    unitTypes: {}, items: {}, zoneLinks: [], entryPoints: {}, openConnections: {},
  };
}

// A zone lives at zones/<key>/<basename(key)>.json - see
// Build::ZonesController#zone_path.
export async function loadZone(client, key) {
  const basename = key.split("/").pop();
  const content = await client.fetchFile(`zones/${key}/${basename}.json`);
  return content === null ? blankZone(key) : JSON.parse(content);
}

// <zone>.layout.json (see saveZone.js/layoutMetadata.js) is purely an
// editor display concern, not part of the zone schema - {} for a zone
// that's never been saved since the graph existed.
export async function loadLayoutPositions(client, key) {
  const basename = key.split("/").pop();
  const content = await client.fetchFile(`zones/${key}/${basename}.layout.json`);
  if (content === null) return {};
  return JSON.parse(content).positions ?? {};
}

// Every real map key directly under zones/<zoneKey>/ - a cheap directory
// listing (no file opens), same intent as Build::ZonesController#zone_map_keys.
// One "/" left after stripping the zones/<zoneKey>/ prefix distinguishes a
// map file (zones/<zone>/<map>/<map>.json) from the zone's own top-level
// file (zones/<zone>/<zone>.json).
export async function listZoneMapKeys(client, zoneKey) {
  const prefix = `zones/${zoneKey}/`;
  const paths = await client.listDirectory(`zones/${zoneKey}`);
  const keys = paths
    .filter((path) => path.endsWith(".json") && !path.endsWith(".full.json"))
    .map((path) => path.slice(prefix.length))
    .filter((relative) => relative.split("/").length === 2)
    .map((relative) => relative.split("/")[0]);
  return [...new Set(keys)];
}

// The map keys a zone's own draft already references, derived from its
// `maps` array's $ref strings - mirrors
// Build::ZonesController#referenced_map_keys, both agreeing with
// mapRef.js's own keyFromRef on what "already referenced" means.
export function referencedMapKeys(zoneData) {
  return (zoneData.maps ?? [])
    .map((entry) => entry?.$ref)
    .filter((ref) => typeof ref === "string")
    .map((ref) => keyFromRef(ref));
}

function unitSummaries(units) {
  return (units ?? []).map((unit) => ({unitType: unit.unitType, itemKeys: Object.keys(unit.lootTable ?? {})}));
}

// {identifier, name, connections, units, thumbnailUrl} for exactly the
// given keys (each opens that map's file) - a key with no matching/
// parseable file is just omitted, not an error, matching
// Build::ZonesController#map_details_for's filter_map/rescue-nil.
// thumbnailUrl resolves to a raw.githubusercontent.com URL, not a fetched/
// base64'd data URI - no fetch, no MIME lookup, no size ceiling, same win
// as every other editor's binary asset reads once they moved client-side.
export async function mapDetailsFor(client, zoneKey, keys) {
  const entries = await Promise.all(
    keys.map(async (key) => {
      try {
        const path = `zones/${zoneKey}/${key}/${key}.json`;
        const content = await client.fetchFile(path);
        if (content === null) return null;
        const mapData = JSON.parse(content);
        const thumbnailUrl = mapData.thumbnailUrl ? await client.assetUrl(resolveRelativePath(path, mapData.thumbnailUrl)) : null;
        return [key, {
          identifier: mapData.identifier,
          name: mapData.name,
          connections: mapData.connections ?? [],
          units: unitSummaries(mapData.units),
          thumbnailUrl,
        }];
      } catch {
        return null;
      }
    })
  );
  return Object.fromEntries(entries.filter(Boolean));
}
