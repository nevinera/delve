// A node's drawn radius (also the ring ports sit on) - shared with
// ZoneGraphCanvas so port positions and the layout's own spacing math agree.
export const NODE_RADIUS = 40;
const DEFAULT_PADDING = 30; // minimum gap between two adjacent nodes' edges

// Default node layout used whenever there's no persisted layout metadata -
// which is always, until step 11 (see plans/zone-editor.md). Places every
// map node evenly around a circle, sized so its circumference has room for
// every node's own diameter plus padding between neighbors, rather than a
// fixed radius that would crowd nodes together as more maps are added.
export function circleLayout(keys, {nodeRadius = NODE_RADIUS, padding = DEFAULT_PADDING} = {}) {
  if (keys.length === 0) return {};
  if (keys.length === 1) return {[keys[0]]: {x: 0, y: 0}};

  const spacing = nodeRadius * 2 + padding; // arc length needed per node
  const radius = (spacing * keys.length) / (2 * Math.PI);

  const positions = {};
  keys.forEach((key, i) => {
    const angle = (i / keys.length) * 2 * Math.PI;
    positions[key] = {x: radius * Math.cos(angle), y: radius * Math.sin(angle)};
  });
  return positions;
}
