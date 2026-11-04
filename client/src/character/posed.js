import * as THREE from "three";
import { HELD } from "./weapons.js";

// Hand-posed clips, for what the animation library lacks: sitting on the ground, two-handed
// weapons, bows, and running, strafing, backing up and turning at the game's pace. Each is a list of
// [time, pose] keyframes, eased from one to the next, or a gait (below) that gives the pose at
// any time through its cycle. A pose gives:
// - pelvis: how far the pelvis moves from rest, in feet for a 6ft body.
// - bones: each bone's turn from rest, as XYZ euler angles relative to its parent. Every bone
//   points along its rest direction unturned, so a turn about x swings it: negative forward (+z),
//   positive back. A turn about y turns it toward its left (+x); about z swings a left limb out,
//   a right one in. Bones left out stay at rest.
// - reach: places for the hands, which the arms bend to reach, overriding their bones' turns.
//   { item, grip, dir, front } puts the grip of a held item (weapons.js) at `grip`, the item
//   pointing along `dir` with its front toward `front`. { along: hand, back, roll } grips the other
//   hand's item `back` feet further down, the hand turned `roll` radians round it from the way the
//   other hand faces. { wrist } puts the wrist there, the hand straight on
//   the forearm. `elbow` is the way the elbow points.
// - feet: where the ankles go, the legs bending to reach them and the feet kept flat.
// - feetYaw: how far each foot (and its knee) is turned about the vertical, toward the left, in
//   radians; straight ahead without.
// - knees: the way each knee points, by its foot, overriding the turn feetYaw gives it.
// Places are in feet for a 6ft body, from the ground beneath the character's middle, facing +z.

// Sitting cross-legged on the ground: knees out to the sides, each foot tucked under the other
// knee, hands resting on the knees.
const SITTING = {
  pelvis: [0, -2.72, -0.1],
  feet: { foot_l: [-0.32, 0.18, 0.5], foot_r: [0.32, 0.24, 0.72] },
  feetYaw: { foot_l: -1.3, foot_r: 1.3 },
  knees: { foot_l: [1, 0.35, 0.5], foot_r: [-1, 0.35, 0.5] },
  bones: {
    spine_01: [0.08, 0, 0],
    spine_02: [0.06, 0, 0],
    head: [0.06, 0, 0],
    upperarm_l: [-0.25, 0, 0.2],
    upperarm_r: [-0.25, 0, -0.2],
    lowerarm_l: [-1.0, 0, 0],
    lowerarm_r: [-1.0, 0, 0],
  },
};
// Halfway down: crouched, leaning forward over the knees.
const CROUCHED = {
  pelvis: [0, -1.45, -0.2],
  feet: { foot_l: [0.4, 0.32, 0.1], foot_r: [-0.4, 0.32, 0.1] },
  knees: { foot_l: [0.6, 0, 1], foot_r: [-0.6, 0, 1] },
  bones: {
    spine_01: [0.25, 0, 0],
    spine_02: [0.15, 0, 0],
    upperarm_l: [-0.5, 0, 0.1],
    upperarm_r: [-0.5, 0, -0.1],
    lowerarm_l: [-0.5, 0, 0],
    lowerarm_r: [-0.5, 0, 0],
  },
};
const STANDING = { pelvis: [0, 0, 0], feet: { foot_l: [0.35, 0.32, 0], foot_r: [-0.35, 0.32, 0] }, bones: {} };
// Breathing in while sitting: the chest lifts a little.
const BREATH = { ...SITTING, bones: { ...SITTING.bones, spine_02: [0.08, 0, 0], head: [0.06, 0.08, 0] } };

// A two-handed weapon: the right hand by the guard, the left below it, in a fighting stance with
// the left foot forward. Each swing starts and ends at the ready.
const STANCE = { pelvis: [0, -0.2, 0.02], feet: { foot_l: [0.6, 0.32, 0.55], foot_r: [-0.6, 0.32, -0.45] } };
const ARMS_DOWN = { hand_r: [-0.6, -0.7, -0.2], hand_l: [0.6, -0.7, -0.2] };
const twoHanded = (bones, grip, dir, front, elbows = ARMS_DOWN) => ({
  ...STANCE,
  bones,
  reach: {
    hand_r: { item: "greatsword", grip, dir, front, elbow: elbows.hand_r },
    hand_l: { along: "hand_r", back: 0.5, roll: 0, elbow: elbows.hand_l },
  },
});
const READY = twoHanded({ spine_01: [0.08, -0.15, 0], head: [0, 0.15, 0] }, [-0.1, 3.4, 1.05], [0.15, 0.75, 0.55], [0, 0, 1]);
const READY_BREATH = twoHanded({ spine_01: [0.06, -0.15, 0], spine_02: [-0.03, 0, 0], head: [0, 0.15, 0] }, [-0.1, 3.47, 1.03], [0.15, 0.75, 0.55], [0, 0, 1]);
// Poses for the keyframes from `start` to `end`, evenly spaced, after the first (already keyed at
// `start`): the body moves through them without stopping, easing only out of the first and into
// the last.
const through = (start, end, poses) =>
  poses.slice(1).map((pose, i, rest) => [start + ((i + 1) / rest.length) * (end - start), i < rest.length - 1 ? { ...pose, through: true } : pose]);
