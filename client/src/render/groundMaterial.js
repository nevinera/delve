import * as THREE from "three";
import { groundCells } from "./terrainMesh.js";

// The ground's material: its vertex colors broken up by a grainy noise texture laid flat across
// the world at three scales, so slopes and distances read at eye level.
//
// Tiles drawn in full also get a pattern for each kind of ground (grass blades, pebbly dirt,
// cracked rock, leaf litter under forest and so on), blended between cells the way the vertex
// colors are. A pattern only changes the light and shade of the color under it, and it fades out
// with distance before it would shimmer.
//
// Ground the caves draw round a mouth (caveMesh.js) takes on the rock's look toward its lip
// (groundRock, 1 at the lip): the rock's color (groundStone), its pattern fading and the rock's
// grain coming in, halfway at the lip, give or take a noise (lipNoise) the rock shares
// (caveMaterial.js).
//
// Footpaths, trails and roads (v2/roads.js) are drawn over that from their middles (the tile's
// roads), so their surface and edges are sharp, finer than the cells: packed earth, patchy and
// covered in hoof and foot prints. Roads are paler and more trodden, with wheel ruts; trails have
// fainter ruts; footpaths have none, and their edges fray into the ground beside them.

const SIZE = 256;
export const PATTERN_PX = SIZE;
const SCALES_FT = [9, 48, 210]; // how far each layer's texture stretches
const PATTERN_FADE_FT = [500, 1100];
// A pattern for each kind of ground the generator paints (world/generator.js's TERRAIN), and leaf
// litter for under trees.
// Each stretches this many feet before it repeats.
export const PATTERN_FT = { grass: 12, dirt: 14, sand: 16, rock: 30, path: 12, shore: 16, mud: 24, moss: 16, litter: 12, snow: 22, ice: 34, ash: 16, cracked: 20 };
const PATTERNS = Object.keys(PATTERN_FT);
const LITTER = PATTERNS.indexOf("litter");
const PATH = PATTERNS.indexOf("path");
const layerOf = (name) => Math.max(0, PATTERNS.indexOf(name));
const MAX_ROAD_SEGMENTS = 96; // per tile; any past this are left out
const KIND_SHADES = { footpath: 0, trail: 0.5, road: 1, highway: 1 }; // how roadKinds tells kinds apart

let detail = null;
let patterns = null;

// With `tile` (and its neighbours, and the scene origin), the material for that tile drawn in full,
// with its ground patterns; without, the plain one shared by every far tile.
export function groundMaterial(renderer, { tile, neighbours, origin } = {}) {
  detail ??= detailTexture(renderer);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  let cells = null;
  if (tile) {
    patterns ??= patternTexture(renderer);
    const { data, side, corner } = groundCells(tile, neighbours, origin, layerOf);
    cells = new THREE.DataTexture(data, side, side, THREE.RGFormat, THREE.UnsignedByteType);
    cells.needsUpdate = true;
    material.userData.cells = cells;
    material.userData.uniforms = { groundCells: { value: cells }, groundCorner: { value: new THREE.Vector2(...corner) }, groundSide: { value: side } };
    material.defines = { GROUND_PATTERNS: "" };
    const segments = roadSegments(tile, origin);
    if (segments) {
      Object.assign(material.userData.uniforms, segments);
      material.defines.GROUND_ROADS = "";
    }
  }
  const roads = Boolean(material.defines?.GROUND_ROADS);
  material.customProgramCacheKey = () => (cells ? (roads ? "ground-roads" : "ground-patterns") : "ground");
  material.onBeforeCompile = (shader) => {
    shader.uniforms.groundDetail = { value: detail };
    if (cells) Object.assign(shader.uniforms, material.userData.uniforms, { groundPatterns: { value: patterns } });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float groundRock;\nattribute vec3 groundStone;\nvarying vec3 vGroundStone;\nvarying vec2 vGroundXZ;\nvarying vec3 vGroundAt;\nvarying float vGroundRock;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGroundAt = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvGroundXZ = vGroundAt.xz;\nvGroundRock = groundRock;\nvGroundStone = groundStone;");
    const [fine, mid, broad] = SCALES_FT.map((ft) => (1 / ft).toFixed(5));
    const cellFt = (tile?.cellFt ?? 1).toFixed(1);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform sampler2D groundDetail;
        varying vec2 vGroundXZ;
        varying vec3 vGroundAt;
        varying float vGroundRock;
        varying vec3 vGroundStone;
        // The grain of jagged cave rock (caveMaterial.js's caveStone), about 0 to 1.
        float rockHash(vec3 p) {
          p = fract(p * 0.3183099 + 0.1);
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }
        float rockNoise(vec3 x) {
          vec3 i = floor(x);
          vec3 f = fract(x);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(rockHash(i), rockHash(i + vec3(1, 0, 0)), f.x), mix(rockHash(i + vec3(0, 1, 0)), rockHash(i + vec3(1, 1, 0)), f.x), f.y),
            mix(mix(rockHash(i + vec3(0, 0, 1)), rockHash(i + vec3(1, 0, 1)), f.x), mix(rockHash(i + vec3(0, 1, 1)), rockHash(i + vec3(1, 1, 1)), f.x), f.y),
            f.z);
        }
