// Bakes Quaternius' Universal Animation Library clips (CC0, quaternius.com) onto the character
// skeleton (client/src/character/body.js), as client/src/character/animations.json, which
// animations.js plays. The T-pose goes to animations-stash.json instead, which nothing loads: it
// checks the baking.
//
//   node script/bake_animations.mjs <UAL1 Godot .glb> <UAL2 Unreal-Godot .glb>
//
// The free Standard packs are at opengameart.org/content/universal-animation-library and
// opengameart.org/content/universal-animation-library-2.
//
// The library's mannequin stands in a T-pose with its bones along their own axes; ours stands
// arms down with every bone unrotated. Each frame, each bone turns from its rest pose the way the
// mannequin's bone turns from its own, in the world: our bone is first turned to lie the way
// the mannequin's lies at rest, then the mannequin's turn is applied on top.
//
// Clips that move along the ground record their speed: how fast the planted foot slides back, in
// feet per second for a 6ft body, so a character moving at some speed can play them to match.
import fs from "fs";
import * as THREE from "three";
import { ENDS, skeleton } from "../client/src/character/body.js";
import { DEFAULT_LOOK } from "../client/src/character/recipe.js";

const FPS = 30;
const OUT = new URL("../client/src/character/animations.json", import.meta.url);
const STASH_OUT = new URL("../client/src/character/animations-stash.json", import.meta.url);
// Root motion, gun, vehicle, phone, parkour and chair clips are left out.
const SKIP = /_RM$|^Pistol_|^Driving|Phone|Rail|^NinjaJump|^Slide|^Sitting/;
const STASH = /^A_TPose$/;
const MOVES = /^(Walk|Jog|Sprint|Crouch_Fwd|Zombie_Walk)/;

// How fast the lower foot moves back, frame to frame, in the middle of the range so the moments
// the feet change over don't count.
function groundSpeed(feet) {
  const speeds = [];
  for (let f = 0; f + 1 < feet.length; f++) {
    const planted = feet[f][0].y < feet[f][1].y ? 0 : 1;
    speeds.push((feet[f][planted].z - feet[f + 1][planted].z) * FPS);
  }
  speeds.sort((a, b) => a - b);
  return Math.round(speeds[Math.floor(speeds.length / 2)] * 100) / 100;
}

// The first pack names bones like Blender's Rigify, the second like Unreal.
const RIGIFY = {
  "DEF-hips": "pelvis",
  "DEF-spine.001": "spine_01",
  "DEF-spine.002": "spine_02",
  "DEF-spine.003": "spine_03",
  "DEF-neck": "neck_01",
  "DEF-head": "head",
  Head: "head",
};
for (const side of ["l", "r"]) {
  const S = side.toUpperCase();
  Object.assign(RIGIFY, {
    [`DEF-shoulder.${S}`]: `clavicle_${side}`,
    [`DEF-upper_arm.${S}`]: `upperarm_${side}`,
    [`DEF-forearm.${S}`]: `lowerarm_${side}`,
    [`DEF-hand.${S}`]: `hand_${side}`,
    [`DEF-f_middle.01.${S}`]: `middle_01_${side}`,
    [`DEF-thigh.${S}`]: `thigh_${side}`,
    [`DEF-shin.${S}`]: `calf_${side}`,
    [`DEF-foot.${S}`]: `foot_${side}`,
    [`DEF-toe.${S}`]: `ball_${side}`,
  });
}

// Our skeleton, and the way each bone points: to its main child, or to its end.
const ours = skeleton(DEFAULT_LOOK);
const BONES = ours.map((b) => b.name);
const ourAt = Object.fromEntries(ours.map((b) => [b.name, new THREE.Vector3(...b.at)]));
const mirror = (name) => {
  const end = ENDS[name.replace(/_r$/, "_l")];
  return end && new THREE.Vector3(name.endsWith("_r") ? -end[0] : end[0], end[1], end[2]);
};
// The child a bone points at, in both skeletons; bones without one point to their end.
const NEXT = { pelvis: "spine_01", spine_01: "spine_02", spine_02: "spine_03", spine_03: "neck_01", neck_01: "head" };
for (const side of ["l", "r"]) {
  Object.assign(NEXT, {
    [`clavicle_${side}`]: `upperarm_${side}`,
    [`upperarm_${side}`]: `lowerarm_${side}`,
    [`lowerarm_${side}`]: `hand_${side}`,
    [`thigh_${side}`]: `calf_${side}`,
    [`calf_${side}`]: `foot_${side}`,
    [`foot_${side}`]: `ball_${side}`,
  });
}
const ourDir = (name) => {
  const to = NEXT[name] ? ourAt[NEXT[name]] : mirror(name);
  return to.clone().sub(ourAt[name]).normalize();
};

function readGlb(path) {
  const buf = fs.readFileSync(path);
  const jsonLength = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString());
  const bin = buf.subarray(28 + jsonLength);
  const accessor = (i) => {
    const a = json.accessors[i];
    const view = json.bufferViews[a.bufferView];
    const size = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type];
    if (a.componentType !== 5126 || (view.byteStride && view.byteStride !== size * 4)) throw new Error(`accessor ${i}: unsupported layout`);
    const start = (view.byteOffset || 0) + (a.byteOffset || 0);
    return { size, data: new Float32Array(bin.buffer.slice(bin.byteOffset + start, bin.byteOffset + start + a.count * size * 4)) };
  };
  return { json, accessor };
}

