import { dressArmor } from "./armor.js";

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
  ["clavicle_l", "spine_03", [0.15, 4.75, 0]],
  ["upperarm_l", "clavicle_l", [0.74, 4.72, 0]],
  ["lowerarm_l", "upperarm_l", [0.86, 3.68, -0.02]],
  ["hand_l", "lowerarm_l", [0.94, 2.76, 0.03]],
  ["thigh_l", "pelvis", [0.32, 3.05, 0]],
  ["calf_l", "thigh_l", [0.34, 1.68, 0.04]],
  ["foot_l", "calf_l", [0.35, 0.32, 0]],
  ["ball_l", "foot_l", [0.36, 0.08, 0.48]],
];
// Where bones with no child end, for their direction.
const ENDS = { head: [0, 6, 0], hand_l: [0.97, 2.18, 0.05], ball_l: [0.36, 0.06, 0.75] };
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

  // The trunk, crotch to neck. The bust pushes the chest's front out either side of the middle.
  const { shoulders, waist, hips } = widths(look);
  const bust = (amount) => (angle) => amount * look.bust * 0.34 * s * Math.exp(-(((Math.abs(angle) - 0.45) / 0.5) ** 2)) * (Math.cos(angle) > 0 ? 1 : 0);
  // The chest has extra rings, so the bust rounds off rather than coming to a point. The shoulder
  // ring reaches out over the top of the arms.
  const trunkRings = [
    level(2.92, { rx: 0.5 * hips * trunk, rz: 0.36 * trunk, bones: [["pelvis", 1]] }),
    level(3.18, { rx: 0.62 * hips * trunk, rz: 0.42 * trunk, bones: [["pelvis", 1]] }),
    level(3.32, { rx: 0.6 * hips * trunk, rz: 0.41 * trunk, bones: [["pelvis", 0.6], ["spine_01", 0.4]] }),
    level(3.44, { rx: 0.56 * waist * trunk, rz: 0.39 * trunk, bones: [["spine_01", 1]] }),
    level(3.65, { rx: 0.52 * waist * trunk, rz: 0.37 * trunk, bones: [["spine_01", 1]] }),
    level(3.92, { rx: 0.57 * shoulders * trunk, rz: 0.4 * trunk, push: bust(0.1), bones: [["spine_01", 0.4], ["spine_02", 0.6]] }),
    level(4.06, { rx: 0.6 * shoulders * trunk, rz: 0.42 * trunk, push: bust(0.45), bones: [["spine_02", 1]] }),
    level(4.18, { rx: 0.62 * shoulders * trunk, rz: 0.43 * trunk, push: bust(0.85), bones: [["spine_02", 1]] }),
    level(4.3, { rx: 0.64 * shoulders * trunk, rz: 0.43 * trunk, push: bust(1), bones: [["spine_02", 0.5], ["spine_03", 0.5]] }),
    level(4.42, { rx: 0.67 * shoulders * trunk, rz: 0.42 * trunk, push: bust(0.75), bones: [["spine_03", 1]] }),
    level(4.55, { rx: 0.7 * shoulders * trunk, rz: 0.4 * trunk, push: bust(0.3), bones: [["spine_03", 1]] }),
    level(4.68, { rx: 0.72 * shoulders * trunk, rz: 0.36 * trunk, bones: [["spine_03", 1]] }),
    level(4.8, { rx: 0.6 * shoulders * trunk, rz: 0.3 * trunk, bones: [["spine_03", 1]] }),
    level(4.9, { rx: 0.36 * trunk, rz: 0.24 * trunk, bones: [["spine_03", 0.7], ["neck_01", 0.3]] }),
    level(4.97, { rx: 0.2 * trunk, rz: 0.2 * trunk, bones: [["spine_03", 0.5], ["neck_01", 0.5]] }),
    level(5.25, { rx: 0.18 * trunk, rz: 0.18 * trunk, bones: [["neck_01", 1]] }),
  ];
  // Trousers to the belt, then the shirt to the neck.
  const trunkColor = (band) => {
    const y = trunkRings[band].center[1] / s;
    return y < 3.3 ? c.secondary : y < 3.4 ? belt : y < 4.95 ? c.primary : c.skin;
  };
  // Each part of the body, kept as rings and colors until armor has been put over it.
  const parts = { trunk: { rings: trunkRings, sides: 16, color: trunkColor, opts: { capStart: true } } };

  for (const side of ["l", "r"]) {
    const n = (name) => name.replace(/_l$/, `_${side}`);
    // Arm, sleeved to the wrist, starting under the trunk's shoulder.
    const arm = [
      along(n("upperarm_l"), 0, { rx: 0.15 * limb, rz: 0.17 * limb, bones: [[n("upperarm_l"), 0.6], ["spine_03", 0.4]] }),
      along(n("upperarm_l"), 0.04, { rx: 0.2 * limb, rz: 0.21 * limb, bones: [[n("upperarm_l"), 0.7], ["spine_03", 0.3]] }),
      along(n("upperarm_l"), 0.15, { rx: 0.19 * limb, rz: 0.19 * limb }),
      along(n("upperarm_l"), 0.55, { rx: 0.16 * limb, rz: 0.16 * limb }),
      along(n("upperarm_l"), 1, { rx: 0.13 * limb, rz: 0.13 * limb, bones: [[n("upperarm_l"), 0.5], [n("lowerarm_l"), 0.5]] }),
      along(n("lowerarm_l"), 0.3, { rx: 0.14 * limb, rz: 0.14 * limb }),
      along(n("lowerarm_l"), 0.85, { rx: 0.1 * limb, rz: 0.1 * limb }),
      along(n("lowerarm_l"), 1, { rx: 0.09 * limb, rz: 0.09 * limb, bones: [[n("lowerarm_l"), 0.5], [n("hand_l"), 0.5]] }),
      along(n("hand_l"), 0.15, { rx: 0.05 * s, rz: 0.1 * s }),
      along(n("hand_l"), 0.55, { rx: 0.055 * s, rz: 0.12 * s }),
      along(n("hand_l"), 0.95, { rx: 0.045 * s, rz: 0.08 * s }),
    ];
    parts[`arm_${side}`] = { rings: arm, sides: 10, color: (band) => (band < 7 ? c.primary : c.skin), opts: { capStart: true, capEnd: true } };

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
    parts[`leg_${side}`] = { rings: leg, sides: 8, color: (band) => (band < 5 ? c.secondary : boots), opts: {} };
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

  parts.head = head(out, look, at("head"), s, c);
  dressArmor(out, parts, look, { s, trunk, limb, along, level, shoulders, hips, n: (name, side) => name.replace(/_l$/, `_${side}`) });
  for (const { rings, sides, color, opts } of Object.values(parts)) out.tube(rings, sides, color, opts);
  return { bones, ...out.arrays() };
}

