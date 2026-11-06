import { Areas } from "./areas.js";
import { KINDS, bedOf, roadTrack, troubleOf } from "../v2/roads.js";

// Roads drawn on the map with geo's road tool (areas.js, as open lines): footpaths, trails and
// roads (v2/roads.js), each one width all along. A road's bed is worked out from the ground before
// courses and roads moved it, when its corners, kind, width or seed change, and kept as it is
// otherwise. Stretches it can't go along, too steep or cut too deep, are drawn over it in TROUBLE's
// color. Kept in roads.json:
//
//   { "version": 1, "roads": [{ "kind": "trail", "points": [[x, z, width], ...], "seed": 412, "bed": [ft, ...] }, ...] }

export const ROADS = { footpath: "#d9b38c", trail: "#b07a4a", road: "#f0e6c8" };
const TROUBLE = { color: "rgba(224, 64, 64, 0.85)", px: 7 };

const round = (v) => Math.round(v * 10) / 10;

export class Roads extends Areas {
  // baseAt(x, z) gives the ground before courses and roads moved it.
  constructor(scene, surface, stage, baseAt) {
    super(scene, surface, stage, { colors: ROADS, kind: "trail", field: "kind", list: "roads", extras: ["width", "seed", "bed"], closed: false });
    this.start = () => ({ width: KINDS[this.kind].width, seed: Math.floor(Math.random() * 1000), bed: null });
    this.baseAt = baseAt;
  }

  show(json) {
    super.show({ roads: (json.roads ?? []).map(({ kind, points, seed, bed }) => ({ kind, points: points.map(([x, z]) => [x, z]), width: points[0]?.[2] ?? KINDS[kind]?.width ?? KINDS.trail.width, seed: seed ?? 0, bed })) });
    for (const area of this.areas) area.bedKey = this.keyOf(area);
  }

  toJSON() {
    this.settle();
    return { version: 1, roads: this.areas.map((area) => this.roadOf(area)) };
  }

  // Works out again the beds of roads whose corners, kind, width or seed have changed.
  settle() {
    for (const area of this.areas) {
      const key = this.keyOf(area);
      if (area.bedKey === key && area.bed) continue;
      area.bed = bedOf(this.roadOf(area), (x, z) => this.baseAt(x, z));
      area.bedKey = key;
    }
  }

  keyOf(area) {
    return JSON.stringify([area.kind, area.seed, pointsOf(area)]);
  }

  // The road `area` is, as v2/roads.js has it, with its bed as last worked out.
  roadOf(area) {
    const points = pointsOf(area);
    if (area.road?.points.length !== points.length || area.road.points.some((p, k) => p.some((v, n) => v !== points[k][n]))) area.road = { points };
    return Object.assign(area.road, { kind: area.kind, seed: area.seed, bed: area.bed });
  }

  // Sets the picked out road's width.
  setWidth(width) {
    if (this.selected) this.setExtra("width", width);
  }

  // A new road, or a road picked out and given another kind, takes that kind's width.
  setKind(kind) {
    const area = this.selected;
    super.setKind(kind);
    if (area && area.width !== KINDS[kind].width) {
      area.width = KINDS[kind].width;
      this.changed();
    }
  }

  tick(dt, camera, width, height, to, active) {
    super.tick(dt, camera, width, height, to, active);
    if (!this.shown) return;
    const c = this.handles.getContext("2d");
    c.strokeStyle = TROUBLE.color;
    c.lineWidth = TROUBLE.px;
    c.lineCap = "round";
    for (const area of this.areas) {
      if (!area.bed || area.bedKey !== this.keyOf(area)) continue;
      const road = this.roadOf(area);
      if (area.troubleKey !== area.bedKey) [area.trouble, area.troubleKey] = [troubleOf(road, (x, z) => this.baseAt(x, z)), area.bedKey];
      if (!area.trouble.length) continue;
      const track = roadTrack(road.points, road.kind, road.seed);
      for (const { from, to: end } of area.trouble) {
        c.beginPath();
        let started = false;
        for (let k = 0; k < track.t.length; k++) {
          if (track.t[k] < from || track.t[k] > end) continue;
          const s = this.screen(camera, width, height, [track.x[k], track.z[k]]);
          if (!s) continue;
          if (started) c.lineTo(...s);
          else c.moveTo(...s);
          started = true;
        }
        c.stroke();
      }
    }
    c.lineCap = "butt";
  }
}

// A road's points with its width at each, rounded, as roads.js has them.
function pointsOf(area) {
  return area.points.map(([x, z]) => [round(x), round(z), area.width]);
}
