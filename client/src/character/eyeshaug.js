import { MeshOut } from "./body.js";
import { TAU, add, ease, hex, hump, lerp, mirrored, mul, sampled, shade } from "./rig.js";
import { shapesOn } from "./bodies.js";
import { painterFor } from "./paint.js";

// Eyeshaugs: a great round body hovering above the ground, one huge eye on its front, a fanged
// mouth beneath it, and eye stalks writhing from its crown, each with a small eye at its tip. The
// `body` bone carries the sphere and the eye; the `jaw` bone opens the mouth; each stalk is two
// bones, `stalk_N` from the crown and `stalk_N_tip`.
//
// A look (recipe.js) gives its height (to its crown, hovering), build (rounder or smaller) and
// colors: skin the hide, secondary the mouth and the stalks' undersides, eyes the great eye's iris.
//
// Shapes are in the eyeshaug's own units, a body 1 across, scaled to the look's height. It faces +z.

export const EYESHAUGS = shapesOn("eyeshaug");

// The areas its faces are tagged with, in named groups (paint.js).
export const AREA_GROUPS = { everything: ["hide", "mouth", "eyes", "eyeWhites", "dark", "teeth"] };

const HOVER = 1.2;
const R = 0.5;
// The stalks' roots on the crown and their tips: [x, z] on the sphere, the tip [x, y, z] above.
const STALKS = [
  [[0.22, 0.12], [0.55, 0.75, 0.35]],
  [[-0.22, 0.12], [-0.55, 0.75, 0.35]],
  [[0.3, -0.12], [0.8, 0.6, -0.2]],
  [[-0.3, -0.12], [-0.8, 0.6, -0.2]],
  [[0.08, -0.2], [0.25, 0.9, -0.45]],
  [[-0.08, -0.2], [-0.25, 0.9, -0.45]],
];

function joints() {
  const C = [0, HOVER, 0];
  const out = [
    ["root", null, [0, 0, 0]],
    ["pelvis", "root", C],
    ["body", "pelvis", C],
    ["jaw", "body", add(C, [0, -0.2, 0.3])],
    ["mouth", "body", add(C, [0, 0, R])],
  ];
  STALKS.forEach(([[x, z], tip], i) => {
    const root = add(C, [x, Math.sqrt(R * R - x * x - z * z) - 0.02, z]);
    out.push([`stalk_${i}`, "body", root], [`stalk_${i}_tip`, `stalk_${i}`, add(lerp(root, add(C, tip), 0.55), [0, 0.08, 0])]);
  });
  return out;
}

