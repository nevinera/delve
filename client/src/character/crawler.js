import { MeshOut } from "./body.js";
import { TAU, add, ease, hex, hump, lerp, mirrored, mul, sampled, shade } from "./rig.js";

// Crawlers: a body low between many jointed legs. A spider has eight long legs round a round
// body, fangs, a cluster of eyes and a great abdomen behind; a scorpion has eight short legs, two
// pincers ahead and a tail curled up over its back with a sting at the end; a beetle has six legs,
// a horn, jaws, and a hard shell over its back that opens in halves. A crab has two great pincers
// before a wide flat shell, its eyes on stalks; an ant (and a hivari, its great spined kin) a head,
// a narrow waist and a swollen abdomen, with jaws and feelers; a wasp an ant's body with wings,
// hovering with its legs hanging, a sting at its tail.
//
// A look (recipe.js) gives its height (to the top of its knees or tail), build (thicker or
// thinner), limbs (its legs' thickness) and colors: skin the body, secondary the markings (the
// shell, for a beetle), hair the legs' joints, claws, horn and fangs, eyes.
//
// Shapes are in the species' own feet, scaled to the look's height. Each faces +z, its feet on
// y = 0, its left toward +x.

// y: the body's height; legs: each leg's angle out from the side (degrees, forward positive), its
// hip's place along the body, and its reach; rise: how far the knees lift above the hips.
// kind: the body plan, as above; hover: off the ground, legs hanging; spines: a hivari's.
export const CRAWLERS = {
  spider: { kind: "spider", y: 1.5, legs: [[65, 0.55], [25, 0.25], [-15, -0.05], [-50, -0.3]], hipOut: 0.4, reach: 3.3, rise: 1.4, thick: 0.7 },
  scorpion: { kind: "scorpion", y: 0.9, legs: [[35, 0.3], [5, -0.1], [-25, -0.5], [-50, -0.9]], hipOut: 0.45, reach: 2.2, rise: 0.75, thick: 0.85 },
  beetle: { kind: "beetle", y: 1.0, legs: [[45, 0.5], [0, -0.1], [-45, -0.6]], hipOut: 0.5, reach: 1.55, rise: 0.5, thick: 1.4 },
  crab: { kind: "crab", y: 0.9, legs: [[25, 0.3], [5, 0.05], [-15, -0.2], [-35, -0.45]], hipOut: 0.85, reach: 2.1, rise: 0.8, thick: 0.95 },
  ant: { kind: "ant", y: 0.9, legs: [[50, 0.35], [0, 0.15], [-45, -0.05]], hipOut: 0.3, reach: 1.6, rise: 0.4, thick: 0.6 },
  hivari: { kind: "ant", y: 1.3, legs: [[50, 0.35], [0, 0.15], [-45, -0.05]], hipOut: 0.3, reach: 2.1, rise: 0.6, thick: 0.8, spines: true },
  wasp: { kind: "ant", y: 2.6, legs: [[35, 0.35], [0, 0.15], [-35, -0.05]], hipOut: 0.25, reach: 0.8, rise: -0.15, thick: 0.45, hover: true },
};
export const crawlerOf = (look) => CRAWLERS[look.body] ?? CRAWLERS.spider;
const isOf = (sp, kind) => sp.kind === kind;

const RAD = Math.PI / 180;
const SCORPION_TAIL = ["tail_01", "tail_02", "tail_03", "tail_04", "tail_05"];

// Each leg's joints: hip, knee (up and out), ankle and foot (on the ground), and the way it
// points out, [x, 0, z].
function legJoints(sp, [angle, z]) {
  const d = [Math.cos(angle * RAD), 0, Math.sin(angle * RAD)];
  const hip = [sp.hipOut * d[0], sp.y - 0.1, z + 0.3 * sp.hipOut * d[2]];
  const knee = add(add(hip, mul(d, 0.38 * sp.reach)), [0, sp.rise, 0]);
  const foot = add(hip, mul(d, sp.reach));
  // A hovering crawler's legs hang below it, bent back a little.
  foot[1] = sp.hover ? hip[1] - 0.9 * sp.reach : 0;
  if (sp.hover) foot[2] -= 0.3 * sp.reach;
  const ankle = add(lerp(knee, foot, 0.6), mul(d, 0.1 * sp.reach));
  return { hip, knee, ankle, foot, d };
}

