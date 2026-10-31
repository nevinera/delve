import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { tileIndexInPlate } from "../v2/plate.js";
import { CELL_FT, PLATE_TILES } from "../v2/sizes.js";
import { walked } from "./grid.js";
import { WalkSearch } from "./walk.js";

// Planning's path tool: click a start and an end, and it searches for the shortest way between on
// foot or swimming (walk.js), no longer than its longest, a slice of cells each frame. The ground
// it's reached is tinted as it spreads, yellow near the start to red at the longest, blue where it
// swam (grid.js's walked). The way it finds is drawn over the ground, white walked, blue swum.

const MILE_FT = 5280;
const MOST_TEXELS = 1024; // the tint's texture, a side
const BUDGET_MS = 12; // the most a frame searches for
const STEP_FT = 16; // how far apart the drawn way's points are, at most
const ABOVE_FT = 3; // how far over the ground it's drawn
const WALKED_COLOR = new THREE.Color("#ffffff");
const SWUM_COLOR = new THREE.Color("#3df0ff");
const MARK = "#ffe9a0";
const SHADOW = "#14141c";

const miles = (ft) => `${(ft / MILE_FT).toFixed(2)} mi`;

export class Paths {
  // surface(x, z): the height to draw the way at, less ABOVE_FT.
  constructor(scene, stage, renditions, surface, onStatus) {
    Object.assign(this, { renditions, surface, onStatus });
    this.settings = { mostFt: 2 * MILE_FT, cells: 20000 }; // the longest way, and cells a frame
    this.from = null;
    this.to = null;
    this.search = null;
    this.shown = false;
    this.material = new LineMaterial({ vertexColors: true, linewidth: 3, depthTest: false, transparent: true });
    this.line = null;
    this.group = new THREE.Group();
    this.group.renderOrder = 10;
    scene.add(this.group);
    this.canvas = document.createElement("canvas");
    this.canvas.className = "create-measure";
    stage.append(this.canvas);
    this.context = this.canvas.getContext("2d");
  }

  // The tile's cells for the search: null while its plate's being read, undefined where there's no
  // tile or it can't be read.
  cellsOf = (tx, tz) => {
    const r = this.renditions;
    if (!r.tile(tx, tz)) return undefined;
    const key = `${Math.floor(tx / PLATE_TILES)},${Math.floor(tz / PLATE_TILES)}`;
    if (r.unreadable.has(key)) return undefined;
    if (!r.hasCells(tx, tz)) return null;
    return r.decoded.get(key).tiles.get(tileIndexInPlate(tx, tz)) ?? undefined;
  };

  setShown(shown) {
    this.shown = shown;
    this.group.visible = shown;
    walked.shown.value = shown && this.search ? 1 : 0;
    if (shown) this.status();
    else this.clearMarks();
  }

  // The first click puts the start, the second the end and starts searching, and the next puts a
  // start again.
  click(x, z) {
    if (this.from && !this.to) {
      this.to = [x, z];
      this.start();
    } else {
      this.reset();
      this.from = [x, z];
      this.status();
    }
  }

  reset() {
    this.from = this.to = this.search = null;
    walked.shown.value = 0;
    this.showLine(null);
  }

  // Searches from the start to the end again, as the ground is now.
  start() {
    if (!this.from || !this.to) return;
    const most = this.settings.mostFt;
    const middle = [(this.from[0] + this.to[0]) / 2, (this.from[1] + this.to[1]) / 2];
    const side = most + 2 * CELL_FT;
    const n = Math.min(MOST_TEXELS, Math.ceil(side / CELL_FT));
    const texel = side / n;
    const [x0, z0] = [middle[0] - side / 2, middle[1] - side / 2];
    const data = new Uint8Array(n * n * 4);
    walked.map.value?.dispose();
    const texture = new THREE.DataTexture(data, n, n);
    texture.magFilter = texture.minFilter = THREE.LinearFilter;
    walked.map.value = texture;
    walked.box.value.set(x0, z0, side, side);
    walked.shown.value = this.shown ? 1 : 0;
    this.changed = true;
    this.showLine(null);
    this.search = new WalkSearch({
      from: this.from,
      to: this.to,
      most,
      cellsOf: this.cellsOf,
      onReach: (i, j, ft, swum) => {
        const [u, v] = [Math.floor(((i + 0.5) * CELL_FT - x0) / texel), Math.floor(((j + 0.5) * CELL_FT - z0) / texel)];
        if (u < 0 || v < 0 || u >= n || v >= n) return;
        const k = (v * n + u) * 4;
        if (data[k + 3]) return;
        data.set([Math.round((255 * ft) / most), swum ? 255 : 0, 0, 255], k);
        this.changed = true;
      },
    });
    this.status();
  }

