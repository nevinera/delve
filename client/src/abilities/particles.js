import * as THREE from "three";
import { PARTICLE_TEXTURES, SHEET, aimed, sheetBytes } from "./particleStock.js";

// Every particle in a scene, in one draw call: camera-facing quads, each worked out in its vertex
// shader from when and how it was let go, so nothing changes between lets-go. It's a ring: past
// `capacity` the oldest make way. Glowing and solid ones blend in the same call, by premultiplied
// alpha: a glowing one writes no alpha, so it only adds light.

const FLOATS = 24;
export const DESKTOP_PARTICLES = 6000;
export const PHONE_PARTICLES = 1500;
const NEVER = 1e9;
const FADE_OUT_S = 0.15;

const VERTEX = `
attribute vec3 aOrigin;
attribute vec3 aVelocity;
attribute vec4 aMotion; // birth, life, gravity, drag
attribute vec4 aLook; // size, end size, stretch, spin
attribute vec3 aColor;
attribute vec3 aColorEnd;
attribute vec4 aPaint; // opacity, how much it's solid, floor, whether it lies flat
attribute vec4 aCell; // the cell's column, row, a turn to start at, and when it was told to fade out
uniform float uTime;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
varying float vSolid;
void main() {
  float t = uTime - aMotion.x;
  float u = t / aMotion.y;
  float fading = (uTime - aCell.w) / ${FADE_OUT_S};
  if (u < 0.0 || u >= 1.0 || fading >= 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float drag = aMotion.w;
  float carried = drag > 0.001 ? (1.0 - exp(-drag * t)) / drag : t;
  vec3 at = aOrigin + aVelocity * carried;
  at.y -= 0.5 * aMotion.z * t * t;
  at.y = max(at.y, aPaint.z);
  float size = mix(aLook.x, aLook.y, u) * 0.5;
  vec2 corner = position.xy;
  if (aPaint.w > 0.5) {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(at + vec3(corner.x, 0.0, corner.y) * size + vec3(0.0, 0.15, 0.0), 1.0);
    vUv = (aCell.xy + position.xy * 0.5 + 0.5) / vec2(${SHEET.columns}.0, ${SHEET.rows}.0);
    vColor = mix(aColor, aColorEnd, u);
    vAlpha = aPaint.x * smoothstep(0.0, 0.08, u) * (1.0 - u * u) * (1.0 - clamp(fading, 0.0, 1.0));
    vSolid = aPaint.y;
    return;
  }
  vec4 view = modelViewMatrix * vec4(at, 1.0);
  vec2 along = vec2(1.0, 0.0);
  float reach = 1.0;
  if (aLook.z > 0.0) {
    vec3 moving = aVelocity * (drag > 0.001 ? exp(-drag * t) : 1.0);
    moving.y -= aMotion.z * t;
    vec2 seen = (modelViewMatrix * vec4(moving, 0.0)).xy;
    float speed = length(seen);
    if (speed > 0.01) {
      along = seen / speed;
      reach = 1.0 + aLook.z * speed * 0.12;
    }
  } else {
    float turn = aCell.z + aLook.w * t * 6.2832;
    along = vec2(cos(turn), sin(turn));
  }
  vec2 side = vec2(-along.y, along.x);
  view.xy += (along * corner.x * reach + side * corner.y) * size;
  gl_Position = projectionMatrix * view;
  vUv = (aCell.xy + position.xy * 0.5 + 0.5) / vec2(${SHEET.columns}.0, ${SHEET.rows}.0);
  vColor = mix(aColor, aColorEnd, u);
  // In quickly, and out over the rest.
  vAlpha = aPaint.x * smoothstep(0.0, 0.08, u) * (1.0 - u * u) * (1.0 - clamp(fading, 0.0, 1.0));
  vSolid = aPaint.y;
}`;

const FRAGMENT = `
uniform sampler2D uSheet;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
varying float vSolid;
void main() {
  float shape = texture2D(uSheet, vUv).r;
  float alpha = shape * vAlpha;
  if (alpha < 0.002) discard;
  gl_FragColor = vec4(vColor, 1.0);
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * alpha, alpha * vSolid);
}`;

let sheet = null;
function sheetTexture() {
  if (sheet) return sheet;
  const [w, h] = [SHEET.columns * SHEET.cellPx, SHEET.rows * SHEET.cellPx];
  sheet = new THREE.DataTexture(sheetBytes(), w, h, THREE.RedFormat, THREE.UnsignedByteType);
  sheet.minFilter = THREE.LinearMipmapLinearFilter;
  sheet.magFilter = THREE.LinearFilter;
  sheet.generateMipmaps = true;
  sheet.needsUpdate = true;
  return sheet;
}

