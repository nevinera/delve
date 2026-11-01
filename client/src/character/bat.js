import { MeshOut } from "./body.js";
import { TAU, add, ease, hex, hump, lerp, mirrored, mul, sampled, shade } from "./rig.js";
import { shapesOn } from "./bodies.js";
import { painterFor } from "./paint.js";

// Bats: a small furred body hanging between two wide wings, always in the air. Each wing is an
// arm (shoulder, elbow, wrist) with four long fingers and skin between them, back to the feet,
// which hang below. A `mouth` bone sits at the tip of the snout.
//
// A look (recipe.js) gives its height (for a bat, across its wings), build (thicker or thinner),
// head (its head's and ears' size) and colors: skin the fur, secondary the wings' skin, hair the
// claws and nose, eyes.
//
// Shapes are in the species' own feet, a bat 10ft across, scaled to the look's height. Each faces
// +z, its left toward +x, its body tipped up, hovering.

export const BATS = shapesOn("bat");

// The areas its faces are tagged with, in named groups (paint.js).
export const AREA_GROUPS = { everything: ["fur", "wings", "claws", "eyes", "dark", "teeth"] };

const HOVER = 4;
const SPAN = 10;

// The skeleton, in its own feet: [name, parent, at].
function joints() {
  const y = HOVER;
  return [
    ["root", null, [0, 0, 0]],
    ["pelvis", "root", [0, y, 0]],
    ["spine_01", "pelvis", [0, y + 0.6, 0.3]],
    ["head", "spine_01", [0, y + 1.15, 0.55]],
    ["jaw", "head", [0, y + 1.0, 0.75]],
    ["mouth", "head", [0, y + 1.0, 1.15]],
    ["wing_01_l", "spine_01", [0.3, y + 0.85, 0.35]],
    ["wing_02_l", "wing_01_l", [1.6, y + 1.3, 0.1]],
    ["wing_03_l", "wing_02_l", [3.0, y + 1.05, 0.3]],
    ["thigh_l", "pelvis", [0.25, y - 0.1, -0.05]],
    ["foot_l", "thigh_l", [0.35, y - 0.95, -0.25]],
  ];
}

// The finger tips, out from the wrist, before the clips turn them.
const FINGERS = [
  [2.0, 0.45, -0.7],
  [1.7, -0.75, -1.4],
  [0.7, -1.55, -1.25],
  [-0.6, -1.9, -0.75],
];

