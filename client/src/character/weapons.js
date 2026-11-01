import { MeshOut } from "./body.js";

// Weapons and off-hand items as mesh data, without three.js: low-poly and flat colored like the
// body (body.js), from the look's colors. Each is built round its grip, at the origin, along +y:
// the line through the fist, toward the business end. Edges, a bow's belly and a gun's sights
// face +z or -z, and a shield faces +x. characterMesh.js puts each on its bone.

// Where each item rides: the bone, the grip's place on it (in feet for a 6ft body, in the bone's
// own frame), and the way +y points from it when the arm hangs down. A fist grips across the hand
// bone, front to back, so held weapons run through it that way, tipped down ahead; a bow is held
// upright. A polearm is tipped less, to clear the ground. A fist weapon's handle runs through the
// fist with its claws jutting past the knuckles, along the hand; an orb's cup sits square to the
// hand; a shield straps across the outside of the forearm, its point back and a little down, the
// fist gripping a third of the way back from its leading edge.
const IN_HAND = [0, -0.3, 0.02];
const DOWN_AHEAD = [0, -0.38, 0.92];
const UP_AHEAD = [0, 0.8, 0.6];
// A blade's grip slid on through the fist toward its tip, so the guard clears the fingers.
const CLEAR_GUARD = (() => {
  const length = Math.hypot(...DOWN_AHEAD);
  return IN_HAND.map((v, i) => v + (DOWN_AHEAD[i] / length) * 0.09);
})();
export const HELD = {
  sword: { bone: "hand_r", at: CLEAR_GUARD, toward: DOWN_AHEAD },
  greatsword: { bone: "hand_r", at: IN_HAND, toward: DOWN_AHEAD, twoHanded: true },
  axe: { bone: "hand_r", at: IN_HAND, toward: DOWN_AHEAD },
  greataxe: { bone: "hand_r", at: IN_HAND, toward: DOWN_AHEAD, twoHanded: true },
  mace: { bone: "hand_r", at: IN_HAND, toward: DOWN_AHEAD },
  maul: { bone: "hand_r", at: IN_HAND, toward: DOWN_AHEAD, twoHanded: true },
  dagger: { bone: "hand_r", at: CLEAR_GUARD, toward: DOWN_AHEAD },
  fist: { bone: "hand_r", at: [0, -0.22, 0], toward: [0, -1, 0] },
  polearm: { bone: "hand_r", at: IN_HAND, toward: [0, -0.35, 0.94], twoHanded: true },
  staff: { bone: "hand_r", at: IN_HAND, toward: DOWN_AHEAD, twoHanded: true },
  bow: { bone: "hand_l", at: IN_HAND, toward: UP_AHEAD, twoHanded: true },
  crossbow: { bone: "hand_r", at: IN_HAND, toward: DOWN_AHEAD, twoHanded: true },
  gun: { bone: "hand_r", at: IN_HAND, toward: DOWN_AHEAD, twoHanded: true },
  wand: { bone: "hand_r", at: IN_HAND, toward: DOWN_AHEAD },
  thrown: { bone: "hand_r", at: IN_HAND, toward: DOWN_AHEAD },
  shield: { bone: "lowerarm_l", at: [0.17, -0.85, 0], toward: [0, 0.17, 0.98] },
  orb: { bone: "hand_l", at: IN_HAND, toward: [0, 0, 1] },
};

// How each weapon attacks: a handful of ways, so creatures need only a clip for each, not one for
// every weapon. The clips (animations.js's roleClips) are each group's.
const GROUPS = {
  unarmed: ["none"],
  oneHanded: ["sword", "axe", "mace", "dagger", "fist", "wand"],
  twoHanded: ["greatsword", "greataxe", "maul", "polearm", "staff"],
  bow: ["bow"],
  firearm: ["crossbow", "gun"],
  thrown: ["thrown"],
};
export const attackGroup = (weapon) => Object.keys(GROUPS).find((group) => GROUPS[group].includes(weapon)) ?? "unarmed";

