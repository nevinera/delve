import { MeshOut } from "./body.js";
import { TAU, add, ease, hex, hump, lerp, mirrored, mul, sampled, shade } from "./rig.js";

// Serpents: a long body on the ground behind the pelvis, a neck rising ahead of it to the head,
// the jaw on its own bone and a `mouth` bone at the tip of the snout. A cobra spreads a hood
// from its neck.
//
// A look (recipe.js) gives its height (to the top of the raised head), build (thicker or
// thinner), head (its head's size) and colors: skin the scales, secondary the belly, hair the
// markings down the back, eyes.
//
// Shapes are in the species' own feet, scaled to the look's height. Each faces +z, lying on
// y = 0, its left toward +x.

// r: the body's radius; segment: each body bone's length; rise: how high the neck lifts the
// head; head: the head's size; markings: "diamonds" or "bands"; hood: a cobra's.
export const SERPENTS = {
  snake: { r: 0.75, segment: 1.5, rise: 2.8, head: 1.4, markings: "diamonds", hood: false },
  cobra: { r: 0.55, segment: 1.4, rise: 3.4, head: 1.1, markings: "bands", hood: true },
};
export const serpentOf = (look) => SERPENTS[look.body] ?? SERPENTS.snake;

const BODY = ["body_01", "body_02", "body_03", "body_04", "body_05", "body_06", "body_07", "body_08", "body_09", "body_10"];
const NECK = ["neck_01", "neck_02", "neck_03"];

// The skeleton for a species, in its own feet: [name, parent, at].
function joints(sp) {
  const { r, segment, rise } = sp;
  const head = [0, r + rise, 2.7];
  const out = [
    ["root", null, [0, 0, 0]],
    ["pelvis", "root", [0, r, 0]],
    ["neck_01", "pelvis", [0, r + 0.1 * rise, 1.2]],
    ["neck_02", "neck_01", [0, r + 0.42 * rise, 2.0]],
    ["neck_03", "neck_02", [0, r + 0.78 * rise, 2.45]],
    ["head", "neck_03", head],
    ["jaw", "head", add(head, mul([0, -0.12, 0.05], sp.head))],
    ["mouth", "head", add(head, mul([0, -0.1, 0.95], sp.head))],
  ];
  BODY.forEach((name, i) => out.push([name, i ? BODY[i - 1] : "pelvis", [0, r * (1 - 0.06 * i), -segment * (i + 1)]]));
  out.push(["tail_end", "body_10", [0, 0.06, -segment * 11.2]]);
  return out;
}

const tallOf = (sp) => sp.r + sp.rise + 0.3 * sp.head;

export function serpentSkeleton(look) {
  const sp = serpentOf(look);
  return mirrored(joints(sp), look.height / tallOf(sp));
}

