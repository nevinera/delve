import * as THREE from "three";
import { HELD } from "./weapons.js";

// Hand-posed clips, for what the animation library lacks: sitting on the ground, two-handed
// weapons and bows. Each is a list of [time, pose] keyframes, eased from one to the next. A pose
// gives:
// - pelvis: how far the pelvis moves from rest, in feet for a 6ft body.
// - bones: each bone's turn from rest, as XYZ euler angles relative to its parent. Every bone
//   points along its rest direction unturned, so a turn about x swings it: negative forward (+z),
//   positive back. A turn about y turns it toward its left (+x); about z swings a left limb out,
//   a right one in. Bones left out stay at rest.
// - reach: places for the hands, which the arms bend to reach, overriding their bones' turns.
//   { item, grip, dir, front } puts the grip of a held item (weapons.js) at `grip`, the item
//   pointing along `dir` with its front toward `front`. { along: hand, back } grips the other
//   hand's item `back` feet further down. { wrist } puts the wrist there, the hand straight on
//   the forearm. `elbow` is the way the elbow points.
// - feet: where the ankles go, the legs bending to reach them and the feet kept flat.
// Places are in feet for a 6ft body, from the ground beneath the character's middle, facing +z.

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

// A two-handed weapon: the right hand by the guard, the left below it, in a fighting stance with
// the left foot forward. Each swing starts and ends at the ready.
const STANCE = { pelvis: [0, -0.18, 0.02], feet: { foot_l: [0.42, 0.32, 0.45], foot_r: [-0.42, 0.32, -0.35] } };
const ARMS_DOWN = { hand_r: [-0.6, -0.7, -0.2], hand_l: [0.6, -0.7, -0.2] };
const twoHanded = (bones, grip, dir, front, elbows = ARMS_DOWN) => ({
  ...STANCE,
  bones,
  reach: {
    hand_r: { item: "greatsword", grip, dir, front, elbow: elbows.hand_r },
    hand_l: { along: "hand_r", back: 0.5, elbow: elbows.hand_l },
  },
});
const READY = twoHanded({ spine_01: [0.08, -0.15, 0], head: [0, 0.15, 0] }, [-0.1, 3.4, 1.05], [0.15, 0.75, 0.55], [0, 0, 1]);
const READY_BREATH = twoHanded({ spine_01: [0.06, -0.15, 0], spine_02: [-0.03, 0, 0], head: [0, 0.15, 0] }, [-0.1, 3.47, 1.03], [0.15, 0.75, 0.55], [0, 0, 1]);
// The overhead chop: back over the right shoulder, up over the head, and down ahead to the left.
const WOUND = twoHanded({ spine_01: [0, -0.5, 0], spine_02: [-0.05, -0.2, 0], head: [0, 0.6, 0] }, [-0.65, 5.6, -0.15], [-0.3, 0.4, -0.85], [0, 1, 0], {
  hand_r: [-1, 0.2, -0.2],
  hand_l: [0.4, -0.5, 0.6],
});
const OVERHEAD = twoHanded({ spine_01: [0, -0.2, 0], spine_02: [-0.05, 0, 0], head: [0, 0.2, 0] }, [-0.15, 5.95, 0.45], [0, 1, 0.2], [0, 0, 1], {
  hand_r: [-1, 0, 0.2],
  hand_l: [1, 0, 0.2],
});
const CHOPPED = twoHanded({ spine_01: [0.25, 0.35, 0], spine_02: [0.1, 0.15, 0], head: [-0.1, -0.45, 0] }, [0.25, 3.0, 1.2], [0.35, -0.35, 0.85], [0, -1, 0]);
const FOLLOWED = twoHanded({ spine_01: [0.3, 0.5, 0], spine_02: [0.05, 0.1, 0], head: [-0.1, -0.55, 0] }, [0.65, 2.7, 0.7], [0.55, -0.7, 0.35], [0, -0.6, -0.8]);
// The sweep: from the right, level across the front, to the left.
const SWEEP_FROM = twoHanded({ spine_01: [0, -0.55, 0], spine_02: [0, -0.15, 0], head: [0, 0.65, 0] }, [-0.85, 3.9, 0.2], [-0.85, 0.3, -0.4], [1, 0, 0]);
const SWEEP_MID = twoHanded({ spine_01: [0.05, 0, 0], head: [0, 0, 0] }, [0, 3.8, 1.25], [0, 0.15, 1], [1, 0, 0]);
const SWEEP_TO = twoHanded({ spine_01: [0.05, 0.6, 0], spine_02: [0, 0.15, 0], head: [0, -0.7, 0] }, [0.85, 3.7, 0.2], [0.85, 0.2, -0.3], [1, 0, 0]);

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

