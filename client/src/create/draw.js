import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { CHUNKS } from "./geo.js";
import { growth, raises } from "./growth.js";
import { Stroke } from "./stroke.js";

// Geo's draw tool: a line drawn on the ground, kept till it's thrown away, to grow things along
// (growth.js). Its states:
// - idle: no line;
// - drawing: the line's being dragged out;
// - drawn: the line's there, and what to grow along it is picked;
// - adjusting: what to grow is picked, and its settings shown on the ground while they're
//   changed: its core shaded orange, its foothills yellow, and a line in the air at the height it
//   aims for. Growing it moves the ground, as one step undo takes back.

const LINE_COLOR = 0xffffff;
const AIM_COLOR = 0x40e0ff;
const ZONES = [null, { color: 0xffe9a0, opacity: 0.3 }, { color: 0xff8c00, opacity: 0.45 }]; // foothills, core
const PREVIEW_CELLS = 160; // how many squares the preview has along its longer side, at most
const LIFT_FT = 2;
export const DEFAULTS = { hills: { width: 2640, height: 300, noise: 0.5 }, range: { width: 5280, height: 1000, noise: 0.5 } };

export class Draw {
  // heightAt(x, z) gives the ground's height; onChange() is called when the state changes.
  constructor(scene, renditions, ground, heightAt, onChange) {
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
    this.drop("aim");
    this.drop("zones");
  }

  grown() {
    return growth(this.kind, this.stroke.points, this.settings[this.kind], this.heightAt);
  }

  // Grows what's picked along the line, and throws the line away.
  grow() {
    if (this.state !== "adjusting") return;
    const r = raises(this.grown(), this.heightAt);
    this.ground.refresh(this.renditions.raise(r.at, r.bounds, CHUNKS));
    this.undos.push(r);
    this.clear();
  }

  undo() {
    const r = this.undos.pop();
    if (r) this.ground.refresh(this.renditions.raise(r.undo, r.bounds, CHUNKS));
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
    const grown = this.grown();
    const { height } = this.settings[this.kind];
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
    const index = [[], [], []];
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
    for (const zone of [1, 2]) {
      const geometry = this.zones.geometry.clone();
      geometry.setIndex(index[zone]);
      const mesh = new THREE.Mesh(geometry, this.zoneMaterials[zone]);
      mesh.frustumCulled = false;
      mesh.renderOrder = 10;
      this.zones.add(mesh);
    }
    this.group.add(this.zones);
  }

  tick(width, height) {
    this.lineMaterial.resolution.set(width, height);
    this.aimMaterial.resolution.set(width, height);
    if (this.dirty && this.state === "adjusting") this.showPreview();
    this.dirty = false;
  }
}
