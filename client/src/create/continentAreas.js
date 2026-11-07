import { Areas } from "./areas.js";
import { inside } from "../v2/biomes.js";
import { areaId, readAreas } from "../v2/regions.js";

// A continent's areas (v2/regions.js), drawn by the tools that use them: units' resting area tool
// for now (areas.js). Rest points point at them by id, as `area` in world.json: inside
// one, a character is resting, and logs off at once. An area a rest point points at is drawn in
// the resting color. One drawn with the resting area tool goes to the rest point inside it, or else
// the nearest, in place of the area it had; one drawn with no rest point on the continent, or
// that no rest point points at any more, is a plain area.

export const AREA_COLOR = "#7ec8e8";
export const RESTING_COLOR = "#ffb050";

// The rest point an area is for: the one inside it, or else the one nearest its middle.
export function ownerOf(points, restPoints) {
  if (!restPoints.length) return null;
  const within = restPoints.find((r) => inside(points, r.at[0], r.at[1]));
  if (within) return within;
  const [mx, mz] = [0, 1].map((i) => points.reduce((sum, p) => sum + p[i], 0) / points.length);
  return restPoints.reduce((best, r) => (Math.hypot(r.at[0] - mx, r.at[1] - mz) < Math.hypot(best.at[0] - mx, best.at[1] - mz) ? r : best));
}

export class ContinentAreas extends Areas {
  // restPoints(): the continent's rest points. onChange(): when areas change. onRest(rest, id):
  // when the resting area tool gives a rest point a new area.
  constructor(scene, surface, stage, restPoints) {
    super(scene, surface, stage, { colors: { area: AREA_COLOR, resting: RESTING_COLOR }, kind: "area", field: "kind", list: "areas", extras: ["id"], start: (points) => this.started(points) });
    this.restPoints = restPoints;
    this.forRest = false; // whether new areas are drawn for rest points
    this.onChange = () => {};
    this.onRest = () => {};
  }

  // A new area's id, given to the rest point it's for when drawn for one.
  started(points) {
    const id = areaId(this.areas);
    const owner = this.forRest ? ownerOf(points, this.restPoints()) : null;
    if (owner) this.onRest(owner, id);
    return { id };
  }

  // regions.json's areas.
  load(json) {
    super.load({ areas: readAreas(json) });
    this.recolor();
  }

  show(json) {
    super.show(json);
    this.recolor();
  }

  toJSON() {
    return { version: 1, areas: super.toJSON().areas.map(({ id, points }) => ({ id, points })) };
  }

  // The area with that id, or null.
  byId(id) {
    return this.areas.find((a) => a.id === id) ?? null;
  }

  // Draws each area a rest point points at in the resting color, and the rest plain.
  recolor() {
    const resting = new Set(this.restPoints().map((r) => r.area));
    for (const area of this.areas) {
      const kind = resting.has(area.id) ? "resting" : "area";
      if (area.kind === kind) continue;
      area.kind = kind;
      area.line.material = this.material(kind, area === this.selected);
    }
  }

  changed() {
    super.changed();
    this.onChange();
    this.recolor();
  }
}
