import * as THREE from "three";
import { MeshOut } from "./body.js";

// A four-legged body, so far a wolf's: a skeleton and a low-poly skin over it, as body.js builds a
// humanoid's, and its clips, made here rather than baked: idle, walk, run, attack (a bite), a big
// attack (a leap), cast (a howl), hit and death, by quadrupedClips. A look (recipe.js) shapes it by
// height (to the top of the head), build (its girth), limbs (its legs' thickness), head (its head's
// size) and colors: skin the fur, hair the darker back and tail tip, eyes.
//
// Positions are feet for a body 3 ft to the top of its head: feet on y = 0, facing +z, its left
// toward +x. Bones rest unturned, so a clip's turns are about the continent's axes: about x,
// positive tips a bone pointing up forward and one pointing forward down.

const HEIGHT_FT = 3;
const JOINTS = [
  ["root", null, [0, 0, 0]],
  ["pelvis", "root", [0, 2.05, -1.15]],
  ["spine_01", "pelvis", [0, 2.12, -0.55]],
  ["spine_02", "spine_01", [0, 2.15, 0.05]],
  ["spine_03", "spine_02", [0, 2.1, 0.6]],
  ["neck_01", "spine_03", [0, 2.3, 1.0]],
  ["head", "neck_01", [0, 2.62, 1.38]],
  ["jaw", "head", [0, 2.5, 1.5]],
  ["tail_01", "pelvis", [0, 2.15, -1.5]],
  ["tail_02", "tail_01", [0, 1.85, -1.95]],
  ["tail_03", "tail_02", [0, 1.45, -2.25]],
  ["upperarm_l", "spine_03", [0.3, 1.85, 0.7]],
  ["lowerarm_l", "upperarm_l", [0.3, 1.05, 0.62]],
  ["hand_l", "lowerarm_l", [0.29, 0.3, 0.68]],
  ["thigh_l", "pelvis", [0.3, 1.95, -1.15]],
  ["calf_l", "thigh_l", [0.3, 1.2, -0.85]],
  ["foot_l", "calf_l", [0.3, 0.7, -1.25]],
  ["ball_l", "foot_l", [0.3, 0.12, -1.12]],
];
export const QUADRUPED_PELVIS_FT = 2.05;

const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, k) => a.map((v) => v * k);
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const shade = (rgb, f) => rgb.map((v) => Math.min(1, v * f));

// The skeleton: [{ name, parent, at }], parents first, scaled to the look's height.
export function quadrupedSkeleton(look) {
  const s = look.height / HEIGHT_FT;
  const joints = [];
  for (const [name, parent, at] of JOINTS) {
    joints.push({ name, parent, at: mul(at, s) });
    if (name.endsWith("_l")) joints.push({ name: name.replace(/_l$/, "_r"), parent: parent.replace(/_l$/, "_r"), at: mul([-at[0], at[1], at[2]], s) });
  }
  return joints;
}