// The overhead chop: crouched, leaning back with the blade over the right shoulder and the
// shoulders shrugged up, then rolling the blade up over the head and on down ahead in one even arc,
// bending forward from the hips, knees giving, arms out straight, and on down to the left.
const CHOP_STANCE = (drop) => ({ ...STANCE, pelvis: [0, STANCE.pelvis[1] - drop, STANCE.pelvis[2]] });
const SHRUG = (up) => ({ clavicle_l: [0, 0, up], clavicle_r: [0, 0, -up] });
const WOUND = {
  ...twoHanded({ pelvis: [-0.08, -0.15, 0], spine_01: [-0.12, -0.3, 0], spine_02: [-0.1, -0.15, 0], head: [0.15, 0.4, 0], ...SHRUG(0.3) }, [-0.4, 5.55, -0.15], [-0.25, 0.25, -0.95], [0, 1, 0], {
    hand_r: [-1, 0.1, -0.3],
    hand_l: [0.6, -0.4, 0.5],
  }),
  ...CHOP_STANCE(0.15),
};
const OVERHEAD = {
  ...twoHanded({ pelvis: [-0.04, 0, 0], spine_01: [-0.08, -0.1, 0], spine_02: [-0.05, 0, 0], head: [0.1, 0.1, 0], ...SHRUG(0.35) }, [-0.15, 6.05, 0.55], [0, 0.55, -0.85], [0, 0.85, 0.55], {
    hand_r: [-1, 0, 0.1],
    hand_l: [1, 0, 0.1],
  }),
  ...CHOP_STANCE(0.05),
};
// The blade straight up over the head, then out ahead at shoulder height, its edge leading.
const ABOVE = {
  ...twoHanded({ pelvis: [0.04, 0.03, 0], spine_01: [0.06, -0.04, 0], spine_02: [0.03, 0, 0], head: [0, 0.05, 0], ...SHRUG(0.3) }, [-0.08, 6.15, 1.2], [0.02, 1, 0.05], [0, -0.05, 1], {
    hand_r: [-1, -0.2, 0],
    hand_l: [1, -0.2, 0],
  }),
  ...CHOP_STANCE(0.1),
};
const AHEAD = {
  ...twoHanded({ pelvis: [0.12, 0.06, 0], spine_01: [0.22, 0.04, 0], spine_02: [0.14, 0, 0], head: [-0.2, 0, 0], ...SHRUG(0.12) }, [0, 4.8, 2.3], [0.05, 0.4, 0.92], [0, -0.92, 0.4], {
    hand_r: [-0.8, -0.5, -0.1],
    hand_l: [0.8, -0.5, -0.1],
  }),
  ...CHOP_STANCE(0.25),
};
const CHOPPED = {
  ...twoHanded({ pelvis: [0.2, 0.08, 0], spine_01: [0.35, 0.08, 0], spine_02: [0.22, 0, 0], head: [-0.4, 0, 0] }, [0.05, 2.85, 2.7], [0.1, -0.45, 0.9], [0, -0.9, -0.45]),
  ...CHOP_STANCE(0.35),
};
const FOLLOWED = {
  ...twoHanded({ pelvis: [0.25, 0.2, 0], spine_01: [0.4, 0.25, 0], spine_02: [0.2, 0.1, 0], head: [-0.45, -0.25, 0] }, [0.6, 2.0, 2.15], [0.35, -0.85, 0.35], [0, -0.5, -0.85]),
  ...CHOP_STANCE(0.4),
};
// The sweep, posed in Cascadeur: the whole body wound round to the right as it loads, the left
// shoulder leading, the handle by the right side of the head and the blade out behind; then the
// hips open and haul the blade round in a wide arc across the front, the right foot stepping
// through, to end on the left pointing mostly ahead, a little down and left. Each pose is a frame
// of that animation, its blade smoothed onto an even arc (script/cascadeur_pose.mjs).
const SWEEP = [
  {
    pelvis: [0.02, -0.57, 0.27],
    bones: { pelvis: [0.25, -0.62, 0.23], spine_01: [0.01, -0.03, -0.01], spine_02: [0.02, -0.03, -0.01], spine_03: [0.02, -0.01, 0], neck_01: [-0.07, 0.16, -0.03], head: [-0.22, 0.19, 0], clavicle_l: [0.1, -0.25, 0.69], clavicle_r: [0.09, 0.02, -0.49] },
    reach: {
      hand_r: { item: "greatsword", grip: [-1.56, 5.65, 0.61], dir: [0.41, 0.33, -0.85], front: [0.05, 0.92, 0.38], elbow: [-0.79, -0.61, -0.07] },
      hand_l: { along: "hand_r", back: 0.5, roll: 0, elbow: [0.01, -0.17, 0.99] },
    },
    feet: { foot_l: [1.1, 0.37, -0.14], foot_r: [-0.23, 0.56, -0.08] },
    feetYaw: { foot_l: -0.48, foot_r: -0.76 },
    knees: { foot_l: [-0.38, -0.38, 0.84], foot_r: [-0.72, -0.05, 0.7] },
  },
  {
    pelvis: [0.03, -0.54, 0.25],
    bones: { pelvis: [0.03, -0.66, 0.12], spine_01: [0.13, -0.03, 0], spine_02: [0.12, -0.02, -0.01], spine_03: [0.06, 0, -0.01], neck_01: [-0.17, 0.19, -0.04], head: [-0.23, 0.24, 0], clavicle_l: [0.26, -0.64, 0.46], clavicle_r: [0.14, 0.34, -0.3] },
    reach: {
      hand_r: { item: "greatsword", grip: [-2.29, 4.1, 1.34], dir: [-0.32, 0.47, -0.83], front: [-0.66, 0.45, 0.5], elbow: [0.05, -0.98, -0.2] },
      hand_l: { along: "hand_r", back: 0.5, roll: 0, elbow: [0.44, -0.59, 0.68] },
    },
    feet: { foot_l: [1.13, 0.34, -0.14], foot_r: [-0.23, 0.55, -0.1] },
    feetYaw: { foot_l: -0.39, foot_r: -0.64 },
    knees: { foot_l: [-0.25, -0.34, 0.91], foot_r: [-0.61, -0.06, 0.79] },
  },
  {
    pelvis: [0.03, -0.54, 0.27],
    bones: { pelvis: [0.19, -0.6, 0.13], spine_01: [0.04, -0.05, 0], spine_02: [0.04, -0.05, 0], spine_03: [0.03, -0.01, 0], neck_01: [-0.05, 0.1, -0.01], head: [-0.12, 0.16, 0], clavicle_l: [0.16, -0.35, 0.13], clavicle_r: [0.21, 0.27, -0.16] },
    reach: {
      hand_r: { item: "greatsword", grip: [-1.89, 3.32, 1.76], dir: [-0.76, 0.64, -0.11], front: [-0.13, -0.05, 0.92], elbow: [-0.17, -0.78, -0.6] },
      hand_l: { along: "hand_r", back: 0.5, roll: 0, elbow: [0.62, -0.73, 0.29] },
    },
    feet: { foot_l: [1.11, 0.37, -0.13], foot_r: [-0.47, 0.42, 0.53] },
    feetYaw: { foot_l: -0.37, foot_r: -0.67 },
    knees: { foot_l: [-0.28, -0.34, 0.89], foot_r: [-0.66, 0.23, 0.72] },
  },
  {
    pelvis: [0.06, -0.58, 0.27],
    bones: { pelvis: [0.42, -0.25, 0.07], spine_01: [0, -0.02, -0.01], spine_02: [0.03, -0.02, -0.01], spine_03: [0.03, 0, -0.01], neck_01: [-0.11, -0.07, 0.03], head: [-0.23, -0.06, 0.01], clavicle_l: [0.21, -0.12, 0.19], clavicle_r: [0.2, 0.13, -0.08] },
    reach: {
      hand_r: { item: "greatsword", grip: [-0.84, 2.94, 2.03], dir: [-0.5, 0.57, 0.65], front: [0.57, -0.35, 0.7], elbow: [-0.5, -0.5, -0.71] },
      hand_l: { along: "hand_r", back: 0.5, roll: -0.4, elbow: [0.58, -0.56, -0.59] },
    },
    feet: { foot_l: [1.11, 0.39, -0.13], foot_r: [-0.42, 0.39, 0.54] },
    feetYaw: { foot_l: -0.31, foot_r: -0.67 },
    knees: { foot_l: [-0.25, -0.28, 0.92], foot_r: [-0.61, 0.19, 0.77] },
  },
  {
    pelvis: [0.06, -0.57, 0.26],
    bones: { pelvis: [0.35, 0.07, -0.01], spine_01: [0.17, -0.02, 0.02], spine_02: [0.13, -0.01, 0.01], spine_03: [0.05, 0, 0], neck_01: [-0.24, -0.03, 0.03], head: [-0.27, -0.13, 0], clavicle_l: [0.04, -0.06, 0.26], clavicle_r: [0.09, 0.12, -0.08] },
    reach: {
      hand_r: { item: "greatsword", grip: [0.09, 2.53, 2.41], dir: [-0.08, 0.35, 0.93], front: [0.91, -0.28, 0.17], elbow: [-0.65, -0.58, -0.49] },
      hand_l: { along: "hand_r", back: 0.5, roll: -1.4, elbow: [0.3, -0.37, -0.88] },
    },
    feet: { foot_l: [1.08, 0.4, -0.13], foot_r: [-0.48, 0.37, 0.48] },
    feetYaw: { foot_l: -0.08, foot_r: -0.38 },
    knees: { foot_l: [-0.06, -0.18, 0.98], foot_r: [-0.36, 0.14, 0.92] },
  },
  {
    pelvis: [0.07, -0.57, 0.26],
    bones: { pelvis: [0.37, 0.2, -0.06], spine_01: [0.14, 0.02, 0.07], spine_02: [0.11, 0.02, 0.05], spine_03: [0.05, 0, 0.02], neck_01: [-0.23, 0.01, -0.05], head: [-0.19, -0.07, -0.02], clavicle_l: [0, -0.2, 0.32], clavicle_r: [0.16, 0.24, -0.13] },
    reach: {
      hand_r: { item: "greatsword", grip: [0.77, 2.3, 2.48], dir: [0.34, 0.1, 0.94], front: [0.91, 0.07, -0.35], elbow: [-0.62, -0.72, -0.3] },
      hand_l: { along: "hand_r", back: 0.5, roll: -2.3, elbow: [0.3, -0.27, -0.91] },
    },
    feet: { foot_l: [1.08, 0.38, -0.12], foot_r: [-0.52, 0.4, 0.49] },
    feetYaw: { foot_l: 0.08, foot_r: -0.04 },
    knees: { foot_l: [0.11, -0.1, 0.99], foot_r: [-0.07, 0.11, 0.99] },
  },
  {
    pelvis: [0.07, -0.56, 0.27],
    bones: { pelvis: [0.4, 0.17, -0.06], spine_01: [0.1, 0.2, 0.06], spine_02: [0.07, 0.25, 0.07], spine_03: [0.03, 0.05, 0.05], neck_01: [-0.18, -0.17, -0.16], head: [-0.09, -0.3, -0.03], clavicle_l: [0.05, -0.76, 0.38], clavicle_r: [0.21, 0.12, -0.07] },
    reach: {
      hand_r: { item: "greatsword", grip: [1.2, 2.21, 2.15], dir: [0.65, -0.17, 0.75], front: [0.76, 0.26, -0.6], elbow: [-0.67, -0.73, -0.11] },
      hand_l: { along: "hand_r", back: 0.5, roll: -2.8, elbow: [0.22, -0.11, -0.97] },
    },
    feet: { foot_l: [1.02, 0.4, -0.12], foot_r: [-0.5, 0.44, 0.53] },
    feetYaw: { foot_l: 0.36, foot_r: 0.14 },
    knees: { foot_l: [0.38, -0.01, 0.93], foot_r: [0.13, 0.1, 0.99] },
  },
];

