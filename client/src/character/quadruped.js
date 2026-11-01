import { MeshOut } from "./body.js";
import { TAU, add, ease, hex, hump, lerp, mirrored, mul, sampled, shade } from "./rig.js";

// Four-legged bodies, in four families that move differently: canine (up on its toes: wolves,
// big cats, rats), ursine (flat-footed and heavy: bears), hoofed (stags, boars, horses) and lizard
// (legs out to the sides, the spine swinging as it walks). Each species (SPECIES, by look.body) is
// a family and a shape: how long and tall, how thick, its head, ears, tail, feet and extras. The
// skeleton and a low-poly skin over it come from the shape, as body.js builds a humanoid's, and
// the clips from the family, made here rather than baked.
//
// A look (recipe.js) gives its height (to the top of the skull), build (thicker or thinner),
// limbs (its legs' thickness), head (its head's size) and colors: skin the fur or scales, hair the
// back, mane and tail tip, secondary the bare skin (snout, rat's tail) or a lizard's belly, eyes.
//
// Shapes are in the species' own feet, scaled to the look's height. Each faces +z, its feet on
// y = 0, its left toward +x.

// H: the back's height; L: hip to shoulder; w: how far out the legs are; neck: the head's joint
// from the shoulders, [up, forward]; head: its size; muzzle: how long the face is; pitch: how far
// the face tips down; girth: [across, deep]; neckGirth and limb: thickness; hump: a rise over the
// shoulders; jaw: how much deeper the lower jaw is than usual; trunk and ivory: an elephant's.
export const SPECIES = {
  wolf: { family: "canine", H: 2.05, L: 1.75, w: 0.3, neck: [0.52, 0.78], head: 1, muzzle: 1, pitch: 0.1, girth: [1, 1], neckGirth: 1, limb: 1, ears: "pointed", tail: "bushy", feet: "paw" },
  panther: { family: "canine", H: 1.75, L: 1.95, w: 0.27, neck: [0.38, 0.6], head: 0.95, muzzle: 0.45, pitch: 0, girth: [0.9, 0.85], neckGirth: 1.05, limb: 1, ears: "short", tail: "long", feet: "paw" },
  rat: { family: "canine", H: 1.15, L: 1.5, w: 0.28, neck: [0.15, 0.55], head: 1, muzzle: 1.05, pitch: 0.15, girth: [1.3, 1.2], neckGirth: 1.3, limb: 1, ears: "round", tail: "thin", feet: "paw" },
  bear: { family: "ursine", H: 2.3, L: 2.6, w: 0.45, neck: [0.1, 0.8], head: 1.45, muzzle: 0.55, pitch: 0.2, girth: [1.55, 1.5], neckGirth: 1.7, limb: 2.1, hump: 0.3, ears: "round", tail: "stub", feet: "paw" },
  boar: { family: "hoofed", H: 1.95, L: 1.9, w: 0.3, neck: [0.02, 0.62], head: 1.25, muzzle: 0.9, pitch: 0.35, girth: [1.3, 1.35], neckGirth: 1.6, limb: 1.1, hump: 0.15, ears: "small", tail: "tuft", feet: "hoof", tusks: true, snout: true },
  stag: { family: "hoofed", H: 3.3, L: 2.1, w: 0.3, neck: [1.05, 0.75], head: 1.05, muzzle: 1.05, pitch: 0.45, girth: [0.85, 0.9], neckGirth: 0.7, limb: 0.7, ears: "leaf", tail: "stub", feet: "hoof", antlers: true },
  horse: { family: "hoofed", H: 4.6, L: 2.9, w: 0.42, neck: [1.55, 1.3], head: 1.45, muzzle: 1.6, pitch: 0.8, girth: [0.95, 0.95], neckGirth: 0.9, limb: 0.9, ears: "leaf", tail: "horse", feet: "hoof", mane: true },
  lizard: { family: "lizard", H: 0.6, L: 2, w: 0.35, neck: [0.2, 0.75], head: 1, muzzle: 0.9, pitch: 0, girth: [1.15, 0.62], neckGirth: 1.1, limb: 1.25, ears: "none", tail: "lizard", feet: "claw" },
  basilisk: { family: "lizard", H: 0.8, L: 2.3, w: 0.4, neck: [0.35, 0.8], head: 1.2, muzzle: 0.75, pitch: 0, girth: [1.3, 0.75], neckGirth: 1.25, limb: 1.5, ears: "none", tail: "lizard", feet: "claw", crest: true },
  elephant: { family: "hoofed", H: 9, L: 5.4, w: 1.3, neck: [-0.3, 1.2], head: 7.4, muzzle: 0.3, pitch: 0.25, girth: [1.45, 1.3], neckGirth: 1.35, limb: 1.6, ears: "fan", tail: "tuft", feet: "pad", trunk: true, ivory: true, pillar: true },
  crocodile: { family: "lizard", H: 0.55, L: 2.8, w: 0.42, neck: [0.05, 0.75], head: 1.15, muzzle: 2.1, pitch: 0, girth: [1.45, 0.6], neckGirth: 1.4, limb: 1.4, ears: "none", tail: "lizard", feet: "claw", crest: true, jaw: 2.4 },
};
export const FAMILIES = ["canine", "ursine", "hoofed", "lizard"];
export const speciesOf = (look) => SPECIES[look.body] ?? SPECIES.wolf;

// The top of the skull above the head's joint, for a head of size 1.
const SKULL_TOP = 0.32;

