import { Areas } from "./areas.js";

// Bodies of water drawn on the map with geo's water tool (areas.js): lakes, ponds and swamp pools,
// each with the level its surface stands at (v2/water.js). A new one's level is the lowest ground
// round its outline, so it fills what's inside up to where it would spill. A continent's are kept
// in its water file (v2/water.js's waterPath):
//
//   { "version": 1, "bodies": [{ "type": "pond", "level": 12.5, "points": [[x, z], ...] }, ...] }

export const WATER = {
  lake: "#3a78b8",
  pond: "#3c9aa6",
  swamp: "#6d7a3c",
};
export const DEFAULT_WATER = "pond";
const RIM_STEP_FT = 4; // how far apart the ground's looked at round a new body's outline

export class WaterBodies extends Areas {
  // ground(x, z) gives the ground's height.
  constructor(scene, surface, stage, ground) {
    super(scene, surface, stage, { colors: WATER, kind: DEFAULT_WATER, field: "type", list: "bodies", extras: ["level"], start: (points) => ({ level: rim(points, ground) }) });
  }
}

// The lowest ground round the outline through `points`, to a tenth of a foot.
export function rim(points, ground) {
  let low = Infinity;
  points.forEach(([ax, az], k) => {
    const [bx, bz] = points[(k + 1) % points.length];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / RIM_STEP_FT));
    for (let s = 0; s < steps; s++) low = Math.min(low, ground(ax + ((bx - ax) * s) / steps, az + ((bz - az) * s) / steps));
  });
  return Math.floor(low * 10) / 10;
}
