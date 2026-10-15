// Ground areas (the groundArea power effect) sync as a list: the full list on
// instance-state, then adds (new, or refreshed by a recast: same id) and
// removes on deltas. Shapes are in map feet: x, y origin, angle in degrees
// from +y toward +x (like unit facing).

export const DEFAULT_AREA_TEXTURE_SCALE = 5;
export const DEFAULT_AREA_OPACITY = 0.5;

const DEFAULT_COLORS = { bAll: "ff3b30", gAll: "34c759", all: "ffcc00" };
const ARC_STEPS = 48;
const CONE_STEPS = 16;

export function applyFullGroundAreas(msg) {
  return [...(msg.ground_areas ?? [])];
}

export function applyGroundAreaDelta(areas, msg) {
  const adds = msg.ground_area_adds ?? [];
  const removes = msg.ground_area_removes ?? [];
  if (!adds.length && !removes.length) return areas;
  const addedIds = new Set(adds.map((a) => a.id));
  const removed = new Set(removes);
  return [...areas.filter((a) => !removed.has(a.id) && !addedIds.has(a.id)), ...adds];
}

export function areaColor(area) {
  return area.graphic?.color ?? (area.graphic?.textureURL ? null : DEFAULT_COLORS[area.affects] ?? DEFAULT_COLORS.all);
}

export function areaOpacity(area) {
  return area.graphic?.opacity ?? DEFAULT_AREA_OPACITY;
}

function circlePoints(cx, cy, r, steps = ARC_STEPS) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

// The shape's outline as { outer, hole } polygons of [x, y] map-feet points
// (hole is null unless a ring). Counter-clockwise or not, callers triangulate.
export function areaOutline(shape) {
  const { x, y } = shape;
  switch (shape.kind) {
    case "circle":
      return { outer: circlePoints(x, y, shape.radius), hole: null };
    case "ring":
      return { outer: circlePoints(x, y, shape.outerRadius), hole: circlePoints(x, y, shape.innerRadius) };
    case "line":
      return { outer: oriented(shape, [[-shape.width / 2, 0], [shape.width / 2, 0], [shape.width / 2, shape.length], [-shape.width / 2, shape.length]]), hole: null };
    case "cone": {
      const offset = shape.offset ?? 0;
      const span = shape.length - offset;
      const left = [];
      const right = [];
      for (let i = 0; i <= CONE_STEPS; i++) {
        const t = i / CONE_STEPS;
        const half = (shape.width / 2) * Math.sqrt(t);
        const along = offset + span * t;
        left.push([-half, along]);
        right.push([half, along]);
      }
      // The tip is one point (half = 0), so the left side skips its duplicate.
      return { outer: oriented(shape, [...left.slice(1), ...right.reverse()]), hole: null };
    }
    default:
      return { outer: [], hole: null };
  }
}

// Rotates points given as [across, along] (across to the shape's right, along
// the way it points) into map feet around the shape's origin.
function oriented(shape, pts) {
  const rad = ((shape.angle ?? 0) * Math.PI) / 180;
  const sin = Math.sin(rad);
  const cos = Math.cos(rad);
  return pts.map(([across, along]) => [shape.x + along * sin + across * cos, shape.y + along * cos - across * sin]);
}