// The skeleton for a species, in its own feet: [name, parent, at].
function joints(sp) {
  const { H, L, w, neck, family } = sp;
  const [hz, cz] = [-L / 2, L / 2];
  const k = H / 2.05;
  const spine3 = [0, H + 0.05 * k, cz];
  const head = add(spine3, [0, neck[0], neck[1]]);
  const out = [
    ["root", null, [0, 0, 0]],
    ["pelvis", "root", [0, H, hz]],
    ["spine_01", "pelvis", [0, H + 0.07 * k, hz + 0.34 * L]],
    ["spine_02", "spine_01", [0, H + 0.1 * k, hz + 0.68 * L]],
    ["spine_03", "spine_02", spine3],
    ["neck_01", "spine_03", add(spine3, [0, 0.38 * neck[0], 0.51 * neck[1]])],
    ["head", "neck_01", head],
    ["jaw", "head", add(head, mul(pitched(sp, 0.12, -0.12), sp.head))],
  ];
  // Tail bones, back from the rump.
  const tails = { bushy: [[0.1, -0.35], [-0.3, -0.45], [-0.4, -0.3]], long: [[-0.1, -0.45], [-0.55, -0.35], [-0.45, -0.45], [0.05, -0.4]], thin: [[-0.05, -0.4], [-0.3, -0.45], [-0.35, -0.5], [-0.25, -0.5]], stub: [[0.05, -0.3]], tuft: [[-0.1, -0.2], [-0.25, -0.05]], horse: [[0.0, -0.35], [-0.6, -0.15], [-0.9, -0.05]], lizard: [[-0.1, -0.5], [-0.12, -0.6], [-0.1, -0.6], [-0.08, -0.6], [-0.05, -0.55]] }[sp.tail];
  const scale = sp.tail === "lizard" ? L / 2 : k;
  let at = [0, H + 0.05 * k, hz - 0.3 * k];
  tails.forEach(([dy, dz], i) => {
    out.push([`tail_0${i + 1}`, i ? `tail_0${i}` : "pelvis", at]);
    at = add(at, mul([0, dy, dz], scale));
  });
  out.push(["tail_end", `tail_0${tails.length}`, at]);
  // A trunk, from the end of the face down nearly to the ground.
  if (sp.trunk) {
    let tip = add(head, mul(pitched(sp, 0.08 + 0.5 * sp.muzzle, -0.12), sp.head));
    // Down in four lengths to a foot above the ground, a little forward at the end.
    const drop = tip[1] - 0.12 * sp.H;
    const steps = [[0.3, 0.05], [0.3, 0.02], [0.25, 0.02], [0.15, 0.06]].map(([dy, dz]) => [0, -dy * drop, dz * drop]);
    out.push(["trunk_01", "head", tip]);
    steps.forEach((step, i) => {
      tip = add(tip, step);
      out.push([i < 3 ? `trunk_0${i + 2}` : "trunk_end", `trunk_0${i + 1}`, tip]);
    });
  }
  // Legs: upright under the body, or out to the sides.
  if (family === "lizard") {
    const r = 0.75 * (sp.L / 2.3) * (sp.limb / 1.25);
    out.push(
      ["upperarm_l", "spine_03", [w, H - 0.1 * k, cz - 0.05]],
      ["lowerarm_l", "upperarm_l", [w + r, H - 0.12 * k, cz + 0.02]],
      ["hand_l", "lowerarm_l", [w + 1.6 * r, 0.08 * k, cz + 0.12]],
      ["thigh_l", "pelvis", [w, H - 0.08 * k, hz]],
      ["calf_l", "thigh_l", [w + 1.1 * r, H - 0.1 * k, hz + 0.08]],
      ["foot_l", "calf_l", [w + 1.7 * r, 0.08 * k, hz - 0.05]],
      ["ball_l", "foot_l", [w + 1.8 * r, 0.04 * k, hz + 0.12]],
    );
  } else if (family === "ursine") {
    out.push(
      ["upperarm_l", "spine_03", [w, H - 0.25 * k, cz + 0.05]],
      ["lowerarm_l", "upperarm_l", [w, 0.5 * (H - 0.25 * k), cz - 0.05]],
      ["hand_l", "lowerarm_l", [w, 0.14 * k, cz + 0.02]],
      ["thigh_l", "pelvis", [w, H - 0.1 * k, hz]],
      ["calf_l", "thigh_l", [w, 0.52 * H, hz + 0.25 * k]],
      ["foot_l", "calf_l", [w, 0.12 * k, hz - 0.08 * k]],
      ["ball_l", "foot_l", [w, 0.06 * k, hz + 0.3 * k]],
    );
  } else if (sp.pillar) {
    // Straight columns under the shoulders and hips, the knees barely bent.
    out.push(
      ["upperarm_l", "spine_03", [w, H - 0.3 * k, cz]],
      ["lowerarm_l", "upperarm_l", [w, 0.48 * H, cz + 0.06 * k]],
      ["hand_l", "lowerarm_l", [w, 0.08 * k, cz + 0.02 * k]],
      ["thigh_l", "pelvis", [w, H - 0.2 * k, hz]],
      ["calf_l", "thigh_l", [w, 0.5 * H, hz + 0.1 * k]],
      ["foot_l", "calf_l", [w, 0.08 * k, hz]],
      ["ball_l", "foot_l", [w, 0.04 * k, hz + 0.08 * k]],
    );
  } else {
    const hoofed = family === "hoofed";
    const front = H - (hoofed ? 0.25 : 0.2) * k;
    const back = H - 0.1 * k;
    out.push(
      ["upperarm_l", "spine_03", [w, front, cz + 0.1 * k]],
      ["lowerarm_l", "upperarm_l", [w, (hoofed ? 0.62 : 0.57) * front, cz + 0.02 * k]],
      ["hand_l", "lowerarm_l", [w * 0.97, (hoofed ? 0.3 : 0.16) * front, cz + 0.06 * k]],
      ["thigh_l", "pelvis", [w, back, hz]],
      ["calf_l", "thigh_l", [w, (hoofed ? 0.76 : 0.615) * back, hz + (hoofed ? 0.32 : 0.3) * k]],
      ["foot_l", "calf_l", [w, (hoofed ? 0.36 : 0.36) * back, hz - (hoofed ? 0.12 : 0.15) * k]],
      ["ball_l", "foot_l", [w, (hoofed ? 0.1 : 0.06) * H, hz - 0.08 * k]],
    );
  }
  return out;
}

