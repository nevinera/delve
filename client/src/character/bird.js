import { MeshOut } from "./body.js";
import { TAU, add, ease, hex, hump, lerp, mirrored, mul, sampled, shade } from "./rig.js";
import { shapesOn } from "./bodies.js";
import { painterFor } from "./paint.js";

// Birds: a feathered body on two legs, wings folded along its sides on the ground and spread to
// fly. The body tips up from the hips by the species' `tilt`, a neck rising to a round head with a
// beak; a `jaw` bone opens the lower half, a `mouth` bone sits at the beak's tip. Each wing is a
// shoulder, elbow and wrist, built spread wide; clips fold it back along the body and squeeze it
// shorter there.
//
// A look (recipe.js) gives its height (standing, to the top of its head), build (stouter or
// slighter), head (its head's size) and colors: skin the feathers, secondary the belly (an eagle's
// head and neck, a vulture's bare head), hair the beak and feet, eyes.
//
// Shapes are in the species' own units, scaled so the head's top is at the look's height. Each
// faces +z, its left toward +x.
//
// Species settings: tilt (radians the body rises from level), hip (how high the hips are), body
// (its length), fat (its thickness), neck (its length), span (each wing's length from the
// shoulder), chord (the wing's depth front to back), fingers (feathers splayed at the wing's tip),
// beak (hook, straight, short), and features: bald and ruff (a vulture), whiteHead (an eagle), disk
// and tufts (an owl), comb and plume (a chicken), flipper (a penguin's wings, which don't fold),
// flightless.
export const BIRDS = shapesOn("bird");

// The areas its faces are tagged with, in named groups (paint.js).
export const AREA_GROUPS = { everything: ["plumage", "belly", "beak", "eyes", "dark", "comb"] };

const HEAD = 0.3;

// The body's direction from the hips, rising by tilt.
const along = (sp) => [0, Math.sin(sp.tilt), Math.cos(sp.tilt)];

// The skeleton, in the species' own units: [name, parent, at].
function joints(sp) {
  const d = along(sp);
  const P = [0, restHeight(sp), 0];
  const C = add(P, mul(d, sp.body * 0.55));
  const N = add(P, mul(d, sp.body * 0.85));
  const H = add(N, [0, sp.neck + 0.1, 0.12 + 0.25 * sp.neck]);
  const w = sp.fat;
  const S = add(C, [w * 0.95, 0.1, 0]);
  return [
    ["root", null, [0, 0, 0]],
    ["pelvis", "root", P],
    ["spine_01", "pelvis", C],
    ["neck", "spine_01", N],
    ["head", "neck", H],
    ["jaw", "head", add(H, [0, -0.05, HEAD * 0.8])],
    ["mouth", "head", add(H, [0, -0.05, HEAD + beakLength(sp)])],
    ["tail", "pelvis", add(P, mul(d, -sp.body * 0.4))],
    ["wing_01_l", "spine_01", S],
    ["wing_02_l", "wing_01_l", add(S, [sp.span * 0.3, 0, -0.05])],
    ["wing_03_l", "wing_02_l", add(S, [sp.span * 0.6, 0, 0])],
    ["thigh_l", "pelvis", [0.25 * w / 0.45, sp.hip, 0.05]],
    ["shin_l", "thigh_l", [0.27 * w / 0.45, sp.hip * 0.5, -0.12]],
    ["foot_l", "shin_l", [0.27 * w / 0.45, 0.06, 0.02]],
  ];
}

// The pelvis's height: above the hips, and high enough that an upright body clears the ground.
const restHeight = (sp) => Math.max(sp.hip + 0.2, sp.body * 0.5 * Math.sin(sp.tilt) + sp.fat * 0.15);
const beakLength = (sp) => ({ hook: 0.32, straight: 0.38, short: 0.18 })[sp.beak];
const topOf = (sp) => joints(sp).find(([n]) => n === "head")[2][1] + HEAD;

