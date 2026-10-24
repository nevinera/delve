import * as THREE from "three";
import { fbm, hash3 } from "../world/noise.js";

const SIZE = 128;

// Small tiling ground textures, painted procedurally for the spike. They
// stand in for hand-painted ones later.
const RECIPES = {
  grass: {base: [86, 128, 52], vary: [40, 46, 22], scale: 10, speck: [[118, 160, 64], 0.08], seed: 1},
  dirt: {base: [120, 92, 62], vary: [44, 34, 26], scale: 8, speck: [[86, 66, 46], 0.1], seed: 2},
  sand: {base: [196, 178, 130], vary: [30, 28, 22], scale: 14, speck: [[170, 150, 108], 0.06], seed: 3},
  rock: {base: [124, 120, 114], vary: [50, 48, 46], scale: 6, cracks: true, seed: 4},
  road: {base: [150, 130, 98], vary: [34, 30, 24], scale: 5, cobbles: true, seed: 5},
  mud: {base: [78, 64, 44], vary: [30, 26, 18], scale: 7, puddles: true, seed: 6},
  moss: {base: [82, 104, 44], vary: [36, 40, 20], scale: 12, speck: [[120, 132, 58], 0.12], seed: 7},
};

export function makeGroundTextures(renderer) {
  const out = {};
  for (const [name, recipe] of Object.entries(RECIPES)) out[name] = paint(recipe, renderer);
  return out;
}

function paint(r, renderer) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(SIZE, SIZE);
  const period = r.scale;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const u = (x / SIZE) * period, v = (y / SIZE) * period;
      let n = fbm(u, v, 4, r.seed, period) - 0.5;
      let rgb = r.base.map((b, k) => b + n * r.vary[k] * 2);
      if (r.speck && hash3(x, y, r.seed) < r.speck[1]) rgb = r.speck[0].map((c, k) => c + n * r.vary[k]);
      if (r.cracks) {
        const c = Math.abs(fbm(u * 0.7, v * 0.7, 3, r.seed + 50, period * 0.7) - 0.5);
        if (c < 0.03) rgb = rgb.map((c2) => c2 * 0.55);
      }
      if (r.cobbles) {
        const cu = u * 1.6, cv = v * 1.6;
        const fx = cu - Math.floor(cu), fy = cv - Math.floor(cv);
        const edge = Math.min(fx, 1 - fx, fy, 1 - fy);
        rgb = rgb.map((c2) => c2 * (edge < 0.08 ? 0.68 : 1 + (hash3(Math.floor(cu), Math.floor(cv), 9) - 0.5) * 0.2));
      }
      if (r.puddles && fbm(u * 0.5, v * 0.5, 2, r.seed + 70, period * 0.5) > 0.62) rgb = rgb.map((c2) => c2 * 0.6);
      const i = (y * SIZE + x) * 4;
      img.data[i] = rgb[0];
      img.data[i + 1] = rgb[1];
      img.data[i + 2] = rgb[2];
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return tex;
}
