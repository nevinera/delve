import { MeshOut } from "./body.js";
import { TAU, ease, hex, hump, mirrored, mul, sampled, shade } from "./rig.js";
import { shapesOn } from "./bodies.js";
import { painterFor } from "./paint.js";

// Slimes: a dome of jelly that squashes and stretches as it moves, hopping, eyes on its front.
// Its `body` bone sits at the middle of its base, so stretching it squashes the slime onto the
// ground; its `top` bone sways the upper half.
//
// A wisp is a glowing orb on the same bones, floating, motes of light circling it on an `orbit`
// bone. Its frame draws it in a glowing material.
//
// A look (recipe.js) gives its height (to the top of the dome, or the wisp's float), build (wider
// or narrower) and colors: skin the jelly or the orb's glow, eyes the wisp's core.
//
// Shapes are in the slime's own feet, a slime 1ft tall, scaled to the look's height. It faces +z.

export const SLIMES = shapesOn("slime");

// The areas its faces are tagged with, in named groups (paint.js).
export const AREA_GROUPS = { everything: ["jelly", "eyes", "dark", "eyeWhites"] };

// How high a wisp's middle floats, in the wisp's own feet.
const FLOAT = 0.55;

function joints(sp) {
  if (sp.wisp)
    return [
      ["root", null, [0, 0, 0]],
      ["pelvis", "root", [0, FLOAT, 0]],
      ["body", "pelvis", [0, FLOAT, 0]],
      ["top", "body", [0, FLOAT + 0.1, 0]],
      ["orbit", "pelvis", [0, FLOAT, 0]],
    ];
  return [
    ["root", null, [0, 0, 0]],
    ["pelvis", "root", [0, 0, 0]],
    ["body", "pelvis", [0, 0, 0]],
    ["top", "body", [0, 0.45, 0]],
  ];
}

// Mesh data for a look, as body.js's bodyMesh gives it, and the scale its clips move the pelvis by.
export function slimeMesh(look) {
  const sp = SLIMES[look.body] ?? SLIMES.slime;
  const s = look.height;
  const canonical = mirrored(joints(sp), 1);
  const index = new Map(canonical.map((b, i) => [b.name, i]));
  const wide = 0.8 + 0.4 * look.build;
  // Faces are tagged with their areas (AREA_GROUPS), and painted by the look's coloration.
  const c = { skin: "jelly", eyes: "eyes" };
  const [jelly, dark] = [c.skin, "dark"];
  const out = new MeshOut(index);
  out.paint = painterFor(look, AREA_GROUPS, 1);
  if (sp.wisp) return scaled(wispBody(out, c, wide), canonical, s, true);
  // The dome, flat underneath, base to crown: [height, radius]; the upper rings sway with the top.
  const rows = [
    [0.0, 0.02],
    [0.0, 0.85],
    [0.12, 1.0],
    [0.35, 0.98],
    [0.6, 0.82],
    [0.82, 0.55],
    [0.95, 0.25],
    [1.0, 0.04],
  ];
  const bonesAt = (y) => (y < 0.3 ? [["body", 1]] : y < 0.6 ? [["body", (0.6 - y) / 0.3], ["top", (y - 0.3) / 0.3]] : [["top", 1]]);
  out.tube(
    rows.map(([y, r]) => ({ center: [0, y, 0], dir: [0, 1, 0], rx: r * 0.6 * wide, rz: r * 0.6 * wide, bones: bonesAt(y) })),
    12,
    (band, angle) => (band < 2 ? shade(jelly, 0.7) : (band + Math.round(angle * 2)) % 5 === 0 ? shade(jelly, 1.15) : jelly),
  );
  // Eyes and a mouth.
  for (const x of [-1, 1]) {
    out.gem([x * 0.16, 0.6, 0.46 * wide], 0.07, "eyeWhites", [["top", 1]]);
    out.gem([x * 0.16, 0.6, 0.46 * wide + 0.05], 0.035, c.eyes, [["top", 1]]);
  }
  out.path([[-0.12, 0.42, 0.53 * wide], [0, 0.39, 0.56 * wide], [0.12, 0.42, 0.53 * wide]], [0.025, 0.03, 0.025], 4, () => dark, () => [["body", 0.5], ["top", 0.5]]);
  return scaled(out, canonical, s);
}

function scaled(out, canonical, s, glow = false) {
  const mesh = out.arrays();
  for (let i = 0; i < mesh.positions.length; i++) mesh.positions[i] *= s;
  return { ...mesh, bones: canonical.map((b) => ({ ...b, at: mul(b.at, s) })), scale: s, glow };
}

