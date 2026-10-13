// Where placed stamps sit on the map, for picking and handling them in the
// Stamps tab. Everything is in map feet (y down, like the map's own
// coordinates); rotation is degrees clockwise.
import {stampFeet, stampFor, stampFrame} from "../../game/stamps";

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 20;
const SNAP_DEGREES = 15;

// A placed stamp's size in feet, or null when it can't be drawn (no such
// stamp, or its sheet hasn't loaded).
export function stampBox(sets, sheets, placed) {
  const found = stampFor(sets, placed);
  const sheet = found && sheets[found.set];
  if (!sheet) return null;
  return stampFeet(found.stamp, placed, stampFrame(found.stamp, placed, sheet));
}

const radians = (degrees) => ((degrees ?? 0) * Math.PI) / 180;

// point in the stamp's own frame: its center at 0, unrotated.
export function toLocal(placed, point) {
  const [dx, dy] = [point.x - placed.x, point.y - placed.y];
  const a = -radians(placed.rotation);
  return {x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a)};
}

// A point in the stamp's own frame, back on the map.
export function fromLocal(placed, local) {
  const a = radians(placed.rotation);
  return {x: placed.x + local.x * Math.cos(a) - local.y * Math.sin(a), y: placed.y + local.x * Math.sin(a) + local.y * Math.cos(a)};
}

// The topmost stamp under point (the last drawn), or -1.
export function hitStamp(placedStamps, sets, sheets, point) {
  for (let i = (placedStamps?.length ?? 0) - 1; i >= 0; i--) {
    const box = stampBox(sets, sheets, placedStamps[i]);
    if (!box) continue;
    const local = toLocal(placedStamps[i], point);
    if (Math.abs(local.x) <= box.width / 2 && Math.abs(local.y) <= box.height / 2) return i;
  }
  return -1;
}

// A stamp's corners, clockwise from its top left, on the map.
export function stampCorners(placed, box) {
  const [w, h] = [box.width / 2, box.height / 2];
  return [[-w, -h], [w, -h], [w, h], [-w, h]].map(([x, y]) => fromLocal(placed, {x, y}));
}

// Its handles: rotate, out past the top edge by `reach` feet, and scale, at
// the bottom right corner.
export function stampHandles(placed, box, reach) {
  return {
    rotate: fromLocal(placed, {x: 0, y: -box.height / 2 - reach}),
    scale: fromLocal(placed, {x: box.width / 2, y: box.height / 2}),
  };
}

// The rotation that points the stamp's top at point, in [0, 360); snapped
// to 15 degree steps when snap is set.
export function rotationToward(placed, point, snap = false) {
  const degrees = (Math.atan2(point.x - placed.x, placed.y - point.y) * 180) / Math.PI;
  const stepped = snap ? Math.round(degrees / SNAP_DEGREES) * SNAP_DEGREES : Math.round(degrees * 10) / 10;
  return ((stepped % 360) + 360) % 360;
}

// The scale that puts the stamp's scale handle (its corner) at point's
// distance from its center. box is its size at its current scale.
export function scaleToward(placed, box, point) {
  const base = Math.hypot(box.width, box.height) / 2 / (placed.scale ?? 1);
  const scale = Math.hypot(point.x - placed.x, point.y - placed.y) / base;
  return Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale)) * 100) / 100;
}