// The skeleton for a species, in its own feet: [name, parent, at].
function joints(sp) {
  const y = sp.y;
  const out = [
    ["root", null, [0, 0, 0]],
    ["pelvis", "root", [0, y, 0]],
    ["head", "pelvis", [0, y, isOf(sp, "scorpion") ? 1.0 : isOf(sp, "ant") ? 0.7 : 0.8]],
    ["abdomen", "pelvis", [0, y, isOf(sp, "ant") ? -0.5 : -0.4]],
  ];
  sp.legs.forEach((leg, i) => {
    const { hip, knee, ankle } = legJoints(sp, leg);
    const n = (k) => `leg_${i + 1}_0${k}_l`;
    out.push([n(1), "pelvis", hip], [n(2), n(1), knee], [n(3), n(2), ankle]);
  });
  if (isOf(sp, "spider")) out.push(["fang_l", "head", [0.14, y - 0.05, 1.05]]);
  if (isOf(sp, "beetle")) out.push(["jaw_l", "head", [0.18, y - 0.1, 1.45]]);
  if (isOf(sp, "ant")) out.push(["jaw_l", "head", [0.16, y - 0.05, 1.2]]);
  if (sp.hover) out.push(["wing_l", "pelvis", [0.12, y + 0.3, 0.2]]);
  if (isOf(sp, "scorpion") || isOf(sp, "crab")) {
    out.push(["claw_01_l", "pelvis", [0.35, y, 1.0]], ["claw_02_l", "claw_01_l", [1.0, y + 0.15, 1.5]], ["claw_03_l", "claw_02_l", [0.8, y + 0.15, 2.2]], ["finger_l", "claw_03_l", [0.95, y + 0.15, 2.75]]);
  }
  if (isOf(sp, "scorpion")) {
    const tail = [[0, y + 0.1, -1.8], [0, y + 0.75, -2.35], [0, y + 1.5, -2.5], [0, y + 2.15, -2.2], [0, y + 2.5, -1.6]];
    tail.forEach((p, i) => out.push([SCORPION_TAIL[i], i ? SCORPION_TAIL[i - 1] : "abdomen", p]));
    out.push(["tail_end", "tail_05", [0, y + 2.4, -1.05]]);
  }
  if (isOf(sp, "beetle")) out.push(["shell_l", "abdomen", [0.1, y + 0.55, -0.1]]);
  return out;
}

