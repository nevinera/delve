import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { CELLS, CHUNKS } from "./geo.js";
import { crossing, growth, middleOutline, raises } from "./growth.js";
import { Stroke } from "./stroke.js";

// Geo's draw tool: a line drawn on the ground, kept till it's thrown away, to grow things along
// (growth.js). Its states:
// - idle: no line;
// - drawing: the line's being dragged out;
// - drawn: the line's there, and what to grow along it is picked;
// - adjusting: what to grow is picked, and its settings shown on the ground while they're
//   changed: its band's thirds shaded, orange in the middle to yellow at the edge, a dot for each
//   peak it'll grow, bigger the taller, and a line in the air at the height it aims for. A
//   cliff's face is shaded orange, its top lighter, and where it eases down behind yellow. Growing
//   it moves the ground, as one step undo takes back. One that's to be impassable isn't grown
//   when there's a way across it, and the way's drawn in red instead. A range's middle third is
//   made rocky, a biome area on top (biomes.js), which undo takes away again.

const LINE_COLOR = 0xffffff;
const AIM_COLOR = 0x40e0ff;
const PASS_COLOR = 0xff2020;
// The band's thirds, outermost first.
const ZONES = [null, { color: 0xffe9a0, opacity: 0.22 }, { color: 0xffb347, opacity: 0.3 }, { color: 0xff8c00, opacity: 0.4 }];
const DOT_COLORS = ["#ff3b1f", "#ff9a3c", "#ffe14d"]; // each tier of peaks' dots, tallest first
const DOT_PX = [2, 9]; // how wide a dot is across, for the shortest peak to the tallest
const PREVIEW_CELLS = 160; // how many squares the preview has along its longer side, at most
const LIFT_FT = 2;
export const DEFAULTS = {
  hills: { width: 5280, height: 300, noise: 0.6, density: 3, impassable: true },
  range: { width: 10560, height: 1500, noise: 0.6, density: 3, impassable: true },
  cliff: { width: 300, height: 60, noise: 0.6, density: 1, impassable: true, flip: false },
};
// How finely each kind's grown: a cliff's face is too narrow for chunks.
const LEVELS = { hills: CHUNKS, range: CHUNKS, cliff: CELLS };