// The head: rings round the head bone, chin to crown, with hair and beard colored onto its faces
// and built out from it where they stand proud, a nose, eyes and any earrings and necklace.
function head(out, look, [hx, hy, hz], s, c) {
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
  const long = ["long", "ponytail", "braids", "afro"].includes(hair);
  // Angles from the front: a mohawk keeps only a strip down the middle, front to back.
  const scalp = (a) => (hair === "mohawk" ? a < 0.35 || a > Math.PI - 0.35 : hair !== "bald");
  const color = (band, angle) => {
    const a = Math.abs(angle);
    if (bearded && ((band === 1 && a < 2.1) || (band === 0 && a < 1.6))) return c.hair;
    if (look.beard === "goatee" && band <= 1 && a < 0.45) return c.hair;
    if (scalp(a) && (band >= 4 || (band === 3 && a > 0.9) || (band === 2 && a > 1.9) || (long && band === 1 && a > 2.1))) return c.hair;
    return c.skin;
  };
  const part = { rings, sides: 10, color, opts: { capEnd: true, endColor: hair === "bald" ? c.skin : c.hair } };
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
  // Eyes, a little proud of the face so they don't sink into it: a white, then an iris and a
  // pupil each a little further out.
  const disc = (center, rx, ry, sides, color) => {
    const rim = Array.from({ length: sides }, (_, k) => {
      const angle = (k / sides) * Math.PI * 2;
      return add(center, [Math.cos(angle) * rx, Math.sin(angle) * ry, 0]);
    });
    for (let k = 0; k < sides; k++) out.face([center, rim[k], rim[(k + 1) % sides]], color, bones, inside);
  };
  for (const x of [-0.14, 0.14]) {
    const [cx, cy, cz] = front(0.34, x);
    disc([cx, cy, cz + 0.022 * s], 0.065 * s, 0.038 * s, 8, [0.93, 0.92, 0.88]);
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
      const knots = [
        [0.33, 0.22, -0.2],
        [0.37, 0.0, -0.1],
        [0.38, -0.25, 0.14],
        [0.37, -0.5, 0.32],
        [0.34, -0.8, 0.46],
        [0.31, -1.05, 0.5],
      ];
      const points = [];
      for (let i = 0; i < knots.length - 1; i++) {
        for (let t = 0; t < 1; t += 0.5) points.push(knots[i].map((v, k) => v + (knots[i + 1][k] - v) * t));
      }
      points.push(knots[knots.length - 1]);
      const radii = points.map((_, i) => (i % 2 ? 0.045 : 0.07) * s * (i === points.length - 1 ? 0.6 : 1));
      const along = (i) => (i < 3 ? bones : i < 6 ? neck : [["spine_03", 1]]);
      out.path(points.map(([x, dy, z]) => p(side * x, dy, z)), radii, 6, () => c.hair, along, { capEnd: true });
    }
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
    out.path(points, radii, 5, () => c.hair, () => bones, { capStart: true, capEnd: true });
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

  // A triangle, turned to face away from `inside`.
  face(corners, color, bones, inside, cornerBones = null) {
    const normal = cross(sub(corners[1], corners[0]), sub(corners[2], corners[0]));
    const middle = mul(add(add(corners[0], corners[1]), corners[2]), 1 / 3);
    let order = [0, 1, 2];
    if (dot(normal, sub(middle, inside)) < 0) order = [0, 2, 1];
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
  // of the ring's bones.
  tube(rings, sides, color, { capStart = false, capEnd = false, endColor = null, skip = null } = {}) {
    const points = rings.map((r) => {
      // The ring's side axis is +x where it can be; its front is square to that and the bone.
      const side = norm(Math.abs(r.dir[0]) > 0.9 ? [0, 0, -1] : sub([1, 0, 0], mul(r.dir, r.dir[0])));
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
        this.face([a, b, cc], col, wa, inside, [wa, wb, wc]);
        this.face([a, cc, d], col, wa, inside, [wa, wc, wd]);
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
  path(points, radii, sides, color, bones, { capStart = false, capEnd = false, depth = null } = {}) {
    const rings = points.map((center, i) => {
      const [before, after] = [points[Math.max(0, i - 1)], points[Math.min(points.length - 1, i + 1)]];
      return { center, dir: norm(sub(after, before)), rx: radii[i], rz: depth?.[i] ?? radii[i], bones: bones(i) };
    });
    this.tube(rings, sides, color, { capStart, capEnd });
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