// Mesh data for a look, as body.js's bodyMesh gives it, and the scale its clips move the pelvis by.
export function crawlerMesh(look) {
  const sp = crawlerOf(look);
  const canonical = mirrored(joints(sp), 1);
  const index = new Map(canonical.map((b, i) => [b.name, i]));
  const at = (name) => canonical[index.get(name)].at;
  const build = 0.8 + 0.4 * look.build;
  const limb = (0.8 + 0.4 * look.limbs) * sp.thick;
  const c = Object.fromEntries(Object.entries(look.colors).map(([key, v]) => [key, hex(v)]));
  const [body, mark, horn, dark] = [c.skin, c.secondary, c.hair, [0.07, 0.06, 0.06]];
  const out = new MeshOut(index);
  const y = sp.y;

  // An egg shape along a line, `length` long, `rx` wide and `ry` deep at its widest, `at` how far
  // along that is (0 to 1).
  const blob = (center, dir, length, rx, ry, bones, color, { widest = 0.5, skip = null, rings = 7 } = {}) => {
    const rows = Array.from({ length: rings }, (_, k) => {
      const t = k / (rings - 1);
      const r = t < widest ? Math.sin((t / widest) * (Math.PI / 2)) : Math.cos(((t - widest) / (1 - widest)) * (Math.PI / 2));
      const shape = Math.max(0.08, r);
      return { center: add(center, mul(dir, (t - 0.5) * length)), dir, rx: rx * shape, rz: ry * shape, bones: typeof bones === "function" ? bones(t) : bones };
    });
    out.tube(rows, 10, color, { skip });
  };
  const forward = [0, 0, 1];

  // Legs: hip, knee, ankle, foot, thinning, banded at the joints.
  sp.legs.forEach((leg, i) => {
    for (const side of ["l", "r"]) {
      const x = side === "l" ? 1 : -1;
      const flip = (p) => [x * p[0], p[1], p[2]];
      const { hip, knee, ankle, foot } = legJoints(sp, leg);
      const n = (k) => `leg_${i + 1}_0${k}_${side}`;
      const points = [hip, lerp(hip, knee, 0.5), knee, lerp(knee, ankle, 0.5), ankle, lerp(ankle, foot, 0.5), foot].map(flip);
      const bones = [[[n(1), 1]], [[n(1), 1]], [[n(1), 0.5], [n(2), 0.5]], [[n(2), 1]], [[n(2), 0.5], [n(3), 0.5]], [[n(3), 1]], [[n(3), 1]]];
      const radii = [0.13, 0.12, 0.1, 0.09, 0.07, 0.05, 0.015].map((r) => r * limb);
      out.path(points, radii, 6, (band) => (band === 1 || band === 3 ? shade(horn, 1.1) : body), (k) => bones[k], { carry: true });
    }
  });

  if (isOf(sp, "spider")) {
    // The front body, with eyes and fangs; the great abdomen behind, marked on top.
    blob([0, y + 0.05, 0.3], forward, 1.5, 0.55, 0.38, (t) => (t > 0.75 ? [["pelvis", 0.4], ["head", 0.6]] : [["pelvis", 1]]), () => body);
    blob([0, y + 0.35, -1.45], [0, 0.15, 1], 2.1, 0.85 * build, 0.72 * build, [["abdomen", 1]], (band, angle) => (Math.abs(angle) > 2.3 && band % 2 === 0 ? mark : body), { widest: 0.45 });
    for (const [ex, ey, ez, r] of [[0.1, 0.32, 0.92, 0.07], [0.22, 0.28, 0.85, 0.05], [0.07, 0.38, 0.78, 0.04], [0.26, 0.3, 0.7, 0.035]]) {
      for (const x of [-1, 1]) out.gem([x * ex, y + ey - 0.1, ez + 0.05], r, c.eyes, [["head", 1]]);
    }
    for (const side of ["l", "r"]) {
      const x = side === "l" ? 1 : -1;
      const f = at(`fang_${side}`);
      out.path([add(f, [0, 0.05, -0.05]), add(f, [0, -0.2, 0.08]), add(f, [-x * 0.05, -0.42, 0.02])], [0.09, 0.06, 0.01], 5, (band) => (band ? horn : body), () => [[`fang_${side}`, 1]]);
    }
  }

  if (isOf(sp, "scorpion")) {
    // Head and back, flat and in plates, the tail curled up over it to a sting.
    blob([0, y + 0.05, 0.75], forward, 0.9, 0.48, 0.28, (t) => (t > 0.6 ? [["head", 1]] : [["pelvis", 1]]), () => body, { widest: 0.4 });
    const plates = [0.2, -0.2, -0.6, -1.0, -1.4, -1.75].map((zz, k) => ({ center: [0, y + 0.05, zz], dir: forward, rx: (0.58 - 0.06 * Math.max(0, k - 3)) * build, rz: 0.3 * build, bones: zz > -0.4 ? [["pelvis", 1]] : [["abdomen", 1]] }));
    out.tube([...plates].reverse(), 10, (band, angle) => (Math.abs(angle) > 1.8 && band % 2 ? shade(body, 0.7) : body));
    const tail = [...SCORPION_TAIL, "tail_end"].map(at);
    out.path([[0, y + 0.05, -1.6], ...tail], [0.3, 0.24, 0.22, 0.2, 0.18, 0.16, 0.2].map((r) => r * build), 8, (band) => (band % 2 ? shade(body, 0.75) : body), (k) => [[["abdomen", 1]], ...SCORPION_TAIL.map((n) => [[n, 1]]), [["tail_05", 1]]][k], { carry: true });
    const end = at("tail_end");
    out.path([add(end, [0, 0, -0.15]), add(end, [0, -0.05, 0.25]), add(end, [0, -0.3, 0.5]), add(end, [0, -0.55, 0.45])], [0.22, 0.2, 0.07, 0.01], 6, (band) => (band > 1 ? horn : mark), () => [["tail_05", 1]]);
    for (const x of [-1, 1]) out.gem([x * 0.12, y + 0.32, 0.95], 0.05, c.eyes, [["head", 1]]);
  }
  if (isOf(sp, "scorpion") || isOf(sp, "crab")) {
    // Pincers: an arm forward, then a swollen hand with a fixed finger and one that opens.
    const big = isOf(sp, "crab") ? 1.5 : 1;
    for (const side of ["l", "r"]) {
      const x = side === "l" ? 1 : -1;
      const n = (name) => at(`${name}_${side}`);
      const flipped = (bone) => [[`${bone}_${side}`, 1]];
      out.path([n("claw_01"), n("claw_02"), n("claw_03")], [0.14, 0.12, 0.13].map((r) => r * limb), 6, () => body, (k) => [flipped("claw_01"), [[`claw_01_${side}`, 0.5], [`claw_02_${side}`, 0.5]], flipped("claw_02")][k], { carry: true });
      const hand = n("claw_03");
      blob(add(hand, [0, 0, 0.25]), forward, 0.75 * big, 0.25 * limb * big, 0.17 * limb * big, flipped("claw_03"), () => body);
      out.path([add(hand, [-x * 0.08, 0, 0.5]), add(hand, [-x * 0.1, 0, 0.85]), add(hand, [-x * 0.02, 0, 1.05])], [0.09, 0.06, 0.01].map((r) => r * limb), 5, (band) => (band ? horn : body), () => flipped("claw_03"));
      const f = n("finger");
      out.path([add(f, [0, 0, -0.15]), add(f, [x * 0.02, 0, 0.15]), add(f, [-x * 0.1, 0, 0.32])], [0.09, 0.06, 0.01].map((r) => r * limb), 5, (band) => (band ? horn : body), () => flipped("finger"));
    }
  }

  if (isOf(sp, "crab")) {
    // A wide flat shell, paler beneath, eyes up on stalks at its front edge.
    blob([0, y + 0.1, -0.05], forward, 1.5, 1.05 * build, 0.42 * build, [["pelvis", 1]], (band, angle) => (Math.abs(angle) < 1.2 ? mark : band % 2 ? body : shade(body, 0.85)), { rings: 8 });
    for (const x of [-1, 1]) {
      out.path([[x * 0.18, y + 0.3, 0.6], [x * 0.22, y + 0.6, 0.68]], [0.05, 0.04], 5, () => body, () => [["head", 1]]);
      out.gem([x * 0.22, y + 0.66, 0.68], 0.08, c.eyes, [["head", 1]]);
    }
  }

  if (isOf(sp, "ant")) {
    // A head with jaws, feelers and great eyes; a narrow waist; a swollen abdomen, ending in a
    // sting on a wasp.
    blob([0, y + 0.05, 0.15], forward, 0.95, 0.3 * build, 0.28 * build, [["pelvis", 1]], () => body);
    out.path([[0, y + 0.02, -0.3], [0, y + 0.05, -0.5], [0, y + 0.1, -0.65]], [0.1, 0.07, 0.1].map((r) => r * build), 6, () => shade(body, 0.8), (k) => (k ? [["abdomen", 1]] : [["pelvis", 1]]));
    blob([0, y + 0.18, -1.3], [0, 0.18, 0.98], 1.5, 0.55 * build, 0.48 * build, [["abdomen", 1]], (band, angle) => (Math.abs(angle) > 1.2 && band % 2 ? mark : body), { widest: 0.45 });
    blob([0, y + 0.1, 0.95], forward, 0.65, 0.34, 0.3, [["head", 1]], () => body);
    for (const x of [-1, 1]) {
      out.gem([x * 0.27, y + 0.2, 1.0], 0.1, c.eyes, [["head", 1]]);
      out.path([[x * 0.1, y + 0.3, 1.15], [x * 0.25, y + 0.75, 1.35], [x * 0.35, y + 0.95, 1.75]], [0.03, 0.025, 0.01], 4, () => horn, () => [["head", 1]]);
    }
    for (const side of ["l", "r"]) {
      const x = side === "l" ? 1 : -1;
      const j = at(`jaw_${side}`);
      const k = sp.spines ? 1.6 : 1;
      out.path([add(j, [0, 0, -0.1]), add(j, [x * 0.12 * k, 0, 0.25 * k]), add(j, [-x * 0.14 * k, -0.02, 0.45 * k])], [0.07, 0.05, 0.01].map((r) => r * k), 5, () => horn, () => [[`jaw_${side}`, 1]]);
    }
    if (sp.spines) {
      // Spines along the back and up from the abdomen.
      for (const [z, h] of [[0.4, 0.45], [0.05, 0.55], [-1.0, 0.5], [-1.4, 0.6], [-1.8, 0.45]]) {
        const base = [0, y + (z < -0.5 ? 0.55 : 0.28), z];
        out.path([base, add(base, [0, h, -0.15])], [0.08, 0.005], 5, () => horn, () => [[z < -0.5 ? "abdomen" : "pelvis", 1]]);
      }
    }
    if (sp.hover) {
      // A sting at the tail, and two wings on each side, see-through veins drawn as faces both
      // ways.
      out.path([[0, y + 0.05, -2.0], [0, y - 0.05, -2.3]], [0.07, 0.005], 5, () => horn, () => [["abdomen", 1]]);
      const membrane = [0.82, 0.86, 0.9];
      for (const side of ["l", "r"]) {
        const x = side === "l" ? 1 : -1;
        const root = at(`wing_${side}`);
        for (const [len, back, wide] of [[1.9, -0.35, 0.42], [1.4, -0.75, 0.32]]) {
          const tip = add(root, [x * len, 0.25, back]);
          const front = add(lerp(root, tip, 0.5), [0, 0.02, wide * 0.6]);
          const rear = add(lerp(root, tip, 0.55), [0, -0.02, -wide]);
          for (const toward of [false, true]) {
            out.face([root, front, tip], membrane, [[`wing_${side}`, 1]], add(root, [0, 5, 0]), null, toward);
            out.face([root, tip, rear], membrane, [[`wing_${side}`, 1]], add(root, [0, 5, 0]), null, toward);
          }
        }
      }
    }
  }

  if (isOf(sp, "beetle")) {
    // A hard front plate and head with a horn and jaws; the shell over the back in two halves,
    // with the soft body under them.
    blob([0, y + 0.1, 0.55], forward, 0.85, 0.62 * build, 0.42 * build, [["pelvis", 1]], () => body);
    blob([0, y + 0.05, 1.15], forward, 0.6, 0.38, 0.3, [["head", 1]], () => body);
    blob([0, y - 0.05, -0.85], forward, 1.9, 0.72 * build, 0.45 * build, [["abdomen", 1]], () => shade(body, 0.6));
    for (const side of ["l", "r"]) {
      const x = side === "l" ? 1 : -1;
      const half = (band, angle) => (x > 0 ? angle < 0 : angle > 0);
      blob([0, y + 0.12, -0.85], forward, 2.0, 0.86 * build, 0.66 * build, [[`shell_${side}`, 1]], (band, angle) => (Math.abs(Math.abs(angle) - Math.PI) < 0.4 ? shade(mark, 0.75) : mark), { widest: 0.4, skip: (band, angle) => half(band, angle) || Math.abs(angle) < 0.6 });
      const j = at(`jaw_${side}`);
      out.path([add(j, [0, 0, -0.1]), add(j, [x * 0.1, 0, 0.2]), add(j, [-x * 0.12, -0.02, 0.38])], [0.07, 0.05, 0.01], 5, () => horn, () => [[`jaw_${side}`, 1]]);
      out.gem([x * 0.3, y + 0.15, 1.3], 0.06, c.eyes, [["head", 1]]);
    }
    out.path([[0, y + 0.2, 1.25], [0, y + 0.55, 1.55], [0, y + 1.05, 1.75], [0, y + 1.4, 1.6]], [0.15, 0.11, 0.06, 0.01], 6, () => horn, () => [["head", 1]], { carry: true });
  }

  // Scaled so the top of it is the look's height.
  const mesh = out.arrays();
  let top = 0;
  for (let i = 1; i < mesh.positions.length; i += 3) top = Math.max(top, mesh.positions[i]);
  const s = look.height / top;
  for (let i = 0; i < mesh.positions.length; i++) mesh.positions[i] *= s;
  return { ...mesh, bones: canonical.map((b) => ({ ...b, at: mul(b.at, s) })), scale: s };
}

