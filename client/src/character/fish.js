import { MeshOut } from "./body.js";
import { TAU, add, ease, hex, hump, mirrored, mul, sampled, shade } from "./rig.js";

// Fish: a shark or a barracuda swims with its body, a ray with its wings. Each floats off the
// ground as if in water, a `mouth` bone at the front of its mouth.
//
// A look (recipe.js) gives its height (for a fish, its length nose to tail; for a ray, across its
// wings), build (thicker or thinner) and colors: skin the back, secondary the belly, hair the fins
// and markings, eyes.
//
// Shapes are in the species' own feet, scaled to the look's height. Each faces +z, its left
// toward +x.

// A fish 10ft long. rings: the body, nose to tail, as [z, half its width, half its height, how far
// its middle sits above the swimming line]; jaw: rows of the same, the jaw's; dorsal: fins on the
// back as [front, back, height, sweep back]; caudal: the tail fin's top tip, bottom tip and how
// deep the notch between them is, as [up, back]; pectoral: the side fins' tip, [out, down, back];
// bars: dark bars down the back.
export const FISH = {
  shark: {
    family: "fish",
    rings: [[5.0, 0.08, 0.06, -0.1], [4.5, 0.38, 0.3, -0.02], [3.6, 0.66, 0.58, 0], [2.9, 0.78, 0.72, 0], [2.6, 0.8, 0.75, 0], [2.3, 0.82, 0.78, 0], [1.0, 0.85, 0.82, 0], [-1.0, 0.7, 0.66, 0], [-2.5, 0.45, 0.45, 0.02], [-3.6, 0.22, 0.28, 0.05], [-4.3, 0.12, 0.2, 0.08]],
    jaw: [[3.1, 0.5, 0.12, -0.5], [3.8, 0.38, 0.1, -0.42], [4.3, 0.18, 0.06, -0.33]],
    dorsal: [[1.0, -0.7, 1.3, 1.1], [-3.0, -3.5, 0.45, 0.35]],
    caudal: [[1.9, 1.5], [-1.0, 1.0], 0.5],
    pectoral: [1.6, 0.7, 1.2],
    gills: true,
    bars: false,
  },
  barracuda: {
    family: "fish",
    rings: [[5.2, 0.04, 0.04, 0.02], [4.4, 0.18, 0.2, 0.02], [3.2, 0.36, 0.46, 0], [1.0, 0.44, 0.6, 0], [-1.0, 0.42, 0.56, 0], [-3.0, 0.24, 0.32, 0], [-4.0, 0.12, 0.18, 0], [-4.3, 0.08, 0.13, 0]],
    jaw: [[3.0, 0.3, 0.12, -0.3], [4.4, 0.16, 0.08, -0.2], [5.4, 0.05, 0.04, -0.1]],
    dorsal: [[1.4, 0.4, 0.6, 0.4], [-2.2, -2.9, 0.5, 0.3]],
    caudal: [[1.2, 1.2], [-1.2, 1.2], 0.7],
    pectoral: [0.6, 0.25, 0.6],
    gills: false,
    bars: true,
  },
  // A ray 6ft across, its tail a little longer than that behind it.
  stingray: { family: "ray" },
};
export const fishOf = (look) => FISH[look.body] ?? FISH.shark;

// The fish's swimming line, above the ground.
const SWIM = 2.2;
const RAY_SWIM = 1.6;

const BACK = ["pelvis", "spine_01", "tail_01", "tail_02", "tail_03", "tail_end"];
const RAY_TAIL = ["tail_01", "tail_02", "tail_03", "tail_end"];

