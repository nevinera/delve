import { dressArmor } from "./armor.js";
import { HELD, heldBy } from "./weapons.js";

// A character's body as mesh data, without three.js, so it can be tested: a skeleton and a low-poly
// skin over it, built from a look (recipe.js's resolveRecipe). Each limb and the trunk are tubes of
// rings around their bones, each ring following one bone or blending two at a joint. Faces are
// flat colored by region (skin, shirt, trousers, hair and so on), with no textures.
//
// Bones are named like the Unreal mannequin's, which most free animation sets follow. The bind pose
// stands with the arms down and a little out. Positions are feet: feet on y = 0, facing +z, the
// character's left toward +x.

// A 6ft body's joints, before the look shapes it: [name, parent, position]. Bones ending in _l
// are mirrored to _r.
const JOINTS = [
  ["root", null, [0, 0, 0]],
  ["pelvis", "root", [0, 3.15, 0]],
  ["spine_01", "pelvis", [0, 3.5, 0]],
  ["spine_02", "spine_01", [0, 3.95, 0]],
  ["spine_03", "spine_02", [0, 4.4, 0]],
  ["neck_01", "spine_03", [0, 4.95, 0]],
  ["head", "neck_01", [0, 5.22, 0]],
  ["clavicle_l", "spine_03", [0.15, 4.75, 0.05]],
  ["upperarm_l", "clavicle_l", [0.74, 4.72, 0.12]],
  ["lowerarm_l", "upperarm_l", [0.86, 3.68, 0.1]],
  ["hand_l", "lowerarm_l", [0.94, 2.76, 0.15]],
  ["thigh_l", "pelvis", [0.32, 3.05, 0]],
  ["calf_l", "thigh_l", [0.34, 1.68, 0.04]],
  ["foot_l", "calf_l", [0.35, 0.32, 0]],
  ["ball_l", "foot_l", [0.36, 0.08, 0.48]],
];
// Where bones with no child end, for their direction.
export const ENDS = { head: [0, 6, 0], hand_l: [0.97, 2.18, 0.17], ball_l: [0.36, 0.06, 0.75] };
const TRUNK_SIDES = 32;
// The bust's middle on each side (height in feet for a 6ft body, angle from the front), how far it
// spreads toward the middle of the chest and out toward the arm, above and below its middle, and
// how far it stands out at most. Proportions from plastic surgery's measures of the breast: the
// notch at the top of the breastbone and the two nipples make a triangle with equal sides (Penn
// 1955), each side's inner edge stops short of the middle of the chest and its outer edge reaches
// the front of the armpit (Westreich 1997), and the nipple is 45% of the way down (Mallucci and
// Branford 2012). The fullest point drops by `drop` and the upper slope grows `longer` as it gets
// larger, the shirt across the middle is pulled up to `tight` of the way to flat, and below a full
// bust it hangs as far as `hang` past the bust's underside before meeting the stomach.
const BUST = { y: 4.27, angle: 0.62, inner: 0.5, outer: 0.62, above: 0.36, below: 0.29, depth: 0.32, drop: 0.1, longer: 0.1, tight: 0.6, hang: 0.35 };
// The rear's middle on each side (height in feet for a 6ft body, angle from straight back), how
// far it spreads toward the middle of the back and out toward the hips, above and below its middle,
// and how far it stands out at most.
const REAR = { y: 3.1, angle: 0.42, inner: 0.42, outer: 0.7, above: 0.4, below: 0.36, depth: 0.13 };
const ARM = ["clavicle_l", "upperarm_l", "lowerarm_l", "hand_l"];
const LEG = ["thigh_l", "calf_l", "foot_l", "ball_l"];

export const BONE_NAMES = JOINTS.flatMap(([name]) => (name.endsWith("_l") ? [name, name.replace(/_l$/, "_r")] : [name]));

const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, s) => a.map((v) => v * s);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => mul(a, 1 / Math.hypot(...a));
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const shade = (rgb, f) => rgb.map((v) => v * f);

// The skeleton for a look: [{ name, parent, at }], parents first, `at` the bind position.
export function skeleton(look) {
  const s = look.height / 6;
  const { shoulders, hips } = widths(look);
  const joints = new Map();
  for (const [name, parent, at] of JOINTS) {
    joints.set(name, { name, parent, at });
    if (name.endsWith("_l")) {
      joints.set(name.replace(/_l$/, "_r"), { name: name.replace(/_l$/, "_r"), parent: parent.replace(/_l$/, "_r"), at: [-at[0], at[1], at[2]] });
    }
  }
  // Shoulders and hips move their whole limb out or in.
  for (const [chain, width] of [
    [ARM, shoulders],
    [LEG, hips],
  ]) {
    for (const side of ["l", "r"]) {
      const moved = chain.filter((name) => !name.startsWith("clavicle"));
      const dx = joints.get(moved[0].replace(/_l$/, `_${side}`)).at[0] * (width - 1);
      for (const name of moved) {
        const j = joints.get(name.replace(/_l$/, `_${side}`));
        j.at = [j.at[0] + dx, j.at[1], j.at[2]];
      }
    }
  }
  // Parents come before children in JOINTS, and mirroring keeps that.
  return [...joints.values()].map((j) => ({ ...j, at: mul(j.at, s) }));
}

// How much wider than usual a look's shoulders, waist and hips are, each about 0.8 to 1.2.
function widths(look) {
  return {
    shoulders: 1 + 0.36 * (look.shoulders - 0.5) + 0.12 * (look.build - 0.5),
    waist: 1 + 0.3 * (look.waist - 0.5),
    hips: 1 + 0.4 * (look.hips - 0.5),
  };
}

