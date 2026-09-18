// A node's drawn radius (also the ring ports sit on) - shared with
// WorldGraphCanvas so port positions and the layout's own spacing math
// agree. Same values/shape as zoneEditor/circleLayout.js (duplicated
// rather than cross-imported, matching every other editor's own local
// copy of shared-shape-but-not-shared-code helpers).
export const NODE_RADIUS = 40;
const SPACING_IN_RADII = 6;

// Default node layout used whenever there's no persisted layout metadata -
// places every zone node evenly around a circle, sized so its
// circumference has room for every node plus clearance.
export function circleLayout(keys, {nodeRadius = NODE_RADIUS} = {}) {
  if (keys.length === 0) return {};
  if (keys.length === 1) return {[keys[0]]: {x: 0, y: 0}};

  const circumference = SPACING_IN_RADII * nodeRadius * keys.length;
  const radius = circumference / (2 * Math.PI);

  const positions = {};
  keys.forEach((key, i) => {
    const angle = (i / keys.length) * 2 * Math.PI;
    positions[key] = {x: radius * Math.cos(angle), y: radius * Math.sin(angle)};
  });
  return positions;
}
