import {commitFiles} from "../github/commitFiles";

// A zone lives at zones/<key>/<basename(key)>.json - see
// Build::ZonesController#zone_path. Unlike a map, a zone has no sibling
// binary asset of its own to commit alongside it (yet - step 10's expander
// will add a companion layout-metadata file here).
export async function saveZone(key, zoneData) {
  const basename = key.split("/").pop();
  return commitFiles({[`zones/${key}/${basename}.json`]: zoneData}, {message: `Update ${zoneData.name || key}`});
}