// Mesh data for a look, as body.js's bodyMesh gives it, and the scale its clips move the pelvis by.
export function eyeshaugMesh(look) {
  const canonical = mirrored(joints(), 1);
  const index = new Map(canonical.map((b, i) => [b.name, i]));
  const at = (name) => canonical[index.get(name)].at;
  const big = 0.85 + 0.3 * look.build;
  // Faces are tagged with their areas (AREA_GROUPS), and painted by the look's coloration.
  const c = { skin: "hide", secondary: "mouth", eyes: "eyes" };
  const [hide, inner, iris] = [c.skin, c.secondary, c.eyes];
  const [white, dark, tooth] = ["eyeWhites", "dark", "teeth"];
  const out = new MeshOut(index);
  out.paint = painterFor(look, AREA_GROUPS, 1);
  const C = at("body");
  const r = R * big;
  const bb = [["body", 1]];

  // The body: a sphere, mottled, its belly paler.
  const rows = 10;
  out.tube(
    Array.from({ length: rows + 1 }, (_, i) => {
      const a = (Math.PI * i) / rows;
      return { center: add(C, [0, -r * Math.cos(a), 0]), dir: [0, 1, 0], rx: Math.max(0.01, r * Math.sin(a)), rz: Math.max(0.01, r * Math.sin(a)), bones: bb };
    }),
    14,
    (band, angle) => (band < 3 ? shade(hide, 1.2) : (band * 3 + Math.round(angle * 3)) % 7 === 0 ? shade(hide, 0.75) : hide),
  );
  // The great eye: a white bulging out of the front, a ring of lid round it, the iris and pupil.
  const front = (k, dy = 0.08) => add(C, [0, dy * r, r * k]);
  out.tube([0.75, 0.9, 1.02, 1.08].map((k, i) => ({ center: front(k), dir: [0, 0, 1], rx: r * [0.5, 0.48, 0.36, 0.12][i], rz: r * [0.5, 0.48, 0.36, 0.12][i], bones: bb })), 12, () => white);
  out.tube([0.72, 0.86, 0.9].map((k, i) => ({ center: front(k), dir: [0, 0, 1], rx: r * [0.6, 0.56, 0.5][i], rz: r * [0.6, 0.56, 0.5][i] * 0.95, bones: bb })), 12, () => shade(hide, 0.8), { capStart: false, capEnd: false });
  out.gem(front(1.05), 0.2 * r, iris, bb);
  out.gem(front(1.22), 0.1 * r, dark, bb);
  // The mouth: a wide dark gape beneath the eye, the lower lip on the jaw, teeth along both.
  const J = at("jaw");
  out.tube([-0.6, -0.3, 0, 0.3, 0.6].map((x) => ({ center: add(J, [x * r, -0.05 * r * (1 - x * x), 0.42 * r * Math.sqrt(1 - x * x * 0.8)]), dir: [1, 0, 0], rx: 0.12 * r, rz: 0.1 * r, bones: [["jaw", 1]] })), 6, () => inner);
  for (let i = 0; i < 9; i++) {
    const x = (i / 8 - 0.5) * 1.1;
    const z = 0.5 * r * Math.sqrt(1 - x * x * 0.8);
    const top = add(C, [x * r, -0.33 * r, z]);
    out.path([top, add(top, [0, -0.1 * r, 0.02])], [0.035 * r, 0.004], 3, () => tooth, () => bb);
    const low = add(J, [x * r, 0.02, z * 0.95]);
    out.path([low, add(low, [0, 0.08 * r, 0.02])], [0.03 * r, 0.004], 3, () => tooth, () => [["jaw", 1]]);
  }
  // The stalks, thin and ringed, curling up to small eyes.
  STALKS.forEach(([, tip], i) => {
    const [a, b] = [at(`stalk_${i}`), at(`stalk_${i}_tip`)];
    const end = add(C, mul(tip, big));
    out.path([a, lerp(a, b, 0.5), b, lerp(b, end, 0.6), end], [0.07, 0.06, 0.05, 0.045, 0.04].map((v) => v * r * 2), 6, (band) => (band % 2 ? shade(hide, 0.85) : hide), (k) => (k < 2 ? [[`stalk_${i}`, 1]] : [[`stalk_${i}_tip`, 1]]));
    out.gem(end, 0.09 * r * 2, white, [[`stalk_${i}_tip`, 1]]);
    out.gem(add(end, mul(add(end, mul(C, -1)), 0.06)), 0.05 * r * 2, iris, [[`stalk_${i}_tip`, 1]]);
  });

  // Scaled so its highest point is at the look's height.
  const mesh = out.arrays();
  let top = 0;
  for (let i = 1; i < mesh.positions.length; i += 3) top = Math.max(top, mesh.positions[i]);
  const s = look.height / top;
  for (let i = 0; i < mesh.positions.length; i++) mesh.positions[i] *= s;
  return { ...mesh, bones: canonical.map((b) => ({ ...b, at: mul(b.at, s) })), scale: s };
}

// The stalks writhing at time t, `amount` radians, or all pointed ahead by `aim`.
function writhe(t, amount, aim = 0) {
  const out = {};
  STALKS.forEach(([[x]], i) => {
    const p = 1.3 * i;
    out[`stalk_${i}`] = [amount * Math.sin(TAU * t * 0.7 + p) + 0.9 * aim, amount * Math.sin(TAU * t * 0.5 + p), amount * Math.cos(TAU * t * 0.6 + p) + 0.4 * aim * Math.sign(x)];
    out[`stalk_${i}_tip`] = [amount * 1.4 * Math.sin(TAU * t * 0.9 + p + 1) + 0.6 * aim, 0, amount * Math.sin(TAU * t * 0.8 + p)];
  });
  return out;
}

