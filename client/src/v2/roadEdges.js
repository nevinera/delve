import { inside } from "./biomes.js";
import { courseBox, shape } from "./courses.js";
import { ROAD_KINDS, roadKindAt, roadTrack } from "./roads.js";

// What lines each kind of road (roads.js), the same in every biome: low edge stones along both
// sides of roads with a milestone now and then, waymark posts beside trails, and small cairns
// beside footpaths. /create puts them in the placed files, each with `road`, the id of the road
// it lines, so the game server and bots stand them in the way as they do any placed object, and
// works them out again whenever the roads change.
//
// Each rule: type, a placed object's; every, ft along the road between them; sides, 2 for both
// sides at once, 1 for each side in turn; out, ft past the road's edge; scale; jitter, ft either
// way along the road they wander; from, ft along it the first is.
export const EDGES = {
  road: [
    { type: "built:broad010", every: 20, sides: 2, out: 1.2, scale: 1.4, jitter: 3, from: 10 },
    { type: "built:broad001", every: 1000, sides: 1, out: 3, scale: 1, jitter: 0, from: 300 },
  ],
  trail: [{ type: "built:broad011", every: 160, sides: 1, out: 1.5, scale: 1, jitter: 20, from: 60 }],
  footpath: [{ type: "built:broad004", every: 450, sides: 1, out: 2.5, scale: 0.6, jitter: 60, from: 150 }],
};
const ENDS_FT = 8; // how far from a road's ends nothing's put

const round = (v, places = 1) => Math.round(v * 10 ** places) / 10 ** places;

// A steady number from 0 to 1 for `seed` and `n`.
function rand(seed, n) {
  const v = Math.sin(seed * 127.1 + n * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

// The objects that line `road` (with its id), as placed files keep them, but where wetAt(x, z)
// says there's water or one would stand on another of `roads`.
export function edgesOf(road, roads, wetAt = () => false) {
  const rules = EDGES[road.kind];
  if (!rules || !road.id || road.points.length < 2) return [];
  const track = roadTrack(road.points, road.kind, road.seed ?? 0);
  const others = roads.filter((other) => other !== road && other.id !== road.id);
  const out = [];
  rules.forEach((rule, r) => {
    for (let n = 0, t = rule.from; t < track.length - ENDS_FT; n++, t += rule.every) {
      const along = t + (rand(road.seed ?? 0, n * 7 + r) - 0.5) * 2 * rule.jitter;
      if (along < ENDS_FT || along > track.length - ENDS_FT) continue;
      const at = placeOn(track, along);
      for (const side of rule.sides === 2 ? [1, -1] : [n % 2 ? -1 : 1]) {
        const off = at.width / 2 + rule.out;
        const [x, z] = [at.x + at.across[0] * off * side, at.z + at.across[1] * off * side];
        if (wetAt(x, z) || roadKindAt(others, x, z)) continue;
        // Facing the road.
        const yaw = Math.atan2(-at.across[0] * side, -at.across[1] * side) + (rand(road.seed ?? 0, n * 13 + r + (side > 0 ? 1 : 2)) - 0.5) * 0.4;
        out.push({ type: rule.type, at: [round(x), round(z)], yaw: round(((yaw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), 4), scale: rule.scale, road: road.id });
      }
    }
  });
  return out;
}

// Where a road's track is `t` ft down it: { x, z, width, across: [x, z], square to it, to its left }.
function placeOn(track, t) {
  let k = 1;
  while (k < track.t.length - 1 && track.t[k] < t) k++;
  const span = track.t[k] - track.t[k - 1];
  const u = span ? Math.min(1, Math.max(0, (t - track.t[k - 1]) / span)) : 0;
  const [dx, dz] = [track.x[k] - track.x[k - 1], track.z[k] - track.z[k - 1]];
  const d = Math.hypot(dx, dz) || 1;
  const mix = (v) => v[k - 1] + (v[k] - v[k - 1]) * u;
  return { x: mix(track.x), z: mix(track.z), width: mix(track.width), across: [dz / d, -dx / d] };
}

// Whether (x, z) is in the water `file` (water.json) has: inside a body's outline, or in a
// course's water. It reads no ground, so it's the same however much of the world's been read.
export function wetIn(file) {
  const bodies = (file?.bodies ?? []).filter(({ points }) => points.length >= 3);
  const courses = (file?.courses ?? []).filter((course) => course.surface?.length).map((course) => ({ course, box: courseBox(course) }));
  return (x, z) =>
    bodies.some(({ points }) => inside(points, x, z)) ||
    courses.some(({ course, box }) => x >= box[0] && x <= box[2] && z >= box[1] && z <= box[3] && shape(course, x, z)?.wet);
}

// Every road's edge objects, for `roads` as roads.json keeps them.
export function allEdges(roads, wetAt) {
  return roads.filter((road) => ROAD_KINDS.includes(road.kind)).flatMap((road) => edgesOf(road, roads, wetAt));
}