// How far, give or take, the blend between a mouth's rock and the ground round it strays at p
// (the same in groundMaterial.js and caveMaterial.js, so they agree at the lip): about -0.7 to 0.7.
float lipNoise( vec3 p ) {
  return ( 0.65 * rockNoise( p * 0.45 ) + 0.35 * rockNoise( p * 1.3 ) - 0.5 ) * 1.4;
}
        float rockGrain(vec3 p) {
          float sum = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 4; i++) {
            sum += amp * rockNoise(p);
            p *= 2.03;
            amp *= 0.5;
          }
          return sum / 0.9375;
        }
        #ifdef GROUND_PATTERNS
        uniform highp sampler2DArray groundPatterns;
        uniform sampler2D groundCells;
        uniform vec2 groundCorner;
        uniform float groundSide;
        #ifdef GROUND_ROADS
        uniform vec4 roadSegments[${MAX_ROAD_SEGMENTS}];
        uniform vec2 roadKinds[${MAX_ROAD_SEGMENTS}];
        uniform int roadCount;
        #endif
        const float PATTERN_SCALE[${PATTERNS.length}] = float[](${PATTERNS.map((name) => (1 / PATTERN_FT[name]).toFixed(5)).join(", ")});
        // A vertex's pattern at scene position xz, and its forest cover in w.
        vec4 groundAt(vec2 cell, vec2 xz) {
          vec2 kind = texture(groundCells, (cell + 0.5) / groundSide).rg;
          int layer = int(kind.r * 255.0 + 0.5);
          return vec4(texture(groundPatterns, vec3(xz * PATTERN_SCALE[layer], float(layer))).rgb, kind.g);
        }
        #endif`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float toRock = 0.0;
        if (vGroundRock > 0.0) {
          toRock = clamp(vGroundRock * (0.5 + lipNoise(vGroundAt)), 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuse * vGroundStone, toRock);
        }
        float grain = texture2D(groundDetail, vGroundXZ * ${fine}).r;
        float blotch = texture2D(groundDetail, vGroundXZ * ${mid} + 0.31).g;
        float sweep = texture2D(groundDetail, vGroundXZ * ${broad} + 0.67).g;
        #ifdef GROUND_PATTERNS
        float near = 1.0 - smoothstep(${PATTERN_FADE_FT[0].toFixed(1)}, ${PATTERN_FADE_FT[1].toFixed(1)}, length(vViewPosition));
        if (near > 0.0) {
          vec2 at = clamp((vGroundXZ - groundCorner) / ${cellFt}, 0.0, groundSide - 1.0);
          vec2 cell = min(floor(at), groundSide - 2.0);
          vec2 f = at - cell;
          vec2 xz = vGroundXZ;
          vec4 g = mix(mix(groundAt(cell, xz), groundAt(cell + vec2(1.0, 0.0), xz), f.x), mix(groundAt(cell + vec2(0.0, 1.0), xz), groundAt(cell + 1.0, xz), f.x), f.y);
          vec3 pattern = mix(g.rgb, texture(groundPatterns, vec3(xz * PATTERN_SCALE[${LITTER}], ${LITTER}.0)).rgb, smoothstep(0.1, 0.6, g.w));
          diffuseColor.rgb *= mix(vec3(1.0), pattern * 2.0, near * max(0.0, 1.0 - 2.0 * toRock));
          grain = mix(grain, 0.5, near);
        }
        #endif
        diffuseColor.rgb *= 0.6 + 0.3 * grain + 0.35 * blotch + 0.25 * sweep;
        if (toRock > 0.0) diffuseColor.rgb *= 1.0 + 0.4 * (rockGrain(vGroundAt * 1.1) - 0.5) * toRock;
        #ifdef GROUND_ROADS
        {
          // The nearest road, by how far inside its edge this is (negative outside).
          float inward = -1e9;
          float across = 0.0;
          float kind = 0.0; // 0 a footpath, 0.5 a trail, 1 a road
          for (int i = 0; i < ${MAX_ROAD_SEGMENTS}; i++) {
            if (i >= roadCount) break;
            vec4 seg = roadSegments[i];
            vec2 ab = seg.zw - seg.xy;
            float t = clamp(dot(vGroundXZ - seg.xy, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
            float fromMiddle = length(vGroundXZ - seg.xy - ab * t);
            float d = roadKinds[i].x - fromMiddle;
            if (d > inward) {
              inward = d;
              across = roadKinds[i].x;
              kind = roadKinds[i].y;
            }
          }
          // A footpath's edge frays, wandering in and out by up to a foot.
          float fray = (1.0 - kind) * (texture2D(groundDetail, vGroundXZ * 0.4 + 0.31).g - 0.5) * 2.0;
          float aa = fwidth(inward) + 0.05 + 0.4 * (1.0 - kind);
          float on = smoothstep(-aa, aa, inward + fray);
          if (on > 0.0) {
            vec2 p = vGroundXZ;
            // Packed earth: the ground's dirt pattern over broad damp and dry patches, paler and
            // more trodden on highways.
            vec3 dirt = texture(groundPatterns, vec3(p * PATTERN_SCALE[${PATH}], ${PATH}.0)).rgb * 2.0;
            float patches = texture2D(groundDetail, p * 0.035 + 0.41).g;
            float mottle = texture2D(groundDetail, p * 0.16 + 0.23).g;
            vec3 earth = mix(vec3(0.42, 0.32, 0.21), vec3(0.58, 0.47, 0.33), smoothstep(0.3, 0.7, patches));
            earth = mix(earth, vec3(0.62, 0.55, 0.43), 0.45 * step(0.75, kind));
            earth *= dirt * (0.85 + 0.3 * mottle);
            // Wheel ruts, wandering a little, a third of the way in from each edge.
            float wander = (texture2D(groundDetail, p * 0.02 + 0.77).g - 0.5) * 1.6;
            float rut = 1.0 - smoothstep(0.2, 1.0, abs(inward - across * 0.35 + wander));
            rut *= smoothstep(0.25, 0.5, kind) * (0.5 + 0.5 * step(0.75, kind));
            earth *= 1.0 - 0.1 * rut;
            // Hoof and foot prints: small dark dents, thickest down the middle and in the ruts.
            float trodden = 0.5 + 0.5 * smoothstep(0.2, 0.8, inward / across) + rut;
            float prints = smoothstep(0.66, 0.72, texture2D(groundDetail, p * 0.55 + 0.13).r) + smoothstep(0.68, 0.74, texture2D(groundDetail, p.yx * 0.9 + 0.58).r);
            earth *= 1.0 - 0.32 * min(1.0, prints * trodden);
            // A darker lip along the edge, so the border reads.
            earth *= 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.7, inward));
            diffuseColor.rgb = mix(diffuseColor.rgb, earth, on);
          }
        }
        #endif`,
      );
  };
  return material;
}

