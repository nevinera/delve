import * as THREE from "three";
import url from "./animations.json?url";

// Animation clips for characters (characterMesh.js), baked onto the skeleton from Quaternius'
// Universal Animation Library by script/bake_animations.mjs. Each frame holds a quaternion per
// bone, in the baked bone order, then how far the pelvis moves from rest, in feet for a 6ft body.
// Clips are fetched once and shared; each character makes its own three.js clips, since the
// pelvis moves in proportion to its height.

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

// Every baked clip as a three.js AnimationClip for this character, by name.
export function characterClips(mesh, baked) {
  const s = mesh.userData.scale;
  const rest = mesh.skeleton.getBoneByName("pelvis").position;
  const clips = new Map();
  for (const name of Object.keys(baked.clips)) {
    const { times, rotations, pelvis } = decodeClip(baked, name);
    const tracks = Object.entries(rotations).map(([bone, values]) => new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values));
    const positions = pelvis.map((v, i) => rest.getComponent(i % 3) + v * s);
    tracks.push(new THREE.VectorKeyframeTrack("pelvis.position", times, positions));
    clips.set(name, new THREE.AnimationClip(name, times[times.length - 1] || 1 / baked.fps, tracks));
  }
  return clips;
}
