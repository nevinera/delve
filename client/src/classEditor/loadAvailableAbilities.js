import {collectAssetUrls} from "../abilityEditor/collectAssetUrls";

// Resolves a relative asset path (e.g. "../graphics/icons/x.svg") against
// the ability file's own path, not the class's - same URL trick
// AbilityEditor.jsx's own resolveRepoPath uses, just parameterized by the
// full ability path instead of a fixed "abilities/<key>.json" shape.
function resolveRelativePath(basePath, relativePath) {
  const url = new URL(relativePath, `https://_/${basePath}`);
  return url.pathname.replace(/^\//, "");
}

// Port of Build::ClassesController#load_available_abilities/#ability_entry -
// every ability committed under abilities/classes/<classKey>/ gets its full
// content (for the power-slot dropdown and $ref resolution at save time -
// see resolveFullClass.js) plus an assetMap of its own icon/effect URLs
// (for the preview - see AbilityPreviewPane). Eager, not lazy: unlike a
// zone's map list (which can hold many unrelated candidates), this
// directory only ever holds abilities that already belong to this one
// class, so there's no "many unused candidates" problem to avoid.
export async function loadAvailableAbilities(client, classKey) {
  const paths = await client.listDirectory(`abilities/classes/${classKey}`);
  const jsonPaths = paths.filter((path) => path.endsWith(".json"));

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