// A tile's roads (tile.roads) as uniforms: each segment's ends in scene feet, and its road's half
// width and kind, 0 for a footpath, 0.5 a trail and 1 a road. Null without any.
function roadSegments(tile, origin) {
  const list = (tile.roads ?? []).flatMap(({ kind, half, segments }) => segments.map((s) => ({ s, kind, half }))).slice(0, MAX_ROAD_SEGMENTS);
  if (!list.length) return null;
  const [ox, oz] = origin;
  const pad = (make) => Array.from({ length: MAX_ROAD_SEGMENTS }, (_, i) => (list[i] ? make(list[i]) : make(null)));
  return {
    roadSegments: { value: pad((r) => (r ? new THREE.Vector4(r.s[0] - ox, r.s[1] - oz, r.s[2] - ox, r.s[3] - oz) : new THREE.Vector4())) },
    roadKinds: { value: pad((r) => new THREE.Vector2(r?.half ?? 0, KIND_SHADES[r?.kind] ?? 0)) },
    roadCount: { value: list.length },
  };
}

// The grainy noise texture the ground uses, shared with anything else that wants some: speckle in
// red, soft blotches in green.
export function noiseTexture(renderer) {
  detail ??= detailTexture(renderer);
  return detail;
}

// Frees a tile's material and its cells.
export function disposeGround(material) {
  material.userData.cells?.dispose();
  material.dispose();
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

// The ground patterns, a layer each in PATTERNS order. Each pixel is a factor on the ground's color,
// stored halved (128 leaves it as it is), and each layer averages about 1 in brightness.
function patternTexture(renderer) {
  const px = SIZE * SIZE;
  const data = new Uint8Array(px * 4 * PATTERNS.length);
  PATTERNS.forEach((name, layer) => {
    const rgb = patternFactors(name);
    for (let k = 0; k < px; k++) {
      for (let c = 0; c < 3; c++) data[(layer * px + k) * 4 + c] = Math.min(255, Math.round(rgb[k * 3 + c] * 127.5));
      data[(layer * px + k) * 4 + 3] = 255;
    }
  });
  const texture = new THREE.DataArrayTexture(data, SIZE, SIZE, PATTERNS.length);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.needsUpdate = true;
  return texture;
}

// One ground pattern's RGB factors on a PATTERN_PX square spanning its PATTERN_FT, averaging 1 in
// brightness.
export function patternFactors(name) {
  const rgb = PAINT[name](new Canvas(SIZE, PATTERNS.indexOf(name) + 1));
  let sum = 0;
  for (let k = 0; k < SIZE * SIZE; k++) sum += 0.3 * rgb[k * 3] + 0.59 * rgb[k * 3 + 1] + 0.11 * rgb[k * 3 + 2];
  const scale = (SIZE * SIZE) / sum;
  return rgb.map((v) => v * scale);
}

// A square of RGB factors that wraps at its edges, to paint patterns on.
export class Canvas {
  constructor(size, seed) {
    this.size = size;
    this.rgb = new Float32Array(size * size * 3).fill(1);
    this.seed = seed * 7919;
    this.n = 0;
  }

  // A steady random number, 0-1.
  random() {
    return hash(this.n++, this.seed);
  }

  noise(periods, salt = 0) {
    return valueNoise(this.size, periods, this.seed + salt);
  }

  // Multiplies every pixel by `f(k)` (a number, or [r, g, b]).
  each(f) {
    for (let k = 0; k < this.size * this.size; k++) {
      const v = f(k);
      for (let c = 0; c < 3; c++) this.rgb[k * 3 + c] *= Array.isArray(v) ? v[c] : v;
    }
  }

  // Sets the pixels of an ellipse at (x, y), radii rx and ry, turned by `angle`, to `color`.
  blob(x, y, rx, ry, angle, color) {
    const reach = Math.ceil(Math.max(rx, ry));
    const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const u = (dx * cos + dy * sin) / rx;
        const v = (-dx * sin + dy * cos) / ry;
        if (u * u + v * v > 1) continue;
        const k = this.at(x + dx, y + dy);
        this.rgb.set(color, k * 3);
      }
    }
  }

  // Multiplies the pixels along a line from (x, y), `length` long at `angle`, by `color`.
  stroke(x, y, length, angle, color) {
    for (let s = 0; s <= length; s += 0.5) {
      const k = this.at(x + Math.cos(angle) * s, y + Math.sin(angle) * s);
      for (let c = 0; c < 3; c++) this.rgb[k * 3 + c] *= color[c];
    }
  }

  at(x, y) {
    const n = this.size;
    return (((Math.round(y) % n) + n) % n) * n + (((Math.round(x) % n) + n) % n);
  }

  // Distance to the nearest of `count` scattered points, and to the second nearest, at each pixel.
  cells(count) {
    const n = this.size;
    const points = Array.from({ length: count }, () => [this.random() * n, this.random() * n]);
    const near = new Float32Array(n * n);
    const second = new Float32Array(n * n);
    const id = new Uint16Array(n * n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        let [d1, d2, best] = [Infinity, Infinity, 0];
        points.forEach(([px, py], p) => {
          const dx = Math.min(Math.abs(x - px), n - Math.abs(x - px));
          const dy = Math.min(Math.abs(y - py), n - Math.abs(y - py));
          const d = Math.hypot(dx, dy);
          if (d < d1) [d2, d1, best] = [d1, d, p];
          else if (d < d2) d2 = d;
        });
        [near[y * n + x], second[y * n + x], id[y * n + x]] = [d1, d2, best];
      }
    }
    return { near, second, id, shade: (p) => hash(p, this.seed + 5) };
  }
}