// A bow: turned side-on, the left arm holding the bow out ahead and the right hand drawing the
// string back to the jaw.
const SIDE_ON = { spine_01: [0, -0.35, 0], spine_02: [0, -0.25, 0], head: [0, 0.55, 0] };
const ARCHER = { pelvis: [0, -0.06, 0], feet: { foot_l: [0.45, 0.32, 0.35], foot_r: [-0.35, 0.32, -0.3] } };
const bowAt = (grip, dir, front) => ({ item: "bow", grip, dir, front, elbow: [0.6, -0.6, 0] });
const BOW_OUT = bowAt([0.2, 4.6, 2.0], [0.1, 1, 0], [0, 0, 1]);
const BOW_LOW = { ...ARCHER, bones: { spine_01: [0, -0.15, 0], head: [0, 0.15, 0] }, reach: { hand_l: bowAt([0.55, 3.3, 0.9], [0, 0.8, 0.6], [0, -0.6, 0.8]), hand_r: { wrist: [-0.6, 3.1, 0.3], elbow: [-0.4, -0.6, -0.5] } } };
const NOCKED = { ...ARCHER, bones: SIDE_ON, reach: { hand_l: BOW_OUT, hand_r: { wrist: [0.12, 4.55, 1.5], elbow: [-0.5, -0.3, -0.6] } } };
const DRAWN = { ...ARCHER, bones: SIDE_ON, reach: { hand_l: BOW_OUT, hand_r: { wrist: [-0.05, 5.15, 0.45], elbow: [-0.5, 0, -1] } } };
const AIM_SWAY = { ...DRAWN, reach: { ...DRAWN.reach, hand_l: bowAt([0.21, 4.63, 2.0], [0.12, 1, 0], [0, 0, 1]) } };
const LOOSED = { ...ARCHER, bones: SIDE_ON, reach: { hand_l: BOW_OUT, hand_r: { wrist: [-0.3, 5.1, 0.05], elbow: [-0.5, 0, -1] } } };

