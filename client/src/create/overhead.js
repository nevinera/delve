import * as THREE from "three";
import { CHUNK_FT } from "../v2/sizes.js";

// The ground over the camera underground, as a brown ceiling with its edges drawn in: its height
// at each chunk's corners out to REACH_FT from the builder, darkening off toward there. Enough to
// tell where digging up will come out, without the cost of drawing the ground's every face.

const REACH_FT = 512;
const RGB = [0.95, 0.62, 0.36];
const LINE_RGB = 0x2a1c10;
const STEPS = (2 * REACH_FT) / CHUNK_FT;

export class Overhead {
  // heightAt(x, z): the ground's height, or null where it's not known.
  constructor(scene, heightAt) {
    this.heightAt = heightAt;
    this.ceiling = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, fog: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
    );
    this.lines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: LINE_RGB, fog: false }));
    this.ceiling.add(this.lines);
    this.ceiling.visible = false;
    this.ceiling.frustumCulled = this.lines.frustumCulled = false;
    scene.add(this.ceiling);
    this.at = null; // the chunk corner the net's made round, "i,j"
  }

  // Shows the net round continent feet (x, z), or hides it. again: whether the ground's moved.
  tick(shown, x, z, again = false) {
    this.ceiling.visible = shown;
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
        corners.set([cx, h ?? 0, cz], (j * n + i) * 3);
        shades[j * n + i] = h == null ? 0 : Math.max(0, 1 - Math.hypot(cx - x, cz - z) / REACH_FT);
      }
    }
    const [faces, edges] = [[], []];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        if (i + 1 < n && shades[k] && shades[k + 1]) edges.push(k, k + 1);
        if (j + 1 < n && shades[k] && shades[k + n]) edges.push(k, k + n);
        if (i + 1 < n && j + 1 < n && shades[k] && shades[k + 1] && shades[k + n] && shades[k + n + 1]) faces.push(k, k + n, k + 1, k + 1, k + n, k + n + 1);
      }
    }
    const colors = new Float32Array(n * n * 3);
    shades.forEach((shade, k) => colors.set(RGB.map((c) => c * shade), k * 3));
    const geometry = (index) => {
      const made = new THREE.BufferGeometry();
      made.setAttribute("position", new THREE.BufferAttribute(corners, 3));
      made.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      made.setIndex(index);
      return made;
    };
    this.ceiling.geometry.dispose();
    this.ceiling.geometry = geometry(faces);
    this.lines.geometry.dispose();
    this.lines.geometry = geometry(edges);
  }
}