// A ball of light: a pale core inside a shell of the glow color, wisps of it trailing below, and
// three motes circling.
function wispBody(out, c, wide) {
  const ball = (y0, r, color, bones, bands = 8) => {
    const rows = Array.from({ length: bands + 1 }, (_, i) => {
      const a = (Math.PI * i) / bands;
      return { center: [0, y0 - r * Math.cos(a), 0], dir: [0, 1, 0], rx: Math.max(0.01, r * Math.sin(a)), rz: Math.max(0.01, r * Math.sin(a)), bones };
    });
    out.tube(rows, 10, (band) => shade(color, 1 + 0.08 * Math.sin(band)));
  };
  ball(FLOAT, 0.2 * wide, c.skin, [["body", 1]]);
  ball(FLOAT + 0.02, 0.1 * wide, c.eyes, [["top", 1]], 6);
  // Trailing flames below, thinning to points.
  for (const [x, z, len] of [[0, 0, 0.3], [0.07, 0.04, 0.22], [-0.06, -0.05, 0.24]])
    out.path([[x, FLOAT - 0.1, z], [x * 1.3, FLOAT - 0.1 - len / 2, z * 1.3], [x * 1.6, FLOAT - 0.1 - len, z * 1.6]], [0.09, 0.05, 0.01].map((r) => r * wide), 6, () => shade(c.skin, 0.85), () => [["body", 1]]);
  for (let i = 0; i < 3; i++) {
    const a = (TAU * i) / 3;
    out.gem([0.34 * Math.cos(a), FLOAT + 0.08 * Math.sin(2 * a), 0.34 * Math.sin(a)], 0.045, c.eyes, [["orbit", 1]]);
  }
  return out;
}

// Squashed by k (positive flatter and wider, negative taller and thinner), keeping its volume.
const squash = (k) => {
  const y = 1 - k;
  const across = 1 / Math.sqrt(Math.max(0.05, y));
  return { body: [across, y, across] };
};

// A hop at phase u: squashed as it lands and pushes off, stretched in the air.
function hop(u, high, forward = 0) {
  const air = Math.sin(Math.PI * u);
  const squeeze = 0.25 * Math.max(0, Math.cos(TAU * u)) - 0.15 * air;
  return { bones: { top: [-0.15 * forward * Math.cos(TAU * u), 0, 0] }, scale: squash(squeeze), pelvis: [0, high * air * air, 0] };
}

// How long each clip lasts, its pose at each moment, and its speed along the ground in the
// slime's own feet a second.
function slimePoses() {
  return {
    Idle_Loop: [
      2.5,
      (t) => {
        const u = t / 2.5;
        return { bones: { top: [0.06 * Math.sin(TAU * u * 2), 0, 0.08 * Math.sin(TAU * u)] }, scale: squash(0.06 * Math.sin(TAU * u)) };
      },
    ],
    Walk_Loop: [0.9, (t) => hop(t / 0.9, 0.35, 1), 1.4],
    Run_Fwd_Loop: [0.55, (t) => hop(t / 0.55, 0.6, 1.6), 3.5],
    // Up tall, then over and down onto what's ahead.
    Engulf: [
      1.2,
      (t) => {
        const u = t / 1.2;
        const rise = hump(u, 0, 0.3, 0.35, 0.5);
        const over = hump(u, 0.35, 0.55, 0.75, 1);
        return { bones: { top: [0.9 * over, 0, 0], body: [0.2 * over, 0, 0] }, scale: squash(-0.45 * rise + 0.3 * over), pelvis: [0, 0, 0.45 * over] };
      },
    ],
    // Squashed flat, a leap high, and down hard, spreading wide.
    Slam: [
      1.6,
      (t) => {
        const u = t / 1.6;
        const crouch = hump(u, 0, 0.2, 0.25, 0.3);
        const air = hump(u, 0.25, 0.45, 0.5, 0.65);
        const splat = hump(u, 0.62, 0.68, 0.8, 1);
        return { bones: { top: [0.2 * air, 0, 0] }, scale: squash(0.35 * crouch - 0.35 * air + 0.55 * splat), pelvis: [0, 2.2 * air, 0.8 * ease((u - 0.25) / 0.4)] };
      },
    ],
    // Swelling up, shaking all over.
    Quiver: [
      2,
      (t) => {
        const u = t / 2;
        const up = hump(u, 0, 0.2, 0.75, 1);
        const shake = Math.sin(TAU * u * 10) * up;
        const swell = 1 + 0.3 * up;
        return { bones: { top: [0.12 * shake, 0, 0.15 * shake] }, scale: { body: [swell * (1 + 0.05 * shake), swell * (1 - 0.05 * shake), swell * (1 + 0.05 * shake)] } };
      },
    ],
    Hit: [
      0.5,
      (t) => {
        const q = hump(t / 0.5, 0, 0.15, 0.3, 1);
        const wobble = Math.sin(TAU * (t / 0.5) * 3) * (1 - t / 0.5);
        return { bones: { top: [-0.4 * q, 0, 0.1 * wobble] }, scale: squash(0.25 * q - 0.1 * wobble), pelvis: [0, 0, -0.15 * q] };
      },
    ],
    // Melting into a puddle.
    Death: [
      2.2,
      (t) => {
        const u = t / 2.2;
        const melt = ease(u / 0.85);
        const shake = hump(u, 0, 0.1, 0.25, 0.4) * Math.sin(TAU * u * 8);
        return { bones: { top: [0.15 * shake, 0, 0] }, scale: { body: [1 + 1.1 * melt, 1 - 0.9 * melt, 1 + 1.1 * melt] } };
      },
    ],
  };
}