// A crossbow or gun: brought up from the hip to the right shoulder, the left hand under the
// barrel, fired with a kick back and up, and lowered.
const SHOOTING = { feet: { foot_l: [0.35, 0.32, 0.3], foot_r: [-0.35, 0.32, -0.2] } };
const shouldered = (grip, dir) => ({
  ...SHOOTING,
  bones: { spine_01: [0, -0.2, 0], spine_02: [0, -0.1, 0], head: [0.15, 0.3, 0] },
  reach: { hand_r: { item: "gun", grip, dir, front: [0, 1, 0], elbow: [-0.7, -0.6, 0] }, hand_l: { along: "hand_r", back: -0.75, roll: Math.PI, elbow: [0.4, -0.8, 0] } },
});
const HIP_FIRE = shouldered([-0.45, 3.5, 0.7], [0, 0.35, 0.94]);
const AIMED = shouldered([-0.3, 4.75, 0.85], [0.05, 0.02, 1]);
const KICKED = shouldered([-0.32, 4.85, 0.7], [0.05, 0.3, 0.95]);

// A battle cry: a crouch, then up with the arms flung wide and the head thrown back, shaking.
const PLANTED = { feet: { foot_l: [0.4, 0.32, 0.15], foot_r: [-0.4, 0.32, -0.1] } };
const GATHER = { ...PLANTED, pelvis: [0, -0.35, 0], bones: { spine_01: [0.25, 0, 0], spine_02: [0.2, 0, 0], neck_01: [-0.2, 0, 0], upperarm_l: [-0.5, 0, 0.3], upperarm_r: [-0.5, 0, -0.3], lowerarm_l: [-1.2, 0, 0], lowerarm_r: [-1.2, 0, 0] } };
// An oath: the head bowed and the left hand over the heart, whatever the right is holding.
const heart = (bow) => ({
  ...PLANTED,
  pelvis: [0, -0.04 - bow * 0.1, 0],
  bones: { spine_01: [bow * 0.25, 0, 0], spine_02: [bow * 0.2, 0, 0], neck_01: [bow * 0.3, 0, 0], head: [bow * 0.45, 0, 0], upperarm_r: [-0.1, 0, -0.08], lowerarm_r: [-0.25, 0, 0] },
  reach: { hand_l: { wrist: [0.2, 4.55 - bow * 0.1, 0.62 + bow * 0.1], elbow: [0.85, -0.5, 0.1] } },
});