// Mesh data for a look, as body.js's bodyMesh gives it, and the scale its clips move the pelvis by.
export function serpentMesh(look) {
  const sp = serpentOf(look);
  const s = look.height / tallOf(sp);
  const canonical = mirrored(joints(sp), 1);
  const index = new Map(canonical.map((b, i) => [b.name, i]));
  const at = (name) => canonical[index.get(name)].at;
  const build = 0.8 + 0.4 * look.build;
  const big = sp.head * (0.8 + 0.4 * look.head);
  const c = Object.fromEntries(Object.entries(look.colors).map(([key, v]) => [key, hex(v)]));
  const [scales, belly, mark, dark] = [c.skin, c.secondary, c.hair, [0.08, 0.07, 0.07]];
  const out = new MeshOut(index);

  // The body, tail tip to the back of the head, a ring at each joint and between: a point
  // between two joints follows the first; one at a joint is shared with its parent.
  const chain = (names) => {
    const rows = [[at(names[0]), [[names[0], 1]], 0]];
    for (let i = 1; i < names.length; i++) {
      rows.push([lerp(at(names[i - 1]), at(names[i]), 0.5), [[names[i - 1], 1]], i - 0.5]);
      rows.push([at(names[i]), [[names[i - 1], 0.5], [names[i], 0.5]], i]);
    }
    return rows;
  };
  const back = chain(["pelvis", ...BODY, "tail_end"]).reverse();
  const front = chain(["pelvis", ...NECK, "head"]).slice(1);
  // The body's radius at a place along it: k joints behind the pelvis (negative) or ahead of it.
  const radius = (k) => sp.r * (k >= 0 ? 1 - 0.08 * k : k > -4 ? 1 : Math.max(0.08, 1 - (-k - 4) / 7.5));
  const rows = [...back.map(([p, bones, k]) => [p, bones, -k]), ...front];
  const pattern = (band, angle) => {
    if (Math.abs(angle) < 1.0) return belly;
    if (Math.abs(angle) < 1.7) return scales;
    if (sp.markings === "bands") return band % 4 < 2 ? mark : scales;
    return (band % 3 === 0 && Math.abs(angle) > 2.3) || (band % 3 === 1 && Math.abs(angle) > 1.9 && Math.abs(angle) < 2.6) ? mark : scales;
  };
  out.path(
    rows.map(([p]) => p),
    rows.map(([, , k]) => radius(k) * build),
    10,
    pattern,
    (i) => rows[i][1],
    { carry: true },
  );

  // The head: a wedge, wide behind and flat, the jaw under it on its own bone.
  const face = [0, -0.15, 1];
  const hp = (x, dy, dz) => add(at("head"), mul(add([x, dy, 0], mul(face, dz)), big));
  const ring = (dz, dy, rx, rz, bones) => ({ center: hp(0, dy, dz), dir: face, rx: rx * big, rz: rz * big, bones });
  const skull = [
    [-0.3, 0, 0.28, 0.24],
    [0.0, 0.03, 0.42, 0.24],
    [0.35, 0.02, 0.38, 0.2],
    [0.7, -0.01, 0.27, 0.14],
    [0.95, -0.04, 0.16, 0.09],
  ].map(([dz, dy, rx, rz]) => ring(dz, dy, rx, rz, [["head", 1]]));
  out.tube(skull, 10, (band, angle) => (Math.abs(angle) < 1 ? belly : band === 1 && Math.abs(angle) > 2.4 ? mark : scales), { endColor: shade(scales, 0.7) });
  const jaw = [
    [-0.05, -0.12, 0.36, 0.1],
    [0.45, -0.15, 0.3, 0.08],
    [0.88, -0.14, 0.15, 0.05],
  ].map(([dz, dy, rx, rz]) => ring(dz, dy, rx, rz, [["jaw", 1]]));
  out.tube(jaw, 8, (band, angle) => (Math.abs(angle) < 1.4 ? belly : scales));
  for (const side of [-1, 1]) {
    out.gem(hp(side * 0.34, 0.1, 0.35), 0.07 * big, c.eyes, [["head", 1]]);
    out.gem(hp(side * 0.37, 0.1, 0.37), 0.03 * big, dark, [["head", 1]]);
    out.path([hp(side * 0.13, -0.1, 0.75), hp(side * 0.13, -0.3, 0.72)], [0.035 * big, 0.004 * big], 4, () => [0.94, 0.92, 0.86], () => [["head", 1]]);
  }

  // A hood: a flap each side of the upper neck, spread, both faces drawn.
  if (sp.hood) {
    const [n2, n3, h] = [at("neck_02"), at("neck_03"), at("head")];
    for (const x of [-1, 1]) {
      const edge = [
        [lerp(n2, n3, 0.1), [["neck_02", 1]]],
        [add(lerp(n2, n3, 0.3), [x * 0.9 * sp.r * 2.2, 0, -0.1]), [["neck_02", 1]]],
        [add(lerp(n3, h, 0.1), [x * 1.0 * sp.r * 2.2, 0, -0.05]), [["neck_03", 1]]],
        [add(lerp(n3, h, 0.6), [x * 0.6 * sp.r * 2.2, 0, 0]), [["neck_03", 1]]],
        [lerp(n3, h, 0.85), [["neck_03", 0.5], ["head", 0.5]]],
      ];
      const behind = add(lerp(n2, h, 0.5), [0, 0, -3]);
      for (let i = 1; i < edge.length - 1; i++) {
        const corners = [edge[0], edge[i], edge[i + 1]];
        out.face(corners.map(([p]) => p), scales, corners[0][1], behind, corners.map(([, b]) => b));
        out.face(corners.map(([p]) => p), i === 2 ? mark : belly, corners[0][1], behind, corners.map(([, b]) => b), true);
      }
    }
  }

  const mesh = out.arrays();
  for (let i = 0; i < mesh.positions.length; i++) mesh.positions[i] *= s;
  return { ...mesh, bones: canonical.map((b) => ({ ...b, at: mul(b.at, s) })), scale: s };
}

// The body's bones bent side to side in a wave running back down it, at phase u, each `lag` behind
// the one before; the neck turns back against the pelvis so the head keeps looking ahead.
function wave(u, amount, lag = 0.9, lift = 0) {
  const bones = { pelvis: [0, amount * 0.6 * Math.sin(TAU * u), 0], neck_01: [lift, -amount * 0.5 * Math.sin(TAU * u), 0] };
  BODY.forEach((name, i) => (bones[name] = [0, amount * Math.sin(TAU * u - lag * (i + 1)), 0]));
  return bones;
}

const neckBend = (x, y = 0) => ({ neck_01: [x * 0.45, y * 0.3, 0], neck_02: [x * 0.35, y * 0.35, 0], neck_03: [x * 0.2, y * 0.35, 0] });