// A wisp bobs and drifts, its motes circling; `spin` turns them faster.
const drift = (u, bob, spin, lean = 0) => ({ bones: { orbit: [0, TAU * spin * u, 0], body: [lean, 0, 0] }, pelvis: [0, bob * Math.sin(TAU * u), 0] });

function wispPoses() {
  return {
    Idle_Loop: [2, (t) => ({ ...drift(t / 2, 0.06, 1), scale: { body: Array(3).fill(1 + 0.05 * Math.sin(TAU * (t / 2) * 2)) } })],
    Walk_Loop: [1.5, (t) => drift(t / 1.5, 0.05, 1, 0.15), 1.6],
    Run_Fwd_Loop: [1, (t) => drift(t, 0.04, 2, 0.3), 4],
    // A dart forward to touch, flaring, and back.
    Touch: [
      0.9,
      (t) => {
        const u = t / 0.9;
        const dart = hump(u, 0.15, 0.4, 0.5, 0.85);
        const d = drift(u, 0.03, 1.5, 0.4 * dart);
        return { ...d, scale: { body: Array(3).fill(1 + 0.35 * hump(u, 0.35, 0.45, 0.5, 0.7)) }, pelvis: [0, d.pelvis[1], 0.5 * dart] };
      },
    ],
    // Drawing in small and dim, then bursting wide, the motes flung out.
    Flare: [
      1.5,
      (t) => {
        const u = t / 1.5;
        const draw = hump(u, 0, 0.35, 0.45, 0.55);
        const burst = hump(u, 0.45, 0.55, 0.7, 1);
        const k = 1 - 0.35 * draw + 0.9 * burst;
        return { ...drift(u, 0.02, 3), scale: { body: [k, k, k], orbit: Array(3).fill(1 + 1.2 * burst) } };
      },
    ],
    // The motes whirling fast, the orb pulsing.
    Whirl: [
      1.6,
      (t) => {
        const u = t / 1.6;
        const up = hump(u, 0, 0.15, 0.8, 1);
        return { ...drift(u, 0.1 * up, 1 + 5 * up), scale: { body: Array(3).fill(1 + 0.15 * up * Math.sin(TAU * u * 6)) }, pelvis: [0, 0.25 * up, 0] };
      },
    ],
    Hit: [
      0.5,
      (t) => {
        const u = t / 0.5;
        const q = hump(u, 0, 0.15, 0.3, 1);
        return { ...drift(u, 0, 0.5, -0.4 * q), scale: { body: Array(3).fill(1 - 0.3 * q) }, pelvis: [0, 0, -0.2 * q] };
      },
    ],
    // Guttering, sinking, gone.
    Death: [
      2,
      (t) => {
        const u = t / 2;
        const fade = ease(u / 0.9);
        const flicker = 1 + 0.2 * Math.sin(TAU * u * 9) * (1 - fade);
        return { ...drift(u, 0, 0.5), scale: { body: Array(3).fill(Math.max(0.01, (1 - fade) * flicker)), orbit: Array(3).fill(Math.max(0.01, 1 - fade)) }, pelvis: [0, -0.4 * fade, 0] };
      },
    ],
  };
}

export function slimeClips(mesh, look) {
  const poses = SLIMES[look?.body]?.wisp ? wispPoses() : slimePoses();
  const clips = Object.entries(poses).map(([name, [duration, pose, speed]]) => sampled(mesh, name, duration, pose, speed));
  return new Map(clips.map((c) => [c.name, c]));
}

// The clip for each creature role (animations.js's ROLES), or null where it has none.
export function slimeRoles(look) {
  if (SLIMES[look?.body]?.wisp) return { idle: "Idle_Loop", walk: "Walk_Loop", run: "Run_Fwd_Loop", fly: "Walk_Loop", attack: "Touch", bigAttack: "Flare", cast: null, shoot: null, breath: null, battleCry: "Whirl", hit: "Hit", death: "Death" };
  return { idle: "Idle_Loop", walk: "Walk_Loop", run: "Run_Fwd_Loop", fly: null, attack: "Engulf", bigAttack: "Slam", cast: null, shoot: null, breath: null, battleCry: "Quiver", hit: "Hit", death: "Death" };
}