// Mesh data for a look, as body.js's bodyMesh gives it.
export function quadrupedMesh(look) {
  const bones = quadrupedSkeleton(look);
  const index = new Map(bones.map((b, i) => [b.name, i]));
  const s = look.height / HEIGHT_FT;
  const girth = 1.0 + 0.3 * look.build;
  const limb = 1.1 + 0.5 * look.limbs;
  const big = 0.7 + 0.6 * look.head;
  const c = Object.fromEntries(Object.entries(look.colors).map(([k, v]) => [k, hex(v)]));
  const [fur, back, belly, dark] = [c.skin, c.hair, shade(c.skin, 1.3), [0.08, 0.07, 0.07]];
  const out = new MeshOut(index);
  const p = (v) => mul(v, s);
  // Head points grow or shrink about the head's joint.
  const HEAD = JOINTS.find(([name]) => name === "head")[2];
  const h = (v) => p(add(HEAD, mul(sub(v, HEAD), big)));
  // Rings facing +z, their front down: angle 0 is the belly, ±π the back.
  const ring = (center, rx, rz, bones) => ({ center, dir: [0, 0, 1], rx: rx * s, rz: rz * s, bones });
  const furColor = (angle) => (Math.abs(angle) > 2.1 ? back : Math.abs(angle) < 0.8 ? belly : fur);

  // The body, rump to the base of the neck, deep at the chest, a darker saddle along the back.
  const trunk = [
    [[-1.55, 2.05], 0.12, 0.12, [["pelvis", 1]]],
    [[-1.42, 2.04], 0.3, 0.33, [["pelvis", 1]]],
    [[-1.15, 2.0], 0.36, 0.42, [["pelvis", 1]]],
    [[-0.75, 2.02], 0.33, 0.4, [["pelvis", 0.4], ["spine_01", 0.6]]],
    [[-0.3, 2.04], 0.31, 0.4, [["spine_01", 1]]],
    [[0.15, 1.98], 0.37, 0.52, [["spine_02", 1]]],
    [[0.55, 1.95], 0.41, 0.58, [["spine_03", 1]]],
    [[0.88, 2.06], 0.38, 0.52, [["spine_03", 1]]],
    [[1.08, 2.28], 0.3, 0.36, [["spine_03", 0.4], ["neck_01", 0.6]]],
    [[1.25, 2.45], 0.27, 0.3, [["neck_01", 1]]],
    [[1.36, 2.58], 0.25, 0.27, [["neck_01", 0.4], ["head", 0.6]]],
  ].map(([[z, y], rx, rz, bones]) => ring(p([0, y, z]), rx * girth, rz * girth, bones));
  out.tube(trunk, 12, (band, angle) => furColor(angle), { capStart: true });

  // The head, back of the skull to the nose, and the lower jaw under it on its own bone.
  const headBones = [["head", 1]];
  const skull = [
    [[1.24, 2.67], 0.12, 0.12],
    [[1.32, 2.69], 0.25, 0.25],
    [[1.46, 2.67], 0.27, 0.26],
    [[1.62, 2.63], 0.21, 0.19],
    [[1.82, 2.57], 0.13, 0.1],
    [[2.0, 2.52], 0.1, 0.07],
    [[2.13, 2.49], 0.07, 0.05],
  ].map(([[z, y], rx, rz]) => ({ ...ring(h([0, y, z]), rx * big, rz * big, headBones) }));
  out.tube(skull, 10, (band, angle) => (band >= 4 && Math.abs(angle) > 2.3 ? back : band >= 3 && Math.abs(angle) < 0.9 ? belly : fur), { capStart: true, capEnd: true, endColor: dark });
  const jaw = [
    [[1.52, 2.5], 0.15, 0.07],
    [[1.78, 2.44], 0.11, 0.05],
    [[2.04, 2.4], 0.06, 0.035],
  ].map(([[z, y], rx, rz]) => ring(h([0, y, z]), rx * big, rz * big, [["jaw", 1]]));
  out.tube(jaw, 8, () => belly, { capStart: true, capEnd: true });
  out.gem(h([0, 2.51, 2.16]), 0.05 * s * big, dark, headBones);
  for (const side of [-1, 1]) {
    // Eyes, set forward on the skull; ears, upright blades.
    out.gem(h([side * 0.15, 2.72, 1.63]), 0.04 * s * big, c.eyes, headBones);
    out.gem(h([side * 0.17, 2.73, 1.65]), 0.018 * s * big, dark, headBones);
    const ear = [h([side * 0.13, 2.84, 1.4]), h([side * 0.16, 3.0, 1.37]), h([side * 0.18, 3.16, 1.33])];
    out.path(ear, [0.09, 0.055, 0.008].map((r) => r * s * big), 6, () => back, () => headBones, { capStart: true, capEnd: true, depth: [0.03, 0.03, 0.03].map((r) => r * s * big) });
  }

  // Legs: a row of [point, radius, bones] each, the top of each sunk into the body.
  const at = (name) => bones[index.get(name)].at;
  const mid = (a, b, t = 0.5) => add(at(a), mul(sub(at(b), at(a)), t));
  const leg = (rows) => {
    const radii = rows.map(([, r]) => r * limb * s);
    out.path(rows.map(([point]) => point), radii, 8, (band) => (band >= rows.length - 3 ? shade(fur, 0.8) : fur), (i) => rows[i][2], { capStart: true, capEnd: true, carry: true });
  };
  for (const side of ["l", "r"]) {
    const n = (name) => `${name}_${side}`;
    leg([
      [add(at(n("upperarm")), p([0, 0.3, 0.02])), 0.2, [["spine_03", 0.6], [n("upperarm"), 0.4]]],
      [at(n("upperarm")), 0.18, [[n("upperarm"), 1]]],
      [mid(n("upperarm"), n("lowerarm")), 0.13, [[n("upperarm"), 1]]],
      [at(n("lowerarm")), 0.085, [[n("upperarm"), 0.5], [n("lowerarm"), 0.5]]],
      [mid(n("lowerarm"), n("hand")), 0.07, [[n("lowerarm"), 1]]],
      [at(n("hand")), 0.065, [[n("lowerarm"), 0.5], [n("hand"), 0.5]]],
      [add(at(n("hand")), p([0, -0.17, 0.07])), 0.08, [[n("hand"), 1]]],
      [add(at(n("hand")), p([0, -0.24, 0.2])), 0.06, [[n("hand"), 1]]],
    ]);
    leg([
      [add(at(n("thigh")), p([0, 0.22, 0.05])), 0.26, [["pelvis", 0.6], [n("thigh"), 0.4]]],
      [at(n("thigh")), 0.23, [[n("thigh"), 1]]],
      [mid(n("thigh"), n("calf")), 0.17, [[n("thigh"), 1]]],
      [at(n("calf")), 0.1, [[n("thigh"), 0.5], [n("calf"), 0.5]]],
      [mid(n("calf"), n("foot")), 0.075, [[n("calf"), 1]]],
      [at(n("foot")), 0.06, [[n("calf"), 0.5], [n("foot"), 0.5]]],
      [mid(n("foot"), n("ball")), 0.055, [[n("foot"), 1]]],
      [at(n("ball")), 0.07, [[n("foot"), 0.5], [n("ball"), 0.5]]],
      [add(at(n("ball")), p([0, -0.07, 0.18])), 0.06, [[n("ball"), 1]]],
    ]);
  }

  // A bushy tail, dark at the tip.
  const tail = [at("tail_01"), mid("tail_01", "tail_02"), at("tail_02"), mid("tail_02", "tail_03"), at("tail_03"), add(at("tail_03"), p([0, -0.3, -0.12]))];
  const tailBones = [[["tail_01", 1]], [["tail_01", 1]], [["tail_01", 0.4], ["tail_02", 0.6]], [["tail_02", 1]], [["tail_02", 0.4], ["tail_03", 0.6]], [["tail_03", 1]]];
  out.path(tail, [0.08, 0.13, 0.16, 0.16, 0.12, 0.02].map((r) => r * s * girth), 8, (band) => (band >= 4 ? back : fur), (i) => tailBones[i], { capStart: true, capEnd: true, carry: true });

  return { bones, ...out.arrays() };
}

