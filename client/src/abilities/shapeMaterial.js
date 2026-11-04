import * as THREE from "three";
import { repeatingTexture } from "./effectTextures.js";

// How a layer of a shape effect or ribbon looks: a texture scrolling across it (shapeStock.js).

const VERTEX = `
#define FLAT_REPEATS_A_FOOT 0.12
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vView;
varying vec2 vFlat;
void main() {
  vUv = uv;
  vFlat = position.xz * FLAT_REPEATS_A_FOOT;
  vec4 seen = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalMatrix * normal;
  vView = -seen.xyz;
  gl_Position = projectionMatrix * seen;
}`;

const FRAGMENT = `
uniform sampler2D uTexture;
uniform vec3 uColor;
uniform vec3 uHot;
uniform vec2 uRepeat;
uniform vec2 uScroll;
uniform float uTime;
uniform float uOpacity;
uniform float uEdge;
uniform float uRim;
uniform float uTrail;
uniform float uSolid;
uniform float uFlat;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vView;
varying vec2 vFlat;
void main() {
  // A decal can lay its texture flat, rather than round its middle.
  vec2 at = (uFlat > 0.0 ? vFlat : vUv) * uRepeat + uScroll * uTime;
  // A second, slower look at the same texture, so it doesn't read as one image sliding by.
  float shape = texture2D(uTexture, at).r * (0.6 + 0.8 * texture2D(uTexture, at * 0.61 + 0.37 - uScroll * uTime * 0.4).r);
  shape = min(1.0, shape);
  float alpha = shape * uOpacity;
  if (uEdge > 0.0) alpha *= smoothstep(0.0, uEdge, vUv.y) * smoothstep(0.0, uEdge, 1.0 - vUv.y);
  if (uRim > 0.0) alpha *= pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), uRim) * 1.6;
  if (uTrail > 0.0) alpha *= vUv.x;
  if (alpha < 0.002) discard;
  gl_FragColor = vec4(mix(uColor, uHot, smoothstep(0.5, 1.0, shape)), 1.0);
  #include <colorspace_fragment>
  // It mostly adds light, and covers a little of what's behind so it shows against a bright sky.
  gl_FragColor = vec4(gl_FragColor.rgb * alpha, alpha * uSolid);
}`;

export function shapeMaterial(layer, [main, trim], vertexShader = VERTEX) {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader: FRAGMENT,
    uniforms: {
      uTexture: { value: repeatingTexture(layer.texture) },
      uColor: { value: new THREE.Color(layer.color === "trim" ? trim : main) },
      uHot: { value: new THREE.Color(trim) },
      uRepeat: { value: new THREE.Vector2(...layer.repeat) },
      uScroll: { value: new THREE.Vector2(...layer.scroll) },
      uTime: { value: 0 },
      uOpacity: { value: layer.opacity },
      uEdge: { value: layer.edge },
      uRim: { value: layer.rim },
      uTrail: { value: layer.trail ? 1 : 0 },
      uSolid: { value: layer.solid ?? 0.3 },
      uFlat: { value: layer.flat ? 1 : 0 },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
}