// Mesh data for a look: { bones, positions, colors, skinIndex, skinWeight, mail }, one entry per
// corner of each triangle, so each face keeps its own flat color; mail is 1 on chain mail.
export function bodyMesh(look) {
  const bones = skeleton(look);
  const index = new Map(bones.map((b, i) => [b.name, i]));
  const at = (name) => bones[index.get(name)].at;
  const s = look.height / 6;
  const trunk = s * (0.85 + 0.4 * look.build);
  const limb = trunk * (0.8 + 0.4 * look.limbs);
  const c = Object.fromEntries(Object.entries(look.colors).map(([k, v]) => [k, hex(v)]));
  const boots = shade(c.secondary, 0.55);
  const belt = shade(c.primary, 0.45);
  const out = new MeshOut(index);

  // The end of a bone: its child's joint, or its own end point.
  const endOf = (name) => {
    const child = bones.find((b) => b.parent === name && !b.name.startsWith("clavicle") && !b.name.startsWith("thigh"));
    if (child) return child.at;
    const base = ENDS[name.replace(/_r$/, "_l")];
    return mul(name.endsWith("_r") ? [-base[0], base[1], base[2]] : base, s);
  };
  // A ring t of the way along a bone (past 1 or below 0 reaches beyond it).
  const along = (name, t, extra = {}) => {
    const from = at(name);
    const to = endOf(name);
    return { center: add(from, mul(sub(to, from), t)), dir: norm(sub(to, from)), bones: [[name, 1]], ...extra };
  };
  const up = [0, 1, 0];
  const level = (y, extra) => ({ center: [0, y * s, 0], dir: up, ...extra });

  // The trunk, crotch to neck. The chest has extra rings, and the trunk extra sides, so the bust
  // rounds off rather than coming to a point. The bust follows the chest's bone alone, and the
  // stomach bends from the bones below it a little at a time under the bust, so the spine bending
  // doesn't fold the bust under, pull it to a point or leave a ledge below it. The shoulder ring
  // reaches out over the top of the arms.
  const { shoulders, waist, hips } = widths(look);
  const trunkRings = [
    level(2.92, { rx: 0.5 * hips * trunk, rz: 0.36 * trunk, bones: [["pelvis", 1]] }),
    level(3.05, { rx: 0.57 * hips * trunk, rz: 0.4 * trunk, bones: [["pelvis", 1]] }),
    level(3.18, { rx: 0.62 * hips * trunk, rz: 0.42 * trunk, bones: [["pelvis", 1]] }),
    level(3.32, { rx: 0.6 * hips * trunk, rz: 0.41 * trunk, bones: [["pelvis", 0.6], ["spine_01", 0.4]] }),
    level(3.44, { rx: 0.56 * waist * trunk, rz: 0.39 * trunk, bones: [["spine_01", 1]] }),
    level(3.65, { rx: 0.52 * waist * trunk, rz: 0.37 * trunk, bones: [["spine_01", 0.6], ["spine_02", 0.4]] }),
    level(3.92, { rx: 0.57 * shoulders * trunk, rz: 0.4 * trunk, bones: [["spine_02", 0.7], ["spine_03", 0.3]] }),
    level(3.99, { rx: 0.585 * shoulders * trunk, rz: 0.41 * trunk, bones: [["spine_02", 0.45], ["spine_03", 0.55]] }),
    level(4.06, { rx: 0.6 * shoulders * trunk, rz: 0.42 * trunk, bones: [["spine_02", 0.2], ["spine_03", 0.8]] }),
    level(4.12, { rx: 0.61 * shoulders * trunk, rz: 0.425 * trunk, bones: [["spine_03", 1]] }),
    level(4.18, { rx: 0.62 * shoulders * trunk, rz: 0.43 * trunk, bones: [["spine_03", 1]] }),
    level(4.24, { rx: 0.63 * shoulders * trunk, rz: 0.43 * trunk, bones: [["spine_03", 1]] }),
    level(4.3, { rx: 0.64 * shoulders * trunk, rz: 0.43 * trunk, bones: [["spine_03", 1]] }),
    level(4.36, { rx: 0.655 * shoulders * trunk, rz: 0.425 * trunk, bones: [["spine_03", 1]] }),
    level(4.42, { rx: 0.67 * shoulders * trunk, rz: 0.42 * trunk, bones: [["spine_03", 1]] }),
    level(4.55, { rx: 0.7 * shoulders * trunk, rz: 0.4 * trunk, bones: [["spine_03", 1]] }),
    level(4.68, { rx: 0.72 * shoulders * trunk, rz: 0.36 * trunk, bones: [["spine_03", 1]] }),
    level(4.8, { rx: 0.6 * shoulders * trunk, rz: 0.3 * trunk, bones: [["spine_03", 1]] }),
    level(4.9, { rx: 0.36 * trunk, rz: 0.24 * trunk, bones: [["spine_03", 0.7], ["neck_01", 0.3]] }),
    level(4.97, { rx: 0.2 * trunk, rz: 0.2 * trunk, bones: [["spine_03", 0.5], ["neck_01", 0.5]] }),
    level(5.25, { rx: 0.18 * trunk, rz: 0.18 * trunk, bones: [["neck_01", 1]] }),
  ];
  for (const ring of trunkRings) {
    const pushes = [bustPush(look, ring, s), rearPush(look, ring, s)].filter(Boolean);
    if (pushes.length) ring.push = (angle) => pushes.reduce((sum, push) => sum + push(angle), 0);
  }
  // Trousers to the belt, then the shirt to the neck.
  const trunkColor = (band) => {
    const y = trunkRings[band].center[1] / s;
    return y < 3.3 ? c.secondary : y < 3.4 ? belt : y < 4.95 ? c.primary : c.skin;
  };
  // Each part of the body, kept as rings and colors until armor has been put over it.
  const parts = { trunk: { rings: trunkRings, sides: TRUNK_SIDES, color: trunkColor, opts: { capStart: true } } };

  for (const side of ["l", "r"]) {
    const n = (name) => name.replace(/_l$/, `_${side}`);
    const grip = gripping(look, side);
    // Arm, sleeved to the wrist, starting under the trunk's shoulder.
    const arm = [
      along(n("upperarm_l"), 0, { rx: 0.15 * limb, rz: 0.17 * limb, bones: [[n("upperarm_l"), 0.6], ["spine_03", 0.4]] }),
      along(n("upperarm_l"), 0.04, { rx: 0.2 * limb, rz: 0.21 * limb, bones: [[n("upperarm_l"), 0.7], ["spine_03", 0.3]] }),
      along(n("upperarm_l"), 0.15, { rx: 0.19 * limb, rz: 0.19 * limb }),
      // The elbow bends across three rings, the middle one fuller since blending between two
      // bones draws it in.
      along(n("upperarm_l"), 0.8, { rx: 0.15 * limb, rz: 0.15 * limb, bones: [[n("upperarm_l"), 0.85], [n("lowerarm_l"), 0.15]] }),
      along(n("upperarm_l"), 1, { rx: 0.16 * limb, rz: 0.16 * limb, bones: [[n("upperarm_l"), 0.5], [n("lowerarm_l"), 0.5]] }),
      along(n("lowerarm_l"), 0.2, { rx: 0.145 * limb, rz: 0.145 * limb, bones: [[n("lowerarm_l"), 0.85], [n("upperarm_l"), 0.15]] }),
      along(n("lowerarm_l"), 0.85, { rx: 0.1 * limb, rz: 0.1 * limb }),
      along(n("lowerarm_l"), 1, { rx: 0.09 * limb, rz: 0.09 * limb, bones: [[n("lowerarm_l"), 0.5], [n("hand_l"), 0.5]] }),
      // The palm, wrist to knuckles, shorter in a fist so the grip runs below it.
      along(n("hand_l"), 0.15, { rx: 0.05 * s, rz: 0.095 * s }),
      along(n("hand_l"), 0.33, { rx: 0.055 * s, rz: 0.115 * s }),
      along(n("hand_l"), grip ? 0.44 : 0.53, { rx: 0.045 * s, rz: 0.11 * s }),
    ];
    parts[`arm_${side}`] = { rings: arm, sides: 10, color: (band) => (band < 7 ? c.primary : c.skin), opts: { capStart: true, capEnd: true } };
    hand(parts, side, at(n("hand_l")), endOf(n("hand_l")), s, grip, c);

    // Leg, booted from mid-calf.
    const leg = [
      along(n("thigh_l"), -0.06, { rx: 0.3 * limb * hips, rz: 0.32 * limb, bones: [[n("thigh_l"), 0.7], ["pelvis", 0.3]] }),
      along(n("thigh_l"), 0.3, { rx: 0.26 * limb, rz: 0.27 * limb }),
      along(n("thigh_l"), 0.7, { rx: 0.2 * limb, rz: 0.21 * limb }),
      along(n("thigh_l"), 1, { rx: 0.17 * limb, rz: 0.18 * limb, bones: [[n("thigh_l"), 0.5], [n("calf_l"), 0.5]] }),
      along(n("calf_l"), 0.25, { rx: 0.18 * limb, rz: 0.21 * limb }),
      along(n("calf_l"), 0.5, { rx: 0.17 * limb, rz: 0.19 * limb }),
      along(n("calf_l"), 0.56, { rx: 0.18 * limb, rz: 0.2 * limb }),
      along(n("calf_l"), 0.97, { rx: 0.13 * limb, rz: 0.14 * limb, bones: [[n("calf_l"), 0.5], [n("foot_l"), 0.5]] }),
    ];
    // The top of the thigh carries the rear's underside down into the leg (angle 0 is its back).
    const under = rearAt(look, leg[0].center[1] / s, s);
    if (under) {
      const depth = under.depth * 0.5 * (1 + Math.cos(Math.PI * under.down));
      leg[0].push = (angle) => (Math.abs(angle) < 1.4 ? depth * 0.5 * (1 + Math.cos((Math.PI * angle) / 1.4)) : 0);
    }
    parts[`leg_${side}`] = { rings: leg, sides: 8, color: (band) => (band < 5 ? c.secondary : boots), opts: { capStart: true } };
    // Foot, heel to toe, its rings standing upright.
    const [fx, , fz] = at(n("foot_l"));
    const fwd = [0, 0, 1];
    const foot = [
      { center: [fx, 0.16 * s, fz - 0.14 * s], dir: fwd, rx: 0.12 * s, rz: 0.13 * s, bones: [[n("foot_l"), 1]] },
      { center: [fx, 0.17 * s, fz + 0.12 * s], dir: fwd, rx: 0.14 * s, rz: 0.15 * s, bones: [[n("foot_l"), 1]] },
      { center: [fx, 0.1 * s, fz + 0.48 * s], dir: fwd, rx: 0.14 * s, rz: 0.09 * s, bones: [[n("foot_l"), 0.5], [n("ball_l"), 0.5]] },
      { center: [fx, 0.07 * s, fz + 0.7 * s], dir: fwd, rx: 0.1 * s, rz: 0.06 * s, bones: [[n("ball_l"), 1]] },
    ];
    parts[`foot_${side}`] = { rings: foot, sides: 8, color: () => boots, opts: { capStart: true, capEnd: true } };
  }

  // How far forward the trunk's front reaches at a point's x and height, where it's in front of
  // the trunk: between the rings above and below it, bust and all.
  const chestFront = (x, y) => {
    const above = trunkRings.findIndex((r) => r.center[1] >= y);
    if (above < 1) return null;
    const reach = (ring) => {
      const angle = Math.asin(x / ring.rx);
      return ring.center[2] + Math.cos(angle) * (ring.rz + (ring.push?.(angle) ?? 0));
    };
    const [lower, upper] = [trunkRings[above - 1], trunkRings[above]];
    // Out past the sides of the trunk, as beside the neck, there's no front to lie on.
    if (Math.abs(x) >= Math.min(lower.rx, upper.rx)) return null;
    const t = (y - lower.center[1]) / (upper.center[1] - lower.center[1]);
    return reach(lower) + (reach(upper) - reach(lower)) * t;
  };
  parts.head = head(out, look, at("head"), s, c, chestFront);
  // How far the trunk reaches from its middle at a height and angle round it, or 0 off its ends.
  const trunkReach = (y, angle) => {
    const above = trunkRings.findIndex((r) => r.center[1] >= y);
    if (above < 1) return 0;
    const reach = (ring) => ring.rz + (ring.push?.(angle) ?? 0);
    const [lower, upper] = [trunkRings[above - 1], trunkRings[above]];
    const t = (y - lower.center[1]) / (upper.center[1] - lower.center[1]);
    return reach(lower) + (reach(upper) - reach(lower)) * t;
  };
  dressArmor(out, parts, look, { s, trunk, limb, along, level, shoulders, hips, trunkSides: TRUNK_SIDES, trunkReach, n: (name, side) => name.replace(/_l$/, `_${side}`) });
  for (const { rings, sides, color, opts } of Object.values(parts)) out.tube(rings, sides, color, opts);
  return { bones, ...out.arrays() };
}