// Clips are sampled this many times a second.
const FPS = 30;

// One clip from pose(t), t in seconds from 0 to `duration`, giving { bones: { name: [x, y, z] }
// (turns, radians, about the continent's axes), pelvis: [x, y, z] (feet for a 3 ft body) }.
function sampled(name, duration, pose, mesh, s, speed = 0) {
  const frames = Math.max(2, Math.round(duration * FPS) + 1);
  const times = Float32Array.from({ length: frames }, (_, f) => (f / (frames - 1)) * duration);
  const poses = [...times].map((t) => pose(t));
  const names = [...new Set(poses.flatMap((q) => Object.keys(q.bones ?? {})))];
  const euler = new THREE.Euler();
  const turn = new THREE.Quaternion();
  const tracks = names.map((bone) => {
    const values = new Float32Array(frames * 4);
    poses.forEach((q, f) => turn.setFromEuler(euler.set(...(q.bones[bone] ?? [0, 0, 0]))).toArray(values, f * 4));
    return new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values);
  });
  const rest = mesh.skeleton.getBoneByName("pelvis").position;
  const positions = new Float32Array(frames * 3);
  poses.forEach((q, f) => [0, 1, 2].forEach((k) => (positions[f * 3 + k] = rest.getComponent(k) + (q.pelvis?.[k] ?? 0) * s)));
  tracks.push(new THREE.VectorKeyframeTrack("pelvis.position", times, positions));
  const clip = new THREE.AnimationClip(name, duration, tracks);
  clip.userData = { speed };
  return clip;
}