const both = (name, [x, y, z]) => ({ [`${name}_l`]: [x, y, z], [`${name}_r`]: [x, -y, -z] });

// A leg's turn: swung forward by `swing`, its tip lifted by `lift`, on the leg pointing out at
// `angle` degrees on its side.
function legTurn(angle, side, swing, lift) {
  const [s, cos] = [Math.sin(angle * RAD), Math.cos(angle * RAD)];
  return side === "l" ? [-s * lift, -swing, cos * lift] : [-s * lift, swing, -cos * lift];
}

// Every leg at once: `pose(i, side)` gives [swing, lift, knee] for leg i.
function allLegs(sp, pose) {
  const bones = {};
  sp.legs.forEach(([angle], i) => {
    for (const side of ["l", "r"]) {
      const [swing, lift, knee = 0] = pose(i, side);
      bones[`leg_${i + 1}_01_${side}`] = legTurn(angle, side, swing, lift);
      bones[`leg_${i + 1}_02_${side}`] = legTurn(angle, side, 0, knee);
    }
  });
  return bones;
}

// Walking: legs in two sets, each leg of a set stepping together, the sets taking turns.
const gait = (sp, u, swing, lift) =>
  allLegs(sp, (i, side) => {
    const a = TAU * (u + 0.5 * ((i + (side === "l" ? 0 : 1)) % 2));
    return [swing * Math.sin(a), lift * Math.max(0, Math.cos(a)), -0.3 * lift * Math.max(0, Math.cos(a))];
  });

