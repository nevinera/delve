import {commitFiles} from "../github/commitFiles";
import {buildLayoutMetadata} from "./layoutMetadata";

// thumbnailUrl is relative to the world's own file (worlds/<key>.json).
export function worldAssetPath(key, relativePath) {
  const url = new URL(relativePath, `https://_/worlds/${key}.json`);
  return url.pathname.replace(/^\//, "");
}

// A world has no $ref fields at all (see docs/schema/world.md) - just the
// one file, no .full.json companion - plus the graph's own layout metadata
// (positions - see layoutMetadata.js), committed alongside it in one
// atomic commit, same as saveZone.js one level down. A freshly uploaded
// thumbnail (see WorldEditor's handleUploadThumbnail) is written to
// wherever thumbnailUrl currently points, same as saveMap.js's image.
export async function saveWorld(key, worldData, positions, commitMessage, thumbnailFile = null) {
  const filesByPath = {
    [`worlds/${key}.json`]: worldData,
    [`worlds/${key}.layout.json`]: buildLayoutMetadata(positions),
  };
  if (thumbnailFile) {
    if (!worldData.thumbnailUrl) throw new Error("Set a thumbnail URL for the uploaded thumbnail before saving.");
    filesByPath[worldAssetPath(key, worldData.thumbnailUrl)] = thumbnailFile;
  }
  return commitFiles(filesByPath, {message: commitMessage || `Update ${worldData.name || key}`});
}
