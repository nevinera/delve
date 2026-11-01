import * as THREE from "three";
import url from "./animations.json?url";
import { POSED, posedClip, posedSpeed } from "./posed.js";
import { FRAMES } from "./frames.js";
import { attackGroup } from "./weapons.js";

// Animation clips for characters (characterMesh.js), baked onto the skeleton from Quaternius'
// Universal Animation Library by script/bake_animations.mjs. Each frame holds a quaternion per
// bone, in the baked bone order, then how far the pelvis moves from rest, in feet for a 6ft body.
// Clips are fetched once and shared; each character makes its own three.js clips, since the
// pelvis moves in proportion to its height. Clips the library lacks are posed by hand, in
// posed.js.

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

// The names of every clip: baked, then hand-posed.
export const clipNames = (baked) => [...Object.keys(baked.clips), ...Object.keys(POSED)];

// Every clip as a three.js AnimationClip for this character, by name. A clip that moves along the
// ground keeps its speed, for a 6ft body, in userData.speed.
export function characterClips(mesh, baked) {
  const frame = FRAMES[mesh.userData.skeleton];
  if (frame) return frame.clips(mesh, mesh.userData.look);
  const s = mesh.userData.scale;
  const rest = mesh.skeleton.getBoneByName("pelvis").position;
  const clips = new Map();
  for (const name of clipNames(baked)) {
    const { times, rotations, pelvis } = POSED[name] ? posedClip(name, mesh.userData.joints, s, baked.fps) : decodeClip(baked, name);
    const tracks = Object.entries(rotations).map(([bone, values]) => new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values));
    const positions = pelvis.map((v, i) => rest.getComponent(i % 3) + v * s);
    tracks.push(new THREE.VectorKeyframeTrack("pelvis.position", times, positions));
    const clip = new THREE.AnimationClip(name, times[times.length - 1] || 1 / baked.fps, tracks);
    clip.userData = { speed: POSED[name] ? posedSpeed(name) : baked.clips[name].speed };
    clips.set(name, clip);
  }
  return clips;
}

// What a creature does, each played by one of its clips: idle, walk, run, attack, battleCry (an
// enrage or a rallying shout), hit and death for every body, and fly, bigAttack, cast, shoot and
// breath (fire or the like, from its mouth bone) for those that can.
export const ROLES = ["idle", "walk", "run", "fly", "attack", "bigAttack", "cast", "shoot", "breath", "battleCry", "hit", "death"];

// The clip for each of ROLES for a look (recipe.js's resolveRecipe), by its skeleton
// (frames.js's skeletonOf), or null where it has none. A humanoid's attacks go with how its weapon
// attacks (weapons.js's attackGroup), and it shoots only with something to shoot or throw.
const ATTACKS = {
  unarmed: ["Punch_Jab", "Punch_Cross", null],
  oneHanded: ["Sword_Attack", "Sword_Regular_B", null],
  twoHanded: ["TwoHand_Chop", "TwoHand_Sweep", null],
  bow: ["Bow_Shoot", "Bow_Shoot", "Bow_Shoot"],
  firearm: ["Firearm_Shoot", "Firearm_Shoot", "Firearm_Shoot"],
  thrown: ["OverhandThrow", "OverhandThrow", "OverhandThrow"],
};

export function roleClips(look, skeleton) {
  if (FRAMES[skeleton]) return FRAMES[skeleton].roles(look);
  const [attack, bigAttack, shoot] = ATTACKS[attackGroup(look.weapon)];
  return { idle: "Idle_Loop", walk: "Walk_Loop", run: "Run_Fwd_Loop", attack, bigAttack, cast: "Spell_Simple_Shoot", shoot, battleCry: "Battle_Cry", hit: "Hit_Chest", death: "Death01" };
}