// What a look can hold in its main hand, and in its off hand alongside a one-handed weapon.
export const WEAPONS = ["none", ...Object.keys(HELD).filter((type) => !["shield", "orb"].includes(type))];
export const OFFHANDS = ["none", "shield", "orb", "sword", "axe", "mace", "dagger", "fist"];

// Where each item hangs when put away: one-handed items at a hip, the side away from their hand
// for a cross draw, and the rest across the back. +y points along `toward`, and +z toward
// `front`, from the hip or the middle of the back; on the back, the item is centered there.
// Blades hang hilt up, and hafted weapons head up, over the right shoulder, all lying flat.
const HIP_TOWARD = [0.12, -0.8, -0.55];
const HIP_FRONT = [0, -0.55, 0.8];
const HILT_UP = { toward: [0.5, -0.85, 0], front: [0.85, 0.5, 0] };
const HEAD_UP = { toward: [-0.45, 0.9, 0], front: [0.9, 0.45, 0] };
const ACROSS_BACK = {
  greatsword: HILT_UP,
  greataxe: HEAD_UP,
  maul: HEAD_UP,
  polearm: HEAD_UP,
  staff: HEAD_UP,
  bow: { toward: [-0.5, 0.85, 0], front: [0.85, 0.5, 0] },
  crossbow: { toward: [-0.5, 0.85, 0], front: [0, 0, -1] },
  gun: { toward: [-0.5, 0.85, 0], front: [0, 0, -1] },
  shield: { toward: [0, 1, 0], front: [1, 0, 0] },
};

// Where an item is put away: { place: "back" } or { place: "hip", side }, with its toward and front.
export function sheathOf(type, offhand = false) {
  if (!HELD[type]) return null;
  if (ACROSS_BACK[type]) return { place: "back", ...ACROSS_BACK[type] };
  const side = offhand || HELD[type].bone === "hand_l" ? "r" : "l";
  const mirror = (v) => [side === "r" ? -v[0] : v[0], v[1], v[2]];
  return { place: "hip", side, toward: mirror(HIP_TOWARD), front: HIP_FRONT };
}

