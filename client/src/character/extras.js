// What some humanoid bodies carry besides arms and legs (body.js): a tail and wings, each on bones
// of its own, and the clips' sway for them, since the baked clips don't move them.
//
// Positions are a 6ft body's feet, as body.js's JOINTS: feet on y = 0, facing +z, left toward +x.

// Tails, each its points from the base of the back down to the tip and its thickness at each:
// a bone runs from each point but the last.
export const TAILS = {
  // Thick at the base and down to the ground, as a lizard's.
  reptile: { points: [[0, 3.05, -0.32], [0, 2.55, -0.75], [0, 1.85, -1.2], [0, 1.0, -1.65], [0, 0.35, -2.1], [0, 0.12, -2.55]], radii: [0.24, 0.2, 0.15, 0.1, 0.05, 0.01] },
  // A long thin whip, ending in a barb.
  thin: { points: [[0, 3.05, -0.3], [0, 2.6, -0.6], [0, 2.0, -0.85], [0, 1.4, -0.95], [0, 0.95, -0.85]], radii: [0.06, 0.045, 0.035, 0.03, 0.025], barb: true },
  // A cord with a tuft of hair at the end, as a bull's.
  tuft: { points: [[0, 3.15, -0.35], [0, 2.75, -0.55], [0, 2.1, -0.6], [0, 1.45, -0.55]], radii: [0.08, 0.05, 0.04, 0.035], tuft: true },
  // Short and bushy, as a hyena's.
  bushy: { points: [[0, 3.2, -0.35], [0, 2.85, -0.6], [0, 2.4, -0.7], [0, 2.0, -0.7]], radii: [0.08, 0.12, 0.11, 0.02], hairy: true },
};
export const TAIL_KINDS = ["none", ...Object.keys(TAILS)];
export const WING_KINDS = ["none", "bat", "feather"];

// Each wing: the shoulder on the upper back, the elbow up and out, the wrist out past it, the
// wing resting half open behind; bat wings have three fingers from the wrist, with skin between
// them and back to the waist.
const WING = { shoulder: [0.3, 4.55, -0.32], elbow: [1.35, 5.45, -0.85], wrist: [2.45, 5.0, -0.75] };
const FINGERS = [
  [1.5, -0.35, -0.6],
  [0.9, -1.3, -0.85],
  [-0.2, -1.8, -0.75],
];

// The extra joints a look's tail and wings need: [name, parent, at], bones ending in _l mirrored by
// the caller.
export function extraJoints(look) {
  const joints = [];
  const tail = TAILS[look.tail];
  if (tail) tail.points.slice(0, -1).forEach((at, i) => joints.push([`tail_0${i + 1}`, i ? `tail_0${i}` : "pelvis", at]));
  if (WING_KINDS.includes(look.wings) && look.wings !== "none") {
    joints.push(["wing_01_l", "spine_03", WING.shoulder], ["wing_02_l", "wing_01_l", WING.elbow], ["wing_03_l", "wing_02_l", WING.wrist]);
  }
  return joints;
}

const add = (a, b) => a.map((v, i) => v + b[i]);
const mul = (a, k) => a.map((v) => v * k);
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const shade = (rgb, f) => rgb.map((v) => Math.min(1, v * f));

// Builds the tail and wings onto `out` (body.js's MeshOut): `at(name)` is a bone's place, `s` the
// body's scale and `c` the look's colors as numbers.
export function buildExtras(out, look, at, s, c, trunk) {
  const tail = TAILS[look.tail];
  if (tail) {
    const names = tail.points.slice(0, -1).map((_, i) => `tail_0${i + 1}`);
    const points = [...names.map(at), mul(tail.points.at(-1), s)];
    const bones = (i) => [[names[Math.min(i, names.length - 1)], 1]];
    const thick = look.tail === "reptile" ? trunk : s;
    const color = (band) => (tail.hairy ? c.hair : look.tail === "reptile" && band > 3 ? shade(c.skin, 0.85) : c.skin);
    out.path(points, tail.radii.map((r) => r * thick), 8, color, bones, { carry: true });
    const end = points.at(-1);
    if (tail.tuft) out.path([end, add(end, [0, -0.12 * s, 0]), add(end, [0, -0.35 * s, 0.02 * s])], [0.06, 0.09, 0.01].map((r) => r * s), 6, () => c.hair, () => bones(names.length));
    if (tail.barb) {
      const way = lerp(points.at(-2), end, 1.6);
      out.path([end, lerp(end, way, 0.4), way], [0.03, 0.09, 0.005].map((r) => r * s), 4, () => c.skin, () => bones(names.length), { depth: [0.02, 0.02, 0.005].map((r) => r * s) });
    }
  }
  if (look.wings === "bat") batWings(out, at, s, c);
  if (look.wings === "feather") featherWings(out, at, s, c);
}

const ww = (side, n) => [[`wing_0${n}_${side}`, 1]];

