import {commitFiles} from "../github/commitFiles";
import {loadSvgToCanvas} from "../game/svgRaster";

// A map's imageUrl is relative to its own json file - see
// Build::MapsController#resolve_image_path, which resolves it the same way
// against zones/<key>/. Mirrors saveAbility.js's resolveRepoPath.
function resolveRepoPath(key, relativePath) {
  const url = new URL(relativePath, `https://_/zones/${key}/`);
  return url.pathname.replace(/^\//, "");
}

// Small enough that the zone editor's map list/graph (see
// plans/zone-editor.md) can load every map's thumbnail up front without the
// bandwidth cost of the real 10-25MB backgrounds.
const THUMBNAIL_MAX_DIMENSION = 256;

// Generates a small preview image from a freshly chosen background, for the
// zone editor to show without fetching the full-size image. Reuses
// loadSvgToCanvas even for non-SVG files - it just rasterizes whatever an
// <img> can load onto a canvas, capped to a max dimension, which is exactly
// what a thumbnail needs regardless of source format. Best-effort: resolves
// to null (never throws) so a thumbnail failure never blocks saving the map
// itself - the caller falls back to no thumbnailUrl, and any UI showing it
// already treats a missing one as "show a placeholder instead".
async function generateThumbnail(imageFile, feetDimensions) {
  const objectUrl = URL.createObjectURL(imageFile);
  try {
    const canvas = await loadSvgToCanvas(objectUrl, feetDimensions, {maxDimension: THUMBNAIL_MAX_DIMENSION});
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/webp"));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

// Maps live at zones/<key>/<basename(key)>.json, with the background image
// (if any) as a sibling file - see the map editor plan's Phase 3 notes and
// Build::MapsController#map_path/#resolve_image_path, which already expect
// this layout. `imageFile` is the File object from a freshly chosen/replaced
// image (null when the map's existing image wasn't touched this session -
// see MapEditor's `image.file`). A thumbnail (see generateThumbnail above)
// is committed alongside it as `<basename>.thumb.webp`, only when the image
// itself is being (re)saved this session.
export async function saveMap(key, mapData, imageFile) {
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

  return commitFiles(filesByPath, {message: `Update ${mapData.name || key}`});
}
