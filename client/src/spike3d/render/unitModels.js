import * as THREE from "three";

// Placeholder unit models built from primitives, each with a tiny
// procedural walk/idle/attack animation. They face +z. Replace with
// rigged glTF later; the animate() contract stays.
const materials = new Map();
function mat(color) {
  if (!materials.has(color)) materials.set(color, new THREE.MeshLambertMaterial({color, flatShading: true}));
  return materials.get(color);
}

function box(parent, color, [w, h, d], [x, y, z] = [0, 0, 0], rot = [0, 0, 0]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  m.rotation.set(...rot);
  parent.add(m);
  return m;
}

function mesh(parent, geo, color, [x, y, z] = [0, 0, 0], rot = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, mat(color));
  m.position.set(x, y, z);
  m.rotation.set(...rot);
  parent.add(m);
  return m;
}

function pivot(parent, [x, y, z]) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

function humanoid(parent, s) {
  const body = pivot(parent, [0, 0, 0]);
  const legs = [-1, 1].map((side) => {
    const hip = pivot(body, [side * s.hipX, s.hipY, 0]);
    box(hip, s.legColor, [s.limb, s.hipY, s.limb], [0, -s.hipY / 2, 0]);
    box(hip, s.footColor, [s.limb * 1.1, s.limb * 0.6, s.limb * 1.6], [0, -s.hipY + s.limb * 0.3, s.limb * 0.3]);
    return hip;
  });
  const torso = pivot(body, [0, s.hipY, 0]);
  torso.rotation.x = s.hunch || 0;
  box(torso, s.torsoColor, [s.torso[0], s.torso[1], s.torso[2]], [0, s.torso[1] / 2, 0]);
  const head = pivot(torso, [0, s.torso[1], 0]);
  const arms = [-1, 1].map((side) => {
    const shoulder = pivot(torso, [side * (s.torso[0] / 2 + s.limb * 0.55), s.torso[1] * 0.9, 0]);
    box(shoulder, s.armColor, [s.limb * 0.8, s.armLen, s.limb * 0.8], [0, -s.armLen / 2, 0]);
    box(shoulder, s.handColor, [s.limb * 0.8, s.limb * 0.7, s.limb * 0.8], [0, -s.armLen - s.limb * 0.3, 0]);
    return shoulder;
  });
  return {body, legs, torso, head, arms};
}

export function makePlayerModel() {
  const root = new THREE.Group();
  const p = humanoid(root, {
    hipX: 0.5, hipY: 2.9, limb: 0.6, torso: [1.9, 2.5, 1.05], armLen: 2.3,
    legColor: 0x37425e, footColor: 0x3a2a1c, torsoColor: 0x8a2f2b, armColor: 0x8a2f2b, handColor: 0xe0b48a,
  });
  box(p.torso, 0x4a3420, [1.95, 0.35, 1.1], [0, 0.25, 0]);
  box(p.head, 0xe0b48a, [1.15, 1.25, 1.1], [0, 0.75, 0]);
  box(p.head, 0x5a3a1e, [1.25, 0.45, 1.2], [0, 1.35, -0.05]);
  box(p.torso, 0x2c3a5a, [2.0, 2.3, 0.2], [0, 1.3, -0.62], [0.08, 0, 0]);
  const sword = pivot(p.arms[1], [0, -2.6, 0.2]);
  box(sword, 0xc9ccd2, [0.14, 3.2, 0.42], [0, 0, 1.6], [Math.PI / 2, 0, 0]);
  box(sword, 0x6b5530, [0.9, 0.2, 0.3], [0, 0, 0.05]);
  return animated(root, p, {stride: 6, swing: 0.7});
}

export function makeGoblinModel() {
  const root = new THREE.Group();
  const p = humanoid(root, {
    hipX: 0.38, hipY: 1.6, limb: 0.48, torso: [1.4, 1.6, 0.95], armLen: 1.9, hunch: 0.35,
    legColor: 0x6f8f3a, footColor: 0x6f8f3a, torsoColor: 0x6b4e2e, armColor: 0x6f8f3a, handColor: 0x6f8f3a,
  });
  box(p.head, 0x6f8f3a, [1.35, 1.15, 1.2], [0, 0.6, 0.2]);
  box(p.head, 0x8fae4a, [0.35, 0.5, 0.5], [0, 0.45, 0.9]);
  for (const side of [-1, 1]) {
    mesh(p.head, new THREE.ConeGeometry(0.25, 1.3, 4), 0x6f8f3a, [side * 0.95, 0.85, 0.1], [0, 0, side * -Math.PI / 2.2]);
    box(p.head, 0xffd23a, [0.2, 0.15, 0.1], [side * 0.32, 0.75, 0.81]);
  }
  const spear = pivot(p.arms[1], [0, -2.0, 0]);
  mesh(spear, new THREE.CylinderGeometry(0.08, 0.08, 6, 5), 0x6b5530, [0, 0, 0.6], [Math.PI / 2, 0, 0]);
  mesh(spear, new THREE.ConeGeometry(0.22, 0.9, 4), 0xa0a4a8, [0, 0, 3.9], [Math.PI / 2, 0, 0]);
  return animated(root, p, {stride: 3.5, swing: 0.8});
}