const TAU = Math.PI * 2;
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
// Rises to 1 from `a` to `b`, holds, and falls back to 0 from `c` to `d`, eased, u from 0 to 1.
const hump = (u, a, b, c, d) => ease((u - a) / (b - a)) * (1 - ease((u - c) / (d - c)));

// The legs' turns for a gait at phase u (0-1 through its cycle): each leg swings `swing` radians
// either way at its own phase, folding as it comes forward by `lift`.
function legs(u, swing, lift, phases) {
  const bones = {};
  for (const [leg, at] of Object.entries(phases)) {
    const a = TAU * (u + at);
    const angle = swing * Math.sin(a);
    const fold = lift * Math.max(0, -Math.cos(a));
    if (leg.startsWith("front")) {
      const side = leg.endsWith("l") ? "l" : "r";
      bones[`upperarm_${side}`] = [angle, 0, 0];
      bones[`lowerarm_${side}`] = [fold * 1.1, 0, 0];
      bones[`hand_${side}`] = [fold * 0.7, 0, 0];
    } else {
      const side = leg.endsWith("l") ? "l" : "r";
      bones[`thigh_${side}`] = [angle - fold * 0.3, 0, 0];
      bones[`calf_${side}`] = [fold * 0.8, 0, 0];
      bones[`foot_${side}`] = [-fold * 0.9, 0, 0];
    }
  }
  return bones;
}