// The skeleton for a species, in its own feet: [name, parent, at].
function joints(sp) {
  if (sp.family === "ray") {
    const y = RAY_SWIM;
    return [
      ["root", null, [0, 0, 0]],
      ["pelvis", "root", [0, y, 0]],
      ["head", "pelvis", [0, y, 1.0]],
      ["mouth", "head", [0, y - 0.1, 1.3]],
      ["wing_01_l", "pelvis", [0.9, y, 0]],
      ["wing_02_l", "wing_01_l", [2.0, y, -0.15]],
      ["tail_01", "pelvis", [0, y, -1.5]],
      ["tail_02", "tail_01", [0, y, -3.0]],
      ["tail_03", "tail_02", [0, y, -4.5]],
      ["tail_end", "tail_03", [0, y, -6.2]],
    ];
  }
  const y = SWIM;
  return [
    ["root", null, [0, 0, 0]],
    ["pelvis", "root", [0, y, 1.0]],
    ["head", "pelvis", [0, y, 2.6]],
    ["jaw", "head", [0, y - 0.35, 3.0]],
    ["mouth", "head", [0, y - 0.3, 4.4]],
    ["fin_l", "pelvis", [0.55, y - 0.45, 1.3]],
    ["spine_01", "pelvis", [0, y, -0.6]],
    ["tail_01", "spine_01", [0, y, -2.0]],
    ["tail_02", "tail_01", [0, y, -3.2]],
    ["tail_03", "tail_02", [0, y, -4.2]],
    ["tail_end", "tail_03", [0, y + 0.08, -4.7]],
  ];
}

// A fish's length, or a ray's span, in its own feet.
const sizeOf = (sp) => (sp.family === "ray" ? 6 : 10);

export function fishSkeleton(look) {
  const sp = fishOf(look);
  return mirrored(joints(sp), look.height / sizeOf(sp));
}

// Mesh data for a look, as body.js's bodyMesh gives it, and the scale its clips move the pelvis by.
export function fishMesh(look) {
  const sp = fishOf(look);
  const s = look.height / sizeOf(sp);
  const canonical = mirrored(joints(sp), 1);
  const index = new Map(canonical.map((b, i) => [b.name, i]));
  const at = (name) => canonical[index.get(name)].at;
  const build = 0.8 + 0.4 * look.build;
  const c = Object.fromEntries(Object.entries(look.colors).map(([key, v]) => [key, hex(v)]));
  const out = new MeshOut(index);
  // A flat fin, both faces drawn, its corners each on their own bones.
  const fin = (corners, color, side) => {
    for (let i = 1; i < corners.length - 1; i++) {
      const tri = [corners[0], corners[i], corners[i + 1]];
      const inside = add(tri[0][0], side);
      for (const toward of [false, true]) out.face(tri.map(([p]) => p), color, tri[0][1], inside, tri.map(([, b]) => b), toward);
    }
  };
  if (sp.family === "ray") rayBody(sp, out, at, build, c, fin);
  else fishBody(sp, out, at, build, c, fin);
  const mesh = out.arrays();
  for (let i = 0; i < mesh.positions.length; i++) mesh.positions[i] *= s;
  return { ...mesh, bones: canonical.map((b) => ({ ...b, at: mul(b.at, s) })), scale: s };
}

