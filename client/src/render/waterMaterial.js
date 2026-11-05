import * as THREE from "three";
import { noiseTexture } from "./groundMaterial.js";

// Fresh water that moves: ripples drift downstream at each vertex's speed (its `flow` attribute,
// from terrainMesh.js waterMesh), and steeper water breaks into foam: smooth drift where it's
// level, ripples on a gentle fall, whitecaps in rapids, and white water down cascades.
//
// The ripples come from a noise texture slid along the flow. Sliding it for long would smear it,
// so it's slid in two phases half a cycle apart, each restarting while the other's showing (the
// usual flow map trick).

const RIPPLE_FT = [26, 9]; // how far each ripple layer stretches
const CYCLE_S = 1.6; // how long each phase slides before it restarts
const DRIFT = [0.35, 0.2]; // ft/s the ripples wander on still water, so lakes shimmer
// Steepness (0-1, the root of the surface's slope) where foam starts and where it covers the water.
const FOAM = [0.15, 0.45];
// Water fades in over this depth at its shore (its `depth` attribute), so the waterline is soft
// rather than showing each kink where the water meets the ground, unless a material says otherwise.
const SHORE_FADE_FT = 1;
// With `deep`: water darker the deeper it is, down to DEEP_FT, and see-through where it's shallow,
// and fast shallow water foams.
const DEEP_FT = [0.5, 8];
const DEEP_DARK = 0.55; // how dark, at its deepest, as a share of its color
const SHALLOW_OPACITY = 0.55; // how opaque it is, at its shallowest, as a share of its opacity
const RUSH = [2, 6]; // ft/s where shallow water starts foaming, and where it foams most

// The clock every moving water material shares (waterfalls.js too), in seconds.
export const waterTime = { value: 0 };
const time = waterTime;

// Moves every water material's ripples on to `seconds`.
export function setWaterTime(seconds) {
  time.value = seconds;
}

// `still` is how far ripples and foam are stilled, 0 to 1, so 1 is frozen flat, and `emissive` is a
// color it gives off, for lava.
export function waterMaterial(renderer, { color, opacity, shoreFadeFt = SHORE_FADE_FT, deep = false, still = 0, emissive = 0 }) {
  const material = new THREE.MeshLambertMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, emissive });
  material.customProgramCacheKey = () => (deep ? "flowing-water-deep" : "flowing-water");
  material.onBeforeCompile = (shader) => {
    shader.uniforms.waterNoise = { value: noiseTexture(renderer) };
    shader.uniforms.waterTime = time;
    shader.uniforms.shoreFade = { value: shoreFadeFt };
    shader.uniforms.waterStill = { value: still };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 flow;\nattribute float depth;\nvarying vec3 vFlow;\nvarying vec2 vWaterXZ;\nvarying float vDepth;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFlow = flow;\nvDepth = depth;\nvWaterXZ = (modelMatrix * vec4(transformed, 1.0)).xz;");
    const f = (n) => n.toFixed(4);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform sampler2D waterNoise;
        uniform float waterTime;
        uniform float shoreFade;
        uniform float waterStill;
        varying vec3 vFlow;
        varying vec2 vWaterXZ;
        varying float vDepth;
        // The ripple layers at xz, slid back along the flow by \`slide\` seconds' worth.
        vec2 ripples(vec2 xz, float slide, float seed) {
          vec2 at = xz - vFlow.xy * slide + vec2(${f(DRIFT[0])}, ${f(DRIFT[1])}) * waterTime + seed;
          return vec2(texture2D(waterNoise, at / ${f(RIPPLE_FT[0])}).g, texture2D(waterNoise, at / ${f(RIPPLE_FT[1])} + 0.37).r);
        }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float phase = fract(waterTime / ${f(CYCLE_S)});
        float other = fract(phase + 0.5);
        float weight = abs(1.0 - 2.0 * phase);
        vec2 r = mix(ripples(vWaterXZ, phase * ${f(CYCLE_S)}, 0.0), ripples(vWaterXZ, other * ${f(CYCLE_S)}, 0.5), weight);
        float ripple = ((r.x - 0.5) * 1.4 + (r.y - 0.5) * 1.0) * (1.0 - waterStill);
        diffuseColor.rgb *= 1.0 + 0.5 * ripple;
        diffuseColor.rgb += vec3(0.22) * smoothstep(0.12, 0.3, ripple); // glints on the crests
        float foamy = smoothstep(${f(FOAM[0])}, ${f(FOAM[1])}, vFlow.z);
        // Whitecaps on the highest ripples at first, and streaks over about half of a cascade.
        ${deep ? `float shallow = 1.0 - smoothstep(${f(DEEP_FT[0])}, ${f(DEEP_FT[1])}, vDepth);
        diffuseColor.rgb *= mix(${f(DEEP_DARK)}, 1.0, shallow);
        diffuseColor.a *= mix(1.0, ${f(SHALLOW_OPACITY)}, shallow * shallow);
        // Fast water over its shallows, at its edges and on its riffles, breaking white.
        foamy = max(foamy, smoothstep(${f(RUSH[0])}, ${f(RUSH[1])}, length(vFlow.xy)) * (1.0 - smoothstep(0.3, 1.5, vDepth)) * 0.8);` : ""}
        float foam = (1.0 - waterStill) * foamy * smoothstep(0.6 - 0.12 * foamy, 0.66 - 0.12 * foamy, 0.6 * r.x + 0.4 * r.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.96, 1.0), foam);
        diffuseColor.a = mix(diffuseColor.a, 1.0, foam);
        diffuseColor.a *= smoothstep(0.0, shoreFade, vDepth);`,
      );
  };
  return material;
}
