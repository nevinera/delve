import {collectAssetUrls} from "../editor/collectAssetUrls";

// Resolves a relative asset path (e.g. "../graphics/icons/x.svg") against
// the ability file's own path - same URL trick AbilityEditor.jsx's
// resolveRepoPath/classEditor's loadAvailableAbilities use.
function resolveRelativePath(basePath, relativePath) {
  const url = new URL(relativePath, `https://_/${basePath}`);
  return url.pathname.replace(/^\//, "");
}

// Port of Build::UnitTypesController#load_available_abilities/#ability_entry -
// every ability under abilities/units/, not scoped to this unit type's own
// key (unit types are often grouped by shared-ability category rather than
// authored 1:1 with an ability folder - e.g. "goblin" and "goblin-boss"
// both draw on abilities/units/goblins/), up to one level of subdirectory
// nesting (abilities/units/*.json or abilities/units/*/*.json, not deeper).
export async function loadAvailableAbilities(client) {
  const paths = await client.listDirectory("abilities/units");
  const jsonPaths = paths
    .filter((path) => path.endsWith(".json"))
    .filter((path) => path.replace(/^abilities\/units\//, "").split("/").length <= 2);

  const entries = await Promise.all(
    jsonPaths.map(async (path) => {
      const key = path.replace(/^abilities\//, "").replace(/\.json$/, "");
      const ability = JSON.parse(await client.fetchFile(path));
      const urls = collectAssetUrls(ability);
      const assetEntries = await Promise.all(urls.map(async (url) => [url, await client.assetUrl(resolveRelativePath(path, url))]));
      return [key, {ability, assetMap: Object.fromEntries(assetEntries)}];
    })
  );
  return Object.fromEntries(entries);
}
