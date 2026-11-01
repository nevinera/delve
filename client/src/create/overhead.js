import * as THREE from "three";
import { CHUNK_FT } from "../v2/sizes.js";

// The ground over the camera underground, as a net of faint lines seen through the rock: its
// height at each chunk's corners out to REACH_FT from the builder, fading off toward there. Enough
// to tell where digging up will come out, without the cost of drawing the ground's every face.

const REACH_FT = 512;
const RGB = [0.3, 0.32, 0.34];
const STEPS = (2 * REACH_FT) / CHUNK_FT;

export class Overhead {
  // heightAt(x, z): the ground's height, or null where it's not known.
  constructor(scene, heightAt) {
    this.heightAt = heightAt;
    this.lines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, fog: false }),
    );
    this.lines.visible = false;
    this.lines.frustumCulled = false;
    scene.add(this.lines);
    this.at = null; // the chunk corner the net's made round, "i,j"
  }

  // Shows the net round continent feet (x, z), or hides it. again: whether the ground's moved.
  tick(shown, x, z, again = false) {
    this.lines.visible = shown;
    if (!shown) return;
    const [i0, j0] = [Math.round(x / CHUNK_FT) - STEPS / 2, Math.round(z / CHUNK_FT) - STEPS / 2];
    const at = `${i0},${j0}`;
    if (at === this.at && !again) return;
    this.at = at;
    const n = STEPS + 1;
    const corners = new Float32Array(n * n * 3);
    const shades = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const [cx, cz] = [(i0 + i) * CHUNK_FT, (j0 + j) * CHUNK_FT];
        const h = this.heightAt(cx, cz);
        corners.set([cx, h ?? NaN, cz], (j * n + i) * 3);
        shades[j * n + i] = h == null ? 0 : Math.max(0, 1 - Math.hypot(cx - x, cz - z) / REACH_FT);
      }
    }
    const [positions, colors] = [[], []];
    const add = (a, b) => {
      if (!shades[a] || !shades[b]) return;
      positions.push(...corners.subarray(a * 3, a * 3 + 3), ...corners.subarray(b * 3, b * 3 + 3));
      for (const k of [a, b]) colors.push(...RGB.map((c) => c * shades[k]));
    };
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        if (i + 1 < n) add(j * n + i, j * n + i + 1);
        if (j + 1 < n) add(j * n + i, (j + 1) * n + i);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    this.lines.geometry.dispose();
    this.lines.geometry = geometry;
  }
}
