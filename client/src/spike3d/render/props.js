import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Low-poly prop kits, each merged into one geometry with vertex colors and
// drawn as an InstancedMesh: one draw call per kind for the whole world.
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

function part(geo, color, {x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1} = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute("uv");
  g.applyMatrix4(_m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)));
  const c = new THREE.Color(color);
  const cols = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < cols.length; i += 3) cols.set([c.r, c.g, c.b], i);
  g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  return g;
}

const BARK = 0x5a4130;

function ring(count, fn) {
  return Array.from({length: count}, (_, k) => fn((k / count) * Math.PI * 2, k));
}

const KITS = {
  pine: () => [
    part(new THREE.CylinderGeometry(0.5, 0.9, 7, 5), BARK, {y: 3.5}),
    part(new THREE.ConeGeometry(6, 10, 7), 0x2c5530, {y: 9}),
    part(new THREE.ConeGeometry(4.6, 8, 7), 0x32603a, {y: 14, ry: 0.4}),
    part(new THREE.ConeGeometry(3.1, 7, 7), 0x3a6b40, {y: 18.5, ry: 0.8}),
  ],
  oak: () => [
    part(new THREE.CylinderGeometry(0.8, 1.2, 10, 6), BARK, {y: 5}),
    part(new THREE.IcosahedronGeometry(6.2, 0), 0x4d7a2e, {y: 13}),
    part(new THREE.IcosahedronGeometry(4.6, 0), 0x5a8a34, {x: 3.5, y: 15, z: 1.5, ry: 0.7}),
    part(new THREE.IcosahedronGeometry(4.2, 0), 0x44702a, {x: -3, y: 14.5, z: -2, ry: 1.3}),
  ],
  willow: () => [
    part(new THREE.CylinderGeometry(0.9, 1.5, 11, 6), 0x4a3c2c, {y: 5.5, rz: 0.12}),
    part(new THREE.IcosahedronGeometry(6.5, 1), 0x66753a, {x: 0.8, y: 13, sy: 0.55}),
    ...ring(9, (a, k) => part(new THREE.ConeGeometry(0.3, 5 + (k % 3) * 1.5, 4, 1, true), 0x7d8a52, {
      x: Math.cos(a) * 5 + 0.8, y: 9.5 - (k % 3) * 0.7, z: Math.sin(a) * 5, rx: Math.PI,
    })),
  ],
  deadTree: () => [
    part(new THREE.CylinderGeometry(0.35, 1.1, 16, 5), 0x5d544a, {y: 8, rz: -0.06}),
    ...ring(4, (a, k) => part(new THREE.CylinderGeometry(0.12, 0.3, 6 - k * 0.6, 4), 0x5d544a, {
      x: Math.cos(a) * 1.4, y: 9 + k * 1.8, z: Math.sin(a) * 1.4, rx: Math.sin(a) * 0.8, rz: -Math.cos(a) * 0.8,
    })),
  ],
  rock: () => [
    part(new THREE.DodecahedronGeometry(2.6, 0), 0x8a8680, {sy: 0.7, ry: 0.3}),
    part(new THREE.DodecahedronGeometry(1.3, 0), 0x7c7872, {x: 2.2, y: -0.3, z: 1, sy: 0.8}),
  ],
  reed: () => [
    ...ring(5, (a, k) => part(new THREE.ConeGeometry(0.12, 4 + (k % 3), 3, 1, true), 0x7b8a44, {
      x: Math.cos(a) * 0.6, y: 2 + (k % 3) / 2, z: Math.sin(a) * 0.6, rx: Math.sin(a) * 0.15, rz: -Math.cos(a) * 0.15,
    })),
    ...ring(2, (a) => part(new THREE.CylinderGeometry(0.16, 0.16, 0.9, 4, 1, true), 0x5a3a22, {
      x: Math.cos(a) * 0.5, y: 4.6, z: Math.sin(a) * 0.5,
    })),
  ],
  lily: () => [
    part(new THREE.CylinderGeometry(1.3, 1.3, 0.08, 7, 1, false, 0.5, Math.PI * 1.75), 0x4f7d3a),
    part(new THREE.CylinderGeometry(0.8, 0.8, 0.08, 6, 1, false, 0, Math.PI * 1.8), 0x5d8c40, {x: 1.8, z: 0.9, y: 0.01}),
  ],
  hut: () => [
    part(new THREE.BoxGeometry(17, 7, 13), 0x77736b, {y: -3.4}),
    part(new THREE.BoxGeometry(16, 8, 12), 0x9c7b52, {y: 4}),
    part(new THREE.ConeGeometry(1, 1, 4), 0xa98744, {y: 11.5, ry: Math.PI / 4, sx: 9.6 * Math.SQRT2, sy: 7, sz: 7.6 * Math.SQRT2}),
    part(new THREE.BoxGeometry(3, 6, 0.4), 0x3a2818, {y: 3, z: 6.05}),
    part(new THREE.BoxGeometry(2.4, 2, 0.3), 0x2a2420, {x: -5, y: 5, z: 6.02}),
  ],
};

