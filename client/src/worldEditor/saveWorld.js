import {commitFiles} from "../github/commitFiles";
import {buildLayoutMetadata} from "./layoutMetadata";

// A world has no $ref fields at all (see docs/schema/world.md) - just the
// one file, no .full.json companion - plus the graph's own layout metadata
// (positions - see layoutMetadata.js), committed alongside it in one
// atomic commit, same as saveZone.js one level down.
export async function saveWorld(key, worldData, positions) {
  const layout = buildLayoutMetadata(positions);
  return commitFiles(
    {
      [`worlds/${key}.json`]: worldData,
      [`worlds/${key}.layout.json`]: layout,
    },
    {message: `Update ${worldData.name || key}`}
  );
}
