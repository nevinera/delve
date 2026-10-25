import * as THREE from "three";

// The ground's material: its vertex colors broken up by a grainy noise texture laid flat across
// the world at three scales, so slopes and distances read at eye level.

const SIZE = 256;
const SCALES_FT = [9, 48, 210]; // how far each layer's texture stretches

let detail = null;

export function groundMaterial(renderer) {
  detail ??= detailTexture(renderer);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.groundDetail = { value: detail };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vGroundXZ;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGroundXZ = (modelMatrix * vec4(transformed, 1.0)).xz;");
    const [fine, mid, broad] = SCALES_FT.map((ft) => (1 / ft).toFixed(5));
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D groundDetail;\nvarying vec2 vGroundXZ;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float grain = texture2D(groundDetail, vGroundXZ * ${fine}).r;
        float blotch = texture2D(groundDetail, vGroundXZ * ${mid} + 0.31).g;
        float sweep = texture2D(groundDetail, vGroundXZ * ${broad} + 0.67).g;
        diffuseColor.rgb *= 0.6 + 0.3 * grain + 0.35 * blotch + 0.25 * sweep;`,
      );
  };
  return material;
}

// A tiling noise texture: speckle in red, soft blotches in green, both about 0.5 on average.
function detailTexture(renderer) {
  const blotch = valueNoise(SIZE, [8, 16, 32], 0x9e3779b9);
  const speck = valueNoise(SIZE, [32, 64, 128], 0x85ebca6b);
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let k = 0; k < SIZE * SIZE; k++) {
    data[k * 4] = speck[k] * 255;
    data[k * 4 + 1] = blotch[k] * 255;
    data[k * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, SIZE, SIZE);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.needsUpdate = true;
  return texture;
}

// Smooth value noise that wraps at the edges, summed over grid sizes `periods`, scaled to 0-1.
function valueNoise(size, periods, seed) {
  const out = new Float32Array(size * size);
  let weight = 1;
  let total = 0;
  for (const period of periods) {
    const lattice = Array.from({ length: period * period }, (_, n) => hash(n, seed + period));
    const at = (a, b) => lattice[(b % period) * period + (a % period)];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = (x / size) * period;
        const v = (y / size) * period;
        const a = Math.floor(u);
        const b = Math.floor(v);
        const fu = smooth(u - a);
        const fv = smooth(v - b);
        const top = at(a, b) + (at(a + 1, b) - at(a, b)) * fu;
        const bottom = at(a, b + 1) + (at(a + 1, b + 1) - at(a, b + 1)) * fu;
        out[y * size + x] += (top + (bottom - top) * fv) * weight;
      }
    }
    total += weight;
    weight *= 0.6;
  }
  for (let k = 0; k < out.length; k++) out[k] /= total;
  return out;
}

const smooth = (t) => t * t * (3 - 2 * t);

function hash(n, seed) {
  let h = Math.imul(n ^ seed, 0x27d4eb2d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x165667b1);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