// Bat wings: the arm, three fingers and skin between them, both faces drawn.
function batWings(out, at, s, c) {
  const membrane = shade(c.skin, 0.7);
  for (const side of ["l", "r"]) {
    const x = side === "l" ? 1 : -1;
    const [S, E, W] = [1, 2, 3].map((n) => at(`wing_0${n}_${side}`));
    const tips = FINGERS.map(([fx, fy, fz]) => add(W, mul([x * fx, fy, fz], s)));
    const waist = [x * 0.35 * s, 3.55 * s, -0.25 * s];
    out.path([S, E, W], [0.09, 0.07, 0.045].map((r) => r * s), 6, () => c.skin, (i) => ww(side, i + 1), { carry: true });
    for (const f of tips) out.path([W, f], [0.03 * s, 0.005 * s], 4, () => shade(c.skin, 0.8), () => ww(side, 3));
    // Each edge between tips sags in toward the wrist.
    const edge = [...tips, waist];
    const corners = [[W, ww(side, 3)]];
    edge.forEach((p, i) => {
      corners.push([p, i < 3 ? ww(side, 3) : [["spine_01", 1]]]);
      const next = edge[i + 1];
      if (next) corners.push([lerp(lerp(p, next, 0.5), i < 2 ? W : E, 0.25), i < 2 ? ww(side, 3) : ww(side, 2)]);
    });
    const panel = (a, b, d) => {
      for (const toward of [false, true]) out.face([a[0], b[0], d[0]], membrane, a[1], add(W, [0, 0, 5 * s]), [a[1], b[1], d[1]], toward);
    };
    for (let i = 1; i < corners.length - 1; i++) panel(corners[0], corners[i], corners[i + 1]);
    panel([W, ww(side, 3)], [waist, [["spine_01", 1]]], [E, ww(side, 2)]);
    panel([E, ww(side, 2)], [waist, [["spine_01", 1]]], [S, ww(side, 1)]);
  }
}

// Feathered wings: the arm, with long flight feathers fanning back from the wrist and forearm and
// shorter coverts along the arm, each a flat blade, both faces drawn.
function featherWings(out, at, s, c) {
  const [light, dark] = [c.hair, shade(c.hair, 0.65)];
  for (const side of ["l", "r"]) {
    const x = side === "l" ? 1 : -1;
    const [S, E, W] = [1, 2, 3].map((n) => at(`wing_0${n}_${side}`));
    out.path([S, E, W], [0.12, 0.09, 0.06].map((r) => r * s), 6, () => light, (i) => ww(side, i + 1), { carry: true });
    const feather = (root, tip, width, color, bones) => {
      const mid = lerp(root, tip, 0.45);
      // Across the feather, in the wing's plane (which faces back).
      const [dx, dy] = [tip[0] - root[0], tip[1] - root[1]];
      const length = Math.hypot(dx, dy) || 1;
      const across = mul([-dy / length, dx / length, 0], width * s);
      const [a, b] = [add(mid, across), add(mid, mul(across, -1))];
      for (const toward of [false, true]) {
        out.face([root, a, tip], color, bones, add(mid, [0, 5 * s, 0]), null, toward);
        out.face([root, tip, b], color, bones, add(mid, [0, 5 * s, 0]), null, toward);
      }
    };
    // Flight feathers: from the wrist out and back, then along the forearm, ever more down.
    for (let i = 0; i < 10; i++) {
      const t = i / 9;
      const root = i < 4 ? W : lerp(W, E, (i - 3) / 6);
      const way = [x * (1.35 - 1.25 * t), -0.35 - 1.2 * t, -0.35 - 0.25 * t];
      feather(root, add(root, mul(way, s)), 0.2, i % 2 ? dark : light, i < 4 ? ww(side, 3) : ww(side, 2));
    }
    // Coverts along the upper arm, shorter.
    for (let i = 0; i < 5; i++) {
      const root = lerp(E, S, i / 5);
      feather(root, add(root, mul([x * 0.1, -0.85 + 0.12 * i, -0.3], s)), 0.18, light, i ? ww(side, 1) : ww(side, 2));
    }
  }
}

// Sway for the tail and wings, as quaternion tracks for every clip (through `track(bone, turn(t))`
// with turns in radians about x, y and z), whole cycles over the clip's length so a loop meets
// itself: the tail swings side to side, and wings breathe a little open and shut.
export function extraSway(names, duration) {
  const cycles = Math.max(1, Math.round(duration / 1.6));
  const w = (t) => (Math.PI * 2 * cycles * t) / duration;
  const sway = {};
  for (const name of names) {
    const tail = name.match(/^tail_0(\d)$/);
    if (tail) {
      const i = +tail[1];
      sway[name] = (t) => [0, 0.12 * Math.sin(w(t) - 0.6 * i), 0];
    }
    const wing = name.match(/^wing_0(\d)_([lr])$/);
    if (wing) {
      const [n, x] = [+wing[1], wing[2] === "l" ? 1 : -1];
      sway[name] = (t) => [0, 0, x * (n === 1 ? 0.06 : 0.03) * Math.sin(w(t))];
    }
  }
  return sway;
}
