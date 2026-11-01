import { MeshOut } from "./body.js";
import { TAU, add, ease, hex, hump, lerp, mirrored, mul, sampled, shade } from "./rig.js";
import { shapesOn } from "./bodies.js";
import { painterFor } from "./paint.js";

// Striders: a body held level on two big legs, balanced by a long tail, a neck forward to a long
// head with jaws. Each leg bends three ways: the thigh forward to the knee, the shin back to the
// ankle, the long foot forward to the toes. Arms are small, or there are none. A `jaw` bone opens
// the mouth and a `mouth` bone sits at its tip.
//
// A look (recipe.js) gives its height (to the top of its head), build (stouter or slighter), head
// (its head's size) and colors: skin the hide or feathers, secondary stripes on the back (an
// ostora's breast), hair the claws, beak and crest, eyes.
//
// Shapes are in the species' own units, scaled so its highest point is at the look's height.
// Each faces +z, its left toward +x.
//
// Species settings: hip (how high the hips are), body (its length), fat (its thickness), neck
// ([forward, up]), head (its length), skull (its depth), tail (its length), arms (their length, 0
// for none), and features: sickle (a raised claw on each foot), crest (feathers along the head and
// neck), stripes, beak (a bird's head), feathered, kick.
export const STRIDERS = shapesOn("strider");

// The areas its faces are tagged with, in named groups (paint.js).
export const AREA_GROUPS = { everything: ["hide", "markings", "claws", "eyes", "dark", "teeth"] };

const TAIL = ["tail_01", "tail_02", "tail_03", "tail_04"];

// The skeleton, in the species' own units: [name, parent, at].
function joints(sp) {
  const P = [0, sp.hip + 0.1, 0];
  const C = add(P, [0, 0.05, sp.body * 0.55]);
  const N = add(P, [0, 0.1, sp.body * 0.8]);
  const H = add(N, [0, sp.neck[1], sp.neck[0]]);
  const x = sp.fat * 0.6;
  const tail = TAIL.map((name, i) => [name, i ? TAIL[i - 1] : "pelvis", add(P, [0, -0.12 * sp.hip * (i + 1) * 0.25, -sp.body * 0.3 - (sp.tail * i) / 4])]);
  return [
    ["root", null, [0, 0, 0]],
    ["pelvis", "root", P],
    ["spine_01", "pelvis", C],
    ["neck", "spine_01", N],
    ["head", "neck", H],
    ["jaw", "head", add(H, [0, -sp.skull * 0.45, sp.skull * 0.2])],
    ["mouth", "head", add(H, [0, -sp.skull * 0.3, sp.head])],
    ...tail,
    ["arm_l", "spine_01", add(C, [sp.fat * 0.75, -sp.fat * 0.35, sp.body * 0.15])],
    ["hand_l", "arm_l", add(C, [sp.fat * 0.85, -sp.fat * 0.35 - sp.arms * 0.6, sp.body * 0.15 + sp.arms * 0.5])],
    ["thigh_l", "pelvis", [x, sp.hip, 0]],
    ["shin_l", "thigh_l", [x, sp.hip * 0.58, sp.hip * 0.22]],
    ["ankle_l", "shin_l", [x, sp.hip * 0.24, -sp.hip * 0.12]],
    ["foot_l", "ankle_l", [x, 0.04, sp.hip * 0.04]],
  ];
}

