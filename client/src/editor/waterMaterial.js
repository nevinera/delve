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
// rather than showing each kink where the water meets the ground.
const SHORE_FADE_FT = 1;

// The clock every moving water material shares (waterfalls.js too), in seconds.
export const waterTime = { value: 0 };
const time = waterTime;

// Moves every water material's ripples on to `seconds`.
export function setWaterTime(seconds) {
  time.value = seconds;
}

export function waterMaterial(renderer, { color, opacity }) {
  const material = new THREE.MeshLambertMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide });
  material.customProgramCacheKey = () => "flowing-water";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.waterNoise = { value: noiseTexture(renderer) };
    shader.uniforms.waterTime = time;
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
        float ripple = (r.x - 0.5) * 1.4 + (r.y - 0.5) * 1.0;
        diffuseColor.rgb *= 1.0 + 0.5 * ripple;
        diffuseColor.rgb += vec3(0.22) * smoothstep(0.12, 0.3, ripple); // glints on the crests
        float foamy = smoothstep(${f(FOAM[0])}, ${f(FOAM[1])}, vFlow.z);
        // Whitecaps on the highest ripples at first, and streaks over about half of a cascade.
        float foam = foamy * smoothstep(0.6 - 0.12 * foamy, 0.66 - 0.12 * foamy, 0.6 * r.x + 0.4 * r.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.96, 1.0), foam);
        diffuseColor.a = mix(diffuseColor.a, 1.0, foam);
        diffuseColor.a *= smoothstep(0.0, ${f(SHORE_FADE_FT)}, vDepth);`,
      );
  };
  return material;
}