function fishBody(sp, out, at, build, c, fin) {
  const [back, belly, fins, dark] = [c.skin, c.secondary, c.hair, [0.06, 0.06, 0.07]];
  const z = (name) => at(name)[2];
  // The bones a point along the body follows: half and half at a joint, the bone in front of it
  // alone halfway along.
  const chain = BACK.map((n) => [n, z(n)]);
  const bonesAt = (zz) => {
    const [head, pelvis] = [z("head"), z("pelvis")];
    if (zz >= head) {
      const k = Math.min(1, (zz - head) / 0.8);
      return [["head", 0.5 + 0.5 * k], ["pelvis", 0.5 - 0.5 * k]];
    }
    if (zz >= pelvis) {
      const t = (zz - pelvis) / (head - pelvis);
      return t < 0.5 ? [["pelvis", 1]] : [["pelvis", 1.5 - t], ["head", t - 0.5]];
    }
    const i = Math.max(0, chain.findIndex(([, jz], j) => jz >= zz && zz > (chain[j + 1]?.[1] ?? -Infinity)));
    const [[a, za], [b, zb]] = [chain[i], chain[Math.min(i + 1, chain.length - 1)]];
    const t = zb === za ? 0 : (za - zz) / (za - zb);
    if (t < 0.5) return i ? [[chain[i - 1][0], 0.5 - t], [a, 0.5 + t]] : [[a, 1]];
    return [[a, 1.5 - t], [b, t - 0.5]];
  };
  const y = SWIM;
  // Tail to nose, so a ring's angle 0 is underneath.
  const rings = [...sp.rings].reverse().map(([zz, rx, rz, dy]) => ({ center: [0, y + dy, zz], dir: [0, 0, 1], rx: rx * build, rz: rz * build, bones: bonesAt(zz) }));
  const barred = (i) => sp.bars && i % 2 === 1 && rings[i].center[2] < 3;
  out.tube(rings, 12, (i, angle) => {
    const a = Math.abs(angle);
    if (a < 1.3) return belly;
    return barred(i) && a > 1.9 ? shade(back, 0.55) : back;
  });
  const jaw = sp.jaw.map(([zz, rx, rz, dy]) => ({ center: [0, y + dy, zz], dir: [0, 0, 1], rx: rx * build, rz: rz * build, bones: [["jaw", 1]] }));
  out.tube(jaw, 8, (i, angle) => (Math.abs(angle) < 1.6 ? belly : shade(belly, 0.8)));
  // Teeth: down from under the snout, up from the jaw.
  const tooth = [0.95, 0.93, 0.88];
  const [jawFrom, jawTo] = [sp.jaw[0], sp.jaw[sp.jaw.length - 1]];
  for (let k = 0; k <= 4; k++) {
    const t = 0.15 + 0.17 * k;
    const [zz, half, dy] = [0, 1, 3].map((n) => jawFrom[n] + (jawTo[n] - jawFrom[n]) * t);
    for (const x of [-half * build * 0.8, half * build * 0.8]) {
      out.path([[x, y + dy + 0.12, zz], [x, y + dy - 0.06, zz + 0.03]], [0.05, 0.004], 4, () => tooth, () => [["head", 1]]);
      out.path([[x * 0.9, y + dy + 0.02, zz + 0.08], [x * 0.9, y + dy + 0.18, zz + 0.1]], [0.04, 0.004], 4, () => tooth, () => [["jaw", 1]]);
    }
  }
  // Gill slits, a row of dark lines down each side behind the head.
  if (sp.gills) {
    for (const x of [-1, 1]) {
      for (const zz of [2.25, 2.45, 2.65, 2.85]) out.path([[x * 0.8 * build, y - 0.32, zz], [x * 0.82 * build, y + 0.22, zz + 0.04]], [0.035, 0.035], 4, () => dark, () => bonesAt(zz));
    }
  }
  const front = sp.rings.find(([zz]) => zz < 4.2) ?? sp.rings[2];
  for (const x of [-1, 1]) {
    const eye = [x * front[1] * build * 0.92, y + 0.12, front[0] + 0.15];
    out.gem(eye, 0.09, c.eyes, [["head", 1]]);
  }
  // Fins on the back, each a triangle swept back.
  for (const [from, to, tall, sweep] of sp.dorsal) {
    const topAt = (zz) => y + (sp.rings.find(([rz]) => rz <= zz)?.[2] ?? 0.2) * build - 0.05;
    fin(
      [
        [[0, topAt(from), from], bonesAt(from)],
        [[0, topAt(from) + tall, to - sweep * 0.2], bonesAt(to)],
        [[0, topAt(to), to], bonesAt(to)],
      ],
      fins,
      [1, 0, 0],
    );
  }
  // The tail fin, on the tail's last bone.
  const root = at("tail_end");
  const [[upY, upZ], [downY, downZ], notch] = sp.caudal;
  const tail = [["tail_end", 1]];
  fin(
    [
      [add(root, [0, 0, 0.3]), [["tail_03", 1]]],
      [add(root, [0, 0.22, 0.1]), [["tail_03", 0.5], ["tail_end", 0.5]]],
      [add(root, [0, upY, -upZ]), tail],
      [add(root, [0, (upY + downY) * 0.1, -notch]), tail],
      [add(root, [0, downY, -downZ]), tail],
      [add(root, [0, -0.2, 0.1]), [["tail_03", 0.5], ["tail_end", 0.5]]],
    ],
    fins,
    [1, 0, 0],
  );
  // Side fins, out and down from under the chest.
  const [out_, down, back_] = sp.pectoral;
  for (const side of ["l", "r"]) {
    const x = side === "l" ? 1 : -1;
    const base = at(`fin_${side}`);
    const bone = [[`fin_${side}`, 1]];
    fin([[add(base, [0, 0, 0.35]), bone], [add(base, [x * out_, -down, -back_]), bone], [add(base, [0, -0.02, -0.45]), bone]], fins, [0, 1, 0]);
  }
  // Small fins under the tail.
  for (const x of [-1, 1]) fin([[[x * 0.2, y - 0.4, -2.2], bonesAt(-2.2)], [[x * 0.55, y - 0.75, -2.9], bonesAt(-2.6)], [[x * 0.15, y - 0.3, -2.8], bonesAt(-2.8)]], fins, [0, 1, 0]);
}

