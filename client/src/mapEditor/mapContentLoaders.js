// Every GitHub read Build::MapsController#edit/#available_unit_types/
// #available_items used to do server-side, now done here client-side (see
// plans/editor-git.md) - one function per thing MapEditor.jsx needs to load
// or re-load (on mount, and again on "Refresh"/lazily as keys are picked).

// Resolves a relative path (e.g. "./gc1-entrance.webp") against a file's
// own location in the repo - same URL trick every other editor's own
// resolveRepoPath/resolveRelativePath uses.
function resolveRelativePath(basePath, relativePath) {
  const url = new URL(relativePath, `https://_/${basePath}`);
  return url.pathname.replace(/^\//, "");
}

// JS port of Build::MapsController#blank_map - also used as MapEditor.jsx's
// reducer placeholder while the real content is still loading (see its own
// comment on why that has to be a real blank map, not null).
export function blankMap(key) {
  const basename = key.split("/").pop();
  const name = basename
    .replace(/[_-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
  return {
    identifier: basename, name, elvl: null, imageUrl: null, pixelDimensions: null,
    feetDimensions: null, lighting: "daylight", barriers: [], connections: [], units: [],
  };
}

// A map lives at zones/<key>/<basename(key)>.json - see
// Build::MapsController#map_path. Falls back to blankMap on a 404 (brand
// new key), same as every other editor's load.
export async function loadMap(client, key) {
  const basename = key.split("/").pop();
  const content = await client.fetchFile(`zones/${key}/${basename}.json`);
  return content === null ? blankMap(key) : JSON.parse(content);
}

// An existing map's imageUrl is relative to the map's own file (see
// docs/schema/map.md's example) - unlike Build::MapsController#fetch_image_data_uri,
// this needs no fetch/base64/MIME lookup at all: the content repo is always
// public, so GithubClient#assetUrl's raw.githubusercontent.com URL goes
// straight into an <img> src, with no 1MB Contents-API ceiling either.
export async function loadMapImageUrl(client, key, mapData) {
  if (!mapData.imageUrl) return null;
  const basename = key.split("/").pop();
  return client.assetUrl(resolveRelativePath(`zones/${key}/${basename}.json`, mapData.imageUrl));
}

// Every unit_types/*.json key (unit types can nest in subdirectories) - a
// directory listing only, same cheap-list intent as
// Build::MapsController#list_unit_type_keys: a repo can hold far more unit
// types than any one map uses, so this never opens a file.
export async function listUnitTypeKeys(client) {
  const paths = await client.listDirectory("unit_types");
  return paths
    .filter((path) => path.endsWith(".json") && !path.endsWith(".full.json"))
    .map((path) => path.replace(/^unit_types\//, "").replace(/\.json$/, ""));
}

// {name, tokenRadius, tokenImageUrl, speedFactor} for exactly the given
// keys - a key with no matching/parseable file (deleted or renamed since a
// unit referencing it was placed) is just omitted, not an error, matching
// Build::MapsController#unit_type_details_for's filter_map/rescue-nil.
export async function unitTypeDetailsFor(client, keys) {
  const entries = await Promise.all(
    keys.map(async (key) => {
      try {
        const content = await client.fetchFile(`unit_types/${key}.json`);
        if (content === null) return null;
        const unitType = JSON.parse(content);
        const rawUrl = Array.isArray(unitType.tokenImageUrl) ? unitType.tokenImageUrl[0] : unitType.tokenImageUrl;
        const tokenImageUrl = rawUrl ? await client.assetUrl(resolveRelativePath(`unit_types/${key}.json`, rawUrl)) : null;
        return [key, {name: unitType.name, tokenRadius: unitType.tokenRadius, tokenImageUrl, speedFactor: unitType.speedFactor}];
      } catch {
        return null;
      }
    })
  );
  return Object.fromEntries(entries.filter(Boolean));
}

// Every items/*.json key - same cheap-list intent as
// Build::MapsController#list_item_keys.
export async function listItemKeys(client) {
  const paths = await client.listDirectory("items");
  return paths.filter((path) => path.endsWith(".json")).map((path) => path.replace(/^items\//, "").replace(/\.json$/, ""));
}

// {identifier, name, slot} for exactly the given keys - same omit-rather-
// than-error handling as unitTypeDetailsFor, matching
// Build::MapsController#item_details_for.
export async function itemDetailsFor(client, keys) {
  const entries = await Promise.all(
    keys.map(async (key) => {
      try {
        const content = await client.fetchFile(`items/${key}.json`);
        if (content === null) return null;
        const item = JSON.parse(content);
        return [key, {identifier: item.identifier, name: item.name, slot: item.slot}];
      } catch {
        return null;
      }
    })
  );
  return Object.fromEntries(entries.filter(Boolean));
}