// Mesh data for a look, as body.js's bodyMesh gives it, and the scale its clips move the pelvis by.
export function striderMesh(look) {
  const sp = STRIDERS[look.body] ?? STRIDERS.raptor;
  const canonical = mirrored(joints(sp), 1);
  const index = new Map(canonical.map((b, i) => [b.name, i]));
  const at = (name) => canonical[index.get(name)].at;
  const build = 0.85 + 0.3 * look.build;
  const big = 0.85 + 0.3 * look.head;
  // Faces are tagged with their areas (AREA_GROUPS), and painted by the look's coloration.
  const c = { skin: "hide", secondary: "markings", hair: "claws", eyes: "eyes" };
  const [hide, mark, claw, dark] = [c.skin, c.secondary, c.hair, "dark"];
  const pale = shade(hide, 1.35);
  const tooth = "teeth";
  const out = new MeshOut(index);
  out.paint = painterFor(look, AREA_GROUPS, 1);
  const [P, C, N, H] = [at("pelvis"), at("spine_01"), at("neck"), at("head")];
  const w = sp.fat * build;
  const flat = (corners, color, side) => {
    for (let i = 1; i < corners.length - 1; i++) {
      const tri = [corners[0], corners[i], corners[i + 1]];
      for (const toward of [false, true]) out.face(tri.map(([p]) => p), color, tri[0][1], add(tri[0][0], side), tri.map(([, b]) => b), toward);
    }
  };

  // Tail tip to the shoulders in one piece, pale beneath, striped across the back. A feathered
  // body is round, its tail a short tuft.
  const underside = (angle) => Math.abs(angle) < 1.1;
  const coat = (band, angle) => (underside(angle) ? (sp.feathered ? mark : pale) : sp.stripes && band % 2 === 1 && Math.abs(angle) > 2 ? mark : hide);
  const tailAt = TAIL.map(at);
  const tip = add(tailAt[3], [0, -0.05, -sp.tail / 4]);
  const ringAt = (center, r, bones, ry = 1) => ({ center, dir: [0, 0, 1], rx: r * w, rz: r * w * ry, bones });
  const deep = sp.feathered ? 1.15 : 1.1;
  out.tube(
    [
      ringAt(tip, 0.04, [["tail_04", 1]]),
      ringAt(tailAt[3], sp.feathered ? 0.2 : 0.18, [["tail_04", 1]]),
      ringAt(tailAt[2], sp.feathered ? 0.4 : 0.3, [["tail_03", 1]]),
      ringAt(tailAt[1], sp.feathered ? 0.65 : 0.45, [["tail_02", 1]]),
      ringAt(tailAt[0], sp.feathered ? 0.9 : 0.7, [["tail_01", 1]]),
      ringAt(add(P, [0, 0, -sp.body * 0.1]), 0.95, [["pelvis", 1]], deep),
      ringAt(lerp(P, C, 0.5), 1, [["pelvis", 0.5], ["spine_01", 0.5]], deep),
      ringAt(C, 0.92, [["spine_01", 1]], deep),
      ringAt(lerp(C, N, 0.6), 0.65, [["spine_01", 0.5], ["neck", 0.5]]),
    ],
    12,
    coat,
  );
  // The neck, up and forward to the head.
  const nr = sp.beak ? 0.18 : 0.42;
  out.path([lerp(C, N, 0.5), N, lerp(N, H, 0.5), add(H, [0, 0, -sp.skull * 0.4])], [w * 0.6, w * nr * 1.3, w * nr, sp.skull * 0.8 * big], 10, () => hide, (i) => [[["spine_01", 1]], [["neck", 1]], [["neck", 0.5], ["head", 0.5]], [["head", 1]]][i]);

  // The head: a long skull tapering to the snout, the lower jaw beneath it; or a bird's small
  // round head and beak.
  const hb = [["head", 1]];
  const jb = [["jaw", 1]];
  const L = sp.head * big;
  const k = sp.skull * big;
  if (sp.beak) {
    out.tube([-0.8, -0.3, 0.2, 0.7].map((z) => ({ center: add(H, [0, 0, z * k]), dir: [0, 0, 1], rx: k * Math.sqrt(1 - z * z * 0.8), rz: k * Math.sqrt(1 - z * z * 0.8), bones: hb })), 8, () => hide);
    out.path([add(H, [0, 0, k * 0.6]), add(H, [0, -0.04, L * 1.4]), add(H, [0, -0.12, L * 2.2])], [0.09 * big, 0.06 * big, 0.01], 6, () => claw, () => hb);
    out.path([add(H, [0, -0.08, k * 0.5]), add(H, [0, -0.15, L * 1.9])], [0.06 * big, 0.01], 5, () => shade(claw, 0.85), () => jb);
    for (const x of [-1, 1]) out.gem(add(H, [x * k * 0.75, 0.05, k * 0.2]), 0.05 * big, c.eyes, hb);
    // A plume of feathers rising from the crown.
    for (const x of [-0.05, 0.05]) out.path([add(H, [x, k * 0.8, -k * 0.2]), add(H, [x * 4, k * 1.6, -k * 2.4])], [0.06, 0.01], 4, () => mark, () => hb);
  } else {
    const skullRing = (z, rx, ry, dy) => ({ center: add(H, [0, dy * k, z * L]), dir: [0, 0, 1], rx: rx * k, rz: ry * k, bones: hb });
    out.tube([skullRing(-0.25, 0.4, 0.4, 0.05), skullRing(-0.1, 0.85, 0.95, 0.1), skullRing(0.2, 0.8, 0.85, 0.05), skullRing(0.6, 0.55, 0.55, -0.1), skullRing(0.95, 0.35, 0.32, -0.25), skullRing(1.02, 0.15, 0.12, -0.3)], 10, (band, angle) => (underside(angle) ? pale : hide));
    const jawRing = (z, rx, ry, dy) => ({ center: add(H, [0, dy * k, z * L]), dir: [0, 0, 1], rx: rx * k, rz: ry * k, bones: jb });
    out.tube([jawRing(-0.05, 0.6, 0.35, -0.6), jawRing(0.4, 0.5, 0.25, -0.7), jawRing(0.9, 0.28, 0.15, -0.65)], 8, () => pale);
    // Teeth down the upper jaw and up the lower.
    const n = Math.round(4 + 3 * sp.head);
    for (const x of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        const z = 0.25 + (0.7 * i) / n;
        const half = Math.max(0.2, 0.75 - 0.45 * z);
        const top = add(H, [x * half * k, (-0.3 - 0.2 * z) * k, z * L]);
        out.path([top, add(top, [0, -0.2 * k, 0.02])], [0.05 * k, 0.005], 3, () => tooth, () => hb);
        const low = add(H, [x * half * 0.85 * k, (-0.55 - 0.15 * z) * k, z * L]);
        out.path([low, add(low, [0, 0.15 * k, 0.02])], [0.04 * k, 0.005], 3, () => tooth, () => jb);
      }
      out.gem(add(H, [x * 0.6 * k, 0.4 * k, 0.05 * L]), 0.12 * k, c.eyes, hb);
      out.path([add(H, [x * 0.45 * k, 0.6 * k, -0.08 * L]), add(H, [x * 0.55 * k, 0.65 * k, 0.15 * L])], [0.1 * k, 0.04 * k], 4, () => shade(hide, 0.8), () => hb);
    }
    if (sp.crest) for (let i = 0; i < 5; i++) flat([[add(H, [0, k * 0.75, (0.2 - 0.18 * i) * L]), hb], [add(H, [0, k * 1.3, (0.05 - 0.18 * i) * L]), hb], [add(H, [0, k * 0.7, (0.02 - 0.18 * i) * L]), hb]], claw, [1, 0, 0]);
  }

  for (const side of ["l", "r"]) {
    const x = side === "l" ? 1 : -1;
    const n = (name) => `${name}_${side}`;
    const bone = (name) => [[n(name), 1]];
    // An arm, a small clawed hand.
    if (sp.arms) {
      const [A, Hd] = [at(n("arm")), at(n("hand"))];
      out.path([A, lerp(A, Hd, 0.5), Hd], [0.1, 0.07, 0.05].map((v) => (v * w) / 0.36), 6, () => hide, (i) => [bone("arm"), bone("arm"), bone("hand")][i]);
      for (const spread of [-0.05, 0.05, 0.12]) out.path([Hd, add(Hd, [x * spread, -0.08, 0.1 * sp.arms * 2])], [0.03 * w * 2, 0.004], 4, () => claw, () => bone("hand"));
    }
    // A leg: a thick thigh forward to the knee, the shin back to the ankle, the long foot down
    // to the toes.
    const [T, K, A, F] = [at(n("thigh")), at(n("shin")), at(n("ankle")), at(n("foot"))];
    const legR = sp.feathered ? 0.4 : 1;
    out.path([add(T, [0, 0.15 * sp.hip, -0.1]), T, K], [0.55 * w * legR, 0.5 * w * legR, 0.26 * w * legR], 8, () => hide, (i) => [[["pelvis", 1]], bone("thigh"), bone("shin")][i]);
    out.path([K, A], [0.24 * w * legR, 0.14 * w * legR], 6, () => (sp.feathered ? claw : hide), (i) => [bone("shin"), bone("ankle")][i]);
    out.path([A, F], [0.13 * w * legR, 0.1 * w * legR], 6, () => (sp.feathered ? claw : hide), (i) => [bone("ankle"), bone("foot")][i]);
    const toeLen = sp.hip * 0.28;
    for (const [tx, tz] of [[0.35, 0.85], [0, 1], [-0.35, 0.85]]) {
      const toe = add(F, [tx * toeLen * 0.6, -0.02, tz * toeLen]);
      out.path([F, toe], [0.07 * w, 0.04 * w], 4, () => (sp.feathered ? claw : hide), () => bone("foot"));
      out.path([toe, add(toe, [0, -0.02, 0.07 * sp.hip])], [0.035 * w, 0.004], 4, () => (sp.feathered ? dark : claw), () => bone("foot"));
    }
    if (sp.sickle) {
      const root = add(F, [x * 0.05, 0.05, toeLen * 0.35]);
      out.path([root, add(root, [0, 0.14, 0.12]), add(root, [0, 0.08, 0.26])], [0.04, 0.03, 0.004], 4, () => claw, () => bone("foot"));
    }
  }

  // Scaled so its highest point is at the look's height.
  const mesh = out.arrays();
  let top = 0;
  for (let i = 1; i < mesh.positions.length; i += 3) top = Math.max(top, mesh.positions[i]);
  const s = look.height / top;
  for (let i = 0; i < mesh.positions.length; i++) mesh.positions[i] *= s;
  return { ...mesh, bones: canonical.map((b) => ({ ...b, at: mul(b.at, s) })), scale: s };
}