// A ray: a flat disk, raised in the middle, wide wings each side, and a long thin tail with a
// barb on it.
function rayBody(sp, out, at, build, c, fin) {
  const [back, belly, mark] = [c.skin, c.secondary, c.hair];
  const y = RAY_SWIM;
  // The left edge, nose round to the back, in [x, z]; the right mirrors it.
  const edge = [[0, 1.6], [0.8, 1.3], [1.8, 0.75], [2.6, 0.15], [3.0, -0.3], [2.5, -0.75], [1.5, -1.15], [0.6, -1.45], [0, -1.55]];
  const outline = [...edge, ...edge.slice(1, -1).reverse().map(([x, z]) => [-x, z])];
  const bonesAt = ([x]) => {
    const side = x >= 0 ? "l" : "r";
    const a = Math.abs(x);
    if (a < 0.6) return [["pelvis", 1]];
    if (a < 1.2) return [["pelvis", (1.2 - a) / 0.6], [`wing_01_${side}`, (a - 0.6) / 0.6]];
    if (a < 1.8) return [[`wing_01_${side}`, 1]];
    if (a < 2.3) return [[`wing_01_${side}`, (2.3 - a) / 0.5], [`wing_02_${side}`, (a - 1.8) / 0.5]];
    return [[`wing_02_${side}`, 1]];
  };
  const thick = 0.32 * build;
  const layer = (ring, k, up) => ring.map(([x, z]) => [[x * k, y + up, z * k], bonesAt([x * k])]);
  for (const [up, color] of [
    [1, back],
    [-1, belly],
  ]) {
    const rim = layer(outline, 1, 0);
    const mid = layer(outline, 0.5, up * thick * 0.75);
    const top = [[0, y + up * thick, 0], [["pelvis", 1]]];
    const inside = [0, y - up * 2, 0];
    const n = outline.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      out.face([rim[i][0], rim[j][0], mid[j][0]], color, rim[i][1], inside, [rim[i][1], rim[j][1], mid[j][1]]);
      out.face([rim[i][0], mid[j][0], mid[i][0]], color, rim[i][1], inside, [rim[i][1], mid[j][1], mid[i][1]]);
      out.face([mid[i][0], mid[j][0], top[0]], color, mid[i][1], inside, [mid[i][1], mid[j][1], top[1]]);
    }
  }
  // Eyes up on top toward the front.
  for (const x of [-1, 1]) out.gem([x * 0.35, y + thick * 0.85, 0.75], 0.09, c.eyes, [["head", 1]]);
  // The tail, thin and long, a barb partway down it.
  const names = ["pelvis", ...RAY_TAIL];
  const points = [[0, y, -1.2], ...RAY_TAIL.map((n) => at(n))];
  out.path(points, [0.22, 0.14, 0.09, 0.05, 0.015].map((r) => r * build), 6, () => shade(back, 0.85), (i) => [[names[Math.max(0, i - 1)], 0.5], [names[i], 0.5]], { carry: true });
  const barb = at("tail_02");
  out.path([add(barb, [0, 0.08, 0.3]), add(barb, [0, 0.14, -0.5]), add(barb, [0, 0.18, -0.9])], [0.06, 0.04, 0.005], 5, () => mark, () => [["tail_02", 1]]);
}

