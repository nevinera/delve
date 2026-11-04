import * as THREE from "three";
import { SHAPE_STOCK, fadeAt, shapeSpec } from "./shapeStock.js";
import { shapeMaterial } from "./shapeMaterial.js";

// A strip that trails after something moving and dies away from its far end. It follows one of:
// - trace.edges(a, b), which sets two points, like the two ends of a blade. The strip is what they sweep.
// - follow, a thing to stay on. The strip is `width` feet across and turns to face you.
// `length` is how many seconds a part of it lasts. `duration` is how long it keeps following.

const MOST_SAMPLES = 32;
const STEPS_BETWEEN = 3; // of the curve drawn through each two samples, so a fast swing looks round
const MOST_COLUMNS = (MOST_SAMPLES - 1) * STEPS_BETWEEN + 1;
const MOVED_FT = 0.02;

const VERTEX = `
attribute vec3 aTangent;
attribute float aAcross;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vUv = uv;
  vec4 seen = modelViewMatrix * vec4(position, 1.0);
  vec2 way = (modelViewMatrix * vec4(aTangent, 0.0)).xy;
  float size = length(way);
  seen.xy += (size > 0.0001 ? vec2(-way.y, way.x) / size : vec2(0.0, 1.0)) * aAcross;
  vNormal = vec3(0.0, 0.0, 1.0);
  vView = -seen.xyz;
  gl_Position = projectionMatrix * seen;
}`;

// A point on the curve through p1 and p2, t of the way along.
const curve = (p0, p1, p2, p3, t) =>
  0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);

function emptyStrip() {
  const geometry = new THREE.BufferGeometry();
  const attribute = (name, size) => {
    const made = new THREE.BufferAttribute(new Float32Array(MOST_COLUMNS * 2 * size), size);
    made.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(name, made);
    return made;
  };
  const indices = [];
  for (let n = 0; n < MOST_COLUMNS - 1; n++) indices.push(n * 2, n * 2 + 1, n * 2 + 2, n * 2 + 1, n * 2 + 3, n * 2 + 2);
  geometry.setIndex(indices);
  return { geometry, position: attribute("position", 3), uv: attribute("uv", 2), tangent: attribute("aTangent", 3), across: attribute("aAcross", 1) };
}

export function makeRibbon({ colors, scale, params, follow, trace }) {
  const spec = shapeSpec("ribbon", params);
  const lasts = Math.max(0.01, params?.length ?? spec.length);
  const halfWidth = ((params?.width ?? spec.width) * scale) / 2;
  const strip = emptyStrip();
  const group = new THREE.Group();
  const meshes = spec.layers.map((layer) => {
    const mesh = new THREE.Mesh(strip.geometry, shapeMaterial(layer, colors, VERTEX));
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    mesh.visible = false;
    group.add(mesh);
    return { layer, mesh };
  });

  const samples = []; // oldest first: { at, a: [x, y, z], b: [x, y, z] }
  const [a, b] = [new THREE.Vector3(), new THREE.Vector3()];
  const sample = (now) => {
    if (trace?.edges) trace.edges(a, b);
    else if (follow) b.copy(a.copy(follow.position));
    else return;
    const last = samples.at(-1);
    if (last && Math.hypot(a.x - last.a[0], a.y - last.a[1], a.z - last.a[2]) + Math.hypot(b.x - last.b[0], b.y - last.b[1], b.z - last.b[2]) < MOVED_FT) return;
    samples.push({ at: now, a: a.toArray(), b: b.toArray() });
    if (samples.length > MOST_SAMPLES) samples.shift();
  };

  const write = (now) => {
    while (samples.length && now - samples[0].at > lasts) samples.shift();
    const across = trace?.edges ? 0 : halfWidth;
    let columns = 0;
    const put = (i, step) => {
      const at = (key, k) => curve(samples[Math.max(0, i - 1)][key][k], samples[i][key][k], samples[Math.min(samples.length - 1, i + 1)][key][k], samples[Math.min(samples.length - 1, i + 2)][key][k], step);
      const when = samples[i].at + ((samples[Math.min(samples.length - 1, i + 1)].at - samples[i].at) * step);
      const near = 1 - (now - when) / lasts;
      const before = samples[Math.max(0, i - 1)].a;
      const after = samples[Math.min(samples.length - 1, i + 1)].a;
      strip.position.setXYZ(columns * 2, at("a", 0), at("a", 1), at("a", 2));
      strip.position.setXYZ(columns * 2 + 1, at("b", 0), at("b", 1), at("b", 2));
      for (const side of [0, 1]) {
        strip.uv.setXY(columns * 2 + side, near, side);
        strip.tangent.setXYZ(columns * 2 + side, after[0] - before[0], after[1] - before[1], after[2] - before[2]);
        strip.across.setX(columns * 2 + side, side ? across : -across);
      }
      columns++;
    };
    for (let i = 0; i < samples.length - 1; i++) for (let step = 0; step < STEPS_BETWEEN; step++) put(i, step / STEPS_BETWEEN);
    if (samples.length) put(samples.length - 1, 0);
    for (const attribute of [strip.position, strip.uv, strip.tangent, strip.across]) attribute.needsUpdate = true;
    strip.geometry.setDrawRange(0, Math.max(0, columns - 1) * 6);
    return columns;
  };

  const length = spec.duration + lasts;
  const { after, duration } = SHAPE_STOCK.ribbon;
  const starts = trace ? (after * spec.duration) / duration : 0; // a faster swing winds up faster
  return {
    group,
    length,
    update: (u) => {
      const now = u * length;
      if (now >= starts && now <= spec.duration) sample(now);
      const shown = write(now) > 1;
      for (const { layer, mesh } of meshes) {
        mesh.visible = shown;
        mesh.material.uniforms.uTime.value = now;
        mesh.material.uniforms.uOpacity.value = layer.opacity * fadeAt(spec.fade, u);
      }
    },
  };
}