// How long each clip lasts, its pose at each moment, and its speed along the ground in the
// species' own feet a second.
function serpentPoses(sp) {
  const k = sp.segment / 1.6;
  const rise = sp.rise / 2.6;
  return {
    Idle_Loop: [
      4,
      (t) => {
        const u = t / 4;
        return { bones: { ...wave(u, 0.05, 0.6), ...neckBend(0.04 * Math.sin(TAU * u * 2), 0.25 * Math.sin(TAU * u)), head: [0, -0.15 * Math.sin(TAU * u), 0] } };
      },
    ],
    Walk_Loop: [
      1.8,
      (t) => {
        const u = t / 1.8;
        const bones = wave(u, 0.32);
        return { bones: { ...bones, neck_01: [0.15, bones.neck_01[1], 0], neck_02: [0.05, 0, 0] }, pelvis: [0.25 * k * Math.sin(TAU * u), 0, 0] };
      },
      5 * k,
    ],
    // Low and fast, the head down and out ahead.
    Run_Fwd_Loop: [
      0.9,
      (t) => {
        const u = t / 0.9;
        const bones = wave(u, 0.42);
        return { bones: { ...bones, ...neckBend(0.6), neck_01: [0.27, bones.neck_01[1], 0], head: [-0.3, 0, 0] }, pelvis: [0.35 * k * Math.sin(TAU * u), -0.05 * k, 0] };
      },
      13 * k,
    ],
    // Drawn back into an S, then thrown forward and down, the jaw wide, then shut and back.
    Strike: [
      1,
      (t) => {
        const u = t / 1;
        const coil = hump(u, 0, 0.3, 0.32, 0.42);
        const strike = hump(u, 0.32, 0.45, 0.55, 0.95);
        const open = hump(u, 0.2, 0.35, 0.5, 0.58);
        return {
          bones: { ...wave(0.25, 0.12 * coil), neck_01: [-0.25 * coil + 0.55 * strike, 0, 0], neck_02: [0.5 * coil + 0.3 * strike, 0, 0], neck_03: [-0.5 * coil + 0.1 * strike, 0, 0], head: [0.2 * coil - 0.25 * strike, 0, 0], jaw: [1.1 * open, 0, 0] },
          pelvis: [0, 0, (-0.4 * coil + 1.5 * strike) * k],
        };
      },
    ],
    // The body thrown round in a coil ahead of it, rising as it wraps, squeezing, then letting go.
    Constrict: [
      3,
      (t) => {
        const u = t / 3;
        const wrap = hump(u, 0, 0.3, 0.8, 1);
        const squeeze = wrap * (0.5 + 0.5 * Math.sin(TAU * u * 3));
        const bones = { pelvis: [0, 0.9 * wrap, 0], ...neckBend(0.3 * wrap, -1.2 * wrap), head: [-0.2 * squeeze, 0, 0], jaw: [0.5 * squeeze, 0, 0] };
        BODY.forEach((name, i) => (bones[name] = [-0.12 * wrap, (0.62 - 0.03 * squeeze) * wrap * (i < 2 ? 0.6 : 1), 0.05 * wrap]));
        return { bones, pelvis: [0, 0.2 * wrap * k, 1.5 * wrap * k] };
      },
    ],
    // Up high, the head drawn back, the jaw wide and the head swaying, then down again.
    Hiss: [
      2.4,
      (t) => {
        const u = t / 2.4;
        const up = hump(u, 0, 0.25, 0.75, 1);
        const open = hump(u, 0.15, 0.25, 0.7, 0.8);
        const sway = 0.2 * Math.sin(TAU * u * 2) * up;
        return { bones: { ...wave(u, 0.06), neck_01: [-0.35 * up * rise, sway, 0], neck_02: [-0.2 * up, sway, 0], neck_03: [0.25 * up, 0, 0], head: [0.2 * up, -sway, 0], jaw: [0.9 * open, 0, 0] }, pelvis: [0, 0, -0.3 * up * k] };
      },
    ],
    Hit: [
      0.55,
      (t) => {
        const q = hump(t / 0.55, 0, 0.2, 0.35, 1);
        return { bones: { ...neckBend(-0.4 * q, 0.5 * q), head: [-0.3 * q, 0, 0], jaw: [0.4 * q, 0, 0], body_02: [0, 0.2 * q, 0], body_04: [0, -0.2 * q, 0] }, pelvis: [0, 0, -0.3 * q * k] };
      },
    ],
    // The neck falls to the ground, then the body writhes and rolls over, belly up.
    Death: [
      2.4,
      (t) => {
        const u = t / 2.4;
        const fall = ease(u / 0.35);
        const roll = ease((u - 0.3) / 0.5);
        const writhe = hump(u, 0.2, 0.35, 0.6, 0.9);
        return { bones: { ...wave(u * 2, 0.35 * writhe), pelvis: [0, 0.3 * writhe * Math.sin(TAU * u * 2), 2.6 * roll], ...neckBend(1.1 * fall, 0.4 * roll), head: [0.3 * fall, 0, 0], jaw: [0.5 * roll, 0, 0] }, pelvis: [0, -0.1 * roll * k, 0] };
      },
    ],
  };
}

export function serpentClips(mesh, look) {
  const clips = Object.entries(serpentPoses(serpentOf(look))).map(([name, [duration, pose, speed]]) => sampled(mesh, name, duration, pose, speed));
  return new Map(clips.map((c) => [c.name, c]));
}

// The clip for each creature role (animations.js's ROLES), or null where it has none.
export function serpentRoles() {
  return { idle: "Idle_Loop", walk: "Walk_Loop", run: "Run_Fwd_Loop", fly: null, attack: "Strike", bigAttack: "Constrict", cast: null, shoot: null, breath: null, battleCry: "Hiss", hit: "Hit", death: "Death" };
}