function bakePack(path, clips) {
  const { json, accessor } = readGlb(path);
  const nodes = json.nodes;
  const parent = [];
  nodes.forEach((n, i) => (n.children || []).forEach((c) => (parent[c] = i)));
  const byName = {};
  nodes.forEach((n, i) => (byName[RIGIFY[n.name] ?? n.name] = i));
  const rest = nodes.map((n) => ({
    t: new THREE.Vector3(...(n.translation || [0, 0, 0])),
    r: new THREE.Quaternion(...(n.rotation || [0, 0, 0, 1])),
    s: new THREE.Vector3(...(n.scale || [1, 1, 1])),
  }));
  // World matrices of every node for a pose (local TRS per node).
  const worlds = (pose) => {
    const out = [];
    const of = (i) => {
      if (out[i]) return out[i];
      const m = new THREE.Matrix4().compose(pose[i].t, pose[i].r, pose[i].s);
      out[i] = parent[i] === undefined ? m : of(parent[i]).clone().multiply(m);
      return out[i];
    };
    nodes.forEach((_, i) => of(i));
    return out;
  };
  const decompose = (m) => {
    const [p, q, s] = [new THREE.Vector3(), new THREE.Quaternion(), new THREE.Vector3()];
    m.decompose(p, q, s);
    return { p, q };
  };
  const restWorld = worlds(rest).map(decompose);
  const at = (name) => restWorld[byName[name]].p;
  // How far each of our bones turns to lie the way the mannequin's does at rest. The head and
  // toes have no child to point at; both point the same way in either skeleton.
  const fit = {};
  for (const name of BONES) {
    if (name === "root" || name === "head" || name.startsWith("ball")) {
      fit[name] = new THREE.Quaternion();
      continue;
    }
    const next = NEXT[name] ?? name.replace("hand", "middle_01");
    const theirs = at(next).clone().sub(at(name)).normalize();
    fit[name] = new THREE.Quaternion().setFromUnitVectors(ourDir(name), theirs);
  }
  const lift = ourAt.pelvis.y / at("pelvis").y;

  for (const anim of json.animations) {
    if (SKIP.test(anim.name)) continue;
    const channels = anim.channels.map((c) => {
      const sampler = anim.samplers[c.sampler];
      return { node: c.target.node, path: c.target.path, step: sampler.interpolation === "STEP", times: accessor(sampler.input).data, values: accessor(sampler.output) };
    });
    const duration = Math.max(...channels.map((c) => c.times[c.times.length - 1]));
    const frames = Math.max(1, Math.round(duration * FPS) + 1);
    const data = [];
    const feet = [];
    let previous = null;
    for (let f = 0; f < frames; f++) {
      const time = Math.min(duration, f / FPS);
      const pose = rest.map(({ t, r, s }) => ({ t: t.clone(), r: r.clone(), s: s.clone() }));
      for (const c of channels) {
        if (c.path === "weights") continue;
        let k = 0;
        while (k < c.times.length - 2 && c.times[k + 1] <= time) k++;
        const span = c.times[k + 1] - c.times[k];
        const u = c.step || !span ? 0 : Math.min(1, Math.max(0, (time - c.times[k]) / span));
        const n = c.values.size;
        const v = (i) => Array.from(c.values.data.subarray(i * n, i * n + n));
        const k1 = Math.min(k + 1, c.times.length - 1);
        const target = pose[c.node];
        if (c.path === "rotation") target.r.fromArray(v(k)).slerp(new THREE.Quaternion().fromArray(v(k1)), u);
        else target[c.path === "translation" ? "t" : "s"].fromArray(v(k)).lerp(new THREE.Vector3().fromArray(v(k1)), u);
      }
      const world = worlds(pose).map(decompose);
      const turned = {};
      const frame = [];
      for (const name of BONES) {
        let q;
        if (name === "root") q = new THREE.Quaternion();
        else {
          const i = byName[name];
          const turn = world[i].q.clone().multiply(restWorld[i].q.clone().invert());
          q = turn.multiply(fit[name]);
        }
        turned[name] = q;
        const up = ours.find((b) => b.name === name).parent;
        const local = up ? turned[up].clone().invert().multiply(q) : q;
        frame.push(local);
      }
      // Keep each bone's quaternion on the same side as the frame before, for smooth blending.
      if (previous) frame.forEach((q, i) => q.dot(previous[i]) < 0 && q.set(-q.x, -q.y, -q.z, -q.w));
      previous = frame;
      feet.push(["foot_l", "foot_r"].map((foot) => world[byName[foot]].p.clone().multiplyScalar(lift)));
      const lifted = world[byName.pelvis].p.clone().sub(at("pelvis")).multiplyScalar(lift);
      data.push(...frame.flatMap((q) => q.toArray()), ...lifted.toArray());
    }
    clips[anim.name] = { frames, ...(MOVES.test(anim.name) && { speed: groundSpeed(feet) }), data: Buffer.from(Int16Array.from(data.map((v, i) => Math.round((i % (BONES.length * 4 + 3) < BONES.length * 4 ? v * 32767 : v * 1000)))).buffer).toString("base64") };
  }
}

const all = {};
for (const path of process.argv.slice(2)) bakePack(path, all);
for (const [file, keep] of [
  [OUT, (name) => !STASH.test(name)],
  [STASH_OUT, (name) => STASH.test(name)],
]) {
  const clips = Object.fromEntries(Object.entries(all).filter(([name]) => keep(name)));
  fs.writeFileSync(file, JSON.stringify({ fps: FPS, bones: BONES, clips }) + "\n");
  console.log(`${file.pathname.split("/").pop()}: ${Object.keys(clips).length} clips, ${fs.statSync(file).size} bytes`);
}