export function makeWolfModel() {
  const root = new THREE.Group();
  const body = pivot(root, [0, 2.6, 0]);
  const fur = 0x6d6a66, belly = 0x9a958e, dark = 0x45423f;
  box(body, fur, [1.5, 1.5, 3.8], [0, 0, -0.2]);
  box(body, fur, [1.8, 1.8, 1.6], [0, 0.15, 1.2]);
  box(body, belly, [1.2, 0.4, 3.0], [0, -0.75, 0]);
  const head = pivot(body, [0, 0.7, 2.2]);
  box(head, fur, [1.25, 1.15, 1.2], [0, 0.1, 0.3]);
  box(head, dark, [0.65, 0.55, 1.1], [0, -0.1, 1.3]);
  box(head, 0x111111, [0.25, 0.2, 0.2], [0, 0.1, 1.85]);
  for (const side of [-1, 1]) {
    mesh(head, new THREE.ConeGeometry(0.25, 0.7, 4), dark, [side * 0.4, 0.9, 0.1]);
    box(head, 0xe8c040, [0.15, 0.12, 0.1], [side * 0.35, 0.3, 0.92]);
  }
  const tail = pivot(body, [0, 0.4, -2.1]);
  mesh(tail, new THREE.CylinderGeometry(0.15, 0.35, 2.2, 5), fur, [0, 0, -1.0], [-Math.PI / 2 - 0.5, 0, 0]);
  const legs = [[-0.5, 1.2], [0.5, 1.2], [-0.5, -1.6], [0.5, -1.6]].map(([x, z]) => {
    const hip = pivot(body, [x, -0.5, z]);
    box(hip, fur, [0.42, 2.2, 0.5], [0, -1.0, 0]);
    box(hip, dark, [0.45, 0.25, 0.65], [0, -2.0, 0.1]);
    return hip;
  });
  const parts = {body, legs, head, tail, arms: [], torso: body};
  return animated(root, parts, {stride: 7, swing: 0.6, quadruped: true});
}

function animated(root, parts, {stride, swing, quadruped = false}) {
  let phase = 0;
  let time = 0;
  root.traverse((o) => {
    o.castShadow = false;
  });
  return {
    root,
    // speed in ft/s, attack 0..1 through a strike
    animate(dt, speed, attack = 0) {
      time += dt;
      phase += (speed * dt) / stride * Math.PI * 2;
      const move = Math.min(1, speed / 8);
      const s = Math.sin(phase) * swing * move;
      if (quadruped) {
        parts.legs[0].rotation.x = s;
        parts.legs[3].rotation.x = s;
        parts.legs[1].rotation.x = -s;
        parts.legs[2].rotation.x = -s;
        parts.body.position.y = 2.6 + Math.abs(Math.cos(phase)) * 0.25 * move;
        parts.tail.rotation.x = Math.sin(time * 3) * 0.15 + move * 0.3;
        parts.tail.rotation.y = Math.sin(time * 2.2) * 0.3 * (1 - move);
        parts.head.rotation.x = -attack * 0.6 + Math.sin(time * 1.3) * 0.05 * (1 - move);
        parts.body.rotation.x = -attack * 0.15;
        parts.body.position.z = attack * 1.2;
      } else {
        parts.legs[0].rotation.x = s;
        parts.legs[1].rotation.x = -s;
        parts.arms[0].rotation.x = -s * 0.8;
        parts.arms[1].rotation.x = s * 0.8 - attack * 1.6;
        parts.body.position.y = Math.abs(Math.cos(phase)) * 0.18 * move;
        parts.torso.scale.y = 1 + Math.sin(time * 2) * 0.015 * (1 - move);
        parts.head.rotation.y = Math.sin(time * 0.7) * 0.25 * (1 - move);
      }
    },
  };
}