// The clips for a quadruped mesh, by name: Idle_Loop, Walk_Loop, Run_Fwd_Loop, Bite, Leap, Howl,
// Hit and Death. Walking and running keep their speed, feet a second for a 3 ft body, in
// userData.speed.
export function quadrupedClips(mesh) {
  const s = mesh.userData.scale;
  const clip = (name, duration, pose, speed) => sampled(name, duration, pose, mesh, s, speed);
  const clips = [
    clip("Idle_Loop", 3, (t) => {
      const u = t / 3;
      return {
        bones: { spine_02: [0.02 * Math.sin(TAU * u * 2), 0, 0], neck_01: [0.05 * Math.sin(TAU * u), 0.12 * Math.sin(TAU * u), 0], tail_01: [0, 0.12 * Math.sin(TAU * u), 0], tail_02: [0, 0.1 * Math.sin(TAU * u - 0.6), 0] },
        pelvis: [0, 0.01 * Math.sin(TAU * u * 2), 0],
      };
    }),
    // Walking: each foot in turn, back left, front left, back right, front right.
    clip(
      "Walk_Loop",
      1.1,
      (t) => {
        const u = t / 1.1;
        return {
          bones: { ...legs(u, 0.32, 0.55, { back_l: 0, front_l: 0.25, back_r: 0.5, front_r: 0.75 }), neck_01: [0.04 * Math.sin(TAU * u * 2), 0, 0], tail_01: [0.1, 0.12 * Math.sin(TAU * u), 0] },
          pelvis: [0, -0.025 * Math.cos(TAU * u * 2), 0],
        };
      },
      4.5,
    ),
    // Running: a gallop, the back legs together then the front, the back arching and stretching.
    clip(
      "Run_Fwd_Loop",
      0.5,
      (t) => {
        const u = t / 0.5;
        const flex = Math.sin(TAU * u);
        return {
          bones: { ...legs(u, 0.65, 0.9, { back_l: 0, back_r: 0.08, front_l: 0.5, front_r: 0.58 }), spine_01: [-0.12 * flex, 0, 0], spine_03: [0.08 * flex, 0, 0], neck_01: [0.12 + 0.08 * flex, 0, 0], tail_01: [-0.3, 0, 0] },
          pelvis: [0, 0.12 * Math.sin(TAU * u - 1), 0],
        };
      },
      22,
    ),
    // A bite: a lunge, the head forward and low, the jaw open, then snapping shut.
    clip("Bite", 0.7, (t) => {
      const u = t / 0.7;
      const lunge = hump(u, 0.05, 0.35, 0.5, 0.95);
      const open = hump(u, 0.1, 0.3, 0.38, 0.45);
      return {
        bones: { neck_01: [0.35 * lunge, 0, 0], head: [-0.2 * lunge, 0, 0], jaw: [0.7 * open, 0, 0], upperarm_l: [-0.2 * lunge, 0, 0], upperarm_r: [-0.2 * lunge, 0, 0], thigh_l: [0.15 * lunge, 0, 0], thigh_r: [0.15 * lunge, 0, 0] },
        pelvis: [0, -0.1 * lunge, 0.35 * lunge],
      };
    }),
    // A leap: crouching, springing forward with the forelegs reaching and the jaw wide, landing.
    clip("Leap", 1.2, (t) => {
      const u = t / 1.2;
      const crouch = hump(u, 0, 0.25, 0.3, 0.38) + 0.6 * hump(u, 0.7, 0.78, 0.82, 1);
      const air = hump(u, 0.3, 0.5, 0.55, 0.72);
      const reach = hump(u, 0.32, 0.48, 0.6, 0.72);
      const open = hump(u, 0.35, 0.5, 0.62, 0.7);
      const tuck = 0.8 * crouch;
      return {
        bones: {
          upperarm_l: [-1.0 * reach + 0.3 * crouch, 0, 0],
          upperarm_r: [-1.0 * reach + 0.3 * crouch, 0, 0],
          lowerarm_l: [tuck * 0.6, 0, 0],
          lowerarm_r: [tuck * 0.6, 0, 0],
          thigh_l: [-tuck * 0.5 + 0.6 * air, 0, 0],
          thigh_r: [-tuck * 0.5 + 0.6 * air, 0, 0],
          calf_l: [tuck, 0, 0],
          calf_r: [tuck, 0, 0],
          foot_l: [-tuck, 0, 0],
          foot_r: [-tuck, 0, 0],
          neck_01: [0.2 * reach - 0.1 * crouch, 0, 0],
          jaw: [0.8 * open, 0, 0],
          tail_01: [-0.4 * air, 0, 0],
        },
        pelvis: [0, -0.35 * crouch + 0.7 * air, 0.8 * air],
      };
    }),
    // A howl, nose up and jaw open, the cast.
    clip("Howl", 2.2, (t) => {
      const u = t / 2.2;
      const up = hump(u, 0, 0.2, 0.8, 1);
      return {
        bones: { neck_01: [-0.45 * up, 0, 0], head: [-0.45 * up, 0, 0], jaw: [0.4 * hump(u, 0.18, 0.25, 0.75, 0.82), 0, 0], spine_03: [-0.08 * up, 0, 0], thigh_l: [-0.15 * up, 0, 0], thigh_r: [-0.15 * up, 0, 0], calf_l: [0.3 * up, 0, 0], calf_r: [0.3 * up, 0, 0], foot_l: [-0.3 * up, 0, 0], foot_r: [-0.3 * up, 0, 0] },
        pelvis: [0, -0.18 * up, 0],
      };
    }),
    // Struck: a flinch to one side, the head back.
    clip("Hit", 0.45, (t) => {
      const k = hump(t / 0.45, 0, 0.2, 0.35, 1);
      return { bones: { spine_02: [0, 0.2 * k, 0.08 * k], neck_01: [-0.3 * k, 0.15 * k, 0], jaw: [0.3 * k, 0, 0] }, pelvis: [0, 0, -0.15 * k] };
    }),
    // Dying: the legs give, and it rolls onto its side, held there.
    clip("Death", 1.4, (t) => {
      const u = t / 1.4;
      const buckle = ease(u / 0.4);
      const roll = ease((u - 0.25) / 0.55);
      const limp = { upperarm_l: [0.5 * roll, 0, 0], upperarm_r: [-0.2 * roll, 0, 0], lowerarm_l: [0.6 * buckle, 0, 0], lowerarm_r: [0.6 * buckle, 0, 0], calf_l: [0.6 * buckle, 0, 0], calf_r: [0.6 * buckle, 0, 0], foot_l: [-0.6 * buckle, 0, 0], foot_r: [-0.6 * buckle, 0, 0] };
      return {
        bones: { ...limp, pelvis: [0, 0, 1.45 * roll], neck_01: [0.3 * buckle, 0, -0.3 * roll], head: [0, 0, -0.2 * roll], tail_01: [-0.5 * roll, 0, 0] },
        pelvis: [0, -(QUADRUPED_PELVIS_FT - 0.45) * (0.35 * buckle + 0.65 * roll), 0],
      };
    }),
  ];
  return new Map(clips.map((c) => [c.name, c]));
}