const both = (name, [x, y, z]) => ({ [`${name}_l`]: [x, y, z], [`${name}_r`]: [x, -y, -z] });

// The tail swaying side to side at phase u, each segment lagging, lifted by `lift`.
const sway = (u, amount, lift = 0) => Object.fromEntries(TAIL.map((n, i) => [n, [lift * (i ? 0.5 : 1), amount * Math.sin(TAU * u - 0.7 * i), 0]]));

// The legs stepping at phase u, `stride` radians each way: the knee bends on the lifted leg and
// the ankle folds back under it.
function step(u, stride) {
  const out = {};
  for (const [side, off] of [["l", 0], ["r", 0.5]]) {
    const a = TAU * (u + off);
    const lift = Math.max(0, Math.sin(a));
    out[`thigh_${side}`] = [-stride * Math.cos(a) - 0.5 * stride * lift, 0, 0];
    out[`shin_${side}`] = [0.9 * stride * lift, 0, 0];
    out[`ankle_${side}`] = [-0.5 * stride * lift, 0, 0];
    out[`foot_${side}`] = [stride * Math.cos(a) + 0.1 * stride * lift, 0, 0];
  }
  return out;
}

// How long each clip lasts, its pose at each moment, and its speed along the ground in the
// species' own units a second.
function striderPoses(sp) {
  const rest = sp.hip + 0.1;
  const clips = {
    Idle_Loop: [
      3,
      (t) => {
        const u = t / 3;
        const breathe = Math.sin(TAU * u * 2);
        return { bones: { ...sway(u, 0.08, 0.03 * breathe), neck: [0.04 * breathe, 0.2 * Math.sin(TAU * u), 0], head: [0.03 * breathe, 0.15 * Math.sin(TAU * u - 0.5), 0], ...both("arm", [0.1 * breathe, 0, 0]) }, scale: { spine_01: [1 + 0.02 * breathe, 1 + 0.02 * breathe, 1] }, pelvis: [0, 0.01 * breathe, 0] };
      },
    ],
    Walk_Loop: [
      sp.hip > 2 ? 1.1 : 1,
      (t) => {
        const u = t / (sp.hip > 2 ? 1.1 : 1);
        const bob = Math.cos(TAU * u * 2);
        return { bones: { ...step(u, 0.35), ...sway(u, 0.15), pelvis: [0, 0.08 * Math.sin(TAU * u), 0], neck: [0.05 * bob, -0.06 * Math.sin(TAU * u), 0], head: [-0.05 * bob, 0, 0] }, pelvis: [0, -0.03 * sp.hip * Math.abs(bob), 0] };
      },
      sp.hip * 1.5,
    ],
    // Low and long, the neck stretched out, the tail straight behind.
    Run_Fwd_Loop: [
      0.55,
      (t) => {
        const u = t / 0.55;
        const bob = Math.cos(TAU * u * 2);
        return { bones: { ...step(u, 0.75), ...sway(u, 0.05, 0.1), pelvis: [0.12, 0, 0], neck: [0.1 - 0.05 * bob, 0, 0], head: [-0.1, 0, 0], ...both("arm", [-0.4, 0, 0]) }, pelvis: [0, -0.05 * sp.hip + 0.06 * sp.hip * Math.abs(Math.sin(TAU * u)), 0] };
      },
      sp.hip * 5,
    ],
    // The head drawn back, the jaws wide, then a snap forward.
    Bite: [
      0.9,
      (t) => {
        const u = t / 0.9;
        const draw = hump(u, 0, 0.25, 0.3, 0.4);
        const strike = hump(u, 0.3, 0.45, 0.55, 0.9);
        const open = hump(u, 0.15, 0.3, 0.4, 0.5);
        return { bones: { pelvis: [0.15 * strike, 0, 0], neck: [-0.3 * draw + 0.35 * strike, 0, 0], head: [-0.2 * draw + 0.15 * strike, 0, 0], jaw: [(sp.beak ? 0.4 : 0.8) * open, 0, 0], ...sway(u, 0.05, 0.1 * strike) }, pelvis: [0, -0.04 * sp.hip * strike, 0.3 * sp.hip * strike] };
      },
    ],
    // Head up, jaws wide, roaring, the tail lashing.
    Roar: [
      2.2,
      (t) => {
        const u = t / 2.2;
        const up = hump(u, 0, 0.2, 0.75, 1);
        const shake = 0.05 * Math.sin(TAU * u * 12) * up;
        return { bones: { pelvis: [-0.15 * up, 0, 0], neck: [-0.4 * up, shake, 0], head: [-0.3 * up + shake, 0, 0], jaw: [(sp.beak ? 0.5 : 0.85) * up, 0, 0], ...sway(u * 2, 0.25 * up, 0.15 * up), ...both("arm", [-0.5 * up, 0, 0.3 * up]) }, pelvis: [0, 0.03 * sp.hip * up, 0] };
      },
    ],
    Hit: [
      0.5,
      (t) => {
        const q = hump(t / 0.5, 0, 0.15, 0.3, 1);
        return { bones: { pelvis: [-0.15 * q, 0.1 * q, 0], neck: [-0.3 * q, 0.2 * q, 0], head: [-0.2 * q, 0, 0], jaw: [0.3 * q, 0, 0], ...sway(0.25, 0.2 * q) }, pelvis: [0, 0, -0.15 * sp.hip * q] };
      },
    ],
    // Legs give way and it rolls onto its side.
    Death: [
      2,
      (t) => {
        const u = t / 2;
        const fall = ease(u / 0.6);
        const buckle = hump(u, 0, 0.2, 0.4, 0.6);
        return { bones: { pelvis: [0, 0, 1.45 * fall], neck: [0.2 * fall, 0, 0.3 * fall], head: [0.2 * fall, 0, 0], jaw: [0.4 * fall, 0, 0], ...sway(0.1, 0.2 * fall), ...both("thigh", [-0.6 * fall - 0.6 * buckle, 0, 0]), ...both("shin", [0.8 * buckle + 0.4 * fall, 0, 0]) }, pelvis: [0, -(rest - sp.fat * 0.9) * fall, 0] };
      },
    ],
  };
  if (sp.kick) {
    // Up on one leg, the other drawn up and struck forward.
    clips.Kick = [
      1.1,
      (t) => {
        const u = t / 1.1;
        const draw = hump(u, 0.05, 0.3, 0.35, 0.45);
        const strike = hump(u, 0.35, 0.45, 0.55, 0.9);
        return { bones: { pelvis: [-0.2 * draw - 0.1 * strike, 0, 0], thigh_r: [-0.9 * draw - 1.1 * strike, 0, 0], shin_r: [1.2 * draw, 0, 0], ankle_r: [-0.8 * draw + 0.3 * strike, 0, 0], neck: [0.3 * draw, 0, 0], ...sway(u, 0.1) }, pelvis: [0, 0, 0.3 * strike] };
      },
    ];
  } else if (sp.sickle) {
    // A leap onto what's ahead, both feet forward, the sickle claws first.
    clips.Leap = [
      1.3,
      (t) => {
        const u = t / 1.3;
        const crouch = hump(u, 0, 0.15, 0.2, 0.3);
        const air = hump(u, 0.2, 0.4, 0.55, 0.75);
        const land = hump(u, 0.6, 0.7, 0.8, 1);
        return { bones: { pelvis: [0.2 * crouch - 0.3 * air, 0, 0], ...both("thigh", [-0.8 * crouch - 1.1 * air, 0, 0]), ...both("shin", [1.4 * crouch + 0.6 * air + 0.8 * land, 0, 0]), ...both("ankle", [-0.7 * crouch, 0, 0]), ...both("arm", [-0.9 * air, 0, 0.3 * air]), jaw: [0.6 * air, 0, 0], ...sway(u, 0.05, 0.3 * air) }, pelvis: [0, -0.25 * sp.hip * (crouch + land) + 1.0 * sp.hip * air, 1.6 * sp.hip * ease((u - 0.2) / 0.5)] };
      },
    ];
  } else {
    // A great bite: the head swung low, jaws wide, clamped, then shaken side to side.
    clips.Chomp = [
      1.8,
      (t) => {
        const u = t / 1.8;
        const low = hump(u, 0.05, 0.25, 0.8, 1);
        const open = hump(u, 0.05, 0.2, 0.25, 0.32);
        const shake = Math.sin(TAU * u * 4) * hump(u, 0.35, 0.45, 0.7, 0.85);
        return { bones: { pelvis: [0.1 * low, 0, 0], neck: [0.2 * low, 0.35 * shake, 0], head: [0.05 * low, 0.15 * shake, 0.2 * shake], jaw: [0.9 * open + 0.1 * low, 0, 0], ...sway(u, 0.12, 0.15 * low) }, pelvis: [0, -0.05 * sp.hip * low, 0.2 * sp.hip * low] };
      },
    ];
  }
  return clips;
}

export function striderClips(mesh, look) {
  const sp = STRIDERS[look?.body] ?? STRIDERS.raptor;
  const clips = Object.entries(striderPoses(sp)).map(([name, [duration, pose, speed]]) => sampled(mesh, name, duration, pose, speed));
  return new Map(clips.map((c) => [c.name, c]));
}

// The clip for each creature role (animations.js's ROLES), or null where it has none.
export function striderRoles(look) {
  const sp = STRIDERS[look?.body] ?? STRIDERS.raptor;
  return { idle: "Idle_Loop", walk: "Walk_Loop", run: "Run_Fwd_Loop", fly: null, attack: "Bite", bigAttack: sp.kick ? "Kick" : sp.sickle ? "Leap" : "Chomp", cast: null, shoot: null, breath: null, battleCry: "Roar", hit: "Hit", death: "Death" };
}
