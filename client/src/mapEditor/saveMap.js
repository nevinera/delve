import {commitFiles} from "../github/commitFiles";

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
// see MapEditor's `image.file`).
export async function saveMap(key, mapData, imageFile) {
  const basename = key.split("/").pop();
  const filesByPath = {[`zones/${key}/${basename}.json`]: mapData};

  if (imageFile) {
    if (!mapData.imageUrl) throw new Error("Set a background image before saving.");
    filesByPath[resolveRepoPath(key, mapData.imageUrl)] = imageFile;
  }

  return commitFiles(filesByPath, {message: `Update ${mapData.name || key}`});
}
