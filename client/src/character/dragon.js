import { MeshOut } from "./body.js";
import { TAU, add, ease, hex, hump, lerp, mirrored, mul, sampled, shade, sub } from "./rig.js";
import { shapesOn } from "./bodies.js";
import { painterFor } from "./paint.js";

// Dragons: a long neck and tail, horns, and wings on the back, each wing an arm (shoulder, elbow,
// wrist) with three long fingers and skin between them and back to the flank. A dragon stands on
// four legs; a wyvern stands on two, its body tipped up, with a sting on its tail. A `mouth` bone
// sits at the tip of the snout, for breath and other effects to come out of.
//
// A look (recipe.js) gives its height (to the top of the skull), build (thicker or thinner),
// limbs (its legs' and wings' thickness), head (its head's size) and colors: skin the scales,
// secondary the belly and the wings' skin, hair the horns, spines and claws, eyes.
//
// Shapes are in the species' own feet, scaled to the look's height. Each faces +z, its feet on
// y = 0, its left toward +x. Wings rest spread; clips fold them.

// H: the back's height; L: hip to shoulder; w: how far out the legs are; legs: 4 or 2; tilt: how
// far the body tips up, front first, about the hips; span: the wings' size; neck and tail: their
// length.
export const DRAGONS = shapesOn("dragon");

// The areas its faces are tagged with, in named groups (paint.js).
export const AREA_GROUPS = { everything: ["scales", "belly", "horns", "eyes", "dark", "teeth"] };
export const dragonOf = (look) => DRAGONS[look.body] ?? DRAGONS.dragon;

// Turns a point about the hips, the front up by the species' tilt.
function tipper(sp) {
  const pivot = [0, sp.H, -sp.L / 2];
  const [c, s] = [Math.cos(sp.tilt), Math.sin(sp.tilt)];
  return (p) => {
    const [dy, dz] = [p[1] - pivot[1], p[2] - pivot[2]];
    return [p[0], pivot[1] + dy * c + dz * s, pivot[2] + dz * c - dy * s];
  };
}

const LEG_BONES = /^(upperarm|lowerarm|hand|thigh|calf|foot|ball)_/;

// The skeleton for a species, in its own feet: [name, parent, at]. Everything but the legs is
// tipped by the tilt.
function joints(sp) {
  const { H, L, w } = sp;
  const [hz, cz] = [-L / 2, L / 2];
  const s3 = [0, H + 0.15, cz];
  const n1 = add(s3, mul([0, 0.75, 0.6], sp.neck));
  const n2 = add(n1, mul([0, 0.95, 0.65], sp.neck));
  const n3 = add(n2, mul([0, 0.75, 0.6], sp.neck));
  const head = add(n3, mul([0, 0.45, 0.6], sp.head));
  const out = [
    ["root", null, [0, 0, 0]],
    ["pelvis", "root", [0, H, hz]],
    ["spine_01", "pelvis", [0, H + 0.25, hz + 0.33 * L]],
    ["spine_02", "spine_01", [0, H + 0.3, hz + 0.66 * L]],
    ["spine_03", "spine_02", s3],
    ["neck_01", "spine_03", n1],
    ["neck_02", "neck_01", n2],
    ["neck_03", "neck_02", n3],
    ["head", "neck_03", head],
    ["jaw", "head", add(head, mul([0, -0.3, 0.2], sp.head))],
    ["mouth", "head", add(head, mul([0, -0.28, 1.75], sp.head))],
  ];
  let at = [0, H + 0.05, hz - 0.45];
  const steps = [[-0.25, -1.3], [-0.3, -1.35], [-0.25, -1.35], [-0.15, -1.25], [-0.05, -1.15], [0, -1.05]];
  steps.forEach(([dy, dz], i) => {
    out.push([`tail_0${i + 1}`, i ? `tail_0${i}` : "pelvis", at]);
    at = add(at, mul([0, dy, dz], sp.tail));
  });
  out.push(["tail_end", "tail_06", at]);
  // The wing: shoulder on the back behind the front legs, the elbow up and out, the wrist out
  // and a little forward.
  const k = sp.span;
  const shoulder = [0.55, H + 0.55, cz - 0.45];
  const elbow = add(shoulder, mul([2.3, 1.2, -0.9], k));
  out.push(["wing_01_l", "spine_03", shoulder], ["wing_02_l", "wing_01_l", elbow], ["wing_03_l", "wing_02_l", add(elbow, mul([2.4, -0.5, 1.1], k))]);
  const tip = tipper(sp);
  const tipped = out.map(([name, parent, p]) => [name, parent, name === "root" ? p : tip(p)]);
  // Legs stand under the tipped body: under the shoulders, and under the hips.
  const hip = tip([w, H - 0.3, hz]);
  const hind = 0.5 * (hip[1] - 0.12);
  tipped.push(
    ["thigh_l", "pelvis", hip],
    ["calf_l", "thigh_l", [w + 0.1, hip[1] - hind * 0.85, hz + 0.8]],
    ["foot_l", "calf_l", [w + 0.1, 0.5, hz - 0.15]],
    ["ball_l", "foot_l", [w + 0.1, 0.12, hz + 0.45]],
  );
  if (sp.legs === 4) {
    tipped.push(
      ["upperarm_l", "spine_03", [w, H - 0.5, cz - 0.1]],
      ["lowerarm_l", "upperarm_l", [w + 0.1, 0.52 * H, cz + 0.3]],
      ["hand_l", "lowerarm_l", [w + 0.1, 0.3, cz + 0.05]],
    );
  }
  return tipped;
}