// A point on the head, [up, forward] from its joint for a head of size 1, the face tipped down by
// the species' pitch: [up, forward] as a [0, y, z] offset.
function pitched(sp, dz, dy, tip = sp.pitch) {
  const [c, s] = [Math.cos(tip), Math.sin(tip)];
  return [0, dy * c - dz * s, dz * c + dy * s];
}

export function quadrupedSkeleton(look) {
  const sp = speciesOf(look);
  return mirrored(joints(sp), look.height / tallOf(sp));
}

const tallOf = (sp) => sp.H + 0.05 * (sp.H / 2.05) + sp.neck[0] + SKULL_TOP * sp.head;

// Mesh data for a look, as body.js's bodyMesh gives it, and the scale its clips move the pelvis by.
export function quadrupedMesh(look) {
  const sp = speciesOf(look);
  const s = look.height / tallOf(sp);
  const canonical = mirrored(joints(sp), 1);
  const index = new Map(canonical.map((b, i) => [b.name, i]));
  const at = (name) => canonical[index.get(name)].at;
  const mid = (a, b, t = 0.5) => lerp(at(a), at(b), t);
  const k = sp.H / 2.05;
  // How thick things are: by the back's height, or a lizard's by its length.
  const bulk = sp.family === "lizard" ? sp.L / 2.3 : k;
  const build = 0.85 + 0.3 * look.build;
  const [gx, gy] = sp.girth.map((g) => g * build);
  const limb = sp.limb * (0.9 + 0.3 * look.limbs);
  const big = sp.head * (0.8 + 0.4 * look.head);
  const c = Object.fromEntries(Object.entries(look.colors).map(([key, v]) => [key, hex(v)]));
  const scaly = sp.family === "lizard";
  const [fur, back, belly, bare, dark] = [c.skin, c.hair, scaly ? c.secondary : shade(c.skin, 1.3), c.secondary, [0.08, 0.07, 0.07]];
  const out = new MeshOut(index);
  // Rings facing +z, their front down: angle 0 is the belly, ±π the back.
  const ring = (center, rx, rz, bones, push) => ({ center, dir: [0, 0, 1], rx, rz, bones, push });
  const furColor = (angle) => (Math.abs(angle) > 2.1 ? back : Math.abs(angle) < 0.8 ? belly : fur);

  // The body, rump to the shoulders, deep at the chest, a darker saddle along the back; then the
  // neck, along the line from the shoulders to the head.
  const [hz, L, H] = [-sp.L / 2, sp.L, sp.H];
  const rise = (bias) => (sp.hump ? (angle) => sp.hump * bias * k * Math.max(0, -Math.cos(angle)) ** 2 : undefined);
  const trunk = [
    [-0.23, 0, 0.12, 0.12, [["pelvis", 1]]],
    [-0.15, -0.01, 0.3, 0.33, [["pelvis", 1]]],
    [0, -0.05, 0.36, 0.42, [["pelvis", 1]]],
    [0.23, -0.03, 0.33, 0.4, [["pelvis", 0.4], ["spine_01", 0.6]]],
    [0.49, -0.01, 0.31, 0.4, [["spine_01", 1]]],
    [0.74, -0.07, 0.37, 0.52, [["spine_02", 1]], 0.4],
    [0.97, -0.1, 0.41, 0.58, [["spine_03", 1]], 1],
    [1.14, 0, 0.37, 0.5, [["spine_03", 1]], 0.7],
  // A deeper body hangs below the spine rather than rising above it.
  ].map(([t, dy, rx, rz, bones, h = 0]) => ring([0, H + (dy * gy - 0.6 * rz * Math.max(0, gy - 1)) * bulk, hz + t * L], rx * gx * bulk, rz * gy * bulk, bones, rise(h)));
  const neckRows = [
    [0.45, 0.3, 0.36, [["spine_03", 0.4], ["neck_01", 0.6]]],
    [0.7, 0.27, 0.3, [["neck_01", 1]]],
    [0.9, 0.25, 0.27, [["neck_01", 0.4], ["head", 0.6]]],
  ].map(([u, rx, rz, bones]) => ring(add(lerp(at("spine_03"), at("head"), u), [0, -0.04 * k, 0]), rx * sp.neckGirth * build * bulk, rz * sp.neckGirth * build * bulk * (scaly ? sp.girth[1] * 1.3 : 1), bones));
  out.tube([...trunk, ...neckRows], 12, (band, angle) => furColor(angle), { capStart: true });

  // The head, back of the skull to the nose, the lower jaw on its own bone. Places on the head are
  // [across, up, forward] from its joint for a head of size 1, the face stretched by the muzzle.
  const headBones = [["head", 1]];
  const snout = (dz) => (dz > 0.08 ? 0.08 + (dz - 0.08) * sp.muzzle : dz);
  const flat = scaly ? 0.65 : 1;
  const hp = (x, dy, dz, tip) => add(at("head"), add([x * big, 0, 0], mul(pitched(sp, snout(dz), dy * flat, tip), big)));
  const headRing = (dz, dy, rx, rz, bones) => {
    const wide = dz <= 0.3 ? 1 : sp.snout ? 1.5 : sp.family === "hoofed" || sp.family === "ursine" ? 1.3 : 1;
    return { center: hp(0, dy, dz), dir: pitched(sp, 1, 0).map((v, i) => (i ? v : 0)), rx: rx * big * wide, rz: rz * big * flat * wide, bones };
  };
  const skull = [
    [-0.14, 0.05, 0.12, 0.12],
    [-0.06, 0.07, 0.25, 0.25],
    [0.08, 0.05, 0.27, 0.26],
    [0.24, 0.01, 0.21, 0.19],
    [0.44, -0.05, 0.13, 0.1],
    [0.62, -0.1, 0.1, 0.07],
    [0.75, -0.13, 0.07, 0.05],
  ].map(([dz, dy, rx, rz]) => headRing(dz, dy, rx * (scaly ? 1.2 : 1), rz * (sp.jaw ? (dz > 0.2 ? 0.5 : 0.7) : 1), headBones));
  const nose = sp.snout ? bare : dark;
  out.tube(skull, 10, (band, angle) => (band >= 4 && Math.abs(angle) > 2.3 ? back : band >= 3 && Math.abs(angle) < 0.9 ? belly : fur), { capStart: true, capEnd: true, endColor: nose });
  // A deep lower jaw (a crocodile's) runs the length of the snout, scaled above and pale below.
  const jaw = [
    [0.14, -0.12, 0.15, 0.07],
    [0.4, -0.18, 0.11, 0.05],
    [0.66, -0.22, 0.06, 0.035],
    ...(sp.jaw ? [[0.76, -0.2, 0.05, 0.025]] : []),
  ].map(([dz, dy, rx, rz]) => headRing(dz, dy - (sp.jaw ? 0.03 * (sp.jaw - 1) : 0), rx * (scaly ? 1.3 : 1) * (sp.jaw ? 1.15 : 1), rz * (sp.jaw ?? 1), [["jaw", 1]]));
  out.tube(jaw, 8, (band, angle) => (sp.jaw && Math.abs(angle) > 0.9 ? fur : belly), { capStart: true, capEnd: true });
  if (!sp.snout && !scaly) out.gem(hp(0, -0.11, 0.78), 0.05 * big, dark, headBones);
  for (const side of [-1, 1]) {
    // Eyes, forward on the skull, or at the sides for a lizard.
    const [ex, ey, ez] = scaly ? [0.2, 0.12, 0.12] : [0.15, 0.1, 0.25];
    out.gem(hp(side * ex, ey, ez), 0.04 * big, c.eyes, headBones);
    out.gem(hp(side * (ex + 0.02), ey + 0.01, ez + 0.02), 0.018 * big, dark, headBones);
    ear(side);
    if (sp.tusks) {
      // Up from the lower jaw, curving out.
      const points = [hp(side * 0.1, -0.16, 0.5), hp(side * 0.16, -0.05, 0.58), hp(side * 0.2, 0.08, 0.56)];
      out.path(points, [0.035, 0.025, 0.004].map((r) => r * big), 6, () => [0.9, 0.86, 0.72], () => [["jaw", 1]], { capStart: true, capEnd: true });
    }
    if (sp.antlers) antlers(side);
    if (sp.ivory) {
      // Forward from the upper jaw, curving up.
      const points = [hp(side * 0.17, -0.2, 0.4), hp(side * 0.24, -0.42, 0.75), hp(side * 0.27, -0.42, 1.1), hp(side * 0.25, -0.25, 1.35)];
      out.path(points, [0.05, 0.045, 0.035, 0.005].map((r) => r * big), 6, () => [0.92, 0.88, 0.76], () => headBones, { carry: true });
    }
  }

  // Ears: rows of [across, up, forward], each with its width, the head tipping them less than
  // the face.
  function ear(side) {
    const EARS = {
      pointed: [[0.13, 0.22, 0.02, 0.09], [0.16, 0.38, -0.01, 0.055], [0.18, 0.54, -0.05, 0.008]],
      short: [[0.14, 0.2, 0.02, 0.08], [0.16, 0.3, 0.0, 0.05], [0.17, 0.38, -0.02, 0.008]],
      round: [[0.18, 0.2, -0.02, 0.11], [0.24, 0.31, -0.04, 0.12], [0.27, 0.38, -0.05, 0.03]],
      small: [[0.16, 0.18, 0.0, 0.07], [0.24, 0.27, -0.03, 0.05], [0.3, 0.3, -0.04, 0.008]],
      leaf: [[0.13, 0.2, -0.02, 0.07], [0.24, 0.34, -0.08, 0.075], [0.32, 0.45, -0.14, 0.01]],
      fan: [[0.26, 0.2, -0.04, 0.26], [0.4, 0.12, -0.1, 0.4], [0.48, -0.08, -0.1, 0.38], [0.5, -0.32, -0.06, 0.06]],
    }[sp.ears];
    if (!EARS) return;
    const points = EARS.map(([x, dy, dz]) => hp(side * x, dy, dz, sp.pitch * 0.3));
    out.path(points, EARS.map((row) => row[3] * big), 6, () => (sp.ears === "round" && sp.tail === "thin" ? bare : back), () => headBones, { capStart: true, capEnd: true, depth: EARS.map(() => 0.03 * big) });
  }

  // A main beam up, back and out, with tines forward off it.
  function antlers(side) {
    const bone = [0.75, 0.65, 0.5];
    const beam = [[0.1, 0.22, -0.02], [0.18, 0.5, -0.12], [0.32, 0.85, -0.16], [0.42, 1.15, -0.06], [0.4, 1.4, 0.1]].map(([x, dy, dz]) => hp(side * x, dy, dz, 0));
    out.path(beam, [0.05, 0.045, 0.04, 0.03, 0.012].map((r) => r * big), 5, () => bone, () => headBones, { capStart: true, capEnd: true, carry: true });
    for (const [from, to] of [
      [1, [0.22, 0.62, 0.15]],
      [2, [0.3, 1.05, 0.12]],
      [3, [0.5, 1.3, 0.05]],
    ]) {
      const tip = hp(side * to[0], to[1], to[2], 0);
      out.path([beam[from], lerp(beam[from], tip, 0.5), tip], [0.03, 0.022, 0.008].map((r) => r * big), 5, () => bone, () => headBones, { capEnd: true });
    }
  }

  // A crest of spines along the back; a mane up the neck.
  if (sp.crest) {
    for (const t of [0.05, 0.25, 0.45, 0.65, 0.85]) {
      const row = trunk[Math.min(trunk.length - 1, 2 + Math.round(t * 4))];
      const base = add(row.center, [0, row.rz * 0.9, 0]);
      out.path([base, add(base, [0, 0.18 * k, -0.06])], [0.06, 0.005].map((r) => r * k), 4, () => back, () => row.bones, { capStart: true, capEnd: true, depth: [0.02, 0.005] });
    }
  }
  if (sp.mane) {
    const points = [0.15, 0.45, 0.75, 1.0].map((u) => add(lerp(at("spine_03"), at("head"), u), [0, 0.32 * sp.neckGirth * k, -0.08 * k]));
    out.path(points, [0.06, 0.07, 0.07, 0.05].map((r) => r * k), 6, () => back, (i) => (i < 2 ? [["spine_03", 0.4], ["neck_01", 0.6]] : [["neck_01", 0.5], ["head", 0.5]]), { capStart: true, capEnd: true, depth: [0.15, 0.18, 0.15, 0.1].map((r) => r * k) });
  }

  // Legs: a row of [point, radius, bones] each, the top sunk into the body, the foot by its kind.
  const leg = (rows) => {
    out.path(rows.map(([point]) => point), rows.map(([, r]) => r * limb * bulk), 8, (band) => rows[band + 1]?.[3] ?? (band >= rows.length - 4 ? shade(fur, 0.85) : fur), (i) => rows[i][2], { capStart: true, capEnd: true, carry: true });
  };
  const hoof = shade(dark, 2.5);
  for (const side of ["l", "r"]) {
    const n = (name) => `${name}_${side}`;
    const x = side === "l" ? 1 : -1;
    const top = (joint, body, dy) => (scaly ? add(at(joint), [-x * sp.w * 0.6, 0.02, 0]) : add(at(joint), [0, dy * k, 0.02]));
    const feet = (wrist, bone, parent, toward) => {
      const [wx, , wz] = at(wrist);
      const b = [[bone, 1]];
      if (sp.feet === "hoof") return [[[wx, 0.1 * k, wz + 0.02], 0.065, b], [[wx, 0.06 * k, wz + 0.05], 0.085, b, hoof], [[wx, 0.0, wz + 0.07], 0.09, b, hoof]];
      // Wide round pads.
      if (sp.feet === "pad") return [[[wx, 0.1 * k, wz], 0.09, b], [[wx, 0.0, wz + 0.02], 0.095, b, shade(fur, 0.75)]];
      if (sp.feet === "claw") return [[[wx + x * 0.06, 0.04, wz + 0.1], 0.07, b], [[wx + x * 0.1, 0.02, wz + 0.22], 0.035, b, shade(fur, 0.7)]];
      const flatFoot = sp.family === "ursine";
      return [[[wx, flatFoot ? 0.09 : 0.11, wz + 0.07 + toward], 0.085, b], [[wx, 0.05, wz + (flatFoot ? 0.3 : 0.2) + toward], flatFoot ? 0.07 : 0.06, b, flatFoot ? shade(fur, 0.6) : undefined]];
    };
    leg([
      [top(n("upperarm"), "spine_03", 0.3), 0.2, [["spine_03", 0.6], [n("upperarm"), 0.4]]],
      [at(n("upperarm")), 0.18, [[n("upperarm"), 1]]],
      [mid(n("upperarm"), n("lowerarm")), 0.13, [[n("upperarm"), 1]]],
      [at(n("lowerarm")), 0.085, [[n("upperarm"), 0.5], [n("lowerarm"), 0.5]]],
      [mid(n("lowerarm"), n("hand")), 0.07, [[n("lowerarm"), 1]]],
      [at(n("hand")), 0.065, [[n("lowerarm"), 0.5], [n("hand"), 0.5]]],
      ...feet(n("hand"), n("hand"), n("lowerarm"), 0),
    ]);
    leg([
      [top(n("thigh"), "pelvis", 0.22), 0.26, [["pelvis", 0.6], [n("thigh"), 0.4]]],
      [at(n("thigh")), 0.23, [[n("thigh"), 1]]],
      [mid(n("thigh"), n("calf")), 0.17, [[n("thigh"), 1]]],
      [at(n("calf")), 0.1, [[n("thigh"), 0.5], [n("calf"), 0.5]]],
      [mid(n("calf"), n("foot")), 0.075, [[n("calf"), 1]]],
      [at(n("foot")), 0.06, [[n("calf"), 0.5], [n("foot"), 0.5]]],
      ...(sp.family === "ursine" ? [] : [[mid(n("foot"), n("ball")), 0.055, [[n("foot"), 1]]]]),
      [at(n("ball")), 0.07, [[n("foot"), 0.5], [n("ball"), 0.5]]],
      ...feet(n("ball"), n("ball"), n("foot"), -0.06),
    ]);
  }

  // The trunk, tapering along its bones.
  if (sp.trunk) {
    const names = ["trunk_01", "trunk_02", "trunk_03", "trunk_04"];
    out.path([...names, "trunk_end"].map(at), [0.13, 0.1, 0.075, 0.055, 0.04].map((r) => r * big), 10, () => fur, (i) => [[names[Math.min(i, 3)], 1]], { carry: true });
  }

  // The tail, along its bones.
  const tailNames = canonical.filter((b) => b.name.startsWith("tail_0")).map((b) => b.name);
  const tailPoints = [...tailNames, "tail_end"].map(at);
  const tailBones = tailPoints.map((_, i) => [[tailNames[Math.min(i, tailNames.length - 1)], 1]]);
  const thick = {
    bushy: [0.1, 0.15, 0.16, 0.02],
    long: [0.08, 0.07, 0.06, 0.05, 0.02],
    thin: [0.07, 0.05, 0.035, 0.02, 0.006],
    stub: [0.1, 0.02],
    tuft: [0.04, 0.03, 0.015],
    horse: [0.12, 0.17, 0.15, 0.03],
    lizard: [0.3, 0.24, 0.17, 0.11, 0.06, 0.01],
  }[sp.tail].map((r) => r * (sp.tail === "lizard" ? bulk * gx : k));
  const tailColor = (band) => (sp.tail === "thin" ? bare : sp.tail === "horse" || (sp.tail === "bushy" && band >= tailPoints.length - 2) ? back : fur);
  out.path(tailPoints, thick, 8, tailColor, (i) => tailBones[i], { capStart: true, capEnd: true, carry: true });
  if (sp.tail === "tuft") out.gem(tailPoints.at(-1), 0.07 * k, back, tailBones.at(-1));

  const mesh = out.arrays();
  for (let i = 0; i < mesh.positions.length; i++) mesh.positions[i] *= s;
  return { ...mesh, bones: canonical.map((b) => ({ ...b, at: mul(b.at, s) })), scale: s };
}