export class Draw {
  // heightAt(x, z) gives the ground's height; onChange() is called when the state changes.
  // Peaks' dots are drawn over `stage`.
  constructor(scene, stage, renditions, ground, heightAt, onChange, biomes) {
    this.biomes = biomes;
    this.dots = document.createElement("canvas");
    this.dots.className = "create-measure";
    stage.append(this.dots);
    this.peaks = [];
    this.renditions = renditions;
    this.ground = ground;
    this.heightAt = heightAt;
    this.onChange = onChange;
    this.state = "idle";
    this.stroke = null;
    this.kind = null;
    this.settings = structuredClone(DEFAULTS);
    this.undos = []; // raises() of each growth, latest last
    this.dirty = false; // whether the preview wants making again
    this.group = new THREE.Group();
    this.group.renderOrder = 10;
    scene.add(this.group);
    const lineMaterial = (color, width) => new LineMaterial({ color, linewidth: width, depthTest: false, transparent: true });
    this.lineMaterial = lineMaterial(LINE_COLOR, 3);
    this.aimMaterial = lineMaterial(AIM_COLOR, 2);
    this.passMaterial = lineMaterial(PASS_COLOR, 4);
    this.passable = false; // whether growing was stopped by a way across
    this.zoneMaterials = ZONES.map((zone) => zone && new THREE.MeshBasicMaterial({ ...zone, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    this.line = null;
    this.aim = null;
    this.zones = null;
  }

  set(state) {
    this.state = state;
    this.onChange();
  }

  start(x, z) {
    this.stroke = new Stroke(x, z);
    this.clearPreview();
    this.set("drawing");
    this.showLine();
  }

  add(x, z) {
    this.stroke.add(x, z);
    this.showLine();
  }

  end() {
    this.stroke.end();
    if (this.stroke.points.length < 2) return this.clear();
    this.showLine();
    if (this.kind) this.adjust(this.kind);
    else this.set("drawn");
  }

  // Picks what to grow, and shows it.
  adjust(kind) {
    this.kind = kind;
    this.dirty = true;
    this.set("adjusting");
  }

  back() {
    this.kind = null;
    this.clearPreview();
    this.set("drawn");
  }

  clear() {
    this.stroke = null;
    this.kind = null;
    this.clearPreview();
    this.drop("line");
    this.set("idle");
  }

  drop(name) {
    if (!this[name]) return;
    this.group.remove(this[name]);
    this[name].geometry.dispose();
    for (const child of this[name].children) child.geometry?.dispose();
    this[name] = null;
  }

  clearPreview() {
    this.peaks = [];
    this.passable = false;
    this.drop("pass");
    this.drop("aim");
    this.drop("zones");
  }

  grown() {
    return growth(this.kind, this.stroke.points, this.settings[this.kind], this.heightAt);
  }

  // Grows what's picked along the line, and throws the line away.
  grow() {
    if (this.state !== "adjusting") return;
    const grown = this.grown();
    const r = raises(grown, this.heightAt);
    const way = this.settings[this.kind].impassable && crossing(r);
    if (way) {
      this.fat(way.map(([x, z]) => [x, this.heightAt(x, z) + r.at(x, z) + LIFT_FT * 4, z]), this.passMaterial, "pass");
      this.passable = true;
      this.onChange();
      return;
    }
    r.level = LEVELS[this.kind];
    this.ground.refresh(this.renditions.raise(r.at, r.bounds, r.level));
    r.area = this.kind === "range" ? this.biomes.addArea("rocky", middleOutline(grown)) : null;
    this.undos.push(r);
    this.clear();
  }

  undo() {
    const r = this.undos.pop();
    if (r) this.ground.refresh(this.renditions.raise(r.undo, r.bounds, r.level));
    if (r?.area) this.biomes.removeArea(r.area);
    this.onChange();
  }

  fat(points, material, name) {
    this.drop(name);
    const positions = new Float32Array(Math.max(2, points.length) * 3);
    points.forEach((p, k) => positions.set(p, k * 3));
    if (points.length === 1) positions.set(positions.subarray(0, 3), 3);
    const line = new Line2(new LineGeometry(), material);
    line.geometry.setPositions(positions);
    line.frustumCulled = false;
    line.renderOrder = 11;
    this.group.add(line);
    this[name] = line;
  }

  showLine() {
    this.fat(this.stroke.points.map(([x, z]) => [x, this.heightAt(x, z) + LIFT_FT, z]), this.lineMaterial, "line");
  }

  // Shades where the growth reaches on the ground, and draws the height it aims for in the air.
  showPreview() {
    this.passable = false;
    this.drop("pass");
    const grown = this.grown();
    const { height } = this.settings[this.kind];
    this.peaks = grown.peaks.map((peak) => ({ ...peak, y: this.heightAt(peak.x, peak.z) + LIFT_FT, size: DOT_PX[0] + (DOT_PX[1] - DOT_PX[0]) * (peak.tall / height) }));
    this.fat(grown.line.points.map(([x, z], k) => [x, grown.base(grown.line.along[k]) + height, z]), this.aimMaterial, "aim");
    const [x0, z0, x1, z1] = grown.bounds;
    const step = Math.max(x1 - x0, z1 - z0) / PREVIEW_CELLS;
    const [nx, nz] = [Math.ceil((x1 - x0) / step) + 1, Math.ceil((z1 - z0) / step) + 1];
    const positions = new Float32Array(nx * nz * 3);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const [x, z] = [x0 + i * step, z0 + j * step];
        positions.set([x, this.heightAt(x, z) + LIFT_FT, z], (j * nx + i) * 3);
      }
    }
    // Each square shaded by the zone at its middle, a mesh a zone.
    const index = [[], [], [], []];
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const k = j * nx + i;
        index[grown.zone(x0 + (i + 0.5) * step, z0 + (j + 0.5) * step)].push(k, k + nx, k + 1, k + 1, k + nx, k + nx + 1);
      }
    }
    this.drop("zones");
    this.zones = new THREE.Group();
    this.zones.geometry = new THREE.BufferGeometry();
    this.zones.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    for (const zone of [1, 2, 3]) {
      const geometry = this.zones.geometry.clone();
      geometry.setIndex(index[zone]);
      const mesh = new THREE.Mesh(geometry, this.zoneMaterials[zone]);
      mesh.frustumCulled = false;
      mesh.renderOrder = 10;
      this.zones.add(mesh);
    }
    this.group.add(this.zones);
  }

  tick(camera, width, height) {
    for (const material of [this.lineMaterial, this.aimMaterial, this.passMaterial]) material.resolution.set(width, height);
    if (this.dirty && this.state === "adjusting") this.showPreview();
    this.dirty = false;
    this.drawDots(camera, width, height);
  }

  // A dot over each peak to be grown, tallest tiers last, on top.
  drawDots(camera, width, height) {
    if (this.dots.width !== width || this.dots.height !== height) [this.dots.width, this.dots.height] = [width, height];
    const c = this.dots.getContext("2d");
    c.clearRect(0, 0, width, height);
    const v = new THREE.Vector3();
    c.strokeStyle = "#14141c";
    c.lineWidth = 1;
    for (const tier of [2, 1, 0]) {
      c.fillStyle = DOT_COLORS[tier];
      for (const peak of this.peaks) {
        if (peak.tier !== tier) continue;
        v.set(peak.x, peak.y, peak.z).project(camera);
        if (v.z > 1 || v.z < -1) continue;
        c.beginPath();
        c.arc(((v.x + 1) / 2) * width, ((1 - v.y) / 2) * height, peak.size / 2, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      }
    }
  }
}