// The front legs raised and waving, the rest braced.
const raised = (sp, up, wave = 0) => allLegs(sp, (i) => (i === 0 ? [0.3 * up, 0.9 * up + wave, -0.4 * up] : i === 1 && sp.legs.length > 3 ? [0.1 * up, 0.35 * up, 0] : [0, -0.1 * up, 0]));

// How long each clip lasts, its pose at each moment, and its speed along the ground in the
// species' own feet a second.
function crawlerPoses(sp) {
  const stride = sp.reach;
  const tail = (lift, sway = 0) => (isOf(sp, "scorpion") ? Object.fromEntries(SCORPION_TAIL.map((n, i) => [n, [lift * (i ? 1 : 0.4), sway, 0]])) : {});
  const claws = (open, reach = 0) => (isOf(sp, "scorpion") || isOf(sp, "crab") ? { ...both("claw_01", [0, -0.3 * reach, 0.1 * reach]), ...both("claw_02", [0, 0.3 * reach, 0]), ...both("finger", [0, open, 0]) } : {});
  const fangs = (k) => (isOf(sp, "spider") ? both("fang", [k, 0, 0]) : isOf(sp, "beetle") || isOf(sp, "ant") ? both("jaw", [0, k, 0]) : {});
  const shell = (k) => (isOf(sp, "beetle") ? both("shell", [-0.3 * k, -0.4 * k, 0.9 * k]) : {});
  const clips = {
    Idle_Loop: [
      3,
      (t) => {
        const u = t / 3;
        const breathe = Math.sin(TAU * u);
        return { bones: { ...allLegs(sp, (i, side) => [0.04 * Math.sin(TAU * u + i + (side === "l" ? 0 : 2)), 0, 0]), abdomen: [0.04 * breathe, 0, 0], ...fangs(0.1 * Math.max(0, breathe)), ...claws(0.15 * Math.max(0, -breathe)), ...tail(0.05 * breathe, 0.1 * Math.sin(TAU * u * 0.5)) }, pelvis: [0, 0.03 * breathe, 0] };
      },
    ],
    Walk_Loop: [1.0, (t) => ({ bones: { ...gait(sp, t, 0.22, 0.3), ...tail(0, 0.08 * Math.sin(TAU * t)), ...claws(0, 0.2) }, pelvis: [0, 0.03 * Math.sin(TAU * t * 2), 0] }), 1.2 * stride],
    Run_Fwd_Loop: [0.5, (t) => ({ bones: { ...gait(sp, t / 0.5, 0.32, 0.4), ...tail(0.1, 0.1 * Math.sin(TAU * t * 2)), ...claws(0, 0.3), abdomen: [0.06, 0, 0] }, pelvis: [0, 0.05 * Math.sin(TAU * t * 4), 0] }), 3.5 * stride],
    // Up on its front, then down and in at what's ahead.
    Bite: [
      0.9,
      (t) => {
        const u = t / 0.9;
        const rear = hump(u, 0, 0.3, 0.32, 0.45);
        const strike = hump(u, 0.32, 0.45, 0.6, 1);
        const open = hump(u, 0.1, 0.3, 0.42, 0.5);
        return { bones: { ...raised(sp, 0.4 * rear), pelvis: [-0.25 * rear + 0.15 * strike, 0, 0], ...fangs(-0.5 * open + 0.4 * strike), ...claws(0.6 * open, rear + strike), ...tail(0.1 * rear) }, pelvis: [0, 0.1 * rear, 0.5 * strike] };
      },
    ],
    Rear: [
      2.2,
      (t) => {
        const u = t / 2.2;
        const up = hump(u, 0, 0.25, 0.75, 1);
        const wave = 0.25 * Math.sin(TAU * u * 3) * up;
        return { bones: { ...raised(sp, up, wave), pelvis: [-0.45 * up, 0, 0], abdomen: [0.2 * up, 0, 0], ...fangs(-0.4 * up), ...claws(0.5 * up + 0.2 * wave, 1.4 * up), ...tail(0.1 * up, 0.15 * Math.sin(TAU * u * 9) * up), ...shell(up) }, pelvis: [0, 0.25 * up, -0.2 * up] };
      },
    ],
    Hit: [
      0.5,
      (t) => {
        const q = hump(t / 0.5, 0, 0.2, 0.35, 1);
        return { bones: { ...allLegs(sp, () => [0, 0.2 * q, 0]), pelvis: [-0.2 * q, 0.15 * q, 0], abdomen: [0.15 * q, 0, 0], ...tail(-0.15 * q) }, pelvis: [0, 0.05 * q, -0.3 * q] };
      },
    ],
    // Over onto its back, the legs curling in.
    Death: [
      2.2,
      (t) => {
        const u = t / 2.2;
        const roll = ease(u / 0.5);
        const curl = ease((u - 0.3) / 0.6);
        const kick = hump(u, 0.1, 0.25, 0.45, 0.65) * Math.sin(TAU * u * 5);
        return { bones: { ...allLegs(sp, (i) => [0.2 * kick * (i % 2 ? 1 : -1), -0.6 * curl, -1.2 * curl]), pelvis: [0, 0, Math.PI * roll], abdomen: [-0.15 * curl, 0, 0], ...tail(-0.3 * curl), ...claws(0, -0.5 * curl), ...shell(0) }, pelvis: [0, 0.25 * roll * sp.y - 0.8 * curl * sp.y, 0] };
      },
    ],
  };
  if (isOf(sp, "spider")) {
    // Down low, then a leap at what's ahead, the front legs up to seize it.
    clips.Pounce = [
      1.4,
      (t) => {
        const u = t / 1.4;
        const crouch = hump(u, 0, 0.25, 0.3, 0.38) + hump(u, 0.7, 0.78, 0.82, 1) * 0.6;
        const air = hump(u, 0.3, 0.5, 0.55, 0.75);
        return { bones: { ...allLegs(sp, (i) => (i < 2 ? [0.4 * air, 0.7 * air, -0.5 * air] : [-0.3 * air, -0.2 * crouch, 0.4 * crouch])), pelvis: [-0.3 * air, 0, 0], ...fangs(-0.5 * air) }, pelvis: [0, -0.5 * crouch + 1.6 * air, 3.5 * ease((u - 0.3) / 0.45)] };
      },
    ];
    // The abdomen brought under and forward, spinning a web at what's ahead.
    clips.Web = [
      1.6,
      (t) => {
        const u = t / 1.6;
        const curl = hump(u, 0.1, 0.35, 0.7, 0.95);
        return { bones: { ...raised(sp, 0.5 * curl), pelvis: [-0.35 * curl, 0, 0], abdomen: [-1.0 * curl, 0, 0], ...allLegs(sp, (i) => (i === 3 ? [-0.4 * curl, 0.5 * curl, 0] : i === 0 ? [0.3 * curl, 0.9 * curl, -0.4 * curl] : [0, 0, 0])) }, pelvis: [0, 0.3 * curl, 0] };
      },
    ];
  }
  if (isOf(sp, "crab")) {
    // Both pincers raised high, then brought down together on what's ahead.
    clips.Crush = [
      1.3,
      (t) => {
        const u = t / 1.3;
        const up = hump(u, 0.05, 0.35, 0.45, 0.55);
        const down = hump(u, 0.45, 0.55, 0.7, 1);
        return { bones: { ...both("claw_01", [-1.0 * up + 0.4 * down, 0, 0]), ...both("claw_02", [-0.5 * up, 0, 0]), ...both("finger", [0, 0.6 * up, 0]), pelvis: [-0.2 * up + 0.15 * down, 0, 0] }, pelvis: [0, 0.1 * up, 0.3 * down] };
      },
    ];
  }
  if (isOf(sp, "ant")) {
    // Down low, then a lunge with the jaws wide, snapping shut.
    clips.Lunge = [
      1.1,
      (t) => {
        const u = t / 1.1;
        const crouch = hump(u, 0, 0.25, 0.3, 0.4);
        const go = hump(u, 0.3, 0.45, 0.6, 1);
        return { bones: { ...allLegs(sp, (i) => (i === 0 ? [0.4 * go, 0.4 * go, 0] : [-0.2 * go, -0.15 * crouch, 0.3 * crouch])), ...fangs(-0.6 * hump(u, 0.2, 0.35, 0.5, 0.55) + 0.3 * go), head: [0.15 * go, 0, 0] }, pelvis: [0, -0.2 * crouch, 1.2 * go] };
      },
    ];
    // The abdomen curled under and forward, spraying at what's ahead.
    clips.Spray = [
      1.4,
      (t) => {
        const u = t / 1.4;
        const curl = hump(u, 0.1, 0.35, 0.7, 0.95);
        return { bones: { abdomen: [-0.9 * curl, 0, 0], pelvis: [-0.25 * curl, 0, 0], ...raised(sp, 0.3 * curl) }, pelvis: [0, 0.15 * curl, 0] };
      },
    ];
  }
  if (sp.hover) {
    // Flying: tipped forward, legs trailing.
    const flying = (duration, tip) => (t) => ({ bones: { pelvis: [tip, 0, 0], ...allLegs(sp, () => [-0.3, 0, 0]) }, pelvis: [0, 0.08 * Math.sin((TAU * t) / duration), 0] });
    clips.Walk_Loop = [1, flying(1, 0.15), 6];
    clips.Run_Fwd_Loop = [0.6, flying(0.6, 0.3), 16];
    clips.Fly_Loop = [0.8, flying(0.8, 0.25), 12];
    // The abdomen swung under and forward, the sting driven at what's ahead.
    clips.Sting = [
      0.9,
      (t) => {
        const u = t / 0.9;
        const draw = hump(u, 0, 0.3, 0.35, 0.45);
        const stab = hump(u, 0.35, 0.5, 0.65, 1);
        return { bones: { abdomen: [0.3 * draw - 1.3 * stab, 0, 0], pelvis: [-0.2 * stab, 0, 0] }, pelvis: [0, 0.2 * draw - 0.2 * stab, 0.4 * stab] };
      },
    ];
    // Up, then a dive at what's ahead, sting first.
    clips.Dive = [
      1.4,
      (t) => {
        const u = t / 1.4;
        const up = hump(u, 0, 0.3, 0.4, 0.5);
        const dive = hump(u, 0.4, 0.55, 0.7, 1);
        return { bones: { pelvis: [0.7 * dive, 0, 0], abdomen: [-1.0 * dive, 0, 0] }, pelvis: [0, 1.2 * up - 1.2 * dive, 2 * dive] };
      },
    ];
    // Rising and hanging there, wings loud, abdomen pumping.
    clips.Buzz = [
      1.6,
      (t) => {
        const u = t / 1.6;
        const up = hump(u, 0, 0.25, 0.75, 1);
        return { bones: { abdomen: [0.3 * Math.sin(TAU * u * 6) * up, 0, 0], ...fangs(-0.4 * up) }, pelvis: [0, 0.6 * up, 0] };
      },
    ];
    // Falling out of the air onto its back.
    const fall = clips.Death[1];
    clips.Death = [2.2, (t) => ({ ...fall(t), pelvis: [0, -sp.y * 0.85 * ease(t / 0.8), 0] })];
  }
  if (isOf(sp, "scorpion") || isOf(sp, "crab")) {
    // Pincers out and snapping, the body pushed forward.
    clips.Pinch = [
      1,
      (t) => {
        const u = t / 1;
        const reach = hump(u, 0.05, 0.35, 0.6, 0.95);
        const open = hump(u, 0.05, 0.25, 0.4, 0.48);
        return { bones: { ...claws(0.7 * open, 1.2 * reach), pelvis: [0.1 * reach, 0, 0], ...tail(0.1 * reach) }, pelvis: [0, 0, 0.4 * reach] };
      },
    ];
  }
  if (isOf(sp, "scorpion")) {
    // The tail drawn back, then driven forward over the head, the sting at what's ahead.
    clips.Sting = [
      1.3,
      (t) => {
        const u = t / 1.3;
        const draw = hump(u, 0, 0.3, 0.35, 0.45);
        const stab = hump(u, 0.35, 0.5, 0.65, 1);
        const tailBones = Object.fromEntries(SCORPION_TAIL.map((n, i) => [n, [[-0.3, -0.1, 0, 0.2, 0.2][i] * draw + [0.9, 0.5, 0, -0.35, -0.4][i] * stab, 0, 0]]));
        return { bones: { ...tailBones, pelvis: [0.15 * stab, 0, 0], ...claws(0.3 * draw, 0.6 * draw) }, pelvis: [0, -0.1 * stab, 0.3 * stab] };
      },
    ];
  }
  if (isOf(sp, "beetle")) {
    // Head down, a rush forward, and the horn tossed up through what's ahead.
    clips.Charge = [
      1.5,
      (t) => {
        const u = t / 1.5;
        const low = hump(u, 0, 0.2, 0.55, 0.65);
        const rush = ease((u - 0.15) / 0.45);
        const toss = hump(u, 0.55, 0.65, 0.75, 1);
        return { bones: { ...gait(sp, u * 3, 0.35 * (1 - toss), 0.4 * (1 - toss)), pelvis: [0.15 * low - 0.4 * toss, 0, 0], head: [0.3 * low - 0.5 * toss, 0, 0], ...fangs(0.4 * toss) }, pelvis: [0, -0.15 * low + 0.2 * toss, 3 * rush] };
      },
    ];
  }
  return clips;
}