const both = (name, [x, y, z]) => ({ [`${name}_l`]: [x, y, z], [`${name}_r`]: [x, -y, -z] });

// The body bent side to side in a wave running back to the tail, at phase u.
function swim(u, amount) {
  const wave = (k, lag) => amount * k * Math.sin(TAU * u - lag);
  return { head: [0, -wave(0.25, 0), 0], pelvis: [0, wave(0.1, 0), 0], spine_01: [0, wave(0.3, 0.6), 0], tail_01: [0, wave(0.5, 1.2), 0], tail_02: [0, wave(0.7, 1.8), 0], tail_03: [0, wave(0.8, 2.4), 0], tail_end: [0, wave(0.6, 3.0), 0] };
}
const scull = (u, amount, rest = 0) => both("fin", [0, 0, rest + amount * Math.sin(TAU * u)]);

// The wings rippling: each part beating up and down, the outer a little after the inner.
function beat(u, amount, lag = 0.8) {
  return { ...both("wing_01", [0, 0, amount * Math.sin(TAU * u)]), ...both("wing_02", [0, 0, 1.3 * amount * Math.sin(TAU * u - lag)]) };
}
const tailSway = (u, amount, lift = 0) => Object.fromEntries(RAY_TAIL.map((n, i) => [n, [lift * (i ? 1 : 0.5), amount * Math.sin(TAU * u - 0.8 * i), 0]]));

