import {NODE_RADIUS} from "./circleLayout";

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 3;

const FIT_MARGIN = 0.85; // fraction of the wrapper the fitted content should fill, leaving breathing room

// The view (pan/zoom) that centers the graph on the mean of every node's
// position and zooms out just enough that all of them (plus their port
// ring) are visible - what the graph renders with by default (there's no
// persisted layout/view yet - see plans/zone-editor.md step 11) and what
// the toolbar's Reset button recomputes on demand. Returns null when there's
// nothing to fit (no nodes) or the container hasn't been measured yet (zero
// size, e.g. before layout, or in a test environment with no real layout).
export function computeFitView(nodePositions, containerWidth, containerHeight) {
  if (nodePositions.length === 0 || containerWidth <= 0 || containerHeight <= 0) return null;

  const xs = nodePositions.map((p) => p.x);
  const ys = nodePositions.map((p) => p.y);
  const width = Math.max(Math.max(...xs) - Math.min(...xs) + NODE_RADIUS * 2, 1);
  const height = Math.max(Math.max(...ys) - Math.min(...ys) + NODE_RADIUS * 2, 1);

  const meanX = xs.reduce((sum, x) => sum + x, 0) / xs.length;
  const meanY = ys.reduce((sum, y) => sum + y, 0) / ys.length;

  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min((containerWidth * FIT_MARGIN) / width, (containerHeight * FIT_MARGIN) / height)));

  return {panX: containerWidth / 2 - zoom * meanX, panY: containerHeight / 2 - zoom * meanY, zoom};
}