  status() {
    const s = this.search;
    const state = s?.state;
    const text = !this.from
      ? "Click where to start."
      : !this.to
        ? "Click where to go."
        : state === "found"
          ? `${miles(s.path.ft)} on the way${s.path.swumFt ? `, ${miles(s.path.swumFt)} of it swum` : ""}.`
          : state === "none"
            ? `No way within ${miles(this.settings.mostFt)}.`
            : state === "too far"
              ? "Gave up: it reached too much ground."
              : `Searching: ${s.reached.toLocaleString()} cells.`;
    this.onStatus(text);
  }

  // Each frame, while shown: searches a slice more, and draws the start and end.
  tick(camera, width, height) {
    if (!this.shown) return;
    this.material.resolution.set(width, height);
    const s = this.search;
    if (s?.state === "searching") {
      const started = performance.now();
      const slice = Math.min(this.settings.cells, 2000);
      for (let done = 0; done < this.settings.cells && performance.now() - started < BUDGET_MS; done += slice) {
        if (s.step(slice) !== "searching") break;
      }
      if (s.state === "found") this.showLine(s.path);
      this.status();
    }
    if (this.changed && walked.map.value) {
      walked.map.value.needsUpdate = true;
      this.changed = false;
    }
    this.drawMarks(camera, width, height);
  }

  // The way found, sampled every STEP_FT along over the ground, or none.
  showLine(path) {
    if (this.line) {
      this.group.remove(this.line);
      this.line.geometry.dispose();
      this.line = null;
    }
    if (!path) return;
    const [positions, colors] = [[], []];
    const add = (x, z, swum) => {
      positions.push(x, this.surface(x, z) + ABOVE_FT, z);
      const c = swum ? SWUM_COLOR : WALKED_COLOR;
      colors.push(c.r, c.g, c.b);
    };
    path.points.forEach((p, k) => {
      const q = path.points[k + 1];
      if (!q) return add(p.x, p.z, p.swum);
      const steps = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / STEP_FT));
      for (let n = 0; n < steps; n++) add(p.x + ((q.x - p.x) * n) / steps, p.z + ((q.z - p.z) * n) / steps, p.swum && q.swum);
    });
    if (positions.length < 6) return;
    const geometry = new LineGeometry();
    geometry.setPositions(positions);
    geometry.setColors(colors);
    this.line = new Line2(geometry, this.material);
    this.line.renderOrder = 10;
    this.line.frustumCulled = false;
    this.group.add(this.line);
  }

  clearMarks() {
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  // A and B over the start and end.
  drawMarks(camera, width, height) {
    if (this.canvas.width !== width || this.canvas.height !== height) [this.canvas.width, this.canvas.height] = [width, height];
    this.clearMarks();
    const c = this.context;
    c.font = "bold 14px sans-serif";
    c.fillStyle = c.strokeStyle = MARK;
    c.lineWidth = 2;
    c.shadowColor = SHADOW;
    c.shadowBlur = 3;
    [this.from, this.to].forEach((at, k) => {
      if (!at) return;
      const v = new THREE.Vector3(at[0], this.surface(at[0], at[1]) + ABOVE_FT, at[1]).project(camera);
      if (v.z > 1 || v.z < -1) return;
      const [x, y] = [((v.x + 1) / 2) * width, ((1 - v.y) / 2) * height];
      c.beginPath();
      c.arc(x, y, 5, 0, Math.PI * 2);
      c.stroke();
      c.fillText(k ? "B" : "A", x + 8, y - 8);
    });
  }
}
