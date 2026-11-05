import { Areas } from "./areas.js";
import { inside } from "../v2/biomes.js";

// Resting areas, drawn on the map with the units tab's resting area tool (areas.js): inside one,
// a character is resting, and logs off at once. Each belongs to a rest point, and world.json keeps
// it on that rest point as `area`, [[x, z], ...] in continent feet. A new one goes to the rest point
// inside it, or else the nearest; one drawn with no rest point on the continent isn't kept.

export const RESTING_COLOR = "#ffb050";

// The rest point an area is for: the one inside it, or else the one nearest its middle.
export function ownerOf(points, restPoints) {
  if (!restPoints.length) return null;
  const within = restPoints.find((r) => inside(points, r.at[0], r.at[1]));
  if (within) return within;
  const [mx, mz] = [0, 1].map((i) => points.reduce((sum, p) => sum + p[i], 0) / points.length);
  return restPoints.reduce((best, r) => (Math.hypot(r.at[0] - mx, r.at[1] - mz) < Math.hypot(best.at[0] - mx, best.at[1] - mz) ? r : best));
}

// The areas of a continent's rest points, as Areas files them.
export function areasOf(restPoints, continent) {
  return { version: 1, areas: restPoints.filter((r) => r.continent === continent && r.area?.length >= 3).map((r) => ({ kind: "resting", rest: r.id, points: r.area })) };
}

// Puts areas back on the continent's rest points: each gets the last one for it, or none.
export function giveAreas(restPoints, json, continent) {
  for (const rest of restPoints) {
    if (rest.continent !== continent) continue;
    const area = json.areas.findLast((a) => a.rest === rest.id);
    if (area) rest.area = area.points;
    else delete rest.area;
  }
}

export class RestAreas extends Areas {
  // restPoints(): the continent's rest points. onChange(): when areas change.
  constructor(scene, surface, stage, restPoints) {
    super(scene, surface, stage, { colors: { resting: RESTING_COLOR }, kind: "resting", field: "kind", list: "areas", extras: ["rest"], start: (points) => ({ rest: ownerOf(points, restPoints())?.id }) });
    this.onChange = () => {};
  }

  changed() {
    super.changed();
    this.onChange();
  }
}