// The legs' turns for a gait at phase u (0-1 through its cycle): each leg swings `swing` radians
// either way at its own phase, folding as it comes forward by `lift`. Positive swings it back.
function legs(sp, u, swing, lift, phases) {
  const bones = {};
  for (const [leg, at] of Object.entries(phases)) {
    const a = TAU * (u + at);
    const angle = swing * Math.sin(a);
    const fold = lift * Math.max(0, -Math.cos(a));
    const side = leg.endsWith("l") ? "l" : "r";
    if (sp.family === "lizard") {
      // Out to the side: swung about the vertical, lifted about the length of the body.
      const x = side === "l" ? 1 : -1;
      const [upper, lower] = leg.startsWith("front") ? ["upperarm", "lowerarm"] : ["thigh", "calf"];
      bones[`${upper}_${side}`] = [0, x * angle, x * fold * 0.5];
      bones[`${lower}_${side}`] = [0, 0, -x * fold * 0.3];
    } else if (leg.startsWith("front")) {
      bones[`upperarm_${side}`] = [angle, 0, 0];
      bones[`lowerarm_${side}`] = [fold * 1.1, 0, 0];
      bones[`hand_${side}`] = [fold * 0.7, 0, 0];
    } else {
      bones[`thigh_${side}`] = [angle - fold * 0.3, 0, 0];
      bones[`calf_${side}`] = [fold * 0.8, 0, 0];
      bones[`foot_${side}`] = [-fold * 0.9, 0, 0];
    }
  }
  return bones;
}