// How far the bust pushes a trunk ring out at each angle round it (0 the front), as the shirt over
// it lies: a rounded swell either side of the middle that eases into the chest at its edges,
// fullest a little below its middle. A larger bust hangs lower and heavier, its upper slope longer
// and flatter and its underside rounder. Toward the middle the shirt clings a little to a small
// bust, and stretches flatter across a larger one. Below, the shirt hangs from the fullest point
// a little way before it meets the stomach, rather than tucking in under the bust.
function bustPush(look, ring, s) {
  if (!look.bust) return null;
  const droop = look.bust ** 1.5;
  const middle = BUST.y - BUST.drop * droop;
  const depth = look.bust * BUST.depth * s;
  const tight = BUST.tight * look.bust;
  // The push at height y and angle, before the shirt hangs.
  const lying = (y, angle) => {
    const down = y > middle ? (y - middle) / (BUST.above + BUST.longer * droop) : (y - middle) / BUST.below;
    const swell = (off) => {
      const across = off / (off < 0 ? BUST.inner : BUST.outer);
      const r = across * across + down * down;
      if (r >= 1) return 0;
      const bell = 0.5 * (1 + Math.cos(Math.PI * Math.sqrt(r)));
      return depth * (y > middle ? bell : bell ** (1 - 0.5 * droop));
    };
    const off = Math.abs(angle) - BUST.angle;
    const push = swell(off);
    if (off >= 0) return push;
    // Laid flat across the front from the fullest point at this height.
    const flat = (Math.cos(BUST.angle) * (ring.rz + swell(0))) / Math.cos(angle) - ring.rz;
    return Math.max(push, push + (flat - push) * tight);
  };
  const y = ring.center[1] / s;
  // How much of the fullest point's push the shirt keeps this far below it, easing to none.
  const below = (middle - y) / (BUST.below + BUST.hang * look.bust);
  const hang = y < middle && below < 1 ? 0.5 * (1 + Math.cos(Math.PI * below)) * look.bust : 0;
  return (angle) => Math.max(lying(y, angle), lying(middle, angle) * hang);
}