// How each pattern is painted, on a 256px canvas that spans its PATTERN_FT.
const PAINT = {
  grass: (c) => {
    const tufts = c.noise([8, 16], 1);
    c.each((k) => 0.8 + 0.4 * tufts[k]);
    for (let n = 0; n < 9000; n++) {
      const light = c.random() < 0.5;
      const tint = light ? [1.18, 1.15, 0.95] : [0.8, 0.84, 0.8];
      c.stroke(c.random() * c.size, c.random() * c.size, 3 + c.random() * 7, c.random() * Math.PI * 2, tint);
    }
    return c.rgb;
  },
  dirt: (c) => {
    const lumps = c.noise([8, 16, 32], 1);
    const speck = c.noise([64, 128], 2);
    c.each((k) => 0.75 + 0.35 * lumps[k] + 0.25 * speck[k]);
    pebbles(c, 260, [1, 3]);
    return c.rgb;
  },
  sand: (c) => {
    const speck = c.noise([128], 1);
    const warp = c.noise([4, 8], 2);
    c.each((k) => {
      const y = Math.floor(k / c.size);
      const ripple = Math.sin((y / c.size) * Math.PI * 2 * 9 + warp[k] * 6);
      return 0.95 + 0.04 * ripple + 0.12 * speck[k];
    });
    return c.rgb;
  },
  rock: (c) => {
    // Weathered stone: broad light and dark patches, grit, lichen, and a few cracks that wander
    // off rather than outlining slabs.
    const { near, second } = c.cells(14);
    const patches = c.noise([4, 8, 16], 1);
    const grit = c.noise([64, 128], 2);
    const reach = c.noise([8, 16], 3);
    const lichen = c.noise([16, 32], 4);
    c.each((k) => {
      const crack = (1 - smooth(Math.min(1, (second[k] - near[k]) / 2.5))) * smooth(Math.min(1, Math.max(0, (reach[k] - 0.5) * 5)));
      const spot = smooth(Math.min(1, Math.max(0, (lichen[k] - 0.66) * 6)));
      const tone = (0.7 + 0.5 * patches[k] + 0.25 * grit[k]) * (1 - 0.45 * crack);
      return [tone * (1 + 0.08 * spot), tone * (1 + 0.12 * spot), tone * (1 - 0.06 * spot)];
    });
    return c.rgb;
  },
  path: (c) => {
    const lumps = c.noise([8, 16], 1);
    const speck = c.noise([64, 128], 2);
    c.each((k) => 0.85 + 0.2 * lumps[k] + 0.2 * speck[k]);
    pebbles(c, 500, [1, 2.5]);
    return c.rgb;
  },
  shore: (c) => {
    const speck = c.noise([128], 1);
    const damp = c.noise([4, 8], 2);
    c.each((k) => 0.85 + 0.15 * speck[k] + 0.2 * damp[k]);
    pebbles(c, 400, [1.5, 4]);
    return c.rgb;
  },
  mud: (c) => {
    // Dark wet hollows with a sheen, between drier lumps.
    const pools = c.noise([4, 8, 16], 1);
    const lumps = c.noise([16, 32], 2);
    const speck = c.noise([128], 3);
    c.each((k) => {
      const wet = smooth(Math.min(1, Math.max(0, (pools[k] - 0.5) * 4)));
      const sheen = wet * smooth(Math.min(1, Math.max(0, (lumps[k] - 0.6) * 4)));
      return (0.9 + 0.25 * lumps[k] + 0.1 * speck[k]) * (1 - 0.3 * wet) + 0.35 * sheen;
    });
    return c.rgb;
  },
  moss: (c) => {
    // Soft cushions with fine fuzz, darker in the gaps between them.
    const clumps = c.noise([16, 32], 1);
    const fuzz = c.noise([64, 128], 2);
    c.each((k) => {
      const top = smooth(Math.min(1, Math.max(0, (clumps[k] - 0.3) * 2)));
      const v = 0.75 + 0.35 * top + 0.25 * fuzz[k];
      return [v, v * (1 + 0.08 * top), v * 0.95];
    });
    return c.rgb;
  },
  litter: (c) => {
    const shade = c.noise([8, 16], 1);
    c.each((k) => [0.8 + 0.3 * shade[k], 0.6 + 0.25 * shade[k], 0.45 + 0.2 * shade[k]]);
    const leaves = [
      [1.9, 1.0, 0.5],
      [1.6, 0.85, 0.4],
      [1.3, 0.75, 0.4],
      [2.0, 1.4, 0.55],
      [1.0, 0.95, 0.55],
    ];
    for (let n = 0; n < 1400; n++) {
      const color = leaves[Math.floor(c.random() * leaves.length)].map((v) => v * (0.75 + 0.35 * c.random()));
      c.blob(c.random() * c.size, c.random() * c.size, 3 + c.random() * 3, 1.5 + c.random() * 1.5, c.random() * Math.PI, color);
    }
    return c.rgb;
  },
  snow: (c) => {
    // Soft drifts and a little sparkle.
    const drifts = c.noise([4, 8, 16], 1);
    const grain = c.noise([128], 2);
    c.each((k) => 0.93 + 0.1 * drifts[k] + 0.04 * grain[k]);
    return c.rgb;
  },
  ice: (c) => {
    // Clouded patches with long pale streaks and a few fine cracks.
    const cloud = c.noise([4, 8], 1);
    c.each((k) => [0.9 + 0.2 * cloud[k], 0.92 + 0.16 * cloud[k], 0.96 + 0.08 * cloud[k]]);
    for (let n = 0; n < 60; n++) c.stroke(c.random() * c.size, c.random() * c.size, 30 + c.random() * 90, 0.3 + c.random() * 0.4, [1.14, 1.14, 1.12]);
    for (let n = 0; n < 14; n++) c.stroke(c.random() * c.size, c.random() * c.size, 40 + c.random() * 80, c.random() * Math.PI * 2, [0.78, 0.82, 0.88]);
    return c.rgb;
  },
  ash: (c) => {
    const drifts = c.noise([8, 16], 1);
    const speck = c.noise([128], 2);
    c.each((k) => 0.72 + 0.42 * drifts[k] + 0.3 * speck[k]);
    pebbles(c, 180, [1, 2]);
    return c.rgb;
  },
  cracked: (c) => {
    // Plates of dried crust, dark along the cracks between them.
    const { near, second } = c.cells(70);
    const tone = c.noise([16, 32], 1);
    c.each((k) => (0.92 + 0.18 * tone[k]) * (0.55 + 0.45 * smooth(Math.min(1, (second[k] - near[k]) / 3))));
    return c.rgb;
  },
};

// Small stones, lighter or darker than the ground, each with a shadow on one side.
function pebbles(c, count, [small, big]) {
  for (let n = 0; n < count; n++) {
    const [x, y] = [c.random() * c.size, c.random() * c.size];
    const r = small + c.random() * (big - small);
    const tone = 0.7 + c.random() * 0.8;
    c.blob(x + r * 0.4, y + r * 0.4, r, r * 0.8, 0, [0.55, 0.55, 0.55]);
    c.blob(x, y, r, r * 0.8, c.random() * Math.PI, [tone, tone * 0.97, tone * 0.92]);
  }
}

function hash(n, seed) {
  let h = Math.imul(n ^ seed, 0x27d4eb2d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x165667b1);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
