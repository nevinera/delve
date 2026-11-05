import * as THREE from "three";
import { noiseTexture } from "./groundMaterial.js";
import { waterTime } from "./waterMaterial.js";

// Waterfalls (the generator's tile.falls): a curtain of water arcing from the lip to where it lands,
// streaming down; churning foam on the water where it lands; and mist rising off it.

// The curtain bulges out from the lip `bulge` of the way to where it lands.
const CURTAIN = { bulge: 0.2, segments: 14, spread: 1.15, narrow: 0.9, liftFt: 1, speedFtS: 26 };
// A second, thinner curtain behind the first, this far back toward the cliff and this much as wide,
// its streams elsewhere.
const BACK = { ft: 0.8, wide: 0.75, shift: 37 };
const FOAM = { reach: 1.4, liftFt: 0.4, segments: 24, rings: 6 };
const MIST = { puffs: 14, sizeFt: 30, riseFt: [12, 45], cycleS: 7 };

let materials = null;

// The meshes for a tile's waterfalls, positioned relative to the scene's `origin`. A fall with
// `mist` false has none.
export function waterfallMeshes(falls, origin, renderer) {
  if (!falls?.length) return [];
  materials ??= makeMaterials(renderer);
  return falls.flatMap((fall) => {
    const at = ([x, y, z]) => new THREE.Vector3(x - origin[0], y, z - origin[1]);
    if (fall.sheet) {
      const sheet = new THREE.Mesh(sheetGeometry(fall.sheet, origin), sheetMaterial(fall.sheet.look, renderer));
      sheet.renderOrder = 1;
      return [sheet];
    }
    const [top, bottom] = [at(fall.top), at(fall.bottom)];
    const meshes = [
      new THREE.Mesh(curtainGeometry(fall, top, bottom, BACK), materials.curtain),
      new THREE.Mesh(curtainGeometry(fall, top, bottom), materials.curtain),
      new THREE.Mesh(foamGeometry(fall, bottom), materials.foam),
    ];
    if (fall.mist !== false) {
      const mist = new THREE.Points(mistGeometry(fall, bottom), materials.mist);
      mist.frustumCulled = false;
      meshes.push(mist);
    }
    // Drawn after the water, which is see-through too, so the water's surface hides only what's
    // really under it.
    for (const mesh of meshes) mesh.renderOrder = 1;
    return meshes;
  });
}