// The wing's finger tips and where its skin meets the flank, in its own feet, before the tilt:
// tips as offsets from the wrist.
const FINGERS = [
  [3.1, -0.4, -1.4],
  [1.6, -0.7, -3.1],
  [-0.4, -0.8, -3.4],
];

const tallOf = (sp) => {
  const head = mirrored(joints(sp), 1).find((b) => b.name === "head").at;
  return head[1] + 0.45 * sp.head;
};

export function dragonSkeleton(look) {
  const sp = dragonOf(look);
  return mirrored(joints(sp), look.height / tallOf(sp));
}

// Mesh data for a look, as body.js's bodyMesh gives it, and the scale its clips move the pelvis by.
export function dragonMesh(look) {
  const sp = dragonOf(look);
  const s = look.height / tallOf(sp);
  const canonical = mirrored(joints(sp), 1);
  const index = new Map(canonical.map((b, i) => [b.name, i]));
  const at = (name) => canonical[index.get(name)].at;
  const tip = tipper(sp);
  const build = 0.85 + 0.3 * look.build;
  const limb = 0.85 + 0.3 * look.limbs;
  const big = sp.head * (0.8 + 0.4 * look.head);
  // Faces are tagged with their areas (AREA_GROUPS), and painted by the look's coloration.
  const c = { skin: "scales", secondary: "belly", hair: "horns", eyes: "eyes" };
  const [scales, belly, horn, dark] = [c.skin, c.secondary, c.hair, "dark"];
  const ridge = shade(scales, 0.7);
  const out = new MeshOut(index);
  out.paint = painterFor(look, AREA_GROUPS, look.height / s);
  const scaled = (angle) => (Math.abs(angle) < 0.9 ? belly : Math.abs(angle) > 2.5 ? ridge : scales);
  const { H, L } = sp;
  const hz = -L / 2;
  const dir = tip([0, 0, 1]).map((v, i) => v - tip([0, 0, 0])[i]);

  // The body, rump to chest, a ring at a time, tipped with the rest; the neck along its bones.
  const trunk = [
    [-0.14, 0.05, 0.42, 0.45, [["pelvis", 1]]],
    [0, 0, 0.8, 0.85, [["pelvis", 1]]],
    [0.3, -0.05, 0.95, 1.0, [["pelvis", 0.4], ["spine_01", 0.6]]],
    [0.55, -0.1, 1.0, 1.08, [["spine_01", 0.5], ["spine_02", 0.5]]],
    [0.8, -0.1, 1.0, 1.12, [["spine_02", 0.5], ["spine_03", 0.5]]],
    [1.0, -0.05, 0.9, 1.0, [["spine_03", 1]]],
    [1.12, 0.15, 0.6, 0.62, [["spine_03", 0.5], ["neck_01", 0.5]]],
  ].map(([t, dy, rx, rz, bones]) => ({ center: tip([0, H + 0.5 - rz * build + dy, hz + t * L]), dir, rx: rx * build, rz: rz * build, bones }));
  out.tube(trunk, 12, (band, angle) => scaled(angle));
  const neckNames = ["spine_03", "neck_01", "neck_02", "neck_03", "head"];
  const neckPoints = neckNames.map((n, i) => (i ? at(n) : add(at(n), mul(dir, -0.3))));
  out.path(neckPoints, [0.6, 0.5, 0.42, 0.36, 0.3].map((r) => r * build * sp.neck ** 0.3), 10, (band, angle) => scaled(angle), (i) => [[neckNames[Math.max(0, i - 1)], 0.4], [neckNames[i], 0.6]], { carry: true });

  // The head: a long snout ahead of the skull, tipped down a little, the jaw on its own bone.
  const face = tip([0, -0.22, 1]).map((v, i) => v - tip([0, 0, 0])[i]);
  const hp = (x, dy, dz) => add(at("head"), mul(add([x, dy, 0], mul(face, dz)), big));
  const headRing = (dz, dy, rx, rz, bones) => ({ center: hp(0, dy, dz), dir: face, rx: rx * big, rz: rz * big, bones });
  const skull = [
    [-0.35, 0.05, 0.22, 0.22],
    [-0.15, 0.06, 0.4, 0.36],
    [0.2, 0.04, 0.38, 0.32],
    [0.65, -0.02, 0.28, 0.22],
    [1.15, -0.05, 0.22, 0.17],
    [1.6, -0.07, 0.17, 0.13],
  ].map(([dz, dy, rx, rz]) => headRing(dz, dy, rx, rz, [["head", 1]]));
  out.tube(skull, 10, (band, angle) => (band >= 2 && Math.abs(angle) < 1 ? belly : scaled(angle)), { endColor: dark });
  const jaw = [
    [0.0, -0.2, 0.33, 0.2],
    [0.6, -0.26, 0.27, 0.15],
    [1.15, -0.27, 0.2, 0.11],
    [1.55, -0.27, 0.14, 0.08],
  ].map(([dz, dy, rx, rz]) => headRing(dz, dy, rx, rz, [["jaw", 1]]));
  out.tube(jaw, 8, (band, angle) => (Math.abs(angle) < 1.2 ? belly : scales));
  for (const side of [-1, 1]) {
    out.gem(hp(side * 0.3, 0.14, 0.35), 0.06 * big, c.eyes, [["head", 1]]);
    out.gem(hp(side * 0.33, 0.15, 0.37), 0.025 * big, dark, [["head", 1]]);
    // Teeth down the upper jaw.
    for (const dz of [0.7, 1.0, 1.3]) out.path([hp(side * 0.17, -0.12, dz), hp(side * 0.17, -0.26, dz + 0.03)], [0.035 * big, 0.004 * big], 4, () => "teeth", () => [["head", 1]]);
    const horns = {
      swept: [[0.22, 0.3, -0.05, 0.13], [0.36, 0.55, -0.6, 0.09], [0.42, 0.68, -1.25, 0.05], [0.4, 0.82, -1.7, 0.008]],
      short: [[0.2, 0.28, -0.05, 0.1], [0.3, 0.45, -0.45, 0.06], [0.33, 0.55, -0.8, 0.008]],
    }[sp.horns];
    out.path(horns.map(([x, dy, dz]) => hp(side * x, dy, dz)), horns.map((r) => r[3] * big), 6, () => horn, () => [["head", 1]], { carry: true });
  }

  // Spines down the back of the neck, the back and the tail.
  const spine = (base, up, size, bones) => out.path([base, add(base, mul(up, size))], [0.16 * size, 0.01], 4, () => horn, () => bones, { depth: [0.05 * size, 0.005] });
  const upward = tip([0, 1, -0.5]).map((v, i) => v - tip([0, 0, 0])[i]);
  for (const ring of trunk.slice(1, 6)) spine(add(ring.center, mul(tip([0, 1, 0]).map((v, i) => v - tip([0, 0, 0])[i]), ring.rz * 0.92)), upward, 0.55, ring.bones);
  for (const [i, n] of ["neck_01", "neck_02", "neck_03"].entries()) spine(add(at(n), [0, 0.38 - i * 0.05, -0.12]), [0, 0.7, -0.7], 0.45 - i * 0.07, [[n, 1]]);

  // The tail, tapering along its bones, with a spade or a sting at the end.
  const tailNames = ["tail_01", "tail_02", "tail_03", "tail_04", "tail_05", "tail_06"];
  const tailPoints = [...tailNames, "tail_end"].map(at);
  const tailRadii = [0.48, 0.4, 0.31, 0.23, 0.16, 0.1, 0.05].map((r) => r * build);
  out.path(tailPoints, tailRadii, 8, (band, angle) => scaled(angle), (i) => [[tailNames[Math.min(i, tailNames.length - 1)], 1]], { carry: true });
  tailPoints.slice(0, 5).forEach((p, i) => spine(add(p, [0, tailRadii[i] * 0.9, 0]), [0, 0.8, -0.6], 0.4 - i * 0.06, [[tailNames[i], 1]]));
  const end = at("tail_end");
  const along = sub(end, at("tail_06"));
  const forth = mul(along, 1 / Math.hypot(...along));
  if (sp.tip === "spade") {
    // A flat diamond, both faces drawn.
    const [a, b, l, r] = [sub(end, mul(forth, 0.1)), add(end, mul(forth, 0.85)), add(end, [0.38, 0, 0.25 * forth[2]]), add(end, [-0.38, 0, 0.25 * forth[2]])];
    for (const toward of [false, true]) {
      out.face([a, l, b], horn, [["tail_06", 1]], add(end, [0, 1, 0]), null, toward);
      out.face([a, b, r], horn, [["tail_06", 1]], add(end, [0, 1, 0]), null, toward);
    }
  } else {
    out.path([sub(end, mul(forth, 0.1)), add(end, add(mul(forth, 0.5), [0, 0.15, 0])), add(end, add(mul(forth, 0.8), [0, 0.45, 0]))], [0.14, 0.08, 0.005], 6, () => horn, () => [["tail_06", 1]], { carry: true });
  }

  // Wings: the arm, three fingers, and skin between them and back to the flank, both faces drawn.
  const membrane = shade(belly, 0.85);
  for (const side of ["l", "r"]) {
    const x = side === "l" ? 1 : -1;
    const n = (name) => `${name}_${side}`;
    const [S, E, W] = [at(n("wing_01")), at(n("wing_02")), at(n("wing_03"))];
    const tips = FINGERS.map((f) => add(W, tip([x * f[0], f[1], f[2]]).map((v, i) => (v - tip([0, 0, 0])[i]) * sp.span)));
    const flank = tip([x * 0.75, H + 0.05, hz + 0.15 * L]);
    const [ws, we, ww, wf] = [[[n("wing_01"), 1]], [[n("wing_02"), 1]], [[n("wing_03"), 1]], [["spine_01", 1]]];
    out.path([add(S, [-x * 0.3, -0.25, 0]), S, E, W], [0.3, 0.24, 0.17, 0.11].map((r) => r * limb), 8, (band, angle) => scaled(angle), (i) => [ws, ws, we, ww][i], { carry: true });
    for (const f of tips) out.path([W, lerp(W, f, 0.5), f], [0.08 * limb, 0.05 * limb, 0.01], 5, () => ridge, () => ww);
    out.path([W, add(W, tip([x * 0.05, 0.25, 0.35]).map((v, i) => v - tip([0, 0, 0])[i]))], [0.08, 0.005], 5, () => horn, () => ww);
    // Each edge between tips sags in toward the wrist, a scallop.
    const edge = [...tips, flank];
    const corners = [[W, ww]];
    edge.forEach((p, i) => {
      corners.push([p, i < 3 ? ww : wf]);
      const next = edge[i + 1];
      if (next) corners.push([lerp(lerp(p, next, 0.5), i < 2 ? W : lerp(W, E, 0.5), 0.28), i < 2 ? ww : we]);
    });
    const above = add(W, [0, 3, 0]);
    const panel = (a, b, cc) => {
      for (const toward of [false, true]) out.face([a[0], b[0], cc[0]], membrane, a[1], above, [a[1], b[1], cc[1]], toward);
    };
    for (let i = 1; i < corners.length - 1; i++) panel(corners[0], corners[i], corners[i + 1]);
    // From the wrist back to the elbow and the shoulder, down to the flank.
    panel([W, ww], [flank, wf], [E, we]);
    panel([E, we], [flank, wf], [S, ws]);
  }

  // Legs, each a row of [point, radius, bones], with claws.
  const leg = (rows) => out.path(rows.map(([p]) => p), rows.map(([, r]) => 1.35 * r * limb * build), 8, (band) => (band >= rows.length - 3 ? shade(scales, 0.85) : scales), (i) => rows[i][2], { carry: true });
  const claws = (base, bone, x) => {
    for (const spread of [-0.18, 0, 0.18]) out.path([add(base, [spread + x * 0.04, 0.05, 0.12]), add(base, [spread * 1.4 + x * 0.06, 0.0, 0.5])], [0.07, 0.008], 5, () => horn, () => [[bone, 1]]);
  };
  for (const side of ["l", "r"]) {
    const n = (name) => `${name}_${side}`;
    const x = side === "l" ? 1 : -1;
    if (sp.legs === 4) {
      leg([
        [add(at(n("upperarm")), [-x * 0.35, 0.35, 0]), 0.5, [["spine_03", 0.6], [n("upperarm"), 0.4]]],
        [at(n("upperarm")), 0.45, [[n("upperarm"), 1]]],
        [lerp(at(n("upperarm")), at(n("lowerarm")), 0.5), 0.36, [[n("upperarm"), 1]]],
        [at(n("lowerarm")), 0.27, [[n("upperarm"), 0.5], [n("lowerarm"), 0.5]]],
        [lerp(at(n("lowerarm")), at(n("hand")), 0.5), 0.22, [[n("lowerarm"), 1]]],
        [at(n("hand")), 0.22, [[n("lowerarm"), 0.5], [n("hand"), 0.5]]],
        [add(at(n("hand")), [0, -0.15, 0.25]), 0.2, [[n("hand"), 1]]],
      ]);
      claws(add(at(n("hand")), [0, -0.3, 0.2]), n("hand"), x);
    }
    const thick = sp.legs === 2 ? 1.2 : 1;
    leg([
      [add(at(n("thigh")), [-x * 0.3, 0.35, 0]), 0.62 * thick, [["pelvis", 0.6], [n("thigh"), 0.4]]],
      [at(n("thigh")), 0.58 * thick, [[n("thigh"), 1]]],
      [lerp(at(n("thigh")), at(n("calf")), 0.5), 0.46 * thick, [[n("thigh"), 1]]],
      [at(n("calf")), 0.3 * thick, [[n("thigh"), 0.5], [n("calf"), 0.5]]],
      [lerp(at(n("calf")), at(n("foot")), 0.5), 0.22 * thick, [[n("calf"), 1]]],
      [at(n("foot")), 0.2 * thick, [[n("calf"), 0.5], [n("foot"), 0.5]]],
      [at(n("ball")), 0.17 * thick, [[n("foot"), 0.5], [n("ball"), 0.5]]],
    ]);
    claws(at(n("ball")), n("ball"), x);
  }

  const mesh = out.arrays();
  for (let i = 0; i < mesh.positions.length; i++) mesh.positions[i] *= s;
  return { ...mesh, bones: canonical.map((b) => ({ ...b, at: mul(b.at, s) })), scale: s };
}

