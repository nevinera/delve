import {commitFiles} from "../github/commitFiles";
import {resolveZoneRefs} from "./resolveZoneRefs";
import {buildLayoutMetadata} from "./layoutMetadata";

// A zone lives at zones/<key>/<basename(key)>.json - see
// Build::ZonesController#zone_path. Like the class/unit_type editors
// (see saveClass.js), the zone's own file stays abstract ($ref maps/
// unitTypes intact) - this commits a resolved .full.json companion
// alongside it (docs/schema/common.md#assetreference: an abstract config
// must have a concrete .full.json alongside it), plus the graph's own
// layout metadata (positions - see layoutMetadata.js), all in one atomic
// commit.
export async function saveZone(key, zoneData, positions) {
  const basename = key.split("/").pop();
  const fullZone = await resolveZoneRefs(zoneData, `zones/${key}`);
  const layout = buildLayoutMetadata(positions);

  return commitFiles(
    {
      [`zones/${key}/${basename}.json`]: zoneData,
      [`zones/${key}/${basename}.full.json`]: fullZone,
      [`zones/${key}/${basename}.layout.json`]: layout,
    },
    {message: `Update ${zoneData.name || key}`}
  );
}
