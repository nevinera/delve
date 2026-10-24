import * as THREE from "three";

// One Lambert material for all terrain, patched to blend the ground
// textures from per-vertex splat weights (aSplatA = grass, dirt, sand,
// road; aSplatB = mud, moss, swamp-ness; rock is whatever's left), with
// triplanar rock on steep slopes, underwater tint, shoreline foam and an
// optional nav overlay.
export function makeTerrainMaterial(textures, world) {
  const uniforms = {
    tGrass: {value: textures.grass},
    tDirt: {value: textures.dirt},
    tSand: {value: textures.sand},
    tRock: {value: textures.rock},
    tRoad: {value: textures.road},
    tMud: {value: textures.mud},
    tMoss: {value: textures.moss},
    uWaterY: {value: world.waterLevel},
    uTime: {value: 0},
    tNav: {value: null},
    uNavOn: {value: 0},
    uWorldSize: {value: new THREE.Vector2(world.widthFt, world.depthFt)},
  };
  const material = new THREE.MeshLambertMaterial({color: 0xffffff});
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
attribute vec4 aSplatA;
attribute vec4 aSplatB;
varying vec3 vWPos;
varying vec3 vWNormal;
varying vec4 vSplatA;
varying vec4 vSplatB;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vSplatA = aSplatA;
vSplatB = aSplatB;`)
      .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>
vWNormal = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
uniform sampler2D tGrass, tDirt, tSand, tRock, tRoad, tMud, tMoss, tNav;
uniform float uWaterY, uTime, uNavOn;
uniform vec2 uWorldSize;
varying vec3 vWPos;
varying vec3 vWNormal;
varying vec4 vSplatA;
varying vec4 vSplatB;

float tHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float tNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(tHash(i), tHash(i + vec2(1, 0)), f.x), mix(tHash(i + vec2(0, 1)), tHash(i + vec2(1, 1)), f.x), f.y);
}
vec3 triplanar(sampler2D t, vec3 p, vec3 n, float s) {
  vec3 b = pow(abs(n), vec3(4.0));
  b /= (b.x + b.y + b.z);
  return texture2D(t, p.zy * s).rgb * b.x + texture2D(t, p.xz * s).rgb * b.y + texture2D(t, p.xy * s).rgb * b.z;
}
vec3 terrainColor() {
  vec2 uv = vWPos.xz / 16.0;
  vec3 n = normalize(vWNormal);
  float rockW = max(0.0, 1.0 - dot(vSplatA, vec4(1.0)) - vSplatB.x - vSplatB.y);
  vec3 rock = triplanar(tRock, vWPos, n, 1.0 / 20.0);
  vec3 c = texture2D(tGrass, uv).rgb * vSplatA.x
         + texture2D(tDirt, uv).rgb * vSplatA.y
         + texture2D(tSand, uv).rgb * vSplatA.z
         + texture2D(tRoad, uv).rgb * vSplatA.w
         + texture2D(tMud, uv).rgb * vSplatB.x
         + texture2D(tMoss, uv).rgb * vSplatB.y
         + rock * rockW;
  c = mix(c, rock, smoothstep(0.36, 0.58, 1.0 - n.y));

  float swamp = vSplatB.z;
  c = mix(c, c * vec3(0.62, 0.66, 0.42), swamp * 0.85);
  c *= 0.86 + 0.28 * tNoise(vWPos.xz / 90.0);

  float depth = uWaterY - vWPos.y;
  vec3 deep = mix(vec3(0.02, 0.09, 0.12), vec3(0.06, 0.06, 0.02), swamp);
  c = mix(c, deep, clamp(depth / 7.0, 0.0, 0.88) * step(0.0, depth));
  float foam = (1.0 - smoothstep(0.0, 0.7, abs(depth + 0.15))) * (1.0 - swamp * 0.85);
  foam *= 0.55 + 0.45 * sin(vWPos.x * 0.6 + uTime * 1.3) * sin(vWPos.z * 0.5 - uTime * 0.9);
  c = mix(c, vec3(0.85), foam * 0.6);

  if (uNavOn > 0.5) {
    vec4 nav = texture2D(tNav, vWPos.xz / uWorldSize);
    c = mix(c, nav.rgb, nav.a);
  }
  return c;
}`)
      .replace("#include <color_fragment>", `#include <color_fragment>
diffuseColor.rgb *= terrainColor();`);
  };
  material.userData.uniforms = uniforms;
  return material;
}
