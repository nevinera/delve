import * as THREE from "three";
import { BLOCKED, WADE } from "../nav/navGrid.js";

// Debug drawing: the nav grid (as a texture the terrain shader tints
// with), sight lines, and paths.
export function makeNavTexture(nav) {
  const data = new Uint8Array(nav.w * nav.h * 4);
  const tex = new THREE.DataTexture(data, nav.w, nav.h, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  refreshNavTexture(nav, tex);
  return tex;
}

export function refreshNavTexture(nav, tex) {
  const d = tex.image.data;
  for (let i = 0; i < nav.walk.length; i++) {
    let c;
    if (nav.walk[i] === BLOCKED) c = nav.occluder[i] > 0 ? [150, 60, 200, 170] : [210, 40, 40, 150];
    else if (nav.walk[i] === WADE) c = [40, 110, 230, 120];
    else if (nav.clearance[i] < 3) c = [240, 210, 40, 100];
    else c = [0, 0, 0, 0];
    d.set(c, i * 4);
  }
  tex.needsUpdate = true;
}

const GREEN = new THREE.Color(0x40ff60);
const RED = new THREE.Color(0xff3030);
const GRAY = new THREE.Color(0x777777);
const WHITE = new THREE.Color(0xffffff);
const ORANGE = new THREE.Color(0xffa030);

export class LineOverlay {
  constructor(parent, capacity = 4096) {
    this.positions = new Float32Array(capacity * 6);
    this.colors = new Float32Array(capacity * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));
    this.lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({vertexColors: true, depthTest: false, transparent: true, fog: false}));
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 10;
    parent.add(this.lines);
    this.capacity = capacity;
    this.n = 0;
  }

  begin() {
    this.n = 0;
  }

  seg(a, b, color) {
    if (this.n >= this.capacity) return;
    const k = this.n * 6;
    this.positions.set([a.x, a.y, a.z, b.x, b.y, b.z], k);
    this.colors.set([color.r, color.g, color.b, color.r, color.g, color.b], k);
    this.n++;
  }

  sight(from, to, los) {
    if (los.clear) return this.seg(from, to, GREEN);
    this.seg(from, los.at, RED);
    this.seg(los.at, to, GRAY);
  }

  path(world, start, points, isPlayer) {
    let prev = start;
    for (const p of points) {
      // drape long legs over the ground
      const len = Math.hypot(p.x - prev.x, p.z - prev.z);
      const steps = Math.max(1, Math.ceil(len / 6));
      for (let k = 0; k < steps; k++) {
        const t0 = k / steps, t1 = (k + 1) / steps;
        const ax = prev.x + (p.x - prev.x) * t0, az = prev.z + (p.z - prev.z) * t0;
        const bx = prev.x + (p.x - prev.x) * t1, bz = prev.z + (p.z - prev.z) * t1;
        this.seg(
          {x: ax, y: world.heightAt(ax, az) + 0.8, z: az},
          {x: bx, y: world.heightAt(bx, bz) + 0.8, z: bz},
          isPlayer ? WHITE : ORANGE,
        );
      }
      prev = p;
    }
  }

  end() {
    const geo = this.lines.geometry;
    geo.setDrawRange(0, this.n * 2);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }
}
