import * as THREE from "three";
import { repeatingTexture } from "./effectTextures.js";
import { fadeAt, isShapeEffect, shapeSpec } from "./shapeStock.js";

// The stock visuals, small three.js groups. Most are shapes with a texture scrolling across them
// (shapeStock.js), and an arrow is just solid. makeVisual gives { group, length, update }, and
// update(u) draws it u of the way through its length, 0 to 1. A `from` and `to` in feet, for beams,
// reach between two points; the rest stand where the group's put.

const VERTEX = `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vUv = uv;
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
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec2 at = vUv * uRepeat + uScroll * uTime;
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
  gl_FragColor = vec4(gl_FragColor.rgb * alpha, alpha * 0.3);
}`;

function shapeMaterial(layer, [main, trim]) {
  return new THREE.ShaderMaterial({
    vertexShader: VERTEX,
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

// A flat band round a point in the xy plane, x going along it and y going out from `inner` to 1.
function bandGeometry(inner, start, sweep, segments = 48) {
  const [positions, uvs, indices] = [[], [], []];
  for (let n = 0; n <= segments; n++) {
    const u = n / segments;
    const angle = start + sweep * u;
    for (const [v, r] of [[0, inner], [1, 1]]) {
      positions.push(Math.cos(angle) * r, Math.sin(angle) * r, 0);
      uvs.push(u, v);
    }
    if (n < segments) indices.push(n * 2, n * 2 + 1, n * 2 + 2, n * 2 + 1, n * 2 + 3, n * 2 + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(positions.map((_, k) => (k % 3 === 2 ? 1 : 0)), 3));
  geometry.setIndex(indices);
  return geometry;
}

// A shape with a radius of 1, and its length along the way it reaches: a cylinder's up y from its
// foot, and a cone's along z from its point. A ring lies flat, and an arc stands facing z.
function shapeGeometry({ shape, inner = 0.7, start = 0, sweep = Math.PI * 2 }) {
  if (shape === "cylinder") return new THREE.CylinderGeometry(1, 1, 1, 32, 1, true).translate(0, 0.5, 0);
  if (shape === "cone") return new THREE.ConeGeometry(1, 1, 24, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2);
  if (shape === "ring") return bandGeometry(inner, 0, Math.PI * 2).rotateX(-Math.PI / 2);
  if (shape === "arc") return bandGeometry(inner, start, sweep);
  return new THREE.SphereGeometry(1, 24, 16);
}

const between = (radius, u) => (Array.isArray(radius) ? radius[0] + (radius[1] - radius[0]) * u : radius);

// Sizes a shape: a radius across, and a length that way too unless it has one of its own.
function sized(mesh, { shape }, radius, length) {
  if (shape === "cylinder") mesh.scale.set(radius, length ?? radius * 2, radius);
  else if (shape === "cone") mesh.scale.set(radius, radius, length ?? radius * 4);
  else mesh.scale.setScalar(radius);
}

function makeShapes(name, { colors, scale, height, from, to, params, follow }) {
  const spec = shapeSpec(name, params);
  const group = new THREE.Group();
  const holder = new THREE.Group();
  group.add(holder);
  group.position.y = spec.raise ?? (spec.rise ? spec.rise * height : 0);
  const reach = from && to ? new THREE.Vector3(...from).distanceTo(new THREE.Vector3(...to)) : null;
  if (name === "beam" && reach !== null) {
    // A beam's cylinders lie along the way from one point to the other.
    holder.position.fromArray(from);
    holder.lookAt(new THREE.Vector3(...to));
    holder.rotateX(Math.PI / 2);
  }
  const shapes = spec.layers.map((layer) => {
    const beam = name === "beam" && reach !== null;
    // A beam's texture repeats by its length, so it doesn't stretch.
    const fitted = beam ? { ...layer, repeat: [layer.repeat[0], layer.repeat[1] * reach] } : layer;
    const mesh = new THREE.Mesh(shapeGeometry(layer), shapeMaterial(fitted, colors));
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    holder.add(mesh);
    const across = (u) => between(layer.radius, u) * (layer.bodies ? height : 1) * scale;
    const length = beam ? reach : layer.long ? layer.long * scale : layer.tall ? layer.tall * height : null;
    return { layer, mesh, across, length };
  });
  return {
    group,
    length: spec.duration,
    update: (u) => {
      if (follow) group.position.copy(follow.position);
      const grown = spec.grow ? 0.4 + 0.6 * Math.min(1, u / spec.grow) : 1;
      for (const { layer, mesh, across, length } of shapes) {
        sized(mesh, layer, across(u) * grown, length && length * grown);
        mesh.material.uniforms.uTime.value = u * spec.duration;
        mesh.material.uniforms.uOpacity.value = layer.opacity * fadeAt(spec.fade, u);
      }
      if (name === "slash") holder.rotation.z = -1.2 + 2.4 * u;
      if (name === "bolt") holder.scale.setScalar(1 + 0.12 * Math.sin(u * 40));
    },
  };
}

function makeArrow({ colors: [main, trim], scale }) {
  const material = (color) => new THREE.MeshBasicMaterial({ color });
  const group = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * scale, 0.05 * scale, 2.4 * scale, 6).rotateX(Math.PI / 2), material(main));
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.14 * scale, 0.4 * scale, 8).rotateX(Math.PI / 2).translate(0, 0, 1.3 * scale), material(trim));
  group.add(shaft, tip);
  return { group, length: 1, update: () => {} };
}

export const hasVisual = (name) => name === "arrow" || isShapeEffect(name);

// A stock visual. options: colors, [main, trim]; scale; height, of what it stands on, in feet; from
// and to for a beam, as [x, y, z]; follow, a thing to stay on; and params, what the ability sets
// (shapeStock.js).
export function makeVisual(name, { colors = ["#ffffff", "#ffffff"], scale = 1, height = 6, from, to, params, follow } = {}) {
  const options = { colors, scale, height, from, to, params, follow };
  const made = name === "arrow" ? makeArrow(options) : makeShapes(isShapeEffect(name) ? name : "burst", options);
  made.update(0);
  return made;
}

export function disposeVisual({ group }) {
  group.parent?.remove(group);
  group.traverse((node) => {
    node.geometry?.dispose();
    node.material?.dispose();
  });
}