const roar = (shake) => ({
  ...PLANTED,
  pelvis: [0, -0.1, 0],
  bones: { spine_01: [-0.1, 0, 0], spine_02: [-0.15, 0, 0], neck_01: [-0.25, 0, 0], head: [-0.35 + shake, 0, 0], upperarm_l: [-0.4, 0, 2.2 + shake], upperarm_r: [-0.4, 0, -2.2 - shake], lowerarm_l: [-0.5, 0, 0], lowerarm_r: [-0.5, 0, 0] },
});

// A gait: the feet stepping by turns, each planted for `planted` of every `cycle` seconds and
// swung forward the rest, carrying the body along `heading` (radians from straight ahead, toward
// the left) at `speed`. While planted a foot slides back at that speed, so played at it the feet
// hold the ground. With a foot planted less than half the time there's a moment in the air between
// steps, as long as the stride's speed and planting allow, and the body rises through it by as
// much as a jump that long would. The arms swing against the legs, the hips and shoulders turn
// with them (by `twist`), and the body leans into the going. Sizes are feet for a 6ft body.
//
// A gait can turn the body too, at `turn` radians per second toward the left. Then each planted
// foot turns back against the body as the body turns over it, holding its spot on the ground,
// and each lifted foot swings round ahead to catch up.
function gait({ speed, cycle, planted, lift, heading = 0, bob, low = 0, lean, swing, elbow, width = 0.25, twist = 1, turn: turnRate = 0 }) {
  const reach = speed * planted * cycle;
  const sweep = turnRate * planted * cycle;
  const way = [Math.sin(heading), Math.cos(heading)];
  const airborne = Math.max(0, (0.5 - planted) * cycle);
  const rise = (32 * airborne * airborne) / 8;
  const length = cycle;
  const at = (t) => {
    const p = (t / cycle) % 1;
    const feet = {};
    const feetYaw = {};
    for (const [foot, side, offset] of [
      ["foot_l", 1, 0],
      ["foot_r", -1, 0.5],
    ]) {
      const q = (p + offset) % 1;
      // How far through its stride the foot is, from -0.5 to 0.5: back while planted, then
      // forward while it swings.
      let stride;
      let up = 0;
      if (q < planted) stride = 0.5 - q / planted;
      else {
        const u = (q - planted) / (1 - planted);
        stride = u * u * (3 - 2 * u) - 0.5;
        up = lift * Math.sin(Math.PI * u);
      }
      const [x, z] = [side * width + way[0] * reach * stride, way[1] * reach * stride];
      const yaw = sweep * stride;
      feet[foot] = [x * Math.cos(yaw) + z * Math.sin(yaw), 0.32 + up, z * Math.cos(yaw) - x * Math.sin(yaw)];
      if (sweep) feetYaw[foot] = yaw;
    }
    // Through each step: down onto the planted foot, then up through the air or over the stance.
    const h = (p % 0.5) / 0.5;
    let dy;
    if (planted >= 0.5) dy = -bob * Math.cos(2 * Math.PI * h);
    else if (h < 2 * planted) dy = -bob * Math.sin((Math.PI * h) / (2 * planted));
    else dy = rise * Math.sin((Math.PI * (h - 2 * planted)) / (1 - 2 * planted));
    const turn = Math.cos(2 * Math.PI * p);
    const forward = Math.cos(heading);
    return {
      pelvis: [0, low + dy, 0],
      feet,
      feetYaw,
      bones: {
        // The lean tips the hips and bends the spine above them, and the head tips back up to look
        // ahead. The legs still reach their feet.
        pelvis: [0.4 * lean * forward, -0.15 * twist * turn, 0],
        spine_01: [0.35 * lean * forward, 0, -lean * Math.sin(heading) * 0.5],
        spine_02: [0.25 * lean * forward, 0.25 * twist * turn, 0],
        neck_01: [-0.5 * lean * forward, 0, 0],
        upperarm_l: [swing * turn, 0, 0.12],
        upperarm_r: [-swing * turn, 0, -0.12],
        lowerarm_l: [elbow, 0, 0],
        lowerarm_r: [elbow, 0, 0],
      },
    };
  };
  return { length, at, speed };
}
const RUN = { speed: 21, cycle: 0.66, planted: 0.22, lift: 0.75, bob: 0.12, low: -0.2, lean: 0.4, swing: 0.7, elbow: -1.4, width: 0.22 };
const WALK = { speed: 7.5, cycle: 1.1, planted: 0.6, lift: 0.25, bob: 0.06, low: -0.03, lean: 0.03, swing: 0.3, elbow: -0.35, width: 0.25 };
// Strafing runs half turned toward the side, the feet a little further apart so they pass.
const STRAFE = Math.PI / 4;
// Stepping round on the spot, at the walker's turning speed (radians per second), without the
// hips and shoulders swinging.
export const TURN_RATE = 2.6;
const TURN = { speed: 0, cycle: 0.7, planted: 0.5, lift: 0.28, bob: 0.03, lean: 0, swing: 0.08, elbow: -0.3, width: 0.3, twist: 0 };