// Mesh data for a look, as body.js's bodyMesh gives it, and the scale its clips move the pelvis by.
export function birdMesh(look) {
  const sp = BIRDS[look.body] ?? BIRDS.crow;
  const s = look.height / topOf(sp);
  const canonical = mirrored(joints(sp), 1);
  const index = new Map(canonical.map((b, i) => [b.name, i]));
  const at = (name) => canonical[index.get(name)].at;
  const build = 0.85 + 0.3 * look.build;
  const big = 0.8 + 0.4 * look.head;
  // Faces are tagged with their areas (AREA_GROUPS), and painted by the look's coloration.
  const c = { skin: "plumage", secondary: "belly", hair: "beak", eyes: "eyes" };
  const [plume, belly, horn, dark] = [c.skin, c.secondary, c.hair, "dark"];
  const red = "comb";
  const out = new MeshOut(index);
  out.paint = painterFor(look, AREA_GROUPS, look.height / s);
  const d = along(sp);
  const [P, C, N, H] = [at("pelvis"), at("spine_01"), at("neck"), at("head")];
  const flat = (corners, color, side) => {
    for (let i = 1; i < corners.length - 1; i++) {
      const tri = [corners[0], corners[i], corners[i + 1]];
      for (const toward of [false, true]) out.face(tri.map(([p]) => p), color, tri[0][1], add(tri[0][0], side), tri.map(([, b]) => b), toward);
    }
  };

  // The body, tail end to the neck, paler beneath.
  const w = sp.fat * build;
  const ring = (k, r, bones) => ({ center: add(P, mul(d, sp.body * k)), dir: d, rx: w * r, rz: w * r * 0.95, bones });
  const underside = (angle) => Math.abs(angle) < 1.2;
  out.tube(
    [ring(-0.5, 0.12, [["pelvis", 1]]), ring(-0.35, 0.6, [["pelvis", 1]]), ring(-0.1, 0.95, [["pelvis", 1]]), ring(0.25, 1, [["pelvis", 0.5], ["spine_01", 0.5]]), ring(0.55, 0.92, [["spine_01", 1]]), ring(0.78, 0.7, [["spine_01", 1]]), ring(0.9, 0.45, [["spine_01", 0.5], ["neck", 0.5]])],
    12,
    (band, angle) => (underside(angle) ? (sp.bald || sp.whiteHead ? shade(plume, 1.15) : belly) : plume),
  );
  // The neck up to the head.
  const neckColor = sp.whiteHead ? belly : sp.bald ? shade(belly, 0.95) : plume;
  const nr = sp.bald ? 0.13 : 0.22;
  out.path([N, lerp(N, H, 0.5), H], [w * 0.45, nr * big, 0.2 * big], 8, () => neckColor, (i) => [[["neck", 1]], [["neck", 0.5], ["head", 0.5]], [["head", 1]]][i]);
  if (sp.ruff) out.tube([0.3, 0.6, 0.9].map((k, i) => ({ center: lerp(N, H, 0.1 + 0.08 * i), dir: [0, 1, 0.2], rx: w * k * 0.9 + 0.05, rz: w * k * 0.9 + 0.05, bones: [["neck", 1]] })).reverse(), 10, () => shade(plume, 1.6));

  // The head, round, the beak forward of it, the lower half on the jaw.
  const headColor = sp.whiteHead || sp.bald ? belly : plume;
  const r = HEAD * big;
  const hb = [["head", 1]];
  out.tube([-0.9, -0.5, 0, 0.5, 0.9].map((k) => ({ center: add(H, [0, 0, k * r]), dir: [0, 0, 1], rx: r * Math.sqrt(1 - k * k) * (sp.disk ? 1.15 : 1), rz: r * Math.sqrt(1 - k * k), bones: hb })), 10, (band, angle) => (sp.disk && band === 3 ? belly : headColor));
  const bl = beakLength(sp);
  const B = add(H, [0, -0.04, r * 0.75]);
  const tip = add(H, [0, sp.beak === "hook" ? -0.16 : -0.07, r + bl]);
  const top = sp.beak === "hook" ? [B, add(B, [0, 0.02, bl * 0.6]), add(B, [0, -0.02, bl * 0.95]), tip] : [B, lerp(B, tip, 0.5), tip];
  out.path(top, top.map((_, i) => (i === top.length - 1 ? 0.01 : 0.11 * (1 - i / top.length))).map((v) => v * big), 6, () => horn, () => hb);
  const J = add(H, [0, -0.1, r * 0.75]);
  out.path([J, add(J, [0, -0.01, bl * 0.75])], [0.07 * big, 0.01], 5, () => shade(horn, 0.85), () => [["jaw", 1]]);
  // Eyes: on the sides, an owl's big and forward in a pale disk.
  for (const x of [-1, 1]) {
    if (sp.disk) {
      out.gem(add(H, [x * 0.14 * big, 0.04, r * 0.88]), 0.09 * big, c.eyes, hb);
      out.gem(add(H, [x * 0.14 * big, 0.04, r * 0.88 + 0.06]), 0.04 * big, dark, hb);
    } else out.gem(add(H, [x * r * 0.78, 0.06, r * 0.45]), 0.05 * big, c.eyes, hb);
    if (sp.tufts) flat([[add(H, [x * 0.12, r * 0.8, 0]), hb], [add(H, [x * 0.3, r * 1.45, -0.05]), hb], [add(H, [x * 0.24, r * 0.7, -0.1]), hb]], plume, [0, 0, -1]);
  }
  if (sp.comb) {
    for (let i = 0; i < 4; i++) out.gem(add(H, [0, r * (0.95 + 0.1 * Math.sin(i * 1.3)), r * (0.6 - 0.35 * i)]), 0.09 * big, red, hb);
    out.gem(add(H, [0, -0.2 * big, r * 0.75]), 0.08 * big, red, [["jaw", 1]]);
  }

  // The tail: a fan behind, or a chicken's plumes rising.
  const T = at("tail");
  const tb = [["tail", 1]];
  const back = [0, -Math.min(0.45, Math.sin(sp.tilt)), -1];
  const tailEnd = add(T, mul(back, 0.5 + 0.2 * (sp.span > 3 ? 1 : 0)));
  if (sp.plume) {
    for (const x of [-0.12, 0, 0.12]) out.path([T, add(T, [x, 0.5, -0.35]), add(T, [x * 1.5, 0.75, -0.75]), add(T, [x * 2, 0.55, -1.05])], [0.12, 0.1, 0.07, 0.02], 5, () => shade(plume, 0.6), () => tb);
  } else if (!sp.flipper) {
    flat([[add(T, [0.15 * w, 0, 0]), tb], [add(tailEnd, [0.32 * w, 0, 0]), tb], [add(tailEnd, [0, 0, -0.08]), tb], [add(tailEnd, [-0.32 * w, 0, 0]), tb], [add(T, [-0.15 * w, 0, 0]), tb]], shade(plume, 0.85), [0, -1, 0]);
  }

  for (const side of ["l", "r"]) {
    const x = side === "l" ? 1 : -1;
    const n = (name) => `${name}_${side}`;
    const bone = (name) => [[n(name), 1]];
    // The wing: its leading edge along the bones, feathers back from it, the tip splayed into
    // fingers or swept to a point. A penguin's is a narrow flipper.
    const [S, E, W] = [at(n("wing_01")), at(n("wing_02")), at(n("wing_03"))];
    const chord = sp.chord;
    const end = add(S, [x * sp.span, 0, -chord * 0.25]);
    const top = shade(plume, 0.95);
    const pinion = shade(plume, 0.72);
    out.path([S, E, W, end], [0.12, 0.09, 0.07, 0.02].map((v) => v * build), 5, () => top, (i) => [bone("wing_01"), bone("wing_02"), bone("wing_03"), bone("wing_03")][i]);
    flat([[S, bone("wing_01")], [E, bone("wing_02")], [W, bone("wing_03")], [add(W, [0, 0, -chord]), bone("wing_03")], [add(E, [0, 0, -chord]), bone("wing_02")], [add(S, [0, 0, -chord * 0.85]), bone("wing_01")]], top, [0, -1, 0]);
    if (sp.fingers) {
      for (let i = 0; i < sp.fingers; i++) {
        const f = i / (sp.fingers - 1);
        const root = add(W, [0, 0, -chord * (0.1 + 0.85 * f)]);
        const fingerTip = add(W, [x * (sp.span * 0.4 + 0.15 - 0.35 * f), 0, -chord * (0.25 + 0.9 * f)]);
        const half = 0.08 + 0.04 * (1 - f);
        flat([[add(root, [0, 0, half]), bone("wing_03")], [fingerTip, bone("wing_03")], [add(root, [0, 0, -half]), bone("wing_03")]], pinion, [0, -1, 0]);
      }
    } else {
      flat([[W, bone("wing_03")], [end, bone("wing_03")], [add(lerp(W, end, 0.45), [0, 0, -chord * (sp.flipper ? 0.4 : 0.9)]), bone("wing_03")], [add(W, [0, 0, -chord]), bone("wing_03")]], sp.flipper ? top : pinion, [0, -1, 0]);
    }

    // A leg: a feathered drumstick down to the ankle, a scaly shank, toes forward and one back.
    const [Th, Sh, F] = [at(n("thigh")), at(n("shin")), at(n("foot"))];
    out.path([Th, Sh], [0.17 * build, 0.08 * build], 6, () => (sp.feathered ? plume : shade(plume, 0.9)), (i) => [bone("thigh"), bone("shin")][i]);
    out.path([Sh, F], [0.055 * build, 0.045 * build], 5, () => (sp.feathered ? shade(plume, 1.1) : horn), (i) => [bone("shin"), bone("foot")][i]);
    const talon = sp.beak === "hook" || sp.disk;
    const toes = [[0.15, 0.32], [0, 0.38], [-0.15, 0.32], [0, -0.18]];
    if (sp.flipper) flat([[F, bone("foot")], [add(F, [0.18, -0.03, 0.3]), bone("foot")], [add(F, [-0.18, -0.03, 0.3]), bone("foot")]], horn, [0, 1, 0]);
    else
      for (const [tx, tz] of toes) {
        const toe = add(F, [tx * build, -0.04, tz * build]);
        out.path([F, toe], [0.04 * build, 0.025 * build], 4, () => horn, () => bone("foot"));
        if (talon) out.path([toe, add(toe, [0, -0.03, tz > 0 ? 0.07 : -0.07])], [0.025, 0.004], 4, () => dark, () => bone("foot"));
      }
  }

  const mesh = out.arrays();
  for (let i = 0; i < mesh.positions.length; i++) mesh.positions[i] *= s;
  return { ...mesh, bones: canonical.map((b) => ({ ...b, at: mul(b.at, s) })), scale: s };
}