export const POSED = {
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
    [0.5, OVERHEAD],
    [0.6, CHOPPED],
    [0.75, FOLLOWED],
    [1.3, READY],
  ],
  TwoHand_Sweep: [
    [0, READY],
    [0.35, SWEEP_FROM],
    [0.55, SWEEP_MID],
    [0.72, SWEEP_TO],
    [1.25, READY],
  ],
  Bow_Shoot: [
    [0, BOW_LOW],
    [0.35, NOCKED],
    [0.9, DRAWN],
    [1.6, DRAWN],
    [1.65, LOOSED],
    [2.3, BOW_LOW],
  ],
  Bow_Aim_Loop: [
    [0, DRAWN],
    [1.5, AIM_SWAY],
    [3, DRAWN],
  ],
};

const v3 = (a) => new THREE.Vector3(...a);
const UP = new THREE.Vector3(0, 1, 0);

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
    reach[hand] = Object.fromEntries(Object.entries(b).map(([key, value]) => [key, Array.isArray(value) ? lerp(a[key] ?? value, value) : value]));
  }
  const feet = {};
  for (const foot of Object.keys(to.feet ?? {})) feet[foot] = lerp(from.feet?.[foot] ?? to.feet[foot], to.feet[foot]);
  return { pelvis: lerp(from.pelvis ?? [0, 0, 0], to.pelvis ?? [0, 0, 0]), bones, reach, feet };
}

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
    const handTurn = held.turn.clone().multiply(inHand.clone().invert());
    const wrist = grip.clone().sub(at.clone().applyQuaternion(handTurn));
    reachFor(ARM(side), wrist, place.elbow ?? defaultBend, handTurn);
    grips[hand] = { ...held, grip };
  }
  for (const foot of ["foot_l", "foot_r"]) {
    if (!pose.feet[foot]) continue;
    const side = foot.slice(-1);
    reachFor(LEG(side), v3(pose.feet[foot]).multiplyScalar(s), [side === "l" ? 0.15 : -0.15, 0, 1], new THREE.Quaternion());
  }
}

// A hand-posed clip, for a character's skeleton (characterMesh.js's userData.joints), in
// animations.js's decoded form: { times, rotations: { bone: [x, y, z, w per frame] }, pelvis }.
export function posedClip(name, joints, s, fps = 30) {
  const keys = POSED[name];
  const end = keys[keys.length - 1][0];
  const frames = Math.round(end * fps) + 1;
  const at = new Map(joints.map((j) => [j.name, j.at]));
  const rig = new Map(joints.map((j) => [j.name, { parent: j.parent, offset: v3(j.at).sub(v3(j.parent ? at.get(j.parent) : [0, 0, 0])), turn: null }]));
  const times = Float32Array.from({ length: frames }, (_, f) => f / fps);
  const rotations = Object.fromEntries(joints.map((j) => [j.name, new Float32Array(frames * 4)]));
  const pelvis = new Float32Array(frames * 3);
  for (let f = 0; f < frames; f++) {
    let k = 0;
    while (k < keys.length - 2 && keys[k + 1][0] <= times[f]) k++;
    const [[t0, from], [t1, to]] = [keys[k], keys[k + 1]];
    const u = THREE.MathUtils.clamp((times[f] - t0) / (t1 - t0), 0, 1);
    const pose = blend(from, to, u * u * (3 - 2 * u));
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
