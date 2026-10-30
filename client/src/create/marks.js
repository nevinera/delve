import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";

// Lines marked on the ground by the planning marker, drawn over everything, following the ground as
// it's moved. Each has one of COLORS, one of four widths a few pixels wide, and a style, solid,
// dashed or dotted. Lines, dashes and dots all grow the higher the builder flies. The eraser cuts
// lines where it passes, in two where it passes their middles. A continent's are kept in its
// planning file:
//
//   places/continents/<continent>/planning.json
//   { "version": 1, "lines": [{ "points": [[x, z], ...], "color": "red", "width": 2, "style": "solid" }, ...] },
//   continent feet, width 1 to 4

export const COLORS = {
  black: 0x000000,
  white: 0xffffff,
  red: 0xe8202a,
  "dark orange": 0xff8c00,
  "bright green": 0x30f030,
  magenta: 0xff00ff,
  gray: 0x808080,
  pink: 0xff9ec8,
};
const WIDTHS_PX = [2, 3, 5, 8];
// A dash and the gap after it, in line widths.
const STYLES = { solid: null, dashed: [5, 3], dotted: [1, 2] };
const WIDEN_FT = 1024; // flying higher over the ground than this, lines widen with its square root
const MOST_WIDER = 4;
const PEN = { color: "red", width: 2, style: "solid" }; // for lines kept without these
const UNDOS = 50;
export const planningPath = (continent) => `places/continents/${continent}/planning.json`;
const LIFT_EVERY_S = 0.5; // how often lines are put back on the ground, should it have moved

// What's left of a line of `points` ([x, z]) with the circle `radius` round (x, z) cut out of it:
// its pieces of two points or more, each ending where it meets the circle.
export function cut(points, x, z, radius) {
  const pieces = [];
  let piece = [];
  const outside = ([px, pz]) => Math.hypot(px - x, pz - z) > radius;
  if (outside(points[0])) piece.push(points[0]);
  for (let k = 1; k < points.length; k++) {
    const [a, b] = [points[k - 1], points[k]];
    // Where the segment from a to b is in the circle: a + t (b - a), for t from t0 to t1.
    const [dx, dz] = [b[0] - a[0], b[1] - a[1]];
    const [fx, fz] = [a[0] - x, a[1] - z];
    const qa = dx * dx + dz * dz;
    const qb = 2 * (fx * dx + fz * dz);
    const qc = fx * fx + fz * fz - radius * radius;
    const root = qb * qb - 4 * qa * qc;
    const t0 = qa && root > 0 ? (-qb - Math.sqrt(root)) / (2 * qa) : Infinity;
    const t1 = qa && root > 0 ? (-qb + Math.sqrt(root)) / (2 * qa) : -Infinity;
    if (t1 <= 0 || t0 >= 1) {
      piece.push(b);
      continue;
    }
    const along = (t) => [a[0] + dx * t, a[1] + dz * t];
    if (t0 > 0) piece.push(along(t0));
    if (piece.length >= 2) pieces.push(piece);
    piece = t1 < 1 ? [along(t1), b] : [];
  }
  if (piece.length >= 2) pieces.push(piece);
  return pieces;
}

export class Marks {
  // surface(x, z) gives the height lines are drawn at.
  constructor(scene, surface) {
    this.surface = surface;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.materials = new Map(); // "color,width,style" -> its material
    this.pen = { ...PEN }; // what lines are drawn with
    this.kept = []; // { points, pen, line }
    this.live = null; // the line being drawn, { pen, line }
    this.undos = []; // the lines kept before each change, as toJSON's lines
    this.erased = false; // whether the eraser's stroke has cut lines yet
    this.version = 0; // counts changes to the lines kept, to tell when to save them
    this.since = 0;
  }

  // Shows the lines in a planning file's JSON, in place of any there are.
  load(json) {
    this.show(json.lines ?? []);
    this.undos = [];
    this.version = 0;
  }

  show(lines) {
    for (const { line } of this.kept) this.remove(line);
    this.kept = [];
    for (const { points, color, width, style } of lines) {
      const pen = { color: color in COLORS ? color : PEN.color, width: WIDTHS_PX[width - 1] ? width : PEN.width, style: style in STYLES ? style : PEN.style };
      this.kept.push({ points, pen, line: this.line(points, pen) });
    }
  }

  // The planning file's JSON for the lines there are.
  toJSON() {
    const round = (v) => Math.round(v * 10) / 10;
    return { version: 1, lines: this.kept.map(({ points, pen }) => ({ points: points.map(([x, z]) => [round(x), round(z)]), ...pen })) };
  }

  // Keeps the lines as they are, for undo to go back to.
  save() {
    this.undos.push(this.toJSON().lines);
    if (this.undos.length > UNDOS) this.undos.shift();
  }

  material({ color, width, style }) {
    const key = `${color},${width},${style}`;
    if (!this.materials.has(key)) {
      const material = new LineMaterial({ color: COLORS[color], linewidth: WIDTHS_PX[width - 1], depthTest: false, transparent: true, dashed: Boolean(STYLES[style]) });
      material.userData = { width, style };
      this.materials.set(key, material);
    }
    return this.materials.get(key);
  }

  line(points, pen) {
    const line = new Line2(new LineGeometry(), this.material(pen));
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
    if (line.material.dashed) line.computeLineDistances();
  }

  // Draws the stroke being made.
  draw(points) {
    if (this.live) this.place(this.live.line, points);
    else this.live = { pen: { ...this.pen }, line: this.line(points, this.pen) };
  }

  // Keeps the stroke being made as a mark, or drops it when it's only a point.
  keep(points) {
    if (!this.live) return;
    if (points.length < 2) {
      this.remove(this.live.line);
    } else {
      this.save();
      this.place(this.live.line, points);
      this.kept.push({ points, ...this.live });
      this.version++;
    }
    this.live = null;
  }

  // Cuts the circle `radius` round (x, z) out of the lines. The first cut since `erased` was
  // cleared can be undone.
  erase(x, z, radius) {
    const kept = [];
    let changed = false;
    for (const mark of this.kept) {
      const pieces = cut(mark.points, x, z, radius);
      if (pieces.length === 1 && pieces[0].length === mark.points.length && pieces[0].every((p, k) => p === mark.points[k])) {
        kept.push(mark);
        continue;
      }
      changed = true;
      this.remove(mark.line);
      for (const points of pieces) kept.push({ points, pen: mark.pen, line: this.line(points, mark.pen) });
    }
    if (!changed) return;
    if (!this.erased) this.save();
    this.erased = true;
    this.kept = kept;
    this.version++;
  }

  remove(line) {
    this.group.remove(line);
    line.geometry.dispose();
  }

  undo() {
    const lines = this.undos.pop();
    if (!lines) return;
    this.show(lines);
    this.version++;
  }

  // `above` is how high the builder flies over the ground, and `ftPerPx` about how many feet a
  // pixel is across there, for dashes' lengths.
  tick(dt, width, height, above, ftPerPx) {
    const wider = Math.min(MOST_WIDER, Math.max(1, Math.sqrt(above / WIDEN_FT)));
    for (const material of this.materials.values()) {
      const px = WIDTHS_PX[material.userData.width - 1] * wider;
      material.resolution.set(width, height);
      material.linewidth = px;
      const dash = STYLES[material.userData.style];
      if (dash) [material.dashSize, material.gapSize] = [dash[0] * px * ftPerPx, dash[1] * px * ftPerPx];
    }
    if ((this.since += dt) < LIFT_EVERY_S) return;
    this.since = 0;
    for (const { points, line } of this.kept) this.place(line, points);
  }
}
