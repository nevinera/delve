import { MeshOut } from "./body.js";

// Weapons as mesh data, without three.js: low-poly and flat colored like the body (body.js), from
// the look's steel, wood and metal colors. Each is built round its grip, at the origin, pointing
// along +y, with its front (an axe's edge, a bow's belly) toward +z. characterMesh.js puts it in a
// hand.

// Which hand holds each weapon, and the way it points from the hand when the arm hangs down: the
// sword angled down and forward, the rest upright, resting on the ground.
export const HELD = {
  sword: { hand: "hand_r", toward: [0, -0.6, 0.8] },
  axe: { hand: "hand_r", toward: [0, 1, 0] },
  staff: { hand: "hand_r", toward: [0, 1, 0] },
  bow: { hand: "hand_l", toward: [0, 1, 0] },
};

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const STRING = [0.86, 0.84, 0.78];

// { positions, colors } for a weapon, or null for "none". `ground` is how far below the grip the
// ground is, for weapons that rest on it.
export function weaponMesh(type, colors, { ground = 2.4 } = {}) {
  if (!HELD[type]) return null;
  const c = { steel: hex(colors.steel), wood: hex(colors.wood), metal: hex(colors.metal) };
  const out = new MeshOut(new Map([["weapon", 0]]));
  const bones = [["weapon", 1]];
  const up = [0, 1, 0];
  // A straight rod of `sides` from y0 to y1, radius r.
  const rod = (y0, y1, r, sides, color) =>
    out.tube(
      [
        { center: [0, y0, 0], dir: up, rx: r, rz: r, bones },
        { center: [0, y1, 0], dir: up, rx: r, rz: r, bones },
      ],
      sides,
      () => color,
      { capStart: true, capEnd: true },
    );
  // A flat plate `thick` across x, outlined by convex [z, y] points.
  const plate = (outline, thick, color) => {
    const side = (x) => outline.map(([z, y]) => [x, y, z]);
    const [left, right] = [side(-thick / 2), side(thick / 2)];
    const middle = [0, outline.reduce((a, [, y]) => a + y, 0) / outline.length, outline.reduce((a, [z]) => a + z, 0) / outline.length];
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

  if (type === "sword") {
    rod(-0.32, 0.1, 0.055, 6, c.wood);
    out.gem([0, -0.38, 0], 0.07, c.metal, bones);
    plate(
      [
        [-0.06, 0.1],
        [0.06, 0.1],
        [0.06, 0.18],
        [-0.06, 0.18],
      ],
      0.5,
      c.metal,
    );
    // The blade: edges to front and back, a diamond in section, tapering to a point.
    out.tube(
      [
        { center: [0, 0.18, 0], dir: up, rx: 0.025, rz: 0.09, bones },
        { center: [0, 2.4, 0], dir: up, rx: 0.02, rz: 0.075, bones },
        { center: [0, 2.75, 0], dir: up, rx: 0.004, rz: 0.004, bones },
      ],
      4,
      () => c.steel,
      { capStart: true },
    );
  }
  if (type === "axe") {
    // A long haft, gripped low, its head at shoulder height with the edge forward.
    const top = 4.3 - ground;
    rod(-ground, top, 0.06, 6, c.wood);
    rod(top - 0.45, top + 0.05, 0.085, 6, c.steel);
    plate(
      [
        [0.06, top - 0.05],
        [0.06, top - 0.35],
        [0.55, top - 0.6],
        [0.72, top - 0.2],
        [0.55, top + 0.2],
      ],
      0.05,
      c.steel,
    );
    // A short spike behind.
    plate(
      [
        [-0.06, top - 0.12],
        [-0.06, top - 0.28],
        [-0.35, top - 0.22],
      ],
      0.04,
      c.steel,
    );
  }
  if (type === "staff") {
    const top = 6 - ground;
    rod(-ground, top, 0.065, 6, c.wood);
    rod(-0.2, 0.2, 0.08, 6, shadeOf(c.wood, 0.7));
    out.tube(
      [
        { center: [0, top - 0.05, 0], dir: up, rx: 0.07, rz: 0.07, bones },
        { center: [0, top + 0.12, 0], dir: up, rx: 0.12, rz: 0.12, bones },
        { center: [0, top + 0.25, 0], dir: up, rx: 0.06, rz: 0.06, bones },
      ],
      6,
      () => c.metal,
    );
    out.gem([0, top + 0.32, 0], 0.11, c.steel, bones);
  }
  if (type === "bow") {
    // A curved stave, the grip foremost and the tips swept back toward the string.
    const half = Math.min(2.1, ground - 0.15);
    const points = [];
    const radii = [];
    for (let i = 0; i <= 12; i++) {
      const y = -half + (2 * half * i) / 12;
      const t = y / half;
      points.push([0, y, -0.4 * t * t]);
      radii.push(0.07 - 0.035 * Math.abs(t));
    }
    out.path(points, radii, 5, (band) => (band === 5 || band === 6 ? c.metal : c.wood), () => bones, { capStart: true, capEnd: true });
    out.path(
      [
        [0, -half, -0.4],
        [0, half, -0.4],
      ],
      [0.01, 0.01],
      3,
      () => STRING,
      () => bones,
    );
  }
  const { positions, colors: rgb } = out.arrays();
  return { positions, colors: rgb };
}

const shadeOf = (rgb, f) => rgb.map((v) => v * f);