const both = (name, [x, y, z]) => ({ [`${name}_l`]: [x, y, z], [`${name}_r`]: [x, -y, -z] });

// The wings folded back along the body by k (0 spread, 1 folded): turned down, then back, the
// feathers hanging below the leading edge. A penguin's flippers hang at its sides.
function fold(sp, k) {
  if (sp.flipper) return { bones: both("wing_01", [0, 0, -1.35 * k]), scale: {} };
  const squeeze = 1 - (1 - Math.min(1, (sp.body * 0.9) / sp.span)) * k;
  const narrow = 1 - 0.35 * k;
  return { bones: both("wing_01", [-(Math.PI / 2 + sp.tilt) * 0.95 * k, 0, 1.5 * k]), scale: { wing_01_l: [squeeze, 1, narrow], wing_01_r: [squeeze, 1, narrow] } };
}

// The wings beating at phase u, `amount` radians each way, the outer wing lagging.
function flap(u, amount, lift = 0) {
  const a = Math.sin(TAU * u);
  return { ...both("wing_01", [0, 0, amount * a + lift]), ...both("wing_02", [0, 0.15 * amount * Math.cos(TAU * u), 0.4 * amount * Math.sin(TAU * u - 0.6)]), ...both("wing_03", [0, 0, 0.35 * amount * Math.sin(TAU * u - 1.2)]) };
}

