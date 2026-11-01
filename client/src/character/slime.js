import { MeshOut } from "./body.js";
import { TAU, ease, hex, hump, mirrored, mul, sampled, shade } from "./rig.js";

// Slimes: a dome of jelly that squashes and stretches as it moves, hopping, eyes on its front.
// Its `body` bone sits at the middle of its base, so stretching it squashes the slime onto the
// ground; its `top` bone sways the upper half.
//
// A look (recipe.js) gives its height (to the top of the dome), build (wider or narrower) and
// colors: skin the jelly, eyes.
//
// Shapes are in the slime's own feet, a slime 1ft tall, scaled to the look's height. It faces +z.

export const SLIMES = { slime: {} };

function joints() {
  return [
    ["root", null, [0, 0, 0]],
    ["pelvis", "root", [0, 0, 0]],
    ["body", "pelvis", [0, 0, 0]],
    ["top", "body", [0, 0.45, 0]],
  ];
}

// Mesh data for a look, as body.js's bodyMesh gives it, and the scale its clips move the pelvis by.
export function slimeMesh(look) {
  const s = look.height;
  const canonical = mirrored(joints(), 1);
  const index = new Map(canonical.map((b, i) => [b.name, i]));
  const wide = 0.8 + 0.4 * look.build;
  const c = Object.fromEntries(Object.entries(look.colors).map(([key, v]) => [key, hex(v)]));
  const [jelly, dark] = [c.skin, [0.05, 0.05, 0.06]];
  const out = new MeshOut(index);
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
    out.gem([x * 0.16, 0.6, 0.46 * wide], 0.07, [0.95, 0.95, 0.92], [["top", 1]]);
    out.gem([x * 0.16, 0.6, 0.46 * wide + 0.05], 0.035, c.eyes, [["top", 1]]);
  }
  out.path([[-0.12, 0.42, 0.53 * wide], [0, 0.39, 0.56 * wide], [0.12, 0.42, 0.53 * wide]], [0.025, 0.03, 0.025], 4, () => dark, () => [["body", 0.5], ["top", 0.5]]);
  const mesh = out.arrays();
  for (let i = 0; i < mesh.positions.length; i++) mesh.positions[i] *= s;
  return { ...mesh, bones: canonical.map((b) => ({ ...b, at: mul(b.at, s) })), scale: s };
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

export function slimeClips(mesh) {
  const clips = Object.entries(slimePoses()).map(([name, [duration, pose, speed]]) => sampled(mesh, name, duration, pose, speed));
  return new Map(clips.map((c) => [c.name, c]));
}

// The clip for each creature role (animations.js's ROLES), or null where it has none.
export function slimeRoles() {
  return { idle: "Idle_Loop", walk: "Walk_Loop", run: "Run_Fwd_Loop", fly: null, attack: "Engulf", bigAttack: "Slam", cast: null, shoot: null, breath: null, battleCry: "Quiver", hit: "Hit", death: "Death" };
}