// Where an item rides; weapons held in the off hand move to the left hand.
export function heldBy(type, offhand = false) {
  const held = HELD[type];
  if (!held || !offhand || held.bone !== "hand_r") return held;
  return { ...held, bone: "hand_l" };
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const shadeOf = (rgb, f) => rgb.map((v) => v * f);
const STRING = [0.86, 0.84, 0.78];

// How a weapon is made: fine as it's drawn, crude (dented and rusted) or savage (cruder still,
// with bone spikes down its back).
export const WEAPON_STYLES = ["fine", "crude", "savage"];

// { positions, colors } for an item, or null for "none". Blades are steel, hafts and staves wood,
// fittings metal; a shield is painted in the primary color and an orb or wand gem glows in it.
// `style` is one of WEAPON_STYLES.
export function weaponMesh(type, colors, style = "fine") {
  if (!HELD[type]) return null;
  const c = { steel: hex(colors.steel), wood: hex(colors.wood), metal: hex(colors.metal), paint: hex(colors.primary) };
  const grip = shadeOf(c.wood, 0.6);
  const out = new MeshOut(new Map([["weapon", 0]]));
  const seed = [...type].reduce((h, ch) => h * 31 + ch.charCodeAt(0), 7);
  if (style === "crude" || style === "savage") out.wear = { style, seed, jitter: style === "savage" ? 0.014 : 0.009 };
  const bones = [["weapon", 1]];
  const up = [0, 1, 0];
  const ring = (y, rx, rz = rx, z = 0) => ({ center: [0, y, z], dir: up, rx, rz, bones });
  // A straight rod of `sides` from y0 to y1, radius r, its far end r1 round.
  const rod = (y0, y1, r, sides, color, r1 = r) => out.tube([ring(y0, r), ring(y1, r1)], sides, () => color, { capStart: true, capEnd: true });
  // A flat plate `thick` across x, outlined by convex [z, y] points, centered `x` across.
  const plate = (outline, thick, color, x = 0) => {
    const side = (dx) => outline.map(([z, y]) => [x + dx, y, z]);
    const [left, right] = [side(-thick / 2), side(thick / 2)];
    const middle = [x, outline.reduce((a, [, y]) => a + y, 0) / outline.length, outline.reduce((a, [z]) => a + z, 0) / outline.length];
    for (let k = 1; k < outline.length - 1; k++) {
      out.face([left[0], left[k], left[k + 1]], color, bones, middle);
      out.face([right[0], right[k], right[k + 1]], color, bones, middle);
    }
    for (let k = 0; k < outline.length; k++) {
      const k1 = (k + 1) % outline.length;
      out.face([left[k], left[k1], right[k1]], color, bones, middle);
      out.face([left[k], right[k1], right[k]], color, bones, middle);
    }
  };
  // A box from y0 to y1, `depth` front to back (z) and `width` across (x), centered at z.
  const box = (y0, y1, depth, width, color, z = 0) =>
    plate(
      [
        [z - depth / 2, y0],
        [z + depth / 2, y0],
        [z + depth / 2, y1],
        [z - depth / 2, y1],
      ],
      width,
      color,
    );
  // A blade from y0 to a point at `tip`: diamond in section, its edges front and back.
  const blade = (y0, y1, tip, width, thick = 0.03) =>
    out.tube([ring(y0, thick, width), ring(y1, thick * 0.8, width * 0.85), ring(tip, 0.004)], 4, () => c.steel, { capStart: true });
  // A crossguard reaching along the edges.
  const guard = (y, reach) => box(y, y + 0.08, 2 * reach, 0.09, c.metal);
  // An axe blade ahead of a haft at y (behind it when `back`), `size` across, its edge curved.
  const axeHead = (y, size, back = false) => {
    const outline = [
      [0.05, y + 0.1 * size],
      [0.05, y - 0.15 * size],
      [0.4 * size, y - 0.45 * size],
      [0.6 * size, y - 0.1 * size],
      [0.42 * size, y + 0.35 * size],
    ];
    plate(back ? outline.map(([z, yy]) => [-z, yy]).reverse() : outline, 0.05, c.steel);
  };

  if (type === "sword") {
    rod(-0.32, 0.1, 0.055, 6, grip);
    out.gem([0, -0.38, 0], 0.07, c.metal, bones);
    guard(0.1, 0.26);
    blade(0.18, 2.4, 2.75, 0.09);
  }
  if (type === "greatsword") {
    // A long grip for two hands, a broad guard and a blade nearly as long as a man is tall.
    rod(-0.75, 0.12, 0.06, 6, grip);
    out.gem([0, -0.83, 0], 0.09, c.metal, bones);
    guard(0.12, 0.4);
    blade(0.2, 3.7, 4.3, 0.13, 0.035);
  }
  if (type === "axe") {
    rod(-0.35, 1.95, 0.045, 6, c.wood);
    rod(1.55, 1.95, 0.065, 6, c.steel);
    axeHead(1.78, 0.9);
  }
  if (type === "greataxe") {
    // Gripped low on a long haft, with a blade either side of the head.
    rod(-0.6, 3.7, 0.06, 6, c.wood);
    rod(3.0, 3.6, 0.085, 6, c.steel);
    axeHead(3.3, 1.25);
    axeHead(3.3, 0.9, true);
    out.gem([0, 3.75, 0], 0.07, c.metal, bones);
  }
  if (type === "mace") {
    // A flanged head: a ball with four fins.
    rod(-0.35, 1.6, 0.045, 6, c.wood);
    out.gem([0, -0.42, 0], 0.06, c.metal, bones);
    out.tube([ring(1.45, 0.06), ring(1.65, 0.16), ring(1.9, 0.16), ring(2.05, 0.05)], 6, () => c.steel, { capEnd: true });
    box(1.52, 1.98, 0.5, 0.06, c.steel);
    box(1.52, 1.98, 0.06, 0.5, c.steel);
  }
  if (type === "maul") {
    // A long haft and a heavy block of a head, its faces front and back.
    rod(-0.7, 3.4, 0.06, 6, c.wood);
    box(3.15, 3.65, 0.9, 0.42, c.steel);
    box(3.1, 3.7, 0.12, 0.46, c.metal, 0.4);
    box(3.1, 3.7, 0.12, 0.46, c.metal, -0.4);
  }
  if (type === "dagger") {
    rod(-0.26, 0.06, 0.045, 6, grip);
    out.gem([0, -0.31, 0], 0.05, c.metal, bones);
    guard(0.06, 0.13);
    blade(0.14, 0.95, 1.15, 0.065, 0.022);
  }
  if (type === "fist") {
    // A handle across the fist, in a frame whose crossbar carries three claws out past the
    // knuckles.
    const across = [0, 0, 1];
    out.tube(
      [
        { center: [0, 0, -0.22], dir: across, rx: 0.04, rz: 0.04, bones },
        { center: [0, 0, 0.22], dir: across, rx: 0.04, rz: 0.04, bones },
      ],
      6,
      () => grip,
      { capStart: true, capEnd: true },
    );
    for (const z of [-0.23, 0.23]) box(-0.06, 0.24, 0.04, 0.1, c.metal, z);
    box(0.2, 0.28, 0.5, 0.1, c.metal);
    for (const z of [-0.14, 0, 0.14]) {
      plate(
        [
          [z - 0.04, 0.26],
          [z + 0.04, 0.26],
          [z + 0.02, 0.85],
          [z, 1.05],
        ],
        0.025,
        c.steel,
      );
    }
  }
  if (type === "polearm") {
    // A halberd: a spear point, an axe blade ahead and a hook behind.
    rod(-1.8, 4.5, 0.055, 6, c.wood);
    rod(4.0, 4.55, 0.07, 6, c.steel);
    blade(4.55, 4.9, 5.4, 0.08, 0.03);
    axeHead(4.25, 1.0);
    plate(
      [
        [-0.05, 4.2],
        [-0.05, 4.4],
        [-0.4, 4.15],
      ],
      0.04,
      c.steel,
    );
  }
  if (type === "staff") {
    const top = 3.6;
    rod(-2.4, top, 0.065, 6, c.wood);
    rod(-0.2, 0.2, 0.08, 6, grip);
    out.tube([ring(top - 0.05, 0.07), ring(top + 0.12, 0.12), ring(top + 0.25, 0.06)], 6, () => c.metal);
    out.gem([0, top + 0.32, 0], 0.11, c.steel, bones);
  }
  if (type === "bow") {
    // A curved stave, the grip foremost and the tips swept back. It has no string: a still one
    // would stay straight while the hand draws it back.
    const half = 2.0;
    const points = [];
    const radii = [];
    for (let i = 0; i <= 12; i++) {
      const y = -half + (2 * half * i) / 12;
      const t = y / half;
      points.push([0, y, -0.4 * t * t]);
      radii.push(0.07 - 0.035 * Math.abs(t));
    }
    out.path(points, radii, 5, (band) => (band === 5 || band === 6 ? c.metal : c.wood), () => bones, { capStart: true, capEnd: true });
  }
  if (type === "crossbow") {
    // A stock gripped behind the trigger, and a short steel bow across its front, strung back.
    box(-0.7, 1.7, 0.14, 0.12, c.wood);
    box(-0.7, -0.2, 0.3, 0.13, c.wood, 0.06);
    box(0.25, 0.4, 0.12, 0.05, c.metal, 0.12);
    const arms = [];
    const radii = [];
    for (let i = 0; i <= 8; i++) {
      const x = -0.85 + (1.7 * i) / 8;
      arms.push([x, 1.55 - 0.25 * (x / 0.85) ** 2, -0.05]);
      radii.push(0.05 - 0.02 * Math.abs(x / 0.85));
    }
    out.path(arms, radii, 4, () => c.steel, () => bones, { capStart: true, capEnd: true });
    for (const x of [-0.85, 0.85]) {
      out.path(
        [
          [x, 1.3, -0.05],
          [0, 0.9, -0.05],
        ],
        [0.01, 0.01],
        3,
        () => STRING,
        () => bones,
      );
    }
  }
  if (type === "gun") {
    // A blunderbuss: a steel barrel flaring at the muzzle, along a wooden stock.
    out.tube([ring(-0.05, 0.05, 0.05, -0.06), ring(1.9, 0.05, 0.05, -0.06), ring(2.2, 0.1, 0.1, -0.06), ring(2.25, 0.11, 0.11, -0.06)], 6, () => c.steel, {
      capStart: true,
    });
    box(-0.1, 1.6, 0.1, 0.1, c.wood, 0.02);
    plate(
      [
        [-0.02, 0.1],
        [0.12, 0.1],
        [0.3, -0.85],
        [-0.02, -0.85],
      ],
      0.12,
      c.wood,
    );
    box(1.0, 1.08, 0.13, 0.12, c.metal, -0.02);
    box(0.25, 0.4, 0.1, 0.04, c.metal, 0.1);
  }
  if (type === "wand") {
    rod(-0.15, 0.95, 0.03, 5, c.wood, 0.022);
    rod(-0.05, 0.05, 0.04, 5, c.metal);
    out.gem([0, 1.05, 0], 0.07, c.paint, bones);
  }
  if (type === "thrown") {
    // A small throwing axe.
    rod(-0.2, 0.95, 0.035, 5, c.wood);
    axeHead(0.82, 0.6);
  }
  if (type === "shield") {
    // A heater shield painted in the primary color on a metal backing, with a steel boss.
    const outline = (k) =>
      [
        [-0.72, 0.85],
        [-0.72, 0.15],
        [-0.5, -0.5],
        [0, -1.05],
        [0.5, -0.5],
        [0.72, 0.15],
        [0.72, 0.85],
      ].map(([z, y]) => [z * k, y * k]);
    plate(outline(1), 0.06, c.metal, 0.02);
    plate(outline(0.88), 0.06, c.paint, 0.05);
    out.gem([0.1, 0.05, 0], 0.13, c.steel, bones);
  }
  if (type === "orb") {
    // A glowing orb in a metal cup.
    rod(-0.1, 0.2, 0.04, 5, c.metal);
    out.tube([ring(0.2, 0.05), ring(0.35, 0.14)], 6, () => c.metal);
    out.tube([ring(0.3, 0.01), ring(0.36, 0.13), ring(0.5, 0.18), ring(0.64, 0.13), ring(0.7, 0.01)], 6, () => c.paint, { capStart: true, capEnd: true });
  }
  if (style === "savage") spikes(out, bones);
  const { positions, colors: rgb } = out.arrays();
  return { positions, colors: rgb };
}

// Bone spikes out of the back of the far part of an item, its length running along +y.
function spikes(out, bones) {
  out.wear = null;
  const points = [];
  for (let i = 0; i < out.positions.length; i += 3) points.push(out.positions.slice(i, i + 3));
  const ys = points.map((p) => p[1]);
  const [low, high] = [Math.min(...ys), Math.max(...ys)];
  for (const t of [0.9, 0.76, 0.62]) {
    const y = low + (high - low) * t;
    const near = points.filter((p) => Math.abs(p[1] - y) < 0.06 * (high - low) + 0.02);
    if (!near.length) continue;
    const back = Math.min(...near.map((p) => p[2]));
    const length = 0.12 + 0.03 * (high - low);
    out.path([[0, y, back + 0.03], [0, y + length * 0.4, back - length]], [length * 0.22, length * 0.02], 5, () => [0.85, 0.8, 0.64], () => bones);
  }
}