// Mesh data for a look, as body.js's bodyMesh gives it, and the scale its clips move the pelvis by.
export function batMesh(look) {
  const s = look.height / SPAN;
  const canonical = mirrored(joints(), 1);
  const index = new Map(canonical.map((b, i) => [b.name, i]));
  const at = (name) => canonical[index.get(name)].at;
  const build = 0.8 + 0.4 * look.build;
  const big = 0.8 + 0.4 * look.head;
  // Faces are tagged with their areas (AREA_GROUPS), and painted by the look's coloration.
  const c = { skin: "fur", secondary: "wings", hair: "claws", eyes: "eyes" };
  const [fur, skin, claw, dark] = [c.skin, c.secondary, c.hair, "dark"];
  const out = new MeshOut(index);
  out.paint = painterFor(look, AREA_GROUPS, look.height / s);
  const belly = shade(fur, 1.2);

  // The body, rump to the neck, tipped up, furred, paler underneath.
  const [p, s1, h] = [at("pelvis"), at("spine_01"), at("head")];
  const up = mul(add(h, mul(p, -1)), 1 / Math.hypot(...add(h, mul(p, -1))));
  out.tube(
    [
      { center: add(p, mul(up, -0.45)), dir: up, rx: 0.12 * build, rz: 0.1 * build, bones: [["pelvis", 1]] },
      { center: add(p, mul(up, -0.15)), dir: up, rx: 0.38 * build, rz: 0.34 * build, bones: [["pelvis", 1]] },
      { center: lerp(p, s1, 0.6), dir: up, rx: 0.48 * build, rz: 0.44 * build, bones: [["pelvis", 0.5], ["spine_01", 0.5]] },
      { center: s1, dir: up, rx: 0.46 * build, rz: 0.42 * build, bones: [["spine_01", 1]] },
      { center: lerp(s1, h, 0.7), dir: up, rx: 0.3 * build, rz: 0.3 * build, bones: [["spine_01", 0.5], ["head", 0.5]] },
    ],
    10,
    (band, angle) => (Math.abs(angle) > 2.2 ? belly : fur),
  );

  // The head: round, a short snout, a jaw under it, tall ears, small eyes, fangs.
  const face = [0, -0.2, 1];
  const hp = (x, dy, dz) => add(h, mul(add([x, dy, 0], mul(face, dz)), big));
  const ring = (dz, dy, rx, rz, bones) => ({ center: hp(0, dy, dz), dir: face, rx: rx * big, rz: rz * big, bones });
  out.tube([ring(-0.3, 0, 0.15, 0.15, [["head", 1]]), ring(-0.15, 0.02, 0.32, 0.3, [["head", 1]]), ring(0.15, 0, 0.3, 0.26, [["head", 1]]), ring(0.4, -0.04, 0.16, 0.13, [["head", 1]]), ring(0.55, -0.05, 0.1, 0.08, [["head", 1]])], 10, () => fur, { endColor: claw });
  out.tube([ring(0.1, -0.2, 0.18, 0.06, [["jaw", 1]]), ring(0.45, -0.17, 0.1, 0.04, [["jaw", 1]])], 6, () => shade(fur, 0.8));
  for (const x of [-1, 1]) {
    out.gem(hp(x * 0.17, 0.1, 0.3), 0.045 * big, c.eyes, [["head", 1]]);
    out.path([hp(x * 0.07, -0.12, 0.45), hp(x * 0.07, -0.27, 0.45)], [0.025 * big, 0.003], 4, () => "teeth", () => [["head", 1]]);
    // An ear: a tall leaf, its inside darker, both faces drawn.
    const ear = [hp(x * 0.05, 0.24, -0.1), hp(x * 0.5, 0.9, -0.22), hp(x * 0.38, 0.06, -0.16)];
    const inner = [hp(x * 0.12, 0.26, -0.09), hp(x * 0.44, 0.75, -0.19), hp(x * 0.34, 0.13, -0.13)];
    for (const toward of [false, true]) out.face(ear, toward ? shade(skin, 0.7) : fur, [["head", 1]], hp(0, 0.4, -1), null, toward);
    out.face(inner, shade(skin, 0.6), [["head", 1]], hp(x * 0.3, 0.4, -1));
  }

  // Wings: the arm, four fingers, and skin between them and back to the foot, both faces drawn.
  for (const side of ["l", "r"]) {
    const x = side === "l" ? 1 : -1;
    const n = (name) => `${name}_${side}`;
    const [S, E, W, F] = [at(n("wing_01")), at(n("wing_02")), at(n("wing_03")), at(n("foot"))];
    const [ws, we, ww, wf] = [[[n("wing_01"), 1]], [[n("wing_02"), 1]], [[n("wing_03"), 1]], [[n("foot"), 1]]];
    const tips = FINGERS.map(([fx, fy, fz]) => add(W, [x * fx, fy, fz]));
    out.path([add(S, [-x * 0.15, -0.1, 0]), S, E, W], [0.16, 0.13, 0.1, 0.07].map((r) => r * build), 6, () => fur, (i) => [ws, ws, we, ww][i], { carry: true });
    for (const f of tips) out.path([W, lerp(W, f, 0.5), f], [0.05, 0.035, 0.008], 4, () => shade(skin, 0.7), () => ww);
    out.path([W, add(W, [x * 0.05, 0.3, 0.25])], [0.05, 0.004], 4, () => claw, () => ww);
    // Each edge between tips sags in toward the wrist, a scallop; then down to the foot.
    const edge = [...tips, F];
    const corners = [[W, ww]];
    edge.forEach((q, i) => {
      corners.push([q, i < 4 ? ww : wf]);
      const next = edge[i + 1];
      if (next) corners.push([lerp(lerp(q, next, 0.5), W, 0.22), i < 3 ? ww : we]);
    });
    const front = add(W, [0, 0, 3]);
    const panel = (a, b, cc) => {
      for (const toward of [false, true]) out.face([a[0], b[0], cc[0]], skin, a[1], front, [a[1], b[1], cc[1]], toward);
    };
    for (let i = 1; i < corners.length - 1; i++) panel(corners[0], corners[i], corners[i + 1]);
    // From the wrist back to the elbow and the shoulder, and down the flank to the foot.
    const flank = add(p, [x * 0.35 * build, 0.1, -0.05]);
    panel([W, ww], [F, wf], [E, we]);
    panel([E, we], [F, wf], [flank, [["pelvis", 1]]]);
    panel([E, we], [flank, [["pelvis", 1]]], [S, ws]);
    // A leg, thin, with a clawed foot.
    const T = at(n("thigh"));
    out.path([T, lerp(T, F, 0.5), F], [0.1, 0.07, 0.05].map((r) => r * build), 5, () => fur, (i) => [[[n("thigh"), 1]], [[n("thigh"), 1]], wf][i]);
    for (const spread of [-0.08, 0, 0.08]) out.path([F, add(F, [spread, -0.2, 0.12])], [0.03, 0.004], 4, () => claw, () => wf);
  }

  const mesh = out.arrays();
  for (let i = 0; i < mesh.positions.length; i++) mesh.positions[i] *= s;
  return { ...mesh, bones: canonical.map((b) => ({ ...b, at: mul(b.at, s) })), scale: s };
}

const both = (name, [x, y, z]) => ({ [`${name}_l`]: [x, y, z], [`${name}_r`]: [x, -y, -z] });