const both = (name, [x, y, z]) => ({ [`${name}_l`]: [x, y, z], [`${name}_r`]: [x, -y, -z] });
const LEFT_RIGHT = (name, l, r) => ({ [`${name}_l`]: l, [`${name}_r`]: r });

// The wings: folded along the body by `fold` (0 spread, 1 folded), raised by `lift` (radians, up
// positive), each part lagging the one before by `lag` of a flap.
function wings(fold, lift = 0, lag = 0) {
  return {
    ...both("wing_01", [0, 1.05 * fold, -0.75 * fold + lift]),
    ...both("wing_02", [0, 1.5 * fold, 0.35 * fold + lift * lag]),
    ...both("wing_03", [0, 1.25 * fold, -0.2 * fold + lift * lag * 0.6]),
  };
}

// The legs' turns for a gait at phase u: each swings `swing` radians at its own phase, folding as
// it comes forward by `lift`.
function gait(u, swing, lift, phases) {
  const bones = {};
  for (const [leg, at] of Object.entries(phases)) {
    const a = TAU * (u + at);
    const angle = swing * Math.sin(a);
    const fold = lift * Math.max(0, -Math.cos(a));
    const side = leg.endsWith("l") ? "l" : "r";
    if (leg.startsWith("front")) Object.assign(bones, { [`upperarm_${side}`]: [angle, 0, 0], [`lowerarm_${side}`]: [fold, 0, 0], [`hand_${side}`]: [fold * 0.5, 0, 0] });
    else Object.assign(bones, { [`thigh_${side}`]: [angle - fold * 0.3, 0, 0], [`calf_${side}`]: [fold * 0.8, 0, 0], [`foot_${side}`]: [-fold * 0.8, 0, 0] });
  }
  return bones;
}