// Props between the camera and the player dissolve (screen-door dither,
// so no transparency sorting). The cleared space is a cone with its tip at
// the camera and its base around the player, plus a small bubble around
// the camera itself.
function makeOccluderFadeMaterial() {
  const uniforms = {
    uCam: {value: new THREE.Vector3()},
    uFocus: {value: new THREE.Vector3()},
    uRadius: {value: 3.5},
  };
  const material = new THREE.MeshLambertMaterial({vertexColors: true, flatShading: true});
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vFadePos;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
#ifdef USE_INSTANCING
vFadePos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
vFadePos = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
uniform vec3 uCam, uFocus;
uniform float uRadius;
varying vec3 vFadePos;
float bayer4(vec2 p) {
  ivec2 i = ivec2(mod(p, 4.0));
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i.x + i.y * 4]) + 0.5) / 16.0;
}`)
      .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
{
  vec3 ab = uFocus - uCam;
  float t = dot(vFadePos - uCam, ab) / dot(ab, ab);
  float r = 0.6 + uRadius * clamp(t, 0.0, 1.0);
  float axis = length(vFadePos - (uCam + ab * t));
  float cone = (1.0 - smoothstep(r * 0.65, r, axis)) * step(0.0, t) * (1.0 - smoothstep(0.92, 1.0, t));
  float bubble = 1.0 - smoothstep(1.5, 4.0, length(vFadePos - uCam));
  if (max(cone, bubble) > bayer4(gl_FragCoord.xy)) discard;
}`);
  };
  material.userData.uniforms = uniforms;
  return material;
}

// Instances are grouped per 256ft chunk so whole groups can be frustum-
// and distance-culled; within a chunk it's one draw call per kind.
export const PROP_CHUNK_FT = 256;

export class Props {
  constructor(parent) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.material = makeOccluderFadeMaterial();
    this.uniforms = this.material.userData.uniforms;
    this.geometries = {};
    for (const [kind, build] of Object.entries(KITS)) this.geometries[kind] = mergeGeometries(build());
    this.chunks = []; // {group, cx, cz}
  }

  update({kinds}) {
    for (const chunk of this.chunks) {
      chunk.group.children.forEach((m) => m.dispose());
      this.group.remove(chunk.group);
    }
    const byChunk = new Map();
    for (const [kind, items] of Object.entries(kinds)) {
      for (const it of items) {
        const key = `${Math.floor(it.x / PROP_CHUNK_FT)},${Math.floor(it.z / PROP_CHUNK_FT)}`;
        if (!byChunk.has(key)) byChunk.set(key, {});
        (byChunk.get(key)[kind] ||= []).push(it);
      }
    }
    this.chunks = [...byChunk].map(([key, perKind]) => {
      const [cx, cz] = key.split(",").map(Number);
      const group = new THREE.Group();
      for (const [kind, items] of Object.entries(perKind)) {
        const mesh = new THREE.InstancedMesh(this.geometries[kind], this.material, items.length);
        items.forEach((it, i) => {
          _m.compose(_v.set(it.x, it.y, it.z), _q.setFromEuler(_e.set(0, it.rot, 0)), _s.setScalar(it.scale));
          mesh.setMatrixAt(i, _m);
          mesh.setColorAt(i, _c.setScalar(it.tint));
        });
        mesh.computeBoundingSphere();
        group.add(mesh);
      }
      this.group.add(group);
      return {group, cx, cz};
    });
  }

  // Clears a cone from the camera to the focus point (the player).
  setFade(camera, focus, radius = 3.5) {
    this.uniforms.uCam.value.copy(camera);
    this.uniforms.uFocus.value.copy(focus);
    this.uniforms.uRadius.value = radius;
  }

  // Hides chunks wholly beyond the given distance (the fog's far edge).
  cull(x, z, range) {
    for (const c of this.chunks) {
      const x0 = c.cx * PROP_CHUNK_FT, z0 = c.cz * PROP_CHUNK_FT;
      const dx = Math.max(x0 - x, 0, x - (x0 + PROP_CHUNK_FT));
      const dz = Math.max(z0 - z, 0, z - (z0 + PROP_CHUNK_FT));
      c.group.visible = dx * dx + dz * dz < range * range;
    }
  }
}