// How far the rear stands out at its fullest at a height (in feet for a 6ft body), and how far
// that height is above or below its middle, from -1 to 1, or null outside it.
function rearAt(look, y, s) {
  if (!look.rear) return null;
  const down = (y - REAR.y) / (y > REAR.y ? REAR.above : REAR.below);
  if (Math.abs(down) >= 1) return null;
  return { depth: look.rear * REAR.depth * s, down };
}

// How far the rear pushes a trunk ring out at each angle round it (0 the front): a rounded swell
// either side of the middle of the back, or null for none.
function rearPush(look, ring, s) {
  const at = rearAt(look, ring.center[1] / s, s);
  if (!at) return null;
  const { depth, down } = at;
  return (angle) => {
    const off = Math.PI - Math.abs(angle) - REAR.angle;
    const across = off / (off < 0 ? REAR.inner : REAR.outer);
    const r = across * across + down * down;
    return r < 1 ? depth * 0.5 * (1 + Math.cos(Math.PI * Math.sqrt(r))) : 0;
  };
}

// How a hand grips, or null when it hangs open. The hand holding a weapon or off-hand item makes a
// fist round its grip, which runs through the fist tipped by `slope` (how far down the hand it
// goes for each foot forward). The left hand makes a level fist for a shield's strap or a
// two-handed weapon's haft, which it only reaches in some clips. Put away, both hands hang open.
function gripping(look, side) {
  if (look.sheathed) return null;
  for (const [type, offhand] of [
    [look.weapon, false],
    [look.offhand, true],
  ]) {
    const held = heldBy(type, offhand);
    if (held?.bone !== `hand_${side}`) continue;
    const [, y, z] = held.toward;
    return { slope: Math.max(-0.75, Math.min(0.75, -y / z)) };
  }
  if (side === "l" && (look.offhand !== "none" || HELD[look.weapon]?.twoHanded)) return { slope: 0 };
  return null;
}

// Fingers and a thumb from the palm (in the arm's last rings), each a part of its own, hand_l_0 to
// hand_l_4, so gloves can cover them. Open, each finger bends a little toward the palm at its three
// joints. In a fist each wraps round the grip (weapons.js's IN_HAND, through the middle of the
// hand), from the back of the hand under it and up the palm side, the thumb closing over them.
// Sizes are feet for a 6ft body: u down the hand from the wrist, v toward the palm, w forward
// toward the thumb.
const FINGERS = [
  { w: 0.07, length: 0.25, r: 0.027 },
  { w: 0.024, length: 0.27, r: 0.028 },
  { w: -0.022, length: 0.25, r: 0.026 },
  { w: -0.066, length: 0.2, r: 0.023 },
];
const KNUCKLES = 0.3;
const PHALANGES = [0.45, 0.32, 0.23];
const OPEN_CURL = [0.3, 0.45, 0.25];
const OPEN_THUMB = [
  [0.1, 0.03, 0.075],
  [0.18, 0.06, 0.12],
  [0.27, 0.08, 0.13],
];
// The grip's middle, and how far round it the fingers wrap: the grip's radius and a finger's.
const GRIP = { u: 0.3, w: 0.02, wrap: 0.085 };

function hand(parts, side, wrist, end, s, grip, c) {
  const bone = `hand_${side}`;
  const down = norm(sub(end, wrist));
  // The palm faces the body, and the thumb is forward.
  const toward = norm(sub([side === "l" ? -1 : 1, 0, 0], mul(down, side === "l" ? -down[0] : down[0])));
  const ahead = cross(side === "l" ? toward : down, side === "l" ? down : toward);
  const p = (u, v, w) => add(wrist, add(mul(down, u * s), add(mul(toward, v * s), mul(ahead, w * s))));
  const part = (points, radii) => ({ rings: pathRings(points, radii, () => [[bone, 1]]), sides: 5, color: () => c.skin, opts: { capEnd: true } });
  // Where the grip runs through a finger's plane: lower for fingers further along it.
  const middle = (w) => GRIP.u + (grip?.slope ?? 0) * (w - GRIP.w);
  FINGERS.forEach(({ w, length, r }, i) => {
    const points = [];
    if (grip) {
      // Round the grip from behind it, each joint `share` of the finger further on. A tipped grip
      // cuts the finger's plane long, so the way round is longer down the hand.
      const [mu, stretch] = [middle(w), Math.hypot(1, grip.slope ?? 0)];
      const at = (angle) => p(mu + Math.sin(angle) * GRIP.wrap * stretch, -Math.cos(angle) * GRIP.wrap, w);
      let angle = -0.75;
      points.push(p(mu - 0.11, -0.01, w), at(angle));
      for (const share of PHALANGES) points.push(at((angle += (share * length) / GRIP.wrap)));
    } else {
      let [u, v, turn] = [KNUCKLES, 0, 0];
      points.push(p(u - 0.03, 0, w), p(u, 0, w));
      PHALANGES.forEach((share, joint) => {
        turn += OPEN_CURL[joint];
        u += Math.cos(turn) * share * length;
        v += Math.sin(turn) * share * length;
        points.push(p(u, v, w));
      });
    }
    parts[`${bone}_${i}`] = part(points, [r, r, r * 0.95, r * 0.85, r * 0.75].map((x) => x * s));
  });
  // The thumb closes over the grip on the palm side, across the first two fingers.
  const thumb = grip
    ? [
        [0.1, 0.03, 0.075],
        [0.19, 0.09, 0.1],
        [middle(0.05) - 0.01, GRIP.wrap + 0.025, 0.04],
      ]
    : OPEN_THUMB;
  parts[`${bone}_4`] = part(
    thumb.map(([u, v, w]) => p(u, v, w)),
    [0.032, 0.028, 0.022].map((x) => x * s),
  );
}