const both = (name, turn) => ({ [`${name}_l`]: turn, [`${name}_r`]: turn });

// Each family's clips, by name: pose(t) for each, its length, and its speed along the ground in
// the species' own feet a second (scaled by the back's height).
function familyClips(sp) {
  const k = sp.H / 2.05;
  const tail = (u, amount = 0.12) => ({ tail_01: [0, amount * Math.sin(TAU * u), 0], tail_02: [0, amount * Math.sin(TAU * u - 0.6), 0], tail_03: [0, amount * Math.sin(TAU * u - 1.2), 0] });
  // Lying still: the legs give, it rolls onto its side, or onto its back for a lizard.
  const restY = sp.girth[1] * 0.42 * k;
  const death = {
    Death: [
      1.4,
      (t) => {
        const u = t / 1.4;
        const buckle = ease(u / 0.4);
        const roll = ease((u - 0.25) / 0.55);
        if (sp.family === "lizard") return { bones: { pelvis: [0, 0, Math.PI * roll], ...both("upperarm", [0, 0, 0.6 * buckle]), ...tail(0, 0) }, pelvis: [0, -(sp.H - restY) * buckle + restY * Math.sin(Math.PI * roll), 0] };
        const limp = { upperarm_l: [0.5 * roll, 0, 0], upperarm_r: [-0.2 * roll, 0, 0], ...both("lowerarm", [0.6 * buckle, 0, 0]), ...both("calf", [0.6 * buckle, 0, 0]), ...both("foot", [-0.6 * buckle, 0, 0]) };
        return { bones: { ...limp, pelvis: [0, 0, 1.45 * roll], neck_01: [0.3 * buckle, 0, -0.3 * roll], head: [0, 0, -0.2 * roll], tail_01: [-0.5 * roll, 0, 0] }, pelvis: [0, -(sp.H - restY) * (0.35 * buckle + 0.65 * roll), 0] };
      },
    ],
    Hit: [
      0.45,
      (t) => {
        const q = hump(t / 0.45, 0, 0.2, 0.35, 1);
        return { bones: { spine_02: [0, 0.2 * q, 0.08 * q], neck_01: [-0.3 * q, 0.15 * q, 0], jaw: [0.3 * q, 0, 0] }, pelvis: [0, 0, -0.15 * q * k] };
      },
    ],
  };
  // A bite: a lunge, the head forward and low, the jaw open, then snapping shut.
  const bite = (t) => {
    const u = t / 0.7;
    const lunge = hump(u, 0.05, 0.35, 0.5, 0.95);
    const open = hump(u, 0.1, 0.3, 0.38, 0.45);
    return { bones: { neck_01: [0.35 * lunge, 0, 0], head: [-0.2 * lunge, 0, 0], jaw: [0.7 * open, 0, 0], ...both("upperarm", [-0.2 * lunge, 0, 0]), ...both("thigh", [0.15 * lunge, 0, 0]) }, pelvis: [0, -0.1 * lunge * k, 0.35 * lunge * k] };
  };
  // Rearing onto the back legs: `up` 0-1, the body tipped back by `angle` about the hips.
  const rear = (up, angle) => ({ pelvis: [-angle * up, 0, 0], ...both("thigh", [angle * up, 0, 0]), neck_01: [0.3 * up, 0, 0] });
  // A roar or howl: the head up by `lift`, the jaw open.
  const call = (duration, lift) => (t) => {
    const u = t / duration;
    const up = hump(u, 0, 0.2, 0.8, 1);
    return {
      bones: { neck_01: [-lift * up, 0, 0], head: [-lift * up, 0, 0], jaw: [0.45 * hump(u, 0.15, 0.25, 0.75, 0.85), 0, 0], spine_03: [-0.08 * up, 0, 0], ...both("thigh", [-0.15 * up, 0, 0]), ...both("calf", [0.3 * up, 0, 0]), ...both("foot", [-0.3 * up, 0, 0]) },
      pelvis: [0, -0.12 * up * k, 0],
    };
  };
  const idle = (t) => {
    const u = t / 3;
    return { bones: { spine_02: [0.02 * Math.sin(TAU * u * 2), 0, 0], neck_01: [0.05 * Math.sin(TAU * u), 0.12 * Math.sin(TAU * u), 0], ...tail(u) }, pelvis: [0, 0.01 * k * Math.sin(TAU * u * 2), 0] };
  };

  if (sp.family === "lizard") {
    // Diagonal pairs together, the spine bending to reach each forward leg, the tail swinging back.
    const crawl = (duration, swing) => (t) => {
      const u = t / duration;
      const bend = Math.sin(TAU * u);
      return {
        bones: { ...legs(sp, u, swing, 0.5, { front_l: 0, back_r: 0, front_r: 0.5, back_l: 0.5 }), pelvis: [0, 0.12 * bend, 0], spine_02: [0, -0.14 * bend, 0], spine_03: [0, -0.12 * bend, 0], neck_01: [0, 0.18 * bend, 0], ...tail(u + 0.25, 0.22) },
        pelvis: [0, 0.02 * k * Math.abs(bend), 0],
      };
    };
    return {
      Idle_Loop: [3, (t) => ({ bones: { ...tail(t / 3, 0.08), neck_01: [0, 0.1 * Math.sin((TAU * t) / 3), 0], head: [-0.06 * hump((t / 3) % 1, 0.4, 0.45, 0.55, 0.6), 0, 0] } })],
      Walk_Loop: [1.2, crawl(1.2, 0.45), 3 * k],
      Run_Fwd_Loop: [0.55, crawl(0.55, 0.6), 12 * k],
      Bite: [0.7, bite],
      Lunge: [
        1.1,
        (t) => {
          const u = t / 1.1;
          const go = hump(u, 0.05, 0.3, 0.55, 1);
          const open = hump(u, 0.1, 0.25, 0.35, 0.45);
          return { bones: { neck_01: [-0.2 * go, 0, 0], jaw: [0.9 * open, 0, 0], ...both("upperarm", [0, 0, 0.3 * go]), ...tail(u, 0.3 * go) }, pelvis: [0, 0.15 * go * k, 1.2 * go * k] };
        },
      ],
      // Hissing, the front up off the ground and the jaw wide: the cast.
      Hiss: [
        2,
        (t) => {
          const up = hump(t / 2, 0, 0.2, 0.8, 1);
          return { bones: { spine_02: [-0.25 * up, 0, 0], neck_01: [-0.35 * up, 0, 0], head: [0.2 * up, 0, 0], jaw: [0.8 * hump(t / 2, 0.15, 0.25, 0.7, 0.8), 0, 0], ...both("upperarm", [0, 0, 0]) }, pelvis: [0, 0.05 * up * k, 0] };
        },
      ],
      ...death,
    };
  }

  const clips = {
    Idle_Loop: [3, idle],
    ...death,
    Bite: [0.7, bite],
  };
  if (sp.family === "canine") {
    Object.assign(clips, {
      // Each foot in turn, back left, front left, back right, front right.
      Walk_Loop: [1.1, (t) => ({ bones: { ...legs(sp, t / 1.1, 0.32, 0.55, { back_l: 0, front_l: 0.25, back_r: 0.5, front_r: 0.75 }), neck_01: [0.04 * Math.sin((TAU * t * 2) / 1.1), 0, 0], tail_01: [0.1, 0.12 * Math.sin((TAU * t) / 1.1), 0] }, pelvis: [0, -0.025 * k * Math.cos((TAU * t * 2) / 1.1), 0] }), 4.5 * k],
      Run_Fwd_Loop: [0.5, gallop(sp, 0.5, 0.65), 22 * k],
      Leap: [
        1.2,
        (t) => {
          const u = t / 1.2;
          const crouch = hump(u, 0, 0.25, 0.3, 0.38) + 0.6 * hump(u, 0.7, 0.78, 0.82, 1);
          const air = hump(u, 0.3, 0.5, 0.55, 0.72);
          const reach = hump(u, 0.32, 0.48, 0.6, 0.72);
          const tuck = 0.8 * crouch;
          return {
            bones: { ...both("upperarm", [-1.0 * reach + 0.3 * crouch, 0, 0]), ...both("lowerarm", [tuck * 0.6, 0, 0]), ...both("thigh", [-tuck * 0.5 + 0.6 * air, 0, 0]), ...both("calf", [tuck, 0, 0]), ...both("foot", [-tuck, 0, 0]), neck_01: [0.2 * reach - 0.1 * crouch, 0, 0], jaw: [0.8 * hump(u, 0.35, 0.5, 0.62, 0.7), 0, 0], tail_01: [-0.4 * air, 0, 0] },
            pelvis: [0, (-0.35 * crouch + 0.7 * air) * k, 0.8 * air * k],
          };
        },
      ],
      Howl: [2.2, call(2.2, 0.45)],
      Roar: [1.8, call(1.8, -0.15)],
    });
  }
  if (sp.family === "ursine") {
    Object.assign(clips, {
      // An amble: both legs on a side close together, the body rolling side to side.
      Walk_Loop: [1.4, (t) => ({ bones: { ...legs(sp, t / 1.4, 0.3, 0.6, { back_l: 0, front_l: 0.1, back_r: 0.5, front_r: 0.6 }), pelvis: [0, 0, 0.05 * Math.sin((TAU * t) / 1.4)], neck_01: [0, 0.08 * Math.sin((TAU * t) / 1.4), 0] } }), 3.5 * k],
      Run_Fwd_Loop: [0.6, gallop(sp, 0.6, 0.5), 15 * k],
      // Rearing up, then coming down with both forepaws.
      Rear: [
        1.6,
        (t) => {
          const u = t / 1.6;
          const up = hump(u, 0.05, 0.4, 0.55, 0.75);
          const swipe = hump(u, 0.35, 0.45, 0.6, 0.8);
          return { bones: { ...rear(up, 1.1), ...both("upperarm", [-1.2 * up + 0.8 * swipe, 0, 0]), ...both("lowerarm", [0.6 * up, 0, 0]), jaw: [0.5 * up, 0, 0] }, pelvis: [0, -0.2 * up * k, 0.3 * swipe * k] };
        },
      ],
      Roar: [1.8, call(1.8, -0.15)],
    });
  }
  if (sp.family === "hoofed") {
    const horse = sp.tail === "horse";
    Object.assign(clips, {
      // A bellow, head up and jaw open.
      Roar: [2, call(2, 0.35)],
      Walk_Loop: [1.2, (t) => ({ bones: { ...legs(sp, t / 1.2, 0.3, 0.6, { back_l: 0, front_l: 0.25, back_r: 0.5, front_r: 0.75 }), neck_01: [0.06 * Math.sin((TAU * t * 2) / 1.2), 0, 0], ...tail(t / 1.2, 0.1) } }), 4.5 * k],
      Run_Fwd_Loop: [0.6, gallop(sp, 0.6, 0.6), 24 * k],
      // Charging: head down, a burst forward.
      Charge: [
        1.3,
        (t) => {
          const u = t / 1.3;
          const go = hump(u, 0.1, 0.35, 0.6, 1);
          return { bones: { ...legs(sp, (u * 3) % 1, 0.6 * go, 0.8 * go, { back_l: 0, back_r: 0.08, front_l: 0.5, front_r: 0.58 }), neck_01: [0.55 * go, 0, 0], head: [0.2 * go, 0, 0] }, pelvis: [0, -0.05 * go * k, 1.6 * go * k] };
        },
      ],
      // Goring: head down, then tossed up.
      Gore: [
        0.9,
        (t) => {
          const u = t / 0.9;
          const down = hump(u, 0.05, 0.3, 0.4, 0.55);
          const toss = hump(u, 0.4, 0.55, 0.65, 1);
          return { bones: { neck_01: [0.6 * down - 0.4 * toss, 0, 0], head: [0.3 * down, 0, 0], ...both("upperarm", [-0.15 * down, 0, 0]) }, pelvis: [0, -0.1 * down * k, 0.3 * (down + toss) * k] };
        },
      ],
      ...(horse && {
        // Kicking out behind, head low, rump up.
        Kick: [
          0.9,
          (t) => {
            const kick = hump(t / 0.9, 0.15, 0.35, 0.45, 0.85);
            return { bones: { ...both("thigh", [1.0 * kick, 0, 0]), ...both("calf", [-0.6 * kick, 0, 0]), ...both("foot", [-0.3 * kick, 0, 0]), spine_01: [0.15 * kick, 0, 0], neck_01: [0.4 * kick, 0, 0] }, pelvis: [0, 0.25 * kick * k, 0] };
          },
        ],
        Rear: [
          1.8,
          (t) => {
            const u = t / 1.8;
            const up = hump(u, 0.05, 0.35, 0.6, 0.9);
            const paw = Math.sin(TAU * u * 3) * up;
            return { bones: { ...rear(up, 0.75), upperarm_l: [-0.9 * up + 0.3 * paw, 0, 0], upperarm_r: [-0.9 * up - 0.3 * paw, 0, 0], ...both("lowerarm", [1.3 * up, 0, 0]), neck_01: [-0.4 * up, 0, 0] }, pelvis: [0, -0.1 * up * k, 0] };
          },
        ],
      }),
    });
  }
  return clips;
}