// How long each clip lasts, its pose at each moment, and its speed along the ground in the
// species' own feet a second.
function fishPoses(sp) {
  const barracuda = sp === FISH.barracuda;
  return {
    Idle_Loop: [
      3,
      (t) => {
        const u = t / 3;
        return { bones: { ...swim(u, 0.12), ...scull(u * 2, 0.12) }, pelvis: [0, 0.08 * Math.sin(TAU * u), 0] };
      },
    ],
    Swim_Loop: [
      1.2,
      (t) => {
        const u = t / 1.2;
        return { bones: { ...swim(u, 0.3), ...scull(u, 0.08, 0.1) }, pelvis: [0, 0.05 * Math.sin(TAU * u * 2), 0] };
      },
      8,
    ],
    Swim_Fast_Loop: [
      0.6,
      (t) => {
        const u = t / 0.6;
        return { bones: { ...swim(u, 0.42), ...scull(u, 0.05, 0.25) } };
      },
      20,
    ],
    // Snout up, jaw wide, thrown forward, then shut.
    Bite: [
      1,
      (t) => {
        const u = t / 1;
        const lunge = hump(u, 0.2, 0.45, 0.55, 0.95);
        const open = hump(u, 0.1, 0.35, 0.48, 0.55);
        return { bones: { ...swim(u, 0.15), head: [-0.25 * open, 0, 0], jaw: [0.7 * open, 0, 0], ...scull(0, 0, 0.3 * lunge) }, pelvis: [0, 0, 1.6 * lunge] };
      },
    ],
    ...(barracuda
      ? {
          // Drawn back into an S, then shot forward its own length, jaw open, and snapped shut.
          Dart: [
            1.2,
            (t) => {
              const u = t / 1.2;
              const coil = hump(u, 0, 0.3, 0.35, 0.45);
              const shoot = hump(u, 0.35, 0.5, 0.65, 1);
              const open = hump(u, 0.3, 0.42, 0.55, 0.6);
              const s = { spine_01: [0, -0.3 * coil, 0], tail_01: [0, 0.5 * coil, 0], tail_02: [0, 0.6 * coil, 0], tail_03: [0, -0.4 * coil, 0] };
              return { bones: { ...s, head: [-0.15 * open, 0, 0], jaw: [0.8 * open, 0, 0], ...scull(0, 0, 0.4 * shoot) }, pelvis: [0, 0, -0.8 * coil + 6 * shoot] };
            },
          ],
        }
      : {
          // A bite, then a shake: the body thrown side to side, rolling, the jaw shut on it.
          Thrash: [
            1.8,
            (t) => {
              const u = t / 1.8;
              const bite = hump(u, 0, 0.15, 0.85, 1);
              const open = hump(u, 0.02, 0.12, 0.18, 0.22);
              const shake = hump(u, 0.2, 0.3, 0.75, 0.85) * Math.sin(TAU * u * 5);
              return { bones: { ...swim(u * 5, 0.35 * Math.abs(shake)), pelvis: [0, 0.35 * shake, 0.3 * shake], head: [-0.25 * bite, -0.2 * shake, 0], jaw: [0.7 * open + 0.1 * bite, 0, 0], ...scull(u * 5, 0.2 * bite) }, pelvis: [0, 0, 1.2 * bite] };
            },
          ],
        }),
    // Jaws gaping, the body bent hard one way and the other, rolling half onto its side.
    Frenzy: [
      2,
      (t) => {
        const u = t / 2;
        const up = hump(u, 0, 0.15, 0.8, 1);
        const lash = Math.sin(TAU * u * 4) * up;
        return { bones: { ...swim(u * 4, 0.4 * up), pelvis: [0, 0.2 * lash, 0.6 * up], head: [-0.3 * up, -0.3 * lash, 0], jaw: [0.6 * up + 0.2 * lash * lash, 0, 0], ...scull(u * 4, 0.3 * up, 0.3 * up) }, pelvis: [0, 0.3 * up, 0] };
      },
    ],
    Hit: [
      0.5,
      (t) => {
        const q = hump(t / 0.5, 0, 0.2, 0.35, 1);
        return { bones: { pelvis: [0, 0.3 * q, 0.3 * q], head: [0, 0.2 * q, 0], tail_01: [0, -0.3 * q, 0], tail_02: [0, -0.2 * q, 0], jaw: [0.3 * q, 0, 0] }, pelvis: [0, 0, -0.6 * q] };
      },
    ],
    // Over onto its back, the tail and fins going still, and sinking to the ground.
    Death: [
      2.6,
      (t) => {
        const u = t / 2.6;
        const roll = ease(u / 0.5);
        const sink = ease((u - 0.3) / 0.7);
        const twitch = hump(u, 0, 0.1, 0.25, 0.4) * Math.sin(TAU * u * 6);
        return { bones: { ...swim(u * 6, 0.3 * twitch), pelvis: [0.1 * sink, 0.2 * twitch, Math.PI * roll], jaw: [0.35 * roll, 0, 0], ...scull(0, 0, -0.4 * roll) }, pelvis: [0, -(SWIM - 0.75) * sink, 0] };
      },
    ],
  };
}

