// Pixel <-> feet conversion for a map's background image, ported from
// tools/map-coords.html. Feet-space y increases upward (matches the
// in-game/world coordinate convention - see docs/schema/common.md's
// Location/Position); pixel-space y increases downward (standard image
// coordinates, origin top-left) - hence the (1 - y/height) flip.

export function pixelToFeet(px, py, pixelDimensions, feetDimensions) {
  return {
    x: (px / pixelDimensions.width) * feetDimensions.width,
    y: (1 - py / pixelDimensions.height) * feetDimensions.height,
  };
}

export function feetToPixel(xFt, yFt, pixelDimensions, feetDimensions) {
  return {
    x: (xFt / feetDimensions.width) * pixelDimensions.width,
    y: (1 - yFt / feetDimensions.height) * pixelDimensions.height,
  };
}

// Grid line spacing in pixels for a given real-world spacing (feet) - used
// to draw the 5ft reference grid. Only meaningful along one axis at a time
// (pixel/feet dimensions need not share an aspect ratio).
export function feetSpacingToPixelsX(feetSpacing, pixelDimensions, feetDimensions) {
  return (feetSpacing / feetDimensions.width) * pixelDimensions.width;
}

export function feetSpacingToPixelsY(feetSpacing, pixelDimensions, feetDimensions) {
  return (feetSpacing / feetDimensions.height) * pixelDimensions.height;
}