export const POSED = {
  Run_Fwd_Loop: gait(RUN),
  Run_Left_Loop: gait({ ...RUN, heading: STRAFE, width: 0.3 }),
  Run_Right_Loop: gait({ ...RUN, heading: -STRAFE, width: 0.3 }),
  Run_Back_Loop: gait({ ...RUN, speed: 13.5, cycle: 0.6, planted: 0.32, lift: 0.5, lean: -0.06, swing: 0.45, heading: Math.PI }),
  Walk_Left_Loop: gait({ ...WALK, heading: STRAFE, width: 0.3 }),
  Walk_Right_Loop: gait({ ...WALK, heading: -STRAFE, width: 0.3 }),
  Walk_Back_Loop: gait({ ...WALK, heading: Math.PI, lean: -0.03 }),
  // Stepping round on the spot, for turning where it stands.
  Turn_Left_Loop: gait({ ...TURN, turn: TURN_RATE }),
  Turn_Right_Loop: gait({ ...TURN, turn: -TURN_RATE }),
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
  TwoHand_Idle_Loop: [
    [0, READY],
    [1.5, READY_BREATH],
    [3, READY],
  ],
  TwoHand_Chop: [
    [0, READY],
    [0.4, WOUND],
    [0.5, WOUND],
    ...through(0.5, 0.82, [WOUND, OVERHEAD, ABOVE, AHEAD, CHOPPED, FOLLOWED]),
    [1.0, FOLLOWED],
    [1.5, READY],
  ],
  TwoHand_Sweep: [
    [0, READY],
    [0.5, SWEEP[0]],
    [0.6, SWEEP[0]],
    ...through(0.6, 0.95, SWEEP),
    [1.2, SWEEP[6]],
    [1.75, READY],
  ],
  Bow_Shoot: [
    [0, BOW_LOW],
    [0.35, NOCKED],
    [0.9, DRAWN],
    [1.6, DRAWN],
    [1.65, LOOSED],
    [2.3, BOW_LOW],
  ],
  Firearm_Shoot: [
    [0, HIP_FIRE],
    [0.45, AIMED],
    [1.0, AIMED],
    [1.06, KICKED],
    [1.3, AIMED],
    [1.8, HIP_FIRE],
  ],
  // Held ready to swing through a long windup, then let go straight into the swing.
  TwoHand_Windup_Loop: [
    [0, SWEEP[0]],
    [1, { ...SWEEP[0], pelvis: [SWEEP[0].pelvis[0], SWEEP[0].pelvis[1] - 0.05, SWEEP[0].pelvis[2]] }],
    [2, SWEEP[0]],
  ],
  TwoHand_Sweep_Release: [
    [0, SWEEP[0]],
    ...through(0, 0.35, SWEEP),
    [0.6, SWEEP[6]],
    [1.15, READY],
  ],
  Pray: [
    [0, STANDING],
    [0.3, heart(1)],
    [0.95, heart(0.9)],
    [1.3, STANDING],
  ],
  Battle_Cry: [
    [0, STANDING],
    [0.35, GATHER],
    [0.65, roar(0)],
    [0.9, roar(0.12)],
    [1.15, roar(-0.05)],
    [1.4, roar(0.12)],
    [1.65, roar(0)],
    [2.2, STANDING],
  ],
  Bow_Aim_Loop: [
    [0, DRAWN],
    [1.5, AIM_SWAY],
    [3, DRAWN],
  ],
};

const v3 = (a) => new THREE.Vector3(...a);
const UP = new THREE.Vector3(0, 1, 0);