// What runs down the ground rather than falling clear of it: a sheet over `rows` of points, its
// `fallUv` running across it and down it in ft.
function sheetGeometry({ rows }, origin) {
  const positions = [];
  const uv = [];
  const indices = [];
  const across = rows[0].length;
  let down = 0;
  rows.forEach((row, j) => {
    if (j) down += Math.hypot(row[0][0] - rows[j - 1][0][0], row[0][1] - rows[j - 1][0][1], row[0][2] - rows[j - 1][0][2]);
    row.forEach(([x, y, z], k) => {
      positions.push(x - origin[0], y, z - origin[1]);
      uv.push(Math.hypot(x - row[0][0], z - row[0][2]), down, 0, 0);
      if (j && k) {
        const v = j * across + k;
        indices.push(v - across - 1, v - 1, v - across, v - across, v - 1, v);
      }
    });
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("fallUv", new THREE.Float32BufferAttribute(uv, 4));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

// A sheet's material for a look (create/waterSurface.js), one for each: it creeps down the ground
// unless it's still.
const sheetMaterials = new Map();
function sheetMaterial({ color, emissive = 0, still = 0 }, renderer) {
  const key = `${color},${emissive},${still}`;
  if (sheetMaterials.has(key)) return sheetMaterials.get(key);
  const material = new THREE.MeshLambertMaterial({ color, emissive, side: THREE.DoubleSide });
  material.customProgramCacheKey = () => "waterfall-sheet";
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { waterNoise: { value: noiseTexture(renderer) }, waterTime, sheetStill: { value: still } });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec4 fallUv;\nvarying vec4 vFallUv;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFallUv = fallUv;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D waterNoise;\nuniform float waterTime;\nuniform float sheetStill;\nvarying vec4 vFallUv;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec2 sheetAt = vec2(vFallUv.x / 14.0, (vFallUv.y - waterTime * 3.0 * step(sheetStill, 0.99)) / 22.0);
        diffuseColor.rgb *= 0.65 + 0.7 * texture2D(waterNoise, sheetAt).r;`,
      );
  };
  sheetMaterials.set(key, material);
  return material;
}

// The curtain: a strip along a curve that leaves the lip level and drops to the landing, a little
// wider at the bottom. `fallUv` runs across it and down it, in ft, then across it from -1 to 1 and
// down it from 0 to 1. With `back`, it's BACK's curtain behind.
function curtainGeometry(fall, top, bottom, back = null) {
  const ahead = new THREE.Vector3(bottom.x - top.x, 0, bottom.z - top.z);
  if (ahead.lengthSq() < 1e-6) ahead.set(1, 0, 0);
  const side = new THREE.Vector3(-ahead.z, 0, ahead.x).normalize();
  if (back) {
    const toward = ahead.clone().normalize().multiplyScalar(-back.ft);
    [top, bottom] = [top.clone().add(toward), bottom.clone().add(toward)];
  }
  // Out over the drop at the lip's height, then down: a quadratic curve.
  const control = new THREE.Vector3().lerpVectors(top, bottom, CURTAIN.bulge).setY(top.y);
  const curve = new THREE.QuadraticBezierCurve3(top.clone().setY(top.y + CURTAIN.liftFt), control, bottom);
  const points = curve.getSpacedPoints(CURTAIN.segments);
  // Each fall's patterns from somewhere else in them.
  const seed = (Math.abs(Math.sin(fall.top[0] * 12.9898 + fall.top[2] * 78.233)) * 43758.5453) % 200;
  const positions = [];
  const uvs = [];
  let down = 0;
  points.forEach((p, k) => {
    if (k) down += p.distanceTo(points[k - 1]);
    const half = (fall.width / 2) * CURTAIN.narrow * (back?.wide ?? 1) * (1 + ((CURTAIN.spread - 1) * k) / CURTAIN.segments);
    for (const s of [-1, 1]) {
      positions.push(p.x + side.x * half * s, p.y, p.z + side.z * half * s);
      uvs.push(half * s + (back?.shift ?? 0) + seed, down, s, k / CURTAIN.segments);
    }
  });
  const indices = [];
  for (let k = 0; k < CURTAIN.segments; k++) {
    const v = k * 2;
    indices.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("fallUv", new THREE.Float32BufferAttribute(uvs, 4));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

// The foam: a disc on the water where the fall lands. `fallUv` is each vertex's offset from the
// middle in ft, and its z its distance as a share of the disc's radius.
function foamGeometry(fall, bottom) {
  const radius = fall.pool * FOAM.reach;
  const positions = [bottom.x, bottom.y + FOAM.liftFt, bottom.z];
  const uvs = [0, 0, 0];
  for (let r = 1; r <= FOAM.rings; r++) {
    for (let a = 0; a < FOAM.segments; a++) {
      const angle = (a / FOAM.segments) * Math.PI * 2;
      const [dx, dz] = [Math.cos(angle) * (radius * r) / FOAM.rings, Math.sin(angle) * (radius * r) / FOAM.rings];
      positions.push(bottom.x + dx, bottom.y + FOAM.liftFt, bottom.z + dz);
      uvs.push(dx, dz, r / FOAM.rings);
    }
  }
  const indices = [];
  const ring = (r, a) => 1 + (r - 1) * FOAM.segments + (a % FOAM.segments);
  for (let a = 0; a < FOAM.segments; a++) indices.push(0, ring(1, a + 1), ring(1, a));
  for (let r = 1; r < FOAM.rings; r++) {
    for (let a = 0; a < FOAM.segments; a++) indices.push(ring(r, a), ring(r, a + 1), ring(r + 1, a), ring(r + 1, a), ring(r, a + 1), ring(r + 1, a + 1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("fallUv", new THREE.Float32BufferAttribute(uvs, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(positions.map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(indices);
  return g;
}

// The mist: puffs around the landing, each rising and fading on its own cycle. `mist` holds each
// puff's start in its cycle, and how high it rises.
function mistGeometry(fall, bottom) {
  const drop = fall.top[1] - fall.bottom[1];
  const rise = Math.min(MIST.riseFt[1], MIST.riseFt[0] + drop * 0.5);
  const positions = [];
  const mist = [];
  for (let k = 0; k < MIST.puffs; k++) {
    const angle = k * 2.399963;
    const r = fall.pool * Math.sqrt((k + 0.5) / MIST.puffs);
    positions.push(bottom.x + Math.cos(angle) * r, bottom.y, bottom.z + Math.sin(angle) * r);
    mist.push(((k * 0.618034) % 1), rise);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("mist", new THREE.Float32BufferAttribute(mist, 2));
  return g;
}

function makeMaterials(renderer) {
  const noise = noiseTexture(renderer);
  const f = (n) => n.toFixed(4);

  const curtain = new THREE.MeshLambertMaterial({ color: 0xdfeaf4, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
  curtain.customProgramCacheKey = () => "waterfall-curtain";
  const patterns = fallTexture();
  curtain.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { waterNoise: { value: noise }, fallPatterns: { value: patterns }, waterTime });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec4 fallUv;\nvarying vec4 vFallUv;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFallUv = fallUv;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D waterNoise;\nuniform sampler2D fallPatterns;\nuniform float waterTime;\nvarying vec4 vFallUv;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float down = vFallUv.y - waterTime * ${f(CURTAIN.speedFtS)};
        float speck = texture2D(waterNoise, vec2(vFallUv.x / 3.0, down / 9.0) + 0.41).r;
        // Four patterns (fallTexture), each sliding down at its own speed, mingled by a mask that
        // wanders across the fall and drifts slowly down it.
        float t = waterTime * ${f(CURTAIN.speedFtS)};
        float ropes = texture2D(fallPatterns, vec2(vFallUv.x / 9.0, (vFallUv.y - t) / 60.0)).r;
        float sheet = texture2D(fallPatterns, vec2(vFallUv.x / 14.0 + 0.3, (vFallUv.y - t * 0.8) / 30.0)).g;
        float spray = texture2D(fallPatterns, vec2(vFallUv.x / 6.0 + 0.6, (vFallUv.y - t * 1.25) / 12.0)).b;
        float veil = texture2D(fallPatterns, vec2(vFallUv.x / 18.0 + 0.1, (vFallUv.y - t * 0.55) / 40.0)).a;
        vec4 mask = vec4(
          texture2D(fallPatterns, vec2(vFallUv.x / 31.0, vFallUv.y / 150.0 - waterTime * 0.03)).a,
          texture2D(fallPatterns, vec2(vFallUv.x / 27.0 + 0.5, vFallUv.y / 120.0 - waterTime * 0.04 + 0.3)).a,
          texture2D(fallPatterns, vec2(vFallUv.x / 37.0 + 0.2, vFallUv.y / 170.0 - waterTime * 0.025 + 0.6)).a,
          texture2D(fallPatterns, vec2(vFallUv.x / 23.0 + 0.7, vFallUv.y / 110.0 - waterTime * 0.035 + 0.1)).a
        );
        mask = pow(mask, vec4(4.0));
        float pattern = dot(mask, vec4(ropes, sheet, spray, veil)) / max(0.0001, dot(mask, vec4(1.0)));
        float foot = smoothstep(0.55, 1.0, vFallUv.w);
        float glassy = 1.0 - smoothstep(0.0, 0.12, vFallUv.w);
        float body = max(glassy, smoothstep(0.28 + 0.12 * foot, 0.5 + 0.1 * foot, pattern));
        // Ragged at its edges.
        float edge = 1.0 - smoothstep(0.5 + 0.4 * (spray - 0.5), 1.0, abs(vFallUv.z));
        float white = max(smoothstep(0.45, 0.8, pattern), foot * (0.6 + 0.4 * speck));
        white *= 1.0 - 0.7 * glassy;
        diffuseColor.rgb = mix(vec3(0.3, 0.48, 0.64), diffuseColor.rgb, 0.3 + 0.7 * white);
        diffuseColor.a *= (0.4 + 0.6 * white) * body * edge;`,
      );
  };

  const foam = new THREE.MeshLambertMaterial({ color: 0xf0f6fb, transparent: true, depthWrite: false });
  foam.customProgramCacheKey = () => "waterfall-foam";
  foam.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { waterNoise: { value: noise }, waterTime });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 fallUv;\nvarying vec3 vFallUv;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFallUv = fallUv;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D waterNoise;\nuniform float waterTime;\nvarying vec3 vFallUv;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        // Churn spreading out from the middle, slid in two phases like running water's ripples.
        vec2 away = normalize(vFallUv.xy + 0.001) * 6.0;
        float phase = fract(waterTime / 1.5);
        float other = fract(phase + 0.5);
        float a = mix(texture2D(waterNoise, (vFallUv.xy - away * phase) / 9.0).g, texture2D(waterNoise, (vFallUv.xy - away * other) / 9.0 + 0.5).g, abs(1.0 - 2.0 * phase));
        float b = texture2D(waterNoise, (vFallUv.xy + vec2(waterTime * 2.3, -waterTime * 1.7)) / 4.0 + 0.27).r;
        float churn = smoothstep(0.4, 0.58, 0.6 * a + 0.4 * b);
        diffuseColor.a *= churn * (1.0 - smoothstep(0.45, 1.0, vFallUv.z));`,
      );
  };

  const mist = new THREE.PointsMaterial({ color: 0xffffff, size: MIST.sizeFt, map: puffTexture(), transparent: true, opacity: 0.32, depthWrite: false });
  mist.customProgramCacheKey = () => "waterfall-mist";
  mist.onBeforeCompile = (shader) => {
    shader.uniforms.waterTime = waterTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 mist;\nuniform float waterTime;\nvarying float vMistFade;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float age = fract(waterTime / ${f(MIST.cycleS)} + mist.x);
        transformed.y += age * mist.y;
        vMistFade = sin(age * 3.14159);`,
      )
      .replace("gl_PointSize = size;", "gl_PointSize = size * (0.6 + 0.8 * age);");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vMistFade;")
      // Unlit, so dimmed by hand with the sky's light, where sky.js lights the fog.
      .replace("#include <alphatest_fragment>", "diffuseColor.a *= vMistFade;\n#if defined(USE_FOG) && defined(SKY_LIT)\ndiffuseColor.rgb *= skyLight;\n#endif\n#include <alphatest_fragment>");
  };

  return { curtain, foam, mist };
}

