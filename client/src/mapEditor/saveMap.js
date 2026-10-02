import {commitFiles} from "../github/commitFiles";
import {generateThumbnail} from "../content/generateThumbnail";

// A map's imageUrl is relative to its own json file - see
// Build::MapsController#resolve_image_path, which resolves it the same way
// against zones/<key>/. Mirrors saveAbility.js's resolveRepoPath.
function resolveRepoPath(key, relativePath) {
  const url = new URL(relativePath, `https://_/zones/${key}/`);
  return url.pathname.replace(/^\//, "");
}

// Maps live at zones/<key>/<basename(key)>.json, with the background image
// (if any) as a sibling file - see the map editor plan's Phase 3 notes and
// Build::MapsController#map_path/#resolve_image_path, which already expect
// this layout. `imageFile` is the File object from a freshly chosen/replaced
// image (null when the map's existing image wasn't touched this session -
// see MapEditor's `image.file`). A thumbnail (see content/generateThumbnail.js)
// is committed alongside it as `<basename>.thumb.webp`, only when the image
// itself is being (re)saved this session. Small enough that the zone
// editor's map list/graph can load every map's thumbnail up front without
// the bandwidth cost of the real 10-25MB backgrounds.
export async function saveMap(key, mapData, imageFile, commitMessage) {
  const basename = key.split("/").pop();
  const filesByPath = {};
  let data = mapData;

  if (imageFile) {
    if (!mapData.imageUrl) throw new Error("Set a background image before saving.");
    filesByPath[resolveRepoPath(key, mapData.imageUrl)] = imageFile;

    const thumbnail = await generateThumbnail(imageFile, mapData.feetDimensions);
    if (thumbnail) {
      const thumbnailUrl = `${basename}.thumb.webp`;
      filesByPath[resolveRepoPath(key, thumbnailUrl)] = thumbnail;
      data = {...mapData, thumbnailUrl};
    }
  }

  filesByPath[`zones/${key}/${basename}.json`] = data;

  return commitFiles(filesByPath, {message: commitMessage || `Update ${mapData.name || key}`});
}