// A hovering crawler's wings beat through every clip, but still once it's dead.
const beating = (sp, name, pose) =>
  sp.hover
    ? (t) => {
        const q = pose(t);
        const beat = name === "Death" ? 0.6 * Math.max(0, 1 - t / 0.8) : 0.6;
        return { ...q, bones: { ...q.bones, ...both("wing", [0, 0, beat * Math.sin(TAU * t * 9)]) } };
      }
    : pose;

export function crawlerClips(mesh, look) {
  const sp = crawlerOf(look);
  const clips = Object.entries(crawlerPoses(sp)).map(([name, [duration, pose, speed]]) => sampled(mesh, name, duration, beating(sp, name, pose), speed));
  return new Map(clips.map((c) => [c.name, c]));
}

// The clip for each creature role (animations.js's ROLES), or null where it has none.
export function crawlerRoles(look) {
  const sp = crawlerOf(look);
  const base = { idle: "Idle_Loop", walk: "Walk_Loop", run: "Run_Fwd_Loop", fly: null, cast: null, shoot: null, breath: null, battleCry: "Rear", hit: "Hit", death: "Death" };
  if (isOf(sp, "spider")) return { ...base, attack: "Bite", bigAttack: "Pounce", cast: "Web" };
  if (isOf(sp, "scorpion")) return { ...base, attack: "Pinch", bigAttack: "Sting" };
  if (isOf(sp, "crab")) return { ...base, attack: "Pinch", bigAttack: "Crush" };
  if (sp.hover) return { ...base, fly: "Fly_Loop", attack: "Sting", bigAttack: "Dive", battleCry: "Buzz" };
  if (isOf(sp, "ant")) return { ...base, attack: "Bite", bigAttack: sp.spines ? "Lunge" : "Spray", cast: sp.spines ? null : "Spray" };
  return { ...base, attack: "Bite", bigAttack: "Charge" };
}