const tailSway = (u, amount, lift = 0) => Object.fromEntries(["tail_01", "tail_02", "tail_03", "tail_04", "tail_05", "tail_06"].map((n, i) => [n, [lift, amount * Math.sin(TAU * u - 0.7 * i), 0]]));
const neckBend = (x, y = 0) => ({ neck_01: [x * 0.4, y * 0.3, 0], neck_02: [x * 0.35, y * 0.35, 0], neck_03: [x * 0.25, y * 0.35, 0] });

// How long each clip lasts, its pose at each moment, and its speed along the ground in the
// species' own feet a second; a breath also says when the breath comes out, in seconds.
function dragonPoses(sp) {
  const k = sp.H / 4;
  const four = sp.legs === 4;
  const walkLegs = (u, swing, lift) => gait(u, swing, lift, four ? { back_l: 0, front_l: 0.25, back_r: 0.5, front_r: 0.75 } : { back_l: 0, back_r: 0.5 });
  const clips = {
    Idle_Loop: [
      4,
      (t) => {
        const u = t / 4;
        return { bones: { ...wings(1, 0.05 * Math.sin(TAU * u)), ...neckBend(0.05 * Math.sin(TAU * u), 0.15 * Math.sin(TAU * u * 0.5)), spine_02: [0.02 * Math.sin(TAU * u * 2), 0, 0], ...tailSway(u, 0.08) }, pelvis: [0, 0.02 * k * Math.sin(TAU * u * 2), 0] };
      },
    ],
    Walk_Loop: [
      1.6,
      (t) => {
        const u = t / 1.6;
        return { bones: { ...walkLegs(u, 0.3, 0.6), ...wings(1), ...neckBend(0.05 * Math.sin(TAU * u * 2), 0.08 * Math.sin(TAU * u)), pelvis: [0, 0, 0.04 * Math.sin(TAU * u)], ...tailSway(u, 0.15) }, pelvis: [0, -0.04 * k * Math.cos(TAU * u * 2), 0] };
      },
      4 * k,
    ],
    Run_Fwd_Loop: [
      0.8,
      (t) => {
        const u = t / 0.8;
        const flex = Math.sin(TAU * u);
        const legsNow = four ? gait(u, 0.55, 0.9, { back_l: 0, back_r: 0.08, front_l: 0.5, front_r: 0.58 }) : walkLegs(u, 0.6, 1);
        return { bones: { ...legsNow, ...wings(0.55, 0.15 + 0.1 * flex, 0.5), spine_01: [-0.08 * flex, 0, 0], ...neckBend(0.25 + 0.05 * flex), ...tailSway(u, 0.08, -0.05) }, pelvis: [0, 0.12 * k * Math.sin(TAU * u - 1), 0] };
      },
      14 * k,
    ],
    // A snap: the neck drawn back, then thrown forward and down, the jaw shutting at the end.
    Bite: [
      1,
      (t) => {
        const u = t / 1;
        const back = hump(u, 0, 0.25, 0.3, 0.4);
        const strike = hump(u, 0.3, 0.45, 0.55, 0.95);
        const open = hump(u, 0.15, 0.3, 0.42, 0.5);
        return { bones: { ...wings(1, 0.2 * back), ...neckBend(-0.5 * back + 0.75 * strike), head: [-0.2 * strike, 0, 0], jaw: [0.8 * open, 0, 0], ...walkLegs(0, 0, 0), ...tailSway(u, 0.1) }, pelvis: [0, -0.1 * strike * k, 0.5 * strike * k] };
      },
    ],
    // A sweep: the body turns, the tail swinging round from one side across to the other.
    Tail_Sweep: [
      1.5,
      (t) => {
        const u = t / 1.5;
        const wind = hump(u, 0, 0.25, 0.3, 0.45);
        const swing = hump(u, 0.3, 0.55, 0.65, 1);
        const amount = 0.5 * wind - 0.75 * swing;
        const tailBones = Object.fromEntries(["tail_01", "tail_02", "tail_03", "tail_04", "tail_05", "tail_06"].map((n, i) => [n, [0.05 * swing, amount * (0.6 + 0.12 * i), 0]]));
        return { bones: { pelvis: [0, -0.35 * amount, 0], ...neckBend(0.1, 0.5 * amount), ...wings(0.8, 0.2 * swing), ...tailBones }, pelvis: [0, -0.05 * swing * k, 0] };
      },
    ],
    // A roar: up off the front, wings spread and raised, head thrown back, jaw wide.
    Roar: [
      2.4,
      (t) => {
        const u = t / 2.4;
        const up = hump(u, 0, 0.25, 0.75, 1);
        const open = hump(u, 0.15, 0.25, 0.7, 0.8);
        const shake = 0.05 * Math.sin(TAU * u * 9) * open;
        return {
          bones: { ...wings(1 - up, 0.35 * up), spine_02: [-0.15 * up, 0, 0], spine_03: [-0.12 * up, 0, 0], ...neckBend(-0.55 * up, shake * 3), head: [-0.2 * up, 0, 0], jaw: [0.6 * open, 0, 0], ...(four ? both("upperarm", [-0.4 * up, 0, 0]) : {}), ...both("thigh", [-0.1 * up, 0, 0]), ...tailSway(u, 0.12 * up) },
          pelvis: [0, 0.05 * up * k, 0],
        };
      },
    ],
    Hit: [
      0.55,
      (t) => {
        const q = hump(t / 0.55, 0, 0.2, 0.35, 1);
        return { bones: { ...wings(1, 0.3 * q), ...neckBend(-0.35 * q, 0.4 * q), spine_02: [0, 0.12 * q, 0.06 * q], jaw: [0.4 * q, 0, 0], ...tailSway(0, 0) }, pelvis: [0, 0, -0.25 * q * k] };
      },
    ],
    // Down onto the belly, then over onto its side, the wings and neck going limp.
    Death: [
      2.2,
      (t) => {
        const u = t / 2.2;
        const buckle = ease(u / 0.4);
        const roll = ease((u - 0.3) / 0.5);
        const legs = { ...(four ? { ...both("upperarm", [-0.5 * buckle, 0, 0]), ...both("lowerarm", [1.0 * buckle, 0, 0]) } : {}), ...both("thigh", [-0.5 * buckle, 0, 0]), ...both("calf", [1.1 * buckle, 0, 0]), ...both("foot", [-0.6 * buckle, 0, 0]) };
        return {
          bones: { ...legs, pelvis: [sp.tilt * buckle, 0, 0.9 * roll], ...wings(1 - 0.4 * roll, -0.3 * roll), ...neckBend(0.5 * buckle, -0.6 * roll), jaw: [0.4 * roll, 0, 0], ...tailSway(0.25, 0.3 * roll) },
          pelvis: [0, -0.48 * sp.H * buckle - 0.08 * sp.H * roll, 0],
        };
      },
    ],
    // Flying: up off the ground, legs tucked, the wings beating, the tail out straight behind.
    Fly_Loop: [
      1.2,
      (t) => {
        const u = t / 1.2;
        const beat = Math.sin(TAU * u);
        const tuck = { ...(four ? { ...both("upperarm", [-0.9, 0, 0]), ...both("lowerarm", [1.6, 0, 0]) } : {}), ...both("thigh", [0.9, 0, 0]), ...both("calf", [0.6, 0, 0]), ...both("foot", [0.4, 0, 0]) };
        return { bones: { ...tuck, pelvis: [sp.tilt, 0, 0], ...wings(0, 0.65 * beat, 0.6), ...neckBend(0.35 - 0.05 * beat), ...tailSway(u, 0.06, 0.1) }, pelvis: [0, (0.9 + 0.12 * -beat) * sp.H, 0] };
      },
      20 * k,
    ],
  };
  if (sp.breath) {
    // Drawing breath (the head back and up, the chest lifting, wings half open), then fire: the
    // neck thrust forward and low, the jaw wide, the head sweeping across, then closing.
    clips.Breath = [
      3.2,
      (t) => {
        const u = t / 3.2;
        const draw = hump(u, 0, 0.2, 0.25, 0.32);
        const blow = hump(u, 0.25, 0.32, 0.82, 0.92);
        const open = hump(u, 0.26, 0.31, 0.83, 0.9);
        const sweep = Math.sin(TAU * ((u - 0.3) / 0.55) * 0.5 - Math.PI / 2) * blow;
        return {
          bones: { ...wings(1 - 0.5 * draw - 0.3 * blow, 0.35 * draw), spine_02: [-0.12 * draw + 0.05 * blow, 0, 0], spine_03: [-0.12 * draw, 0, 0], ...neckBend(-0.6 * draw + 0.45 * blow, 0.7 * sweep), head: [0.25 * draw - 0.15 * blow, 0.2 * sweep, 0], jaw: [0.55 * open, 0, 0], ...(four ? both("upperarm", [-0.15 * draw, 0, 0]) : {}), ...tailSway(u, 0.1) },
          pelvis: [0, 0.05 * draw * k, -0.15 * blow * k],
        };
      },
      0,
      [0.32 * 3.2, 0.85 * 3.2],
    ];
  } else {
    // A wyvern stabs with its tail, up over its back and down ahead of it.
    clips.Sting = [
      1.3,
      (t) => {
        const u = t / 1.3;
        const raise = hump(u, 0, 0.35, 0.45, 0.6);
        const stab = hump(u, 0.4, 0.55, 0.65, 1);
        const tailBones = Object.fromEntries(["tail_01", "tail_02", "tail_03", "tail_04", "tail_05", "tail_06"].map((n, i) => [n, [-(0.35 * raise + 0.5 * stab) * (i < 2 ? 0.5 : 1), 0, 0]]));
        return { bones: { ...tailBones, ...wings(0.7, 0.3 * raise), ...neckBend(0.2 * stab - 0.2 * raise), spine_01: [0.1 * stab, 0, 0] }, pelvis: [0, -0.05 * stab * k, 0.2 * stab * k] };
      },
    ];
  }
  return clips;
}

// The clips for a dragon's mesh, by name. A breath keeps when it breathes in userData.breath:
// [from, to] in seconds.
export function dragonClips(mesh, look) {
  const clips = Object.entries(dragonPoses(dragonOf(look))).map(([name, [duration, pose, speed, breath]]) => {
    const clip = sampled(mesh, name, duration, pose, speed);
    if (breath) clip.userData.breath = breath;
    return clip;
  });
  return new Map(clips.map((c) => [c.name, c]));
}

// The clip for each creature role (animations.js's ROLES), or null where it has none.
export function dragonRoles(look) {
  const sp = dragonOf(look);
  return { idle: "Idle_Loop", walk: "Walk_Loop", run: "Run_Fwd_Loop", fly: "Fly_Loop", attack: "Bite", bigAttack: sp.breath ? "Tail_Sweep" : "Sting", cast: null, shoot: null, breath: sp.breath ? "Breath" : null, battleCry: "Roar", hit: "Hit", death: "Death" };
}
