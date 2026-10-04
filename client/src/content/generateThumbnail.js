import {loadSvgToCanvas} from "../game/svgRaster";

const THUMBNAIL_MAX_DIMENSION = 256;

// Generates a small webp preview of an image File (a map background, a
// world thumbnail), for editors and selection UI to show without fetching
// a full-size image. Reuses loadSvgToCanvas even for non-SVG files - it
// just rasterizes whatever an <img> can load onto a canvas, capped to a max
// dimension, which is exactly what a thumbnail needs regardless of source
// format. feetDimensions (maps only) sets the aspect ratio; without it the
// image's own is used. Best-effort: resolves to null (never throws), so the
// caller decides whether a missing thumbnail blocks anything.
export async function generateThumbnail(imageFile, feetDimensions = null) {
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
