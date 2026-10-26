import * as THREE from "three";
import url from "./animations.json?url";

// Animation clips for characters (characterMesh.js), baked onto the skeleton from Quaternius'
// Universal Animation Library by script/bake_animations.mjs. Each frame holds a quaternion per
// bone, in the baked bone order, then how far the pelvis moves from rest, in feet for a 6ft body.
// Clips are fetched once and shared; each character makes its own three.js clips, since the
// pelvis moves in proportion to its height. A few clips the library lacks are posed by hand
// below.

let loading = null;

// The baked clips: { fps, bones, clips: { name: { frames, data } } }.
export function loadAnimations() {
  loading ??= fetch(url).then((response) => response.json());
  return loading;
}

// A clip's frames as numbers: { times, rotations: { bone: [x, y, z, w per frame] }, pelvis: [x,
// y, z per frame] }.
export function decodeClip(baked, name) {
  const { frames, data } = baked.clips[name];
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  const values = new Int16Array(bytes.buffer);
  const stride = baked.bones.length * 4 + 3;
  const times = Float32Array.from({ length: frames }, (_, f) => f / baked.fps);
  const rotations = Object.fromEntries(baked.bones.map((bone) => [bone, new Float32Array(frames * 4)]));
  const pelvis = new Float32Array(frames * 3);
  for (let f = 0; f < frames; f++) {
    baked.bones.forEach((bone, b) => {
      for (let k = 0; k < 4; k++) rotations[bone][f * 4 + k] = values[f * stride + b * 4 + k] / 32767;
    });
    for (let k = 0; k < 3; k++) pelvis[f * 3 + k] = values[f * stride + baked.bones.length * 4 + k] / 1000;
  }
  return { times, rotations, pelvis };
}

// Hand-posed clips: keyframes of each bone's turn from rest, as XYZ euler angles relative to its
// parent, and how far the pelvis moves, in feet for a 6ft body. Bones left out stay at rest.
// Every bone points along its rest direction unturned, so a turn about x swings it: negative
// forward (+z), positive back. A turn about z swings a left limb out, a right one in.
//
// Sitting on the ground: knees up, forearms resting on them.
const SITTING = {
  pelvis: [0, -2.72, -0.35],
  bones: {
    pelvis: [-0.2, 0, 0],
    spine_01: [0.12, 0, 0],
    spine_02: [0.12, 0, 0],
    head: [0.1, 0, 0],
    thigh_l: [-2.1, 0, 0.18],
    thigh_r: [-2.1, 0, -0.18],
    calf_l: [1.45, 0, 0],
    calf_r: [1.45, 0, 0],
    foot_l: [0.85, 0, 0],
    foot_r: [0.85, 0, 0],
    upperarm_l: [-1.1, 0, -0.12],
    upperarm_r: [-1.1, 0, 0.12],
    lowerarm_l: [-0.6, 0, 0],
    lowerarm_r: [-0.6, 0, 0],
  },
};
// Halfway down: crouched, leaning forward over the knees.
const CROUCHED = {
  pelvis: [0, -1.45, -0.2],
  bones: {
    spine_01: [0.25, 0, 0],
    spine_02: [0.15, 0, 0],
    thigh_l: [-1.5, 0, 0.12],
    thigh_r: [-1.5, 0, -0.12],
    calf_l: [1.9, 0, 0],
    calf_r: [1.9, 0, 0],
    foot_l: [-0.4, 0, 0],
    foot_r: [-0.4, 0, 0],
    upperarm_l: [-0.5, 0, -0.1],
    upperarm_r: [-0.5, 0, 0.1],
    lowerarm_l: [-0.5, 0, 0],
    lowerarm_r: [-0.5, 0, 0],
  },
};
const STANDING = { pelvis: [0, 0, 0], bones: {} };
// Breathing in while sitting: the chest lifts a little.
const BREATH = { ...SITTING, bones: { ...SITTING.bones, spine_02: [0.08, 0, 0], head: [0.06, 0.08, 0] } };
const POSED = {
  Sit_Ground_Enter: [
    [0, STANDING],
    [0.45, CROUCHED],
    [1, SITTING],
  ],
  Sit_Ground_Idle_Loop: [
    [0, SITTING],
    [2, BREATH],
    [4, SITTING],
  ],
  Sit_Ground_Exit: [
    [0, SITTING],
    [0.5, CROUCHED],
    [1.1, STANDING],
  ],
};

// A hand-posed clip in decodeClip's form, eased from each keyframe to the next.
export function posedClip(name, fps = 30) {
  const keys = POSED[name];
  const end = keys[keys.length - 1][0];
  const frames = Math.round(end * fps) + 1;
  const bones = [...new Set(keys.flatMap(([, pose]) => Object.keys(pose.bones)))];
  const times = Float32Array.from({ length: frames }, (_, f) => f / fps);
  const rotations = Object.fromEntries(bones.map((bone) => [bone, new Float32Array(frames * 4)]));
  const pelvis = new Float32Array(frames * 3);
  const turn = (pose, bone) => new THREE.Quaternion().setFromEuler(new THREE.Euler(...(pose.bones[bone] ?? [0, 0, 0])));
  for (let f = 0; f < frames; f++) {
    const time = times[f];
    let k = 0;
    while (k < keys.length - 2 && keys[k + 1][0] <= time) k++;
    const [[t0, from], [t1, to]] = [keys[k], keys[k + 1]];
    const u = Math.min(1, Math.max(0, (time - t0) / (t1 - t0)));
    const eased = u * u * (3 - 2 * u);
    for (const bone of bones) turn(from, bone).slerp(turn(to, bone), eased).toArray(rotations[bone], f * 4);
    for (let i = 0; i < 3; i++) pelvis[f * 3 + i] = from.pelvis[i] + (to.pelvis[i] - from.pelvis[i]) * eased;
  }
  return { times, rotations, pelvis };
}

// The names of every clip: baked, then hand-posed.
export const clipNames = (baked) => [...Object.keys(baked.clips), ...Object.keys(POSED)];

// Every clip as a three.js AnimationClip for this character, by name.
export function characterClips(mesh, baked) {
  const s = mesh.userData.scale;
  const rest = mesh.skeleton.getBoneByName("pelvis").position;
  const clips = new Map();
  for (const name of clipNames(baked)) {
    const { times, rotations, pelvis } = POSED[name] ? posedClip(name, baked.fps) : decodeClip(baked, name);
    const tracks = Object.entries(rotations).map(([bone, values]) => new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values));
    const positions = pelvis.map((v, i) => rest.getComponent(i % 3) + v * s);
    tracks.push(new THREE.VectorKeyframeTrack("pelvis.position", times, positions));
    clips.set(name, new THREE.AnimationClip(name, times[times.length - 1] || 1 / baked.fps, tracks));
  }
  return clips;
}
