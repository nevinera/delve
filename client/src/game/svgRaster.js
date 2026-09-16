// Sizing/rasterization for SVG map backgrounds, shared by the real game
// client (scene.js's per-map ground texture) and the map editor's walk
// preview (mapEditor/MapPreviewScene.js). Maps store their original .svg
// background as committed - smaller than a pre-baked raster, and losslessly
// re-renderable at any resolution - so each renderer rasterizes it into a
// texture itself, sized to the map's own real-world scale rather than
// trusting the SVG's own declared (often arbitrary "artboard") width/height.

const SVG_PIXELS_PER_FOOT = 8; // matches the real content repo's own raster map backgrounds (~5-10px/ft)
const SVG_RASTER_MAX_DIMENSION = 4096; // a safe cross-device WebGL texture size

// If feetDimensions isn't known yet (e.g. the map editor is loading a
// background before feetDimensions has been filled in), there's no density
// target to aim for - falls back to filling maxDimension at the SVG's own
// native aspect ratio.
export function svgRasterSize(nativeWidth, nativeHeight, feetDimensions, {
  pixelsPerFoot = SVG_PIXELS_PER_FOOT,
  maxDimension = SVG_RASTER_MAX_DIMENSION,
} = {}) {
  const hasFeetDimensions = feetDimensions?.width > 0 && feetDimensions?.height > 0;
  const width = hasFeetDimensions ? feetDimensions.width * pixelsPerFoot : nativeWidth;
  const height = hasFeetDimensions ? feetDimensions.height * pixelsPerFoot : nativeHeight;
  const scaleToCap = maxDimension / Math.max(width, height);
  // The feetDimensions-driven target is only ever scaled *down* to the cap,
  // never inflated past its own deliberate density; the native-size
  // fallback has no target of its own, so it always fills the cap exactly.
  const scale = hasFeetDimensions ? Math.min(1, scaleToCap) : scaleToCap;
  return {width: Math.round(width * scale), height: Math.round(height * scale)};
}

// Loads an SVG from any URL the browser can fetch as an <img> (blob:, data:,
// or a real relative/absolute path) and rasterizes it onto a canvas at
// svgRasterSize's target resolution - a canvas is a valid THREE.CanvasTexture
// source directly, so neither caller needs to round-trip through a Blob/File.
// crossOrigin is set unconditionally - required for a real (cross-origin)
// content URL to avoid tainting the canvas, harmless for blob:/data: URLs.
export function loadSvgToCanvas(url, feetDimensions, options) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const {width, height} = svgRasterSize(img.naturalWidth, img.naturalHeight, feetDimensions, options);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      resolve(canvas);
    };
    img.onerror = reject;
    img.src = url;
  });
}