// The way a knee points unless a pose says: ahead and a little out, turned with its foot.
const kneeOf = (foot, yaw = 0) => v3([foot === "foot_l" ? 0.15 : -0.15, 0, 1]).applyAxisAngle(UP, yaw).toArray();

// The pose `u` (0-1) of the way from one to another: turns slerped, places and directions lerped.
function blend(from, to, u) {
  const lerp = (a, b) => a.map((v, i) => v + (b[i] - v) * u);
  const bones = {};
  for (const bone of new Set([...Object.keys(from.bones ?? {}), ...Object.keys(to.bones ?? {})])) {
    const turn = (pose) => new THREE.Quaternion().setFromEuler(new THREE.Euler(...(pose.bones?.[bone] ?? [0, 0, 0])));
    bones[bone] = turn(from).slerp(turn(to), u);
  }
  const reach = {};
  for (const hand of Object.keys(to.reach ?? {})) {
    const [a, b] = [from.reach?.[hand] ?? to.reach[hand], to.reach[hand]];
    reach[hand] = Object.fromEntries(Object.entries(b).map(([key, value]) => [key, Array.isArray(value) ? lerp(a[key] ?? value, value) : typeof value === "number" ? lerp([a[key] ?? value], [value])[0] : value]));
  }
  const feet = {};
  for (const foot of Object.keys(to.feet ?? {})) feet[foot] = lerp(from.feet?.[foot] ?? to.feet[foot], to.feet[foot]);
  const knees = {};
  for (const foot of new Set([...Object.keys(from.knees ?? {}), ...Object.keys(to.knees ?? {})])) {
    knees[foot] = lerp(from.knees?.[foot] ?? kneeOf(foot, from.feetYaw?.[foot]), to.knees?.[foot] ?? kneeOf(foot, to.feetYaw?.[foot]));
  }
  const feetYaw = {};
  for (const foot of new Set([...Object.keys(from.feetYaw ?? {}), ...Object.keys(to.feetYaw ?? {})])) {
    feetYaw[foot] = lerp([from.feetYaw?.[foot] ?? 0], [to.feetYaw?.[foot] ?? 0])[0];
  }
  return { pelvis: lerp(from.pelvis ?? [0, 0, 0], to.pelvis ?? [0, 0, 0]), bones, reach, feet, feetYaw, knees };
}

// A keyframed clip's pose at a time, eased from the keyframe before it to the one after, or
// across a run of keyframes the body moves through without stopping.
function keyed(keys, time) {
  let k = 0;
  while (k < keys.length - 2 && keys[k + 1][0] <= time) k++;
  let [start, end] = [k, k + 1];
  while (start > 0 && keys[start][1].through) start--;
  while (end < keys.length - 1 && keys[end][1].through) end++;
  const [t0, t1] = [keys[start][0], keys[end][0]];
  const u = THREE.MathUtils.clamp((time - t0) / (t1 - t0), 0, 1);
  const eased = t0 + u * u * (3 - 2 * u) * (t1 - t0);
  let i = start;
  while (i < end - 1 && keys[i + 1][0] <= eased) i++;
  const [[from0, from], [to0, to]] = [keys[i], keys[i + 1]];
  return blend(from, to, THREE.MathUtils.clamp((eased - from0) / (to0 - from0), 0, 1));
}

// How fast a gait carries the body, in feet per second for a 6ft body, or undefined.
export const posedSpeed = (name) => POSED[name]?.speed;