// The head: rings round the head bone, chin to crown, with hair and beard colored onto its faces
// and built out from it where they stand proud, a nose, eyes and any earrings and necklace.
function head(out, look, [hx, hy, hz], s, c, chestFront) {
  const jaw = 1 + 0.32 * (look.jaw - 0.5);
  const bearded = look.beard === "full" || look.beard === "long";
  const ring = (dy, rx, rz, dz, extra = {}) => ({ center: [hx, hy + dy * s, hz + dz * s], dir: [0, 1, 0], rx: rx * s, rz: rz * s, bones: [["head", 1]], ...extra });
  // A full beard pushes the chin forward and down.
  const chin = bearded ? (angle) => 0.05 * s * Math.max(0, Math.cos(angle)) : null;
  const rings = [
    ring(-0.1, 0.17, 0.18, 0, { bones: [["neck_01", 0.5], ["head", 0.5]] }),
    ring(0.02, 0.28 * jaw, 0.34, 0.05, { push: chin }),
    ring(0.25, 0.37, 0.4, 0.03),
    ring(0.45, 0.39, 0.42, 0),
    ring(0.62, 0.35, 0.39, -0.02),
    ring(0.74, 0.21, 0.26, -0.03),
  ];
  const { hair } = look;
  const long = ["long", "ponytail", "braids", "afro", "bob", "mullet", "dreadlocks"].includes(hair);
  // Angles from the front: a mohawk keeps only a strip down the middle, front to back, and a
  // receding hairline only the sides and back.
  const scalp = (a) => (hair === "mohawk" ? a < 0.35 || a > Math.PI - 0.35 : hair === "receding" ? a > 1.4 : hair !== "bald");
  const color = (band, angle) => {
    const a = Math.abs(angle);
    if (bearded && ((band === 1 && a < 2.1) || (band === 0 && a < 1.6))) return c.hair;
    if (scalp(a) && (band >= 4 || (band === 3 && a > 0.9) || (band === 2 && a > 1.9) || (long && band === 1 && a > 2.1))) return c.hair;
    return c.skin;
  };
  const part = { rings, sides: 10, color, opts: { capEnd: true, endColor: hair === "bald" || hair === "receding" ? c.skin : c.hair } };
  // Hair that would stand through a helmet or hood goes.
  const covered = Boolean(look.armor?.head);

  // The face's surface at height dy, x across, between the cheek and brow rings (and a little
  // beyond them).
  const front = (dy, x) => {
    const t = (dy - 0.25) / 0.2;
    const rx = 0.37 + 0.02 * t;
    const rz = 0.4 + 0.02 * t;
    const dz = 0.03 - 0.03 * t;
    return [hx + x * s, hy + dy * s, hz + (dz + rz * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2))) * s];
  };
  const bones = [["head", 1]];
  // Nose, between the eyes and the mouth.
  const tip = add(front(0.24, 0), [0, 0, 0.1 * s]);
  const [top, left, right] = [front(0.36, 0), front(0.22, -0.06), front(0.22, 0.06)];
  const inside = [hx, hy + 0.3 * s, hz];
  out.face([top, left, tip], c.skin, bones, inside);
  out.face([top, tip, right], c.skin, bones, inside);
  out.face([left, right, tip], shade(c.skin, 0.85), bones, inside);
  // Eyes, a little proud of the face so they don't sink into it: an almond-shaped white, pointed
  // at either side, then a round iris as tall as the white and a pupil, each a little further out.
  // `pointed` pinches the outline to points at the sides.
  const disc = (center, rx, ry, sides, color, pointed = false) => {
    const rim = Array.from({ length: sides }, (_, k) => {
      const angle = (k / sides) * Math.PI * 2;
      const y = pointed ? Math.sin(angle) * Math.abs(Math.sin(angle)) : Math.sin(angle);
      return add(center, [Math.cos(angle) * rx, y * ry, 0]);
    });
    for (let k = 0; k < sides; k++) out.face([center, rim[k], rim[(k + 1) % sides]], color, bones, inside);
  };
  for (const x of [-0.14, 0.14]) {
    const [cx, cy, cz] = front(0.34, x);
    disc([cx, cy, cz + 0.022 * s], 0.08 * s, 0.037 * s, 12, [0.93, 0.92, 0.88], true);
    disc([cx, cy, cz + 0.027 * s], 0.032 * s, 0.032 * s, 8, c.eyes);
    disc([cx, cy, cz + 0.031 * s], 0.014 * s, 0.014 * s, 6, [0.05, 0.05, 0.06]);
  }

  // Head-relative points, in the head's own feet, to scene points.
  const p = (x, dy, z) => [hx + x * s, hy + dy * s, hz + z * s];
  const neck = [["neck_01", 0.5], ["spine_03", 0.5]];
  if (hair === "long") {
    // A sheet of hair down the back to the shoulder blades.
    const sheet = [
      { center: p(0, 0.5, -0.18), dir: [0, -1, 0], rx: 0.4 * s, rz: 0.3 * s, bones },
      { center: p(0, 0.05, -0.28), dir: [0, -1, 0], rx: 0.4 * s, rz: 0.17 * s, bones },
      { center: p(0, -0.35, -0.33), dir: [0, -1, 0], rx: 0.38 * s, rz: 0.1 * s, bones: neck },
      { center: p(0, -0.85, -0.36), dir: [0, -1, 0], rx: 0.32 * s, rz: 0.07 * s, bones: [["spine_03", 1]] },
    ];
    out.tube(sheet, 8, () => c.hair, { capEnd: true });
  }
  if (hair === "mullet") {
    // Short on top, with a shorter sheet behind, down to the top of the back.
    const sheet = [
      { center: p(0, 0.45, -0.22), dir: [0, -1, 0], rx: 0.36 * s, rz: 0.24 * s, bones },
      { center: p(0, 0.1, -0.3), dir: [0, -1, 0], rx: 0.32 * s, rz: 0.12 * s, bones },
      { center: p(0, -0.25, -0.34), dir: [0, -1, 0], rx: 0.26 * s, rz: 0.06 * s, bones: neck },
    ];
    out.tube(sheet, 8, () => c.hair, { capEnd: true });
  }
  if (hair === "bob" && !covered) {
    // A shell of hair to the jaw, open for the face below a fringe across the forehead.
    const shell = [ring(0.04, 0.38, 0.42, -0.02), ring(0.25, 0.43, 0.46, 0.02), ring(0.45, 0.44, 0.47, 0), ring(0.66, 0.4, 0.44, -0.02), ring(0.78, 0.25, 0.3, -0.03)];
    out.tube(shell, 10, () => c.hair, { capEnd: true, skip: (band, angle) => (band === 0 && Math.abs(angle) < 1.3) || (band === 1 && Math.abs(angle) < 1.1) });
  }
  if (hair === "topknot" && !covered) {
    const knot = [ring(0.7, 0.1, 0.1, -0.06), ring(0.8, 0.14, 0.14, -0.06), ring(0.93, 0.12, 0.12, -0.06), ring(1.0, 0.05, 0.05, -0.06)];
    out.tube(knot, 8, () => c.hair, { capEnd: true });
  }
  if (hair === "bun") {
    // A bun low on the back of the head.
    const bun = [p(0, 0.3, -0.36), p(0, 0.3, -0.47), p(0, 0.3, -0.57), p(0, 0.3, -0.63)];
    out.path(bun, [0.1, 0.15, 0.13, 0.05].map((r) => r * s), 8, () => c.hair, () => bones, { capEnd: true });
  }
  if (hair === "pigtails") {
    // Two short tails, tied high on either side.
    for (const side of [-1, 1]) {
      const tail = [p(side * 0.34, 0.52, -0.14), p(side * 0.47, 0.45, -0.18), p(side * 0.54, 0.22, -0.2), p(side * 0.53, -0.05, -0.17)];
      out.path(tail, [0.07, 0.085, 0.065, 0.03].map((r) => r * s), 6, () => c.hair, () => bones, { capEnd: true });
    }
  }
  if (hair === "spiky" && !covered) {
    // Spikes standing out from the crown, each a cone along the way out from the head's middle.
    const middle = p(0, 0.35, -0.02);
    const spots = [
      [0, 1.35],
      ...[0, 1.25, 2.5, -1.25, -2.5].map((turn) => [turn, 0.85]),
      ...[0.6, -0.6, Math.PI].map((turn) => [turn, 0.45]),
    ];
    for (const [turn, rise] of spots) {
      const way = [Math.sin(turn) * Math.cos(rise), Math.sin(rise), Math.cos(turn) * Math.cos(rise)];
      const base = p(way[0] * 0.33, 0.35 + way[1] * 0.38, -0.02 + way[2] * 0.36);
      const tip = add(base, mul(norm(sub(base, middle)), 0.24 * s));
      out.path([base, tip], [0.08 * s, 0.004 * s], 5, () => c.hair, () => bones, { capStart: true });
    }
  }
  if (hair === "dreadlocks") {
    // Ropes hanging from the hairline round the sides and back, longest behind.
    for (let k = 0; k < 11; k++) {
      const turn = 1.15 + ((Math.PI * 2 - 2.3) * k) / 10;
      const [x, z] = [Math.sin(turn), Math.cos(turn)];
      const reach = 0.25 + 0.45 * Math.abs(z);
      const rope = [p(x * 0.36, 0.5, z * 0.38), p(x * 0.43, 0.3, z * 0.45), p(x * 0.45, 0.05, z * 0.47), p(x * 0.44, 0.1 - reach, z * 0.47 - 0.03)];
      out.path(rope, [0.05, 0.045, 0.04, 0.03].map((r) => r * s), 5, () => c.hair, (i) => (i < 2 ? bones : neck), { capEnd: true });
    }
  }
  if (hair === "ponytail") {
    const tail = [p(0, 0.55, -0.36), p(0, 0.35, -0.55), p(0, -0.05, -0.6), p(0, -0.45, -0.52)];
    out.path(tail, [0.1, 0.11, 0.08, 0.04].map((r) => r * s), 6, () => c.hair, (i) => (i < 3 ? bones : [["neck_01", 1]]), { capEnd: true });
  }
  if (hair === "afro" && !covered) {
    const afro = [ring(0.4, 0.45, 0.38, -0.14), ring(0.58, 0.56, 0.52, -0.09), ring(0.84, 0.52, 0.5, -0.07), ring(1.02, 0.3, 0.3, -0.06)];
    out.tube(afro, 12, () => c.hair, { capStart: true, capEnd: true });
  }
  if (hair === "mohawk" && !covered) {
    // A crest standing up from the forehead to the nape.
    const crest = [
      [0.5, 0.4],
      [0.66, 0.32],
      [0.76, 0.12],
      [0.78, -0.08],
      [0.72, -0.3],
      [0.55, -0.42],
      [0.35, -0.44],
    ].map(([dy, z]) => {
      const out = norm([0, dy - 0.35, z]);
      return p(0, dy + out[1] * 0.08, z + out[2] * 0.08);
    });
    const tall = [0.1, 0.18, 0.24, 0.25, 0.22, 0.15, 0.06];
    out.path(crest, tall.map(() => 0.05 * s), 4, () => c.hair, () => bones, { capStart: true, capEnd: true, depth: tall.map((t) => t * s) });
  }
  if (hair === "braids") {
    // Two braids from behind the ears down over the shoulders, swelling and pinching like plaits.
    for (const side of [-1, 1]) {
      // An even arc from behind the ear forward over the shoulder, then straight down the chest.
      const knots = [
        [0.33, 0.22, -0.2],
        [0.37, 0.0, -0.13],
        [0.38, -0.25, 0.0],
        [0.37, -0.5, 0.2],
        [0.34, -0.8, 0.4],
        [0.31, -1.05, 0.48],
      ];
      const points = [];
      for (let i = 0; i < knots.length - 1; i++) {
        for (let t = 0; t < 1; t += 0.5) points.push(knots[i].map((v, k) => v + (knots[i + 1][k] - v) * t));
      }
      points.push(knots[knots.length - 1]);
      const radii = points.map((_, i) => (i % 2 ? 0.045 : 0.07) * s * (i === points.length - 1 ? 0.6 : 1));
      // Each point hands over from the head to the neck to the chest a little at a time, so the
      // braid bends smoothly when the head turns or tips instead of kinking below the ear.
      const HANDOVER = [
        [["head", 1]],
        [["head", 1]],
        [["head", 0.75], ["neck_01", 0.25]],
        [["head", 0.45], ["neck_01", 0.3], ["spine_03", 0.25]],
        [["head", 0.2], ["neck_01", 0.4], ["spine_03", 0.4]],
        [["head", 0.05], ["neck_01", 0.35], ["spine_03", 0.6]],
      ];
      const along = (i) => HANDOVER[i] ?? [["spine_03", 1]];
      // Over the chest, each knot lies on the outside of it, however full the bust.
      const laid = points.map(([x, dy, z], i) => {
        const point = p(side * x, dy, z);
        const front = chestFront(point[0], point[1]);
        if (front !== null) point[2] = Math.max(point[2], front + radii[i] + 0.015 * s);
        return point;
      });
      out.path(laid, radii, 6, () => c.hair, along, { capEnd: true });
    }
  }

  if (look.beard === "goatee") {
    // A small tuft from under the lower lip, down over the point of the chin.
    const tuft = [p(0, 0.11, 0.42), p(0, 0.02, 0.42), p(0, -0.08, 0.37)];
    out.path(tuft, [0.05, 0.055, 0.02].map((r) => r * s), 6, () => c.hair, () => bones, { capStart: true, capEnd: true, depth: [0.03, 0.04, 0.02].map((r) => r * s) });
  }
  if (look.beard === "long") {
    // A beard hanging to the chest.
    const beard = [ring(0.06, 0.28 * jaw, 0.16, 0.26), ring(-0.2, 0.22 * jaw, 0.12, 0.35), ring(-0.45, 0.14 * jaw, 0.08, 0.41), ring(-0.7, 0.05, 0.04, 0.45)];
    out.tube(beard, 8, () => c.hair, { capStart: true, capEnd: true });
  }
  if (look.beard === "handlebar") {
    // A mustache across the upper lip, its ends curled up.
    const curve = [
      [-0.28, 0.29],
      [-0.26, 0.2],
      [-0.18, 0.15],
      [-0.07, 0.17],
      [0, 0.18],
      [0.07, 0.17],
      [0.18, 0.15],
      [0.26, 0.2],
      [0.28, 0.29],
    ];
    const points = curve.map(([x, dy]) => add(front(dy, x), [0, 0, (0.03 - Math.abs(x) * 0.15) * s]));
    const radii = curve.map(([x]) => (0.04 - Math.abs(x) * 0.09) * s);
    // Each ring carries on from the one before, so the curl doesn't turn the rings over.
    out.path(points, radii, 6, () => c.hair, () => bones, { capStart: true, capEnd: true, carry: true });
  }

  // Face markings and wear, laid a little proud of the face.
  const on = (dy, x, proud) => add(front(dy, x), [0, 0, proud * s]);
  const marked = (name) => look.face?.includes(name);
  // A flat strip across the face through `points` ([dy, x]), `width` tall.
  const strip = (points, width, color) => {
    const edges = points.map(([dy, x]) => [on(dy + width / 2, x, 0.018), on(dy - width / 2, x, 0.018)]);
    for (let i = 0; i < edges.length - 1; i++) {
      out.face([edges[i][0], edges[i][1], edges[i + 1][1]], color, bones, inside);
      out.face([edges[i][0], edges[i + 1][1], edges[i + 1][0]], color, bones, inside);
    }
  };
  if (marked("warpaint")) {
    // Two slashes down each cheek, under the eyes.
    const paint = hex(look.colors.paint ?? "#2a4a9a");
    for (const side of [-1, 1]) {
      for (const dy of [0.27, 0.205]) strip([0.09, 0.17, 0.25, 0.31].map((x) => [dy - (x - 0.09) * 0.25, side * x]), 0.035, paint);
    }
  }
  if (marked("scar")) {
    // A pale welt down the left cheek, from under the eye toward the jaw.
    const scar = [Math.min(1, c.skin[0] * 1.1), c.skin[1] * 0.8, c.skin[2] * 0.8];
    out.path([on(0.31, 0.2, 0.02), on(0.24, 0.24, 0.02), on(0.16, 0.27, 0.01)], [0.014, 0.016, 0.01].map((r) => r * s), 4, () => scar, () => bones, { capStart: true, capEnd: true });
  }
  if (marked("sideburns")) {
    // Strips of hair down in front of each ear, from the temples to the jaw.
    for (const side of [-1, 1]) {
      const burn = [p(side * 0.37, 0.43, 0.08), p(side * 0.375, 0.28, 0.1), p(side * 0.36, 0.12, 0.11)];
      out.path(burn, [0.025, 0.025, 0.02].map((r) => r * s), 4, () => c.hair, () => bones, { capStart: true, capEnd: true, depth: [0.05, 0.06, 0.05].map((r) => r * s) });
    }
  }
  if (marked("eyepatch")) {
    // A patch over the right eye, its strap running up across the forehead and round the head.
    const patch = [0.08, 0.07, 0.06];
    const [cx, cy, cz] = front(0.34, -0.14);
    disc([cx, cy, cz + 0.045 * s], 0.1 * s, 0.085 * s, 8, patch);
    const across = norm(cross(sub(p(0.41, 0.56, 0), p(-0.14, 0.34, 0.42)), sub(p(0, 0.5, -0.43), p(-0.14, 0.34, 0.42))));
    const middle = p(0.02, 0.45, 0.01);
    const band = (shift) => ({ center: add(middle, mul(across, shift * s)), dir: across, rx: 0.425 * s, rz: 0.445 * s, bones });
    out.tube([band(-0.022), band(0.022)], 12, () => patch);
  }
  if (marked("glasses")) {
    // Round wire rims before the eyes, a bridge over the nose and arms back to the ears.
    const metal = c.metal;
    const rim = (x) => {
      const [cx, cy, cz] = front(0.34, x);
      return Array.from({ length: 11 }, (_, k) => {
        const angle = (k / 10) * Math.PI * 2;
        return [cx + Math.cos(angle) * 0.095 * s, cy + Math.sin(angle) * 0.08 * s, cz + 0.06 * s];
      });
    };
    for (const side of [-1, 1]) {
      out.path(rim(side * 0.14), Array(11).fill(0.012 * s), 4, () => metal, () => bones);
      const [ex, ey, ez] = front(0.34, side * 0.235);
      out.path([[ex, ey, ez + 0.06 * s], p(side * 0.38, 0.36, 0.2), p(side * 0.39, 0.33, -0.02)], Array(3).fill(0.01 * s), 4, () => metal, () => bones);
    }
    const [bx, by, bz] = front(0.36, 0);
    out.path([add(front(0.36, -0.045), [0, 0, 0.07 * s]), [bx, by, bz + 0.05 * s], add(front(0.36, 0.045), [0, 0, 0.07 * s])], Array(3).fill(0.012 * s), 4, () => metal, () => bones);
  }

  if (look.jewelry.includes("earrings")) {
    for (const x of [-0.385, 0.385]) out.gem(p(x, 0.14, 0), 0.045 * s, c.metal, bones);
  }
  if (look.jewelry.includes("necklace")) {
    const ringAt = (dy, r) => ({ center: p(0, dy, 0.02), dir: [0, 1, 0], rx: r * s, rz: r * s, bones: neck });
    out.tube([ringAt(-0.31, 0.25), ringAt(-0.25, 0.22)], 10, () => c.metal);
    out.gem([hx, hy - 0.52 * s, hz + 0.34 * s * (0.85 + 0.4 * look.build)], 0.07 * s, c.metal, [["spine_03", 1]]);
  }
  return part;
}