// How long each clip lasts, its pose at each moment, and its speed along the ground in its own
// units a second.
function eyeshaugPoses() {
  const bob = (t, k = 1) => [0, 0.05 * k * Math.sin(TAU * t * 0.5), 0];
  return {
    Idle_Loop: [4, (t) => ({ bones: { ...writhe(t, 0.25), body: [0.05 * Math.sin(TAU * t * 0.25), 0.15 * Math.sin(TAU * t * 0.25), 0], jaw: [0.05 + 0.05 * Math.sin(TAU * t * 0.5), 0, 0] }, pelvis: bob(t) })],
    Walk_Loop: [2, (t) => ({ bones: { ...writhe(t, 0.3), body: [0.15, 0, 0] }, pelvis: bob(t) }), 0.9],
    Run_Fwd_Loop: [1, (t) => ({ bones: { ...writhe(t * 2, 0.2), body: [0.3, 0, 0] }, pelvis: bob(t * 2, 0.5) }), 2.4],
    // A lunge, the mouth wide, and a snap.
    Bite: [
      0.9,
      (t) => {
        const u = t / 0.9;
        const lunge = hump(u, 0.15, 0.4, 0.5, 0.85);
        const open = hump(u, 0.05, 0.3, 0.4, 0.5);
        return { bones: { ...writhe(t, 0.2), body: [0.35 * lunge, 0, 0], jaw: [0.9 * open, 0, 0] }, pelvis: [0, -0.1 * lunge, 0.35 * lunge] };
      },
    ],
    // Every stalk turned ahead and the great eye swelling, trembling: a gaze that burns.
    Gaze: [
      1.8,
      (t) => {
        const u = t / 1.8;
        const on = hump(u, 0.05, 0.3, 0.75, 0.95);
        const shake = 0.04 * Math.sin(TAU * u * 15) * on;
        const swell = 1 + 0.1 * on;
        return { bones: { ...writhe(t, 0.25 * (1 - on), on), body: [-0.05 * on + shake, shake, 0] }, scale: { body: [swell, swell, swell] }, pelvis: [0, 0.1 * on, -0.1 * on] };
      },
    ],
    // Risen up, stalks flung wide, the mouth gaping.
    Glare: [
      2,
      (t) => {
        const u = t / 2;
        const up = hump(u, 0, 0.25, 0.75, 1);
        return { bones: { ...writhe(t * 2, 0.25 + 0.3 * up, -0.6 * up), body: [-0.25 * up, 0, 0], jaw: [0.8 * up, 0, 0] }, pelvis: [0, 0.25 * up, 0] };
      },
    ],
    Hit: [
      0.5,
      (t) => {
        const q = hump(t / 0.5, 0, 0.15, 0.3, 1);
        return { bones: { ...writhe(t, 0.5 * q), body: [-0.5 * q, 0.2 * q, 0], jaw: [0.3 * q, 0, 0] }, scale: { body: [1 + 0.05 * q, 1 - 0.08 * q, 1 + 0.05 * q] }, pelvis: [0, 0.05 * q, -0.2 * q] };
      },
    ],
    // It sinks to the ground, rolls forward, and its stalks droop.
    Death: [
      2,
      (t) => {
        const u = t / 2;
        const fall = ease(u / 0.6);
        const droop = ease((u - 0.3) / 0.6);
        const shake = hump(u, 0, 0.1, 0.25, 0.4) * Math.sin(TAU * u * 10);
        const limp = {};
        STALKS.forEach(([[x]], i) => {
          limp[`stalk_${i}`] = [0.3 * shake, 0, 1.2 * droop * Math.sign(x || 1)];
          limp[`stalk_${i}_tip`] = [0, 0, 0.8 * droop * Math.sign(x || 1)];
        });
        return { bones: { ...limp, body: [0.7 * fall, 0, 0.2 * fall], jaw: [0.5 * fall, 0, 0] }, pelvis: [0, -(HOVER - R * 0.95) * fall, 0.1 * fall] };
      },
    ],
  };
}

export function eyeshaugClips(mesh) {
  const clips = Object.entries(eyeshaugPoses()).map(([name, [duration, pose, speed]]) => sampled(mesh, name, duration, pose, speed));
  return new Map(clips.map((c) => [c.name, c]));
}

// The clip for each creature role (animations.js's ROLES), or null where it has none.
export function eyeshaugRoles() {
  return { idle: "Idle_Loop", walk: "Walk_Loop", run: "Run_Fwd_Loop", fly: "Walk_Loop", attack: "Bite", bigAttack: "Gaze", cast: "Gaze", shoot: null, breath: null, battleCry: "Glare", hit: "Hit", death: "Death" };
}
