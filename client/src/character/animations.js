import * as THREE from "three";
import url from "./animations.json?url";
import { POSED, posedClip, posedSpeed } from "./posed.js";
import { extraSway } from "./extras.js";
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

// Baked swings too slow for a melee hit landing 0.3 s in (timeline.js's MELEE_STRIKE_S): when each
// reaches its target, and how much faster to play what comes after. What's before plays in 0.3 s.
const STRIKE_S = 0.3;
const SLOW_SWINGS = { Sword_Attack: { strikes: 0.4, after: 1.5 }, Zombie_Scratch: { strikes: 0.57, after: 1.5 } };
const retimed = (times, { strikes, after }) => times.map((t) => (t <= strikes ? (t * STRIKE_S) / strikes : STRIKE_S + (t - strikes) / after));

// Every clip as a three.js AnimationClip for this character, by name. A clip that moves along the
// ground keeps its speed, for a 6ft body, in userData.speed.
// A character's clips, each built the first time something asks for it, since a character only ever
// plays a few of them. It reads as a Map of them all.
class LazyClips extends Map {
  constructor(names, build) {
    super();
    this.names = new Set(names);
    this.build = build;
  }

  has(name) {
    return this.names.has(name);
  }

  get(name) {
    if (!super.has(name) && this.names.has(name)) super.set(name, this.build(name));
    return super.get(name);
  }

  set(name, clip) {
    this.names?.add(name);
    return super.set(name, clip);
  }

  get size() {
    return this.names.size;
  }

  keys() {
    return this.names.values();
  }

  *values() {
    for (const name of this.names) yield this.get(name);
  }

  *entries() {
    for (const name of this.names) yield [name, this.get(name)];
  }

  [Symbol.iterator]() {
    return this.entries();
  }

  forEach(callback) {
    for (const [name, clip] of this.entries()) callback(clip, name, this);
  }
}

// A baked clip's decoded numbers are the same for everyone, so everyone shares them. Nothing writes to them.
const decoded = new WeakMap();
function sharedDecode(baked, name) {
  if (!decoded.has(baked)) decoded.set(baked, new Map());
  const clips = decoded.get(baked);
  if (!clips.has(name)) clips.set(name, decodeClip(baked, name));
  return clips.get(name);
}

export function characterClips(mesh, baked) {
  const frame = FRAMES[mesh.userData.skeleton];
  if (frame) return frame.clips(mesh, mesh.userData.look);
  const s = mesh.userData.scale;
  const rest = mesh.skeleton.getBoneByName("pelvis").position;
  // A tail and wings sway through every clip, since the baked clips don't move them.
  const extras = mesh.skeleton.bones.map((b) => b.name).filter((name) => /^(tail|wing|lower|fore|hind|horsetail)_0/.test(name));
  const lowerArms = mesh.skeleton.getBoneByName("upperarm2_l") ? ["clavicle_l", "upperarm_l", "lowerarm_l", "hand_l"].flatMap((b) => [b, b.replace(/_l$/, "_r")]) : [];
  const euler = new THREE.Euler();
  const turn = new THREE.Quaternion();
  return new LazyClips(clipNames(baked), (name) => {
    const { times: playedAt, rotations, pelvis } = POSED[name] ? posedClip(name, mesh.userData.joints, s, baked.fps) : sharedDecode(baked, name);
    const times = SLOW_SWINGS[name] ? Float32Array.from(retimed(playedAt, SLOW_SWINGS[name])) : playedAt;
    const tracks = Object.entries(rotations).map(([bone, values]) => new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values));
    // A second pair of arms moves as the first.
    for (const bone of lowerArms) if (rotations[bone]) tracks.push(new THREE.QuaternionKeyframeTrack(`${bone.replace(/_([lr])$/, "2_$1")}.quaternion`, times, rotations[bone]));
    const positions = pelvis.map((v, i) => rest.getComponent(i % 3) + v * s);
    tracks.push(new THREE.VectorKeyframeTrack("pelvis.position", times, positions));
    const duration = times[times.length - 1] || 1 / baked.fps;
    const speed = POSED[name] ? posedSpeed(name) : baked.clips[name].speed;
    for (const [bone, sway] of Object.entries(extraSway(extras, duration, speed))) {
      const values = new Float32Array(times.length * 4);
      times.forEach((t, f) => turn.setFromEuler(euler.set(...sway(t))).toArray(values, f * 4));
      tracks.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values));
    }
    const clip = new THREE.AnimationClip(name, duration, tracks);
    clip.userData = { speed };
    return clip;
  });
}

// How fast to play a clip that moves along the ground so a character's feet keep pace with it
// going `speed` ft a second, and don't slide: 1 for a clip that doesn't move.
export function strideRate(clip, mesh, speed) {
  const ground = (clip?.userData.speed ?? 0) * mesh.userData.scale;
  return ground > 0 ? speed / ground : 1;
}

// What a creature does, each played by one of its clips: idle, walk, run, attack, battleCry (an
// enrage or a rallying shout), hit and death for every body, and fly, bigAttack, cast, shoot and
// breath (fire or the like, from its mouth bone) for those that can.
export const ROLES = ["idle", "walk", "run", "fly", "attack", "bigAttack", "cast", "shoot", "breath", "battleCry", "hit", "death", "pray", "windup", "released"];

// The clip for each of ROLES for a look (recipe.js's resolveRecipe), by its skeleton
// (frames.js's skeletonOf), or null where it has none. A humanoid's attacks go with how its weapon
// attacks (weapons.js's attackGroup), and it shoots only with something to shoot or throw.
// windup holds a melee ability's cast, released is the swing that comes straight out of it, and
// ready is how it stands with its weapon out.
const HOLDS = {
  oneHanded: { windup: "Sword_Idle", ready: "Sword_Idle" },
  twoHanded: { windup: "TwoHand_Windup_Loop", released: "TwoHand_Sweep_Release", ready: "TwoHand_Idle_Loop" },
};
const ATTACKS = {
  unarmed: ["Punch_Jab", "Punch_Cross", null],
  oneHanded: ["Sword_Attack", "Sword_Regular_B", null],
  twoHanded: ["TwoHand_Chop", "TwoHand_Sweep", null],
  bow: ["Bow_Shoot", "Bow_Shoot", "Bow_Shoot"],
  firearm: ["Firearm_Shoot", "Firearm_Shoot", "Firearm_Shoot"],
  thrown: ["OverhandThrow", "OverhandThrow", "OverhandThrow"],
};

// A humanoid empty-handed tears with its hands when its look fights with claws; a shambling one
// stands, walks and runs as a zombie does.
export function roleClips(look, skeleton) {
  if (FRAMES[skeleton]) return FRAMES[skeleton].roles(look);
  const group = attackGroup(look.weapon);
  const [attack, bigAttack, shoot] = group === "unarmed" && look.unarmed === "claw" ? ["Zombie_Scratch", "Zombie_Scratch", null] : ATTACKS[group];
  const moves = look.gait === "shamble" ? { idle: "Zombie_Idle_Loop", walk: "Zombie_Walk_Fwd_Loop", run: "Zombie_Walk_Fwd_Loop" } : { idle: "Idle_Loop", walk: "Walk_Loop", run: "Run_Fwd_Loop" };
  return { ...moves, attack, bigAttack, cast: "Spell_Simple_Shoot", shoot, battleCry: "Battle_Cry", hit: "Hit_Chest", death: "Death01", pray: "Pray", ...HOLDS[group] };
}