// The legs stepping at phase u, `stride` radians each way; the shank bends back on the lifted leg.
function step(u, stride) {
  const out = {};
  for (const [side, off] of [["l", 0], ["r", 0.5]]) {
    const a = TAU * (u + off);
    const lift = Math.max(0, Math.sin(a));
    out[`thigh_${side}`] = [-stride * Math.cos(a), 0, 0];
    out[`shin_${side}`] = [0.9 * stride * lift, 0, 0];
    out[`foot_${side}`] = [stride * Math.cos(a) - 0.9 * stride * lift, 0, 0];
  }
  return out;
}

const merge = (...poses) => ({ bones: Object.assign({}, ...poses.map((q) => q.bones ?? {})), scale: Object.assign({}, ...poses.map((q) => q.scale ?? {})), pelvis: poses.reduce((p, q) => (q.pelvis ? add(p, q.pelvis) : p), [0, 0, 0]) });

// How long each clip lasts, its pose at each moment, and its speed along the ground in the
// species' own units a second.
function birdPoses(sp) {
  const folded = fold(sp, 1);
  const rest = restHeight(sp);
  const level = sp.tilt * 0.85;
  const waddle = sp.flipper ? 1 : 0;
  const clips = {
    Idle_Loop: [
      3,
      (t) => {
        const u = t / 3;
        const look = sp.disk ? 1.3 * hump(u, 0.15, 0.3, 0.55, 0.7) - 1.1 * hump(u, 0.6, 0.72, 0.85, 0.95) : 0.5 * Math.sin(TAU * u);
        return merge(folded, { bones: { head: [0.05 * Math.sin(TAU * u * 2), look, 0], neck: [0.04 * Math.sin(TAU * u), 0, 0], tail: [0.08 * Math.sin(TAU * u * 3), 0, 0] }, pelvis: [0, 0.015 * Math.sin(TAU * u * 2), 0] });
      },
    ],
    // Stepping, the head bobbing forward with each step; a penguin rocks side to side.
    Walk_Loop: [
      sp.flipper ? 0.8 : 0.9,
      (t) => {
        const u = t / (sp.flipper ? 0.8 : 0.9);
        const bob = Math.sin(TAU * u * 2);
        return merge(folded, { bones: { ...step(u, sp.flipper ? 0.25 : 0.4), pelvis: [0, 0, 0.15 * waddle * Math.sin(TAU * u)], neck: [0.15 * bob * (1 - waddle), 0, 0], head: [-0.1 * bob * (1 - waddle), 0, 0] }, pelvis: [0, 0.03 * Math.abs(bob), 0] });
      },
      sp.flipper ? 0.8 : 1.6,
    ],
    // Running low, head out, the wings half open for balance.
    Run_Fwd_Loop: [
      0.5,
      (t) => {
        const u = t / 0.5;
        const half = sp.flipper ? fold(sp, 0.7) : fold(sp, 0.55);
        return merge(half, { bones: { ...step(u, 0.7), ...(sp.flipper ? {} : flap(u * 2, 0.15)), pelvis: [0.3 * level + 0.2 * waddle * Math.sin(TAU * u) * 0, 0, 0.2 * waddle * Math.sin(TAU * u)], neck: [0.2, 0, 0], head: [-0.3 * level, 0, 0] }, pelvis: [0, 0.08 * Math.abs(Math.sin(TAU * u)), 0] });
      },
      sp.flipper ? 2.5 : 5,
    ],
    // The head drawn back, then struck down and forward, the beak open, and back.
    Peck: [
      0.8,
      (t) => {
        const u = t / 0.8;
        const draw = hump(u, 0, 0.25, 0.3, 0.4);
        const strike = hump(u, 0.3, 0.45, 0.55, 0.9);
        const open = hump(u, 0.25, 0.35, 0.45, 0.55);
        return merge(folded, { bones: { pelvis: [0.35 * strike - 0.1 * draw, 0, 0], neck: [-0.3 * draw + 0.6 * strike, 0, 0], head: [0.3 * strike, 0, 0], jaw: [0.5 * open, 0, 0] }, pelvis: [0, 0, 0.25 * strike] });
      },
    ],
    // Wings flung wide and up, head high, the beak open.
    Cry: [
      1.8,
      (t) => {
        const u = t / 1.8;
        const up = hump(u, 0, 0.25, 0.75, 1);
        const open = fold(sp, 1 - up);
        const call = up * (0.6 + 0.4 * Math.sin(TAU * u * 4));
        return merge(open, { bones: { ...both("wing_01", [-(Math.PI / 2 + sp.tilt) * 0.95 * (1 - up), 0, 1.5 * (1 - up) + 0.5 * up]), pelvis: [-0.15 * up, 0, 0], neck: [-0.3 * up, 0, 0], head: [-0.4 * up, 0, 0], jaw: [0.6 * call, 0, 0], tail: [-0.3 * up, 0, 0] } });
      },
    ],
    Hit: [
      0.5,
      (t) => {
        const q = hump(t / 0.5, 0, 0.15, 0.3, 1);
        return merge(fold(sp, 1 - 0.5 * q), { bones: { pelvis: [-0.3 * q, 0, 0], neck: [-0.4 * q, 0, 0], head: [-0.3 * q, 0, 0] }, pelvis: [0, 0, -0.25 * q] });
      },
    ],
    // Down onto its side, the wing half open, the legs drawn up.
    Death: [
      1.6,
      (t) => {
        const u = t / 1.6;
        const fall = ease(u / 0.55);
        const flail = hump(u, 0, 0.1, 0.25, 0.45);
        return merge(fold(sp, 1 - 0.4 * fall), { bones: { ...(sp.flipper ? {} : flap(u * 4, 0.5 * flail)), pelvis: [-0.3 * fall, 0, 1.45 * fall], neck: [0.3 * fall, 0, 0], head: [0.4 * fall, 0, 0], ...both("thigh", [-0.7 * fall, 0, 0]), ...both("shin", [1.2 * fall, 0, 0]) }, pelvis: [0, -(rest - sp.fat * 0.9) * fall, 0] });
      },
    ],
  };
  if (sp.flipper) {
    // Down onto its belly, sliding forward, flippers back, and up again.
    clips.Slide = [
      2,
      (t) => {
        const u = t / 2;
        const down = hump(u, 0, 0.2, 0.75, 1);
        return merge(fold(sp, 1 - 0.6 * down), { bones: { pelvis: [1.4 * down, 0, 0], head: [-1 * down, 0, 0], ...both("wing_01", [0, 0.6 * down, -0.4 * (1 - down)]), ...both("thigh", [1.2 * down, 0, 0]) }, pelvis: [0, -(rest - sp.fat * 0.85) * down, 2.5 * ease((u - 0.1) / 0.7)] });
      },
    ];
    return clips;
  }
  // Up off the ground on beating wings, feet thrust forward, down onto what's ahead.
  clips.Pounce = [
    1.4,
    (t) => {
      const u = t / 1.4;
      const air = hump(u, 0.1, 0.35, 0.6, 0.85);
      const reach = hump(u, 0.35, 0.5, 0.65, 0.8);
      const spread = fold(sp, 1 - air);
      return merge(spread, { bones: { ...flap(u * 4, 0.8 * air), pelvis: [-0.3 * reach, 0, 0], ...both("thigh", [-1.0 * reach, 0, 0]), ...both("shin", [-0.4 * reach, 0, 0]), head: [0.2 * reach, 0, 0] }, pelvis: [0, (sp.flightless ? 0.6 : 1.4) * air, 1.2 * ease((u - 0.2) / 0.55)] });
    },
  ];
  if (!sp.flightless) {
    // Up high on beating wings, body level, legs tucked back.
    const flying = (u, amount) => ({ bones: { ...flap(u, amount), pelvis: [level, 0, 0], neck: [-0.4 * level, 0, 0], head: [-0.5 * level, 0, 0], ...both("thigh", [1.3, 0, 0]), ...both("shin", [0.8, 0, 0]), tail: [-0.2, 0, 0] }, pelvis: [0, 3 + 0.2 * Math.sin(TAU * u), 0] });
    clips.Fly_Loop = [0.7, (t) => flying(t / 0.7, 0.75), 14];
    clips.Hover_Loop = [0.5, (t) => flying(t / 0.5, 0.9), 0];
  }
  return clips;
}

export function birdClips(mesh, look) {
  const sp = BIRDS[look?.body] ?? BIRDS.crow;
  const clips = Object.entries(birdPoses(sp)).map(([name, [duration, pose, speed]]) => sampled(mesh, name, duration, pose, speed));
  return new Map(clips.map((c) => [c.name, c]));
}

// The clip for each creature role (animations.js's ROLES), or null where it has none.
export function birdRoles(look) {
  const sp = BIRDS[look?.body] ?? BIRDS.crow;
  return { idle: "Idle_Loop", walk: "Walk_Loop", run: "Run_Fwd_Loop", fly: sp.flightless ? null : "Fly_Loop", attack: "Peck", bigAttack: sp.flipper ? "Slide" : "Pounce", cast: null, shoot: null, breath: null, battleCry: "Cry", hit: "Hit", death: "Death" };
}