// Rings along a line of points, for MeshOut.path.
function pathRings(points, radii, bones, depth = null) {
  return points.map((center, i) => {
    const [before, after] = [points[Math.max(0, i - 1)], points[Math.min(points.length - 1, i + 1)]];
    return { center, dir: norm(sub(after, before)), rx: radii[i], rz: depth?.[i] ?? radii[i], bones: bones(i) };
  });
}

// Collects triangles, each corner with its own position, color and bone weights. Faces made
// while `mail` is on are marked for characterMesh.js's mail texture.
export class MeshOut {
  constructor(index) {
    this.index = index;
    this.positions = [];
    this.colors = [];
    this.skinIndex = [];
    this.skinWeight = [];
    this.marks = [];
    this.mail = false;
  }

  // A triangle, turned to face away from `inside`, or toward it when `toward`.
  face(corners, color, bones, inside, cornerBones = null, toward = false) {
    const normal = cross(sub(corners[1], corners[0]), sub(corners[2], corners[0]));
    const middle = mul(add(add(corners[0], corners[1]), corners[2]), 1 / 3);
    let order = [0, 1, 2];
    if (dot(normal, sub(middle, inside)) < 0 !== toward) order = [0, 2, 1];
    for (const k of order) {
      this.positions.push(...corners[k]);
      this.colors.push(...color);
      this.marks.push(this.mail ? 1 : 0);
      const weights = (cornerBones?.[k] ?? bones).slice(0, 4);
      const total = weights.reduce((sum, [, w]) => sum + w, 0);
      for (let n = 0; n < 4; n++) {
        this.skinIndex.push(weights[n] ? this.index.get(weights[n][0]) : 0);
        this.skinWeight.push(weights[n] ? weights[n][1] / total : 0);
      }
    }
  }