const color = new THREE.Color();
const colorOf = (hex) => color.set(hex).toArray();

export class ParticleField {
  constructor(scene, { capacity = DESKTOP_PARTICLES } = {}) {
    this.capacity = capacity;
    this.next = 0;
    this.time = 0;
    this.data = new Float32Array(capacity * FLOATS);
    this.buffer = new THREE.InstancedInterleavedBuffer(this.data, FLOATS);
    this.buffer.setUsage(THREE.DynamicDrawUsage);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    const attribute = (name, size, offset) => geometry.setAttribute(name, new THREE.InterleavedBufferAttribute(this.buffer, size, offset));
    attribute("aOrigin", 3, 0);
    attribute("aVelocity", 3, 3);
    attribute("aMotion", 4, 6);
    attribute("aLook", 4, 10);
    attribute("aColor", 3, 14);
    attribute("aColorEnd", 3, 17);
    attribute("aPaint", 4, 20);
    geometry.instanceCount = capacity;
    this.geometry = geometry;
    this.cells = new Float32Array(capacity * 4);
    this.cellBuffer = new THREE.InstancedBufferAttribute(this.cells, 4);
    this.cellBuffer.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("aCell", this.cellBuffer);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: { uTime: { value: 0 }, uSheet: { value: sheetTexture() } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
    this.clear();
  }

  // Lets `n` go from `origin`. spec: particleSpec's. colors: [main, trim], going from trim to main.
  // way: the unit vector its direction points. floor: how low they can fall. Returns where they
  // went, for fadeOut.
  emit(spec, n, origin, colors, way = [0, 1, 0], floor = -Infinity, rand = Math.random) {
    const cell = PARTICLE_TEXTURES.indexOf(spec.texture);
    const [column, row] = [cell % SHEET.columns, Math.floor(cell / SHEET.columns)];
    const start = colorOf(colors[1]);
    const end = colorOf(colors[0]);
    const solid = spec.blend === "solid" ? 1 : 0;
    const first = this.next;
    for (let k = 0; k < n; k++) {
      const at = this.next * FLOATS;
      const out = aimed(way, spec.spread, rand);
      const speed = spec.speed * (0.6 + 0.4 * rand());
      const place = spec.radius ? aimed([0, 1, 0], 360, rand) : null;
      const away = spec.radius * Math.cbrt(rand());
      const life = spec.lifetime * (0.75 + 0.5 * rand());
      const big = 0.8 + 0.4 * rand();
      this.data.set(
        [
          origin[0] + (place ? place[0] * away : 0),
          origin[1] + (place ? Math.abs(place[1]) * away * 0.4 : 0),
          origin[2] + (place ? place[2] * away : 0),
          out[0] * speed,
          out[1] * speed,
          out[2] * speed,
          this.time,
          life,
          spec.gravity,
          spec.drag,
          spec.size * big,
          spec.sizeEnd * big,
          spec.stretch,
          spec.spin * (rand() < 0.5 ? -1 : 1),
          ...start,
          ...end,
          spec.opacity,
          solid,
          Number.isFinite(floor) ? floor : -1e6,
          spec.facing === "ground" ? 1 : 0,
        ],
        at,
      );
      this.cells.set([column, row, spec.spin ? rand() * 6.2832 : 0, NEVER], this.next * 4);
      this.next = (this.next + 1) % this.capacity;
    }
    this.buffer.needsUpdate = true;
    this.cellBuffer.needsUpdate = true;
    return { first, n };
  }

  // Has these particles, each what emit returned, fade out over a moment from now.
  fadeOut(emitted) {
    for (const { first, n } of emitted) {
      for (let k = 0; k < n; k++) this.cells[((first + k) % this.capacity) * 4 + 3] = this.time;
    }
    this.cellBuffer.needsUpdate = true;
  }

  frame(time) {
    this.time = time;
    this.material.uniforms.uTime.value = time;
  }

  // Takes every particle away.
  clear() {
    for (let k = 0; k < this.capacity; k++) this.data[k * FLOATS + 7] = 1e-6; // gone as soon as it's born
    for (let k = 0; k < this.capacity; k++) this.data[k * FLOATS + 6] = -1e6;
    this.buffer.needsUpdate = true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