// A soft round puff, white with alpha falling off from the middle.
function puffTexture() {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
      const k = (y * size + x) * 4;
      data.set([255, 255, 255, Math.round(255 * Math.max(0, 1 - d) ** 2)], k);
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.needsUpdate = true;
  return texture;
}

// Falling water's four patterns, one in each channel, each wrapping round: ropes, long streams
// straight down; sheet, smooth water torn by holes; spray, specks; and veil, soft cloud.
function fallTexture() {
  const size = 256;
  const rand = (n) => {
    const v = Math.sin(n * 12.9898) * 43758.5453;
    return v - Math.floor(v);
  };
  // Value noise, 0-1, of `cells` cells across and `down` cells down, wrapping round.
  const noise = (x, y, cells, seed, down = cells) => {
    const [gx, gy] = [(x / size) * cells, (y / size) * down];
    const [ix, iy] = [Math.floor(gx), Math.floor(gy)];
    const [fx, fy] = [gx - ix, gy - iy];
    const at = (i, j) => rand(((i % cells) + cells) % cells + (((j % down) + down) % down) * 131 + seed * 7919);
    const [sx, sy] = [fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)];
    const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx;
    const bottom = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
    return top + (bottom - top) * sy;
  };
  const fbm = (x, y, cells, seed, octaves) => {
    let [sum, amp, norm] = [0, 1, 0];
    for (let o = 0; o < octaves; o++) {
      sum += noise(x, y, cells << o, seed + o) * amp;
      norm += amp;
      amp /= 2;
    }
    return sum / norm;
  };
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Ropes: noise stretched down, wobbling a little side to side.
      const wobble = (noise(x, y, 4, 1) - 0.5) * 12;
      const ropes = fbm(x + wobble, y, 16, 2, 3) * 0.7 + noise(x + wobble, y, 32, 3, 4) * 0.3;
      const ropesV = Math.pow(Math.min(1, Math.max(0, (noise(x + wobble, y, 24, 4, 2) * 0.6 + ropes * 0.4 - 0.25) * 1.8)), 1.3);
      const sheet = Math.min(1, Math.max(0, (fbm(x, y, 6, 5, 3) - 0.32) * 3));
      const spray = Math.pow(fbm(x, y, 48, 6, 2), 3) * 2.2;
      const veil = fbm(x, y, 4, 7, 4);
      const k = (y * size + x) * 4;
      data.set([ropesV, sheet, Math.min(1, spray), veil].map((v) => Math.round(255 * v)), k);
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
