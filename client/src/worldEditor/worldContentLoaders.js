import {blankWorld} from "./blankWorld";

// A world lives at worlds/<key>.json - flat, no subdirectory (see
// Build::WorldsController). Same "doesn't exist yet" fallback every other
// editor's own load* helper uses.
export async function loadWorld(client, key) {
  const content = await client.fetchFile(`worlds/${key}.json`);
  return content === null ? blankWorld(key) : JSON.parse(content);
}

// worlds/<key>.layout.json (see saveWorld.js/layoutMetadata.js) is purely
// an editor display concern, not part of the World schema - {} for a world
// that's never been saved since the graph existed, same as
// zoneContentLoaders.js#loadLayoutPositions one level down.
export async function loadLayoutPositions(client, key) {
  const content = await client.fetchFile(`worlds/${key}.layout.json`);
  if (content === null) return {};
  return JSON.parse(content).positions ?? {};
}

// Resolves a relative path against a file's own location in the repo -
// same trick zoneContentLoaders.js's own resolveRelativePath uses.
function resolveRelativePath(basePath, relativePath) {
  const url = new URL(relativePath, `https://_/${basePath}`);
  return url.pathname.replace(/^\//, "");
}

// {name, openConnections, entryPoints} for every zone this world's draft
// references (each opens that zone's own file, at the relative `path` its
// WorldZoneEntry gives - see docs/schema/world.md), so the graph
// (WorldGraphCanvas) can draw a real port for each of a zone's actually
// exposed connections - both its openConnections and its entryPoints -
// instead of the free-typed name WorldLinksPanel used to fall back to. A
// zone's own entryPoints are only reachable directly when it's entered on
// its own; once it's part of a world, that only happens through the
// world's own entryPoints, so they're just more available connection
// points from here (see docs/schema/world.md's ZoneReference). A world
// never inlines its zones and never needs their `.full.json` companion
// either - openConnections/entryPoints are plain dicts, not something a
// zone's own maps/unitTypes $refs would hide (see docs/schema/zone.md). A
// zone key with no path, or whose fetch/parse fails, is just omitted - not
// an error, matching zoneContentLoaders.js#mapDetailsFor's
// filter_map/rescue-nil.
export async function zoneDetailsFor(client, worldKey, zones) {
  const basePath = `worlds/${worldKey}.json`;
  const entries = await Promise.all(
    Object.entries(zones ?? {}).map(async ([key, zone]) => {
      if (!zone?.path) return null;
      try {
        const content = await client.fetchFile(resolveRelativePath(basePath, zone.path));
        if (content === null) return null;
        const data = JSON.parse(content);
        return [key, {
          name: data.name,
          description: data.description,
          openConnections: data.openConnections ?? {},
          entryPoints: data.entryPoints ?? {},
        }];
      } catch {
        return null;
      }
    })
  );
  return Object.fromEntries(entries.filter(Boolean));
}

// Every real zone key directly under zones/ - a cheap directory listing (no
// file opens), same intent/shape as zoneContentLoaders.js#listZoneMapKeys
// one level up. Can't just type a zone key by hand and guess right - this
// is what ZonesPanel's "Add Zone" picker offers candidates from. A zone
// lives at zones/<key>/<key>.json (see Build::ZonesController#zone_path) -
// one "/" left after stripping the zones/ prefix distinguishes a zone's own
// file from a map file living deeper inside it.
export async function listAvailableZoneKeys(client) {
  const prefix = "zones/";
  const paths = await client.listDirectory("zones");
  const keys = paths
    .filter((path) => path.endsWith(".json") && !path.endsWith(".full.json") && !path.endsWith(".layout.json"))
    .map((path) => path.slice(prefix.length))
    .filter((relative) => relative.split("/").length === 2)
    .map((relative) => relative.split("/")[0]);
  return [...new Set(keys)].sort();
}

// The relative path from a world's own file to a zone it references -
// deterministic from each side's fixed directory convention (worlds/<key>.json
// flat, zones/<key>/<key>.json one level deep), so there's nothing to guess
// or ask the author to type once a real zone key is picked from
// listAvailableZoneKeys.
export function zoneRefPath(zoneKey) {
  return `../zones/${zoneKey}/${zoneKey}.json`;
}