  // Bands of faces between rings of `sides` corners, each colored by color(band, angle), angle 0
  // facing the ring's front. Caps close the first or last ring to a point; skip(band, angle) leaves
  // faces out. A ring's weights(angle), where it has one, weights each corner by its angle instead
  // of the ring's bones. With `carry`, each ring after the first takes its side from the ring
  // before, so a tube that bends round toward +x doesn't turn its rings over partway. With `inward`,
  // the faces look in, for the inside of something open, like a skirt.
  tube(rings, sides, color, { capStart = false, capEnd = false, endColor = null, skip = null, carry = false, inward = false } = {}) {
    let last = null;
    const points = rings.map((r) => {
      // The ring's side axis is +x where it can be; its front is square to that and the bone.
      const from = carry && last ? last : Math.abs(r.dir[0]) > 0.9 ? [0, 0, -1] : [1, 0, 0];
      const side = norm(sub(from, mul(r.dir, dot(from, r.dir))));
      last = side;
      const front = cross(side, r.dir);
      return Array.from({ length: sides }, (_, k) => {
        const angle = (k / sides) * Math.PI * 2;
        const angleSigned = angle > Math.PI ? angle - Math.PI * 2 : angle;
        const push = r.push?.(angleSigned) ?? 0;
        return add(r.center, add(mul(side, Math.sin(angle) * r.rx), mul(front, Math.cos(angle) * (r.rz + push))));
      });
    });
    const weightsOf = (r) => r.bones ?? rings.find((q) => q.bones)?.bones;
    // Rings without bones of their own follow the nearest one before them that has some.
    const ringBones = [];
    rings.forEach((r, i) => (ringBones[i] = r.bones ?? ringBones[i - 1] ?? weightsOf(r)));
    const signed = (angle) => (angle > Math.PI ? angle - Math.PI * 2 : angle);
    const cornerBones = rings.map((r, i) => Array.from({ length: sides }, (_, k) => r.weights?.(signed((k / sides) * Math.PI * 2)) ?? ringBones[i]));
    for (let i = 0; i < rings.length - 1; i++) {
      const inside = mul(add(rings[i].center, rings[i + 1].center), 0.5);
      for (let k = 0; k < sides; k++) {
        const k1 = (k + 1) % sides;
        const mid = signed(((k + 0.5) / sides) * Math.PI * 2);
        if (skip?.(i, mid)) continue;
        const col = color(i, mid);
        const [a, b, cc, d] = [points[i][k], points[i][k1], points[i + 1][k1], points[i + 1][k]];
        const [wa, wb, wc, wd] = [cornerBones[i][k], cornerBones[i][k1], cornerBones[i + 1][k1], cornerBones[i + 1][k]];
        this.face([a, b, cc], col, wa, inside, [wa, wb, wc], inward);
        this.face([a, cc, d], col, wa, inside, [wa, wc, wd], inward);
      }
    }
    const cap = (i, outward, capColor) => {
      const r = rings[i];
      const tip = add(r.center, mul(r.dir, outward * Math.min(r.rx, r.rz) * 0.5));
      const inside = rings[i - outward]?.center ?? sub(r.center, mul(r.dir, outward));
      for (let k = 0; k < sides; k++) {
        const k1 = (k + 1) % sides;
        this.face([points[i][k], points[i][k1], tip], capColor, ringBones[i], inside, [cornerBones[i][k], cornerBones[i][k1], ringBones[i]]);
      }
    };
    if (capStart) cap(0, -1, color(0, Math.PI));
    if (capEnd) cap(rings.length - 1, 1, endColor ?? color(rings.length - 2, Math.PI));
  }

  // A tube along a line of points, `radii` round each (or `depth` deep, square to the side, where
  // given), its rings following bones(i).
  path(points, radii, sides, color, bones, { capStart = false, capEnd = false, depth = null, carry = false } = {}) {
    this.tube(pathRings(points, radii, bones, depth), sides, color, { capStart, capEnd, carry });
  }

  // A small eight-faced gem.
  gem(center, r, color, bones) {
    const p = [
      [r, 0, 0],
      [-r, 0, 0],
      [0, r * 1.4, 0],
      [0, -r * 1.4, 0],
      [0, 0, r],
      [0, 0, -r],
    ].map((d) => add(center, d));
    for (const [a, b] of [
      [0, 4],
      [4, 1],
      [1, 5],
      [5, 0],
    ]) {
      this.face([p[a], p[b], p[2]], color, bones, center);
      this.face([p[a], p[b], p[3]], color, bones, center);
    }
  }

  arrays() {
    return {
      positions: Float32Array.from(this.positions),
      colors: Float32Array.from(this.colors),
      skinIndex: Uint16Array.from(this.skinIndex),
      skinWeight: Float32Array.from(this.skinWeight),
      mail: Float32Array.from(this.marks),
    };
  }
}