// A gallop: the back legs nearly together then the front, the back arching and stretching.
function gallop(sp, duration, swing) {
  return (t) => {
    const u = t / duration;
    const flex = Math.sin(TAU * u);
    const k = sp.H / 2.05;
    return {
      bones: { ...legs(sp, u, swing, 0.9, { back_l: 0, back_r: 0.08, front_l: 0.5, front_r: 0.58 }), spine_01: [-0.12 * flex, 0, 0], spine_03: [0.08 * flex, 0, 0], neck_01: [0.12 + 0.08 * flex, 0, 0], tail_01: [-0.3, 0, 0] },
      pelvis: [0, 0.12 * k * Math.sin(TAU * u - 1), 0],
    };
  };
}

// The clips for a four-legged mesh, by name.
export function quadrupedClips(mesh, look) {
  const sp = speciesOf(look);
  const clips = Object.entries(familyClips(sp)).map(([name, [duration, pose, speed]]) => sampled(mesh, name, duration, sp.trunk ? withTrunk(name, duration, pose) : pose, speed));
  return new Map(clips.map((c) => [c.name, c]));
}

// A trunk's turns on top of a pose: it sways, curls up for a trumpet, and tucks back to charge
// or gore.
function withTrunk(name, duration, pose) {
  return (t) => {
    const q = pose(t);
    const u = t / duration;
    const up = name === "Roar" ? hump(u, 0.05, 0.25, 0.75, 0.95) : 0;
    const tuck = name === "Charge" || name === "Gore" ? hump(u, 0, 0.2, 0.7, 1) : 0;
    const sway = 0.12 * Math.sin(TAU * u) * (1 - up);
    const trunk = Object.fromEntries([1, 2, 3, 4].map((i) => [`trunk_0${i}`, [-0.8 * up * (i === 1 ? 0.6 : 1) + 0.25 * tuck, sway * (0.5 + 0.2 * i), 0]]));
    return { ...q, bones: { ...q.bones, ...trunk } };
  };
}

// The clip for each creature role (animations.js's ROLES), or null where it has none.
export function quadrupedRoles(look) {
  const sp = speciesOf(look);
  const base = { idle: "Idle_Loop", walk: "Walk_Loop", run: "Run_Fwd_Loop", hit: "Hit", death: "Death", shoot: null, cast: null, battleCry: "Roar" };
  if (sp.family === "lizard") return { ...base, attack: "Bite", bigAttack: "Lunge", cast: look.body === "basilisk" ? "Hiss" : null, battleCry: "Hiss" };
  if (sp.family === "ursine") return { ...base, attack: "Bite", bigAttack: "Rear", cast: "Roar" };
  if (sp.family === "hoofed") return sp.tail === "horse" ? { ...base, attack: "Kick", bigAttack: "Rear" } : { ...base, attack: "Gore", bigAttack: "Charge" };
  return { ...base, attack: "Bite", bigAttack: "Leap", cast: look.body === "wolf" ? "Howl" : null, battleCry: look.body === "wolf" ? "Howl" : "Roar" };
}
