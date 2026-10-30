import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";

// Lines marked on the ground by the planning marker, drawn over everything, a few pixels wide,
// following the ground as it's moved. A continent's are kept in its planning file:
//
//   places/continents/<continent>/planning.json
//   { "version": 1, "lines": [{ "points": [[x, z], ...] }, ...] }, continent feet

const WIDTH_PX = 3;
const COLOR = 0xff5a36;
export const planningPath = (continent) => `places/continents/${continent}/planning.json`;
const LIFT_EVERY_S = 0.5; // how often lines are put back on the ground, should it have moved

export class Marks {
  // surface(x, z) gives the height lines are drawn at.
  constructor(scene, surface) {
    this.surface = surface;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.material = new LineMaterial({ color: COLOR, linewidth: WIDTH_PX, depthTest: false, transparent: true });
    this.kept = []; // { points, line }
    this.live = null; // the line being drawn
    this.since = 0;
  }

  // Shows the lines in a planning file's JSON, in place of any there are.
  load(json) {
    this.clear();
    for (const { points } of json.lines ?? []) this.kept.push({ points, line: this.line(points) });
  }

  // The planning file's JSON for the lines there are.
  toJSON() {
    const round = (v) => Math.round(v * 10) / 10;
    return { version: 1, lines: this.kept.map(({ points }) => ({ points: points.map(([x, z]) => [round(x), round(z)]) })) };
  }

  line(points) {
    const line = new Line2(new LineGeometry(), this.material);
    line.renderOrder = 10;
    line.frustumCulled = false;
    this.place(line, points);
    this.group.add(line);
    return line;
  }

  // Puts a line's points on the ground.
  place(line, points) {
    const positions = new Float32Array(Math.max(2, points.length) * 3);
    points.forEach(([x, z], k) => positions.set([x, this.surface(x, z) + 1, z], k * 3));
    if (points.length === 1) positions.set(positions.subarray(0, 3), 3);
    line.geometry.dispose();
    line.geometry = new LineGeometry();
    line.geometry.setPositions(positions);
  }

  // Draws the stroke being made.
  draw(points) {
    if (this.live) this.place(this.live, points);
    else this.live = this.line(points);
  }

  // Keeps the stroke being made as a mark, or drops it when it's only a point.
  keep(points) {
    if (!this.live) return;
    if (points.length < 2) {
      this.remove(this.live);
    } else {
      this.place(this.live, points);
      this.kept.push({ points, line: this.live });
    }
    this.live = null;
  }

  remove(line) {
    this.group.remove(line);
    line.geometry.dispose();
  }

  undo() {
    const last = this.kept.pop();
    if (last) this.remove(last.line);
  }

  clear() {
    for (const { line } of this.kept) this.remove(line);
    this.kept = [];
  }

  tick(dt, width, height) {
    this.material.resolution.set(width, height);
    if ((this.since += dt) < LIFT_EVERY_S) return;
    this.since = 0;
    for (const { points, line } of this.kept) this.place(line, points);
  }
}
