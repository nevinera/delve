// A node's drawn radius (also the ring ports sit on) - shared with
// ZoneGraphCanvas so port positions and the layout's own spacing math agree.
export const NODE_RADIUS = 40;
// Per-node arc length, in node radii - i.e. the circle's circumference is
// SPACING_IN_RADII * nodeRadius * nodeCount. 6 (vs. a node's own 2-radius
// diameter) leaves each node comfortably clear of its neighbors - 2 nodes
// were overlapping at the previous, tighter spacing.
const SPACING_IN_RADII = 6;

// Default node layout used whenever there's no persisted layout metadata -
// which is always, until step 11 (see plans/zone-editor.md). Places every
// map node evenly around a circle, sized so its circumference has room for
// every node plus clearance, rather than a fixed radius that would crowd
// nodes together as more maps are added.
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