// The wings beating at phase u, `amount` radians each way: the arm leads, the hand lags, and the
// wing folds back a little on the way up.
function flap(u, amount, spread = 0) {
  const a = Math.sin(TAU * u);
  const fold = 0.25 * amount * Math.max(0, Math.cos(TAU * u));
  return { ...both("wing_01", [0, fold, amount * a + spread]), ...both("wing_02", [0, fold, 0.6 * amount * Math.sin(TAU * u - 0.6)]), ...both("wing_03", [0, -fold, 0.5 * amount * Math.sin(TAU * u - 1.2)]) };
}
// The wings drawn in along the body: 0 spread, 1 folded.
const folded = (k) => ({ ...both("wing_01", [0, 0.6 * k, -0.9 * k]), ...both("wing_02", [0, 1.4 * k, 0.4 * k]), ...both("wing_03", [0, 1.2 * k, -0.6 * k]) });

// How long each clip lasts, its pose at each moment, and its speed along the ground in the
// bat's own feet a second.
function batPoses() {
  const hover = (u, amount, pitch = 0) => ({ bones: { ...flap(u, amount), pelvis: [pitch, 0, 0], head: [-0.6 * pitch, 0, 0], ...both("thigh", [0.3 * pitch, 0, 0]) }, pelvis: [0, -0.25 * Math.sin(TAU * u), 0] });
  return {
    Hover_Loop: [0.7, (t) => hover(t / 0.7, 0.75)],
    Fly_Slow_Loop: [0.6, (t) => hover(t / 0.6, 0.8, 0.5), 7],
    Fly_Loop: [0.45, (t) => hover(t / 0.45, 0.85, 0.9), 18],
    // A dart forward, the head thrust out and the jaw wide, then back.
    Bite: [
      0.8,
      (t) => {
        const u = t / 0.8;
        const lunge = hump(u, 0.15, 0.4, 0.55, 0.9);
        const open = hump(u, 0.1, 0.3, 0.45, 0.55);
        const q = hover(u * 2, 0.6, 0.6 * lunge);
        return { bones: { ...q.bones, jaw: [0.8 * open, 0, 0] }, pelvis: [0, q.pelvis[1], 1.6 * lunge] };
      },
    ],
    // Up high, then wings swept back and down through what's ahead, and round back up.
    Swoop: [
      1.8,
      (t) => {
        const u = t / 1.8;
        const rise = hump(u, 0, 0.3, 0.35, 0.5);
        const dive = hump(u, 0.35, 0.55, 0.6, 1);
        const open = hump(u, 0.4, 0.5, 0.6, 0.65);
        const beat = flap(u * 3, 0.8 * (1 - dive));
        return { bones: { ...beat, ...(dive > 0 ? folded(0.6 * dive) : {}), pelvis: [-0.3 * rise + 1.0 * dive, 0, 0], head: [-0.6 * dive, 0, 0], jaw: [0.8 * open, 0, 0] }, pelvis: [0, 2.2 * rise - 1.6 * dive, 3 * dive] };
      },
    ],
    // Hanging still on wide-spread wings, trembling, the head back and the jaw wide.
    Screech: [
      2,
      (t) => {
        const u = t / 2;
        const up = hump(u, 0, 0.2, 0.8, 1);
        const shake = 0.06 * Math.sin(TAU * u * 14) * up;
        const beat = flap(u * 3, 0.75 * (1 - up) + 0.15 * up, 0.25 * up);
        return { bones: { ...beat, pelvis: [-0.2 * up, 0, 0], head: [-0.5 * up + shake, shake, 0], jaw: [0.9 * up, 0, 0] }, pelvis: [0, 0.6 * up, 0] };
      },
    ],
    Hit: [
      0.5,
      (t) => {
        const q = hump(t / 0.5, 0, 0.2, 0.35, 1);
        return { bones: { ...flap(0.75, 0.6 * q), pelvis: [-0.4 * q, 0.3 * q, 0], head: [-0.3 * q, 0, 0], jaw: [0.4 * q, 0, 0] }, pelvis: [0, 0.2 * q, -0.6 * q] };
      },
    ],
    // The wings crumple and it drops, turning over, to lie on the ground.
    Death: [
      1.8,
      (t) => {
        const u = t / 1.8;
        const fall = ease(u / 0.6);
        const flail = hump(u, 0, 0.1, 0.3, 0.5);
        return { bones: { ...flap(u * 4, 0.6 * flail), ...folded(0.5 * fall), pelvis: [1.4 * fall, 0, 0.8 * fall], head: [0.4 * fall, 0, 0], jaw: [0.3 * fall, 0, 0] }, pelvis: [0, -(HOVER - 0.5) * fall, 0.5 * fall] };
      },
    ],
  };
}

export function batClips(mesh) {
  const clips = Object.entries(batPoses()).map(([name, [duration, pose, speed]]) => sampled(mesh, name, duration, pose, speed));
  return new Map(clips.map((c) => [c.name, c]));
}

// The clip for each creature role (animations.js's ROLES), or null where it has none.
export function batRoles() {
  return { idle: "Hover_Loop", walk: "Fly_Slow_Loop", run: "Fly_Loop", fly: "Fly_Loop", attack: "Bite", bigAttack: "Swoop", cast: null, shoot: null, breath: null, battleCry: "Screech", hit: "Hit", death: "Death" };
}