// A turn whose +y points along `dir` and +z toward `front`.
function frame(dir, front) {
  const y = v3(dir).normalize();
  const z = v3(front).addScaledVector(y, -v3(front).dot(y)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

// Sets one pose's local turns on a rig: the trunk from its bones, then arms and legs bent to reach
// their places. `rig` maps each bone to { parent, offset, turn }, parents first; `s` is the
// character's height over 6ft.
function poseRig(rig, pose, s) {
  for (const [name, bone] of rig) bone.turn = pose.bones[name]?.clone() ?? new THREE.Quaternion();
  // World turns and places, worked out parents first.
  const world = () => {
    const out = new Map();
    for (const [name, bone] of rig) {
      const up = out.get(bone.parent) ?? { turn: new THREE.Quaternion(), at: new THREE.Vector3() };
      const offset = name === "pelvis" ? bone.offset.clone().addScaledVector(v3(pose.pelvis), s) : bone.offset.clone();
      out.set(name, { turn: up.turn.clone().multiply(bone.turn), at: offset.applyQuaternion(up.turn).add(up.at) });
    }
    return out;
  };
  // Bends a limb of three bones so its end joint lands at `target`, its middle joint toward
  // `bend`, and turns the end bone to `endTurn` in the world (or straight on the middle bone).
  const reachFor = ([top, middle, end], target, bend, endTurn = null) => {
    const placed = world();
    const parent = placed.get(rig.get(top).parent).turn;
    const start = placed.get(top).at;
    const [upper, lower] = [rig.get(middle).offset, rig.get(end).offset];
    const [l1, l2] = [upper.length(), lower.length()];
    const toTarget = target.clone().sub(start);
    const reach = THREE.MathUtils.clamp(toTarget.length(), Math.abs(l1 - l2) * 1.01, (l1 + l2) * 0.999);
    const along = toTarget.normalize();
    const side = v3(bend).addScaledVector(along, -v3(bend).dot(along)).normalize();
    const a = (l1 * l1 - l2 * l2 + reach * reach) / (2 * reach);
    const joint = start.clone().addScaledVector(along, a).addScaledVector(side, Math.sqrt(Math.max(0, l1 * l1 - a * a)));
    const tip = start.clone().addScaledVector(along, reach);
    const topTurn = new THREE.Quaternion().setFromUnitVectors(upper.clone().normalize(), joint.clone().sub(start).normalize());
    const lowerRest = lower.clone().normalize().applyQuaternion(topTurn);
    const middleTurn = new THREE.Quaternion().setFromUnitVectors(lowerRest, tip.clone().sub(joint).normalize()).multiply(topTurn);
    rig.get(top).turn = parent.clone().invert().multiply(topTurn);
    rig.get(middle).turn = topTurn.clone().invert().multiply(middleTurn);
    rig.get(end).turn = endTurn ? middleTurn.clone().invert().multiply(endTurn) : new THREE.Quaternion();
  };
  const ARM = (side) => [`upperarm_${side}`, `lowerarm_${side}`, `hand_${side}`];
  const LEG = (side) => [`thigh_${side}`, `calf_${side}`, `foot_${side}`];

  // A held item's turn in the hand, as characterMesh.js sets it, and where the grip sits.
  const holding = (item) => ({ turn: new THREE.Quaternion().setFromUnitVectors(UP, v3(HELD[item].toward).normalize()), at: v3(HELD[item].at).multiplyScalar(s) });
  const grips = {};
  for (const hand of ["hand_r", "hand_l"]) {
    const place = pose.reach[hand];
    if (!place) continue;
    const side = hand.slice(-1);
    const defaultBend = [side === "l" ? 0.6 : -0.6, -0.6, -0.3];
    if (place.wrist) {
      reachFor(ARM(side), v3(place.wrist).multiplyScalar(s), place.elbow ?? defaultBend);
      continue;
    }
    // Gripping an item, either its own or further down the other hand's.
    const held = place.along ? grips[place.along] : { item: place.item, turn: frame(place.dir, place.front), grip: v3(place.grip).multiplyScalar(s) };
    const grip = place.along ? held.grip.clone().addScaledVector(UP.clone().applyQuaternion(held.turn), -place.back * s) : held.grip;
    const { turn: inHand, at } = holding(held.item);
    const roll = new THREE.Quaternion().setFromAxisAngle(UP.clone().applyQuaternion(held.turn), place.roll ?? 0);
    const handTurn = roll.multiply(held.turn).multiply(inHand.clone().invert());
    const wrist = grip.clone().sub(at.clone().applyQuaternion(handTurn));
    reachFor(ARM(side), wrist, place.elbow ?? defaultBend, handTurn);
    grips[hand] = { ...held, grip };
  }
  for (const foot of ["foot_l", "foot_r"]) {
    if (!pose.feet[foot]) continue;
    const side = foot.slice(-1);
    const yaw = new THREE.Quaternion().setFromAxisAngle(UP, pose.feetYaw?.[foot] ?? 0);
    const knee = pose.knees?.[foot] ?? kneeOf(foot, pose.feetYaw?.[foot]);
    reachFor(LEG(side), v3(pose.feet[foot]).multiplyScalar(s), knee, yaw);
  }
}

// A hand-posed clip, for a character's skeleton (characterMesh.js's userData.joints), in
// animations.js's decoded form: { times, rotations: { bone: [x, y, z, w per frame] }, pelvis }.
export function posedClip(name, joints, s, fps = 30) {
  const keys = POSED[name];
  const end = Array.isArray(keys) ? keys[keys.length - 1][0] : keys.length;
  const frames = Math.round(end * fps) + 1;
  const at = new Map(joints.map((j) => [j.name, j.at]));
  const rig = new Map(joints.map((j) => [j.name, { parent: j.parent, offset: v3(j.at).sub(v3(j.parent ? at.get(j.parent) : [0, 0, 0])), turn: null }]));
  const times = Float32Array.from({ length: frames }, (_, f) => f / fps);
  const rotations = Object.fromEntries(joints.map((j) => [j.name, new Float32Array(frames * 4)]));
  const pelvis = new Float32Array(frames * 3);
  for (let f = 0; f < frames; f++) {
    const pose = Array.isArray(keys) ? keyed(keys, times[f]) : blend(keys.at(times[f]), keys.at(times[f]), 0);
    poseRig(rig, pose, s);
    for (const [bone, { turn }] of rig) {
      // Keep each quaternion on the same side as the frame before, for smooth blending.
      if (f > 0 && turn.dot(new THREE.Quaternion().fromArray(rotations[bone], (f - 1) * 4)) < 0) turn.set(-turn.x, -turn.y, -turn.z, -turn.w);
      turn.toArray(rotations[bone], f * 4);
    }
    pelvis.set(pose.pelvis, f * 3);
  }
  return { times, rotations, pelvis };
}