function rayPoses() {
  return {
    Idle_Loop: [
      3,
      (t) => {
        const u = t / 3;
        return { bones: { ...beat(u * 2, 0.08), ...tailSway(u, 0.1) }, pelvis: [0, 0.06 * Math.sin(TAU * u), 0] };
      },
    ],
    Swim_Loop: [
      1.4,
      (t) => {
        const u = t / 1.4;
        return { bones: { ...beat(u, 0.35), ...tailSway(u, 0.12) }, pelvis: [0, -0.12 * Math.sin(TAU * u), 0] };
      },
      6,
    ],
    Swim_Fast_Loop: [
      0.8,
      (t) => {
        const u = t / 0.8;
        return { bones: { ...beat(u, 0.5), ...tailSway(u, 0.08), pelvis: [0.08, 0, 0] }, pelvis: [0, -0.18 * Math.sin(TAU * u), 0] };
      },
      14,
    ],
    // The tail brought up over the back and stabbed down ahead, the front tipped down to it.
    Sting: [
      1.2,
      (t) => {
        const u = t / 1.2;
        const raise = hump(u, 0, 0.35, 0.45, 0.6);
        const stab = hump(u, 0.4, 0.55, 0.65, 1);
        const tail = Object.fromEntries(RAY_TAIL.map((n, i) => [n, [(0.5 * raise + 0.9 * stab) * (i ? 1 : 0.6), 0, 0]]));
        return { bones: { ...tail, ...beat(u, 0.1 + 0.15 * raise), pelvis: [0.25 * stab, 0, 0] }, pelvis: [0, 0.2 * raise, 0.6 * stab] };
      },
    ],
    // Up high, the wings raised, then down on top of what's ahead, wings wrapping round it.
    Smother: [
      1.6,
      (t) => {
        const u = t / 1.6;
        const rise = hump(u, 0, 0.35, 0.4, 0.55);
        const slam = hump(u, 0.4, 0.55, 0.75, 1);
        return { bones: { ...both("wing_01", [0, 0, 0.45 * rise - 0.5 * slam]), ...both("wing_02", [0, 0, 0.35 * rise - 0.6 * slam]), ...tailSway(u, 0.15), pelvis: [-0.25 * rise + 0.2 * slam, 0, 0] }, pelvis: [0, 1.6 * rise - 0.6 * slam, 1.5 * slam] };
      },
    ],
    // The front up, the wings beating hard and wide, the tail lashing.
    Flare: [
      2,
      (t) => {
        const u = t / 2;
        const up = hump(u, 0, 0.2, 0.8, 1);
        return { bones: { ...beat(u * 3, 0.5 * up, 1.2), ...tailSway(u * 3, 0.4 * up, 0.3 * up), pelvis: [-0.5 * up, 0, 0] }, pelvis: [0, 0.6 * up, 0] };
      },
    ],
    Hit: [
      0.5,
      (t) => {
        const q = hump(t / 0.5, 0, 0.2, 0.35, 1);
        return { bones: { pelvis: [-0.2 * q, 0, 0.3 * q], ...beat(0.25, 0.3 * q), ...tailSway(0.25, 0.3 * q) }, pelvis: [0, 0.1 * q, -0.4 * q] };
      },
    ],
    // Over onto its back, the wings curling, sinking to the ground.
    Death: [
      2.6,
      (t) => {
        const u = t / 2.6;
        const roll = ease(u / 0.5);
        const sink = ease((u - 0.3) / 0.7);
        return { bones: { pelvis: [0, 0, Math.PI * roll], ...both("wing_01", [0, 0, 0.25 * roll]), ...both("wing_02", [0, 0, 0.3 * roll]), ...tailSway(0.3, 0.3 * roll) }, pelvis: [0, -(RAY_SWIM - 0.35) * sink, 0] };
      },
    ],
  };
}

export function fishClips(mesh, look) {
  const sp = fishOf(look);
  const poses = sp.family === "ray" ? rayPoses() : fishPoses(sp);
  const clips = Object.entries(poses).map(([name, [duration, pose, speed]]) => sampled(mesh, name, duration, pose, speed));
  return new Map(clips.map((c) => [c.name, c]));
}

// The clip for each creature role (animations.js's ROLES), or null where it has none.
export function fishRoles(look) {
  const sp = fishOf(look);
  const swims = { idle: "Idle_Loop", walk: "Swim_Loop", run: "Swim_Fast_Loop", fly: null, cast: null, shoot: null, breath: null, hit: "Hit", death: "Death" };
  if (sp.family === "ray") return { ...swims, attack: "Sting", bigAttack: "Smother", battleCry: "Flare" };
  return { ...swims, attack: "Bite", bigAttack: sp === FISH.barracuda ? "Dart" : "Thrash", battleCry: "Frenzy" };
}
