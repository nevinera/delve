// A character's body as mesh data, without three.js, so it can be tested: a skeleton and a low-poly
// skin over it, built from a look (recipe.js's resolveRecipe). Each limb and the trunk are tubes of
// rings around their bones, each ring following one bone or blending two at a joint. Faces are
// flat colored by region (skin, shirt, trousers, hair and so on), with no textures.
//
// Bones are named like the Unreal mannequin's, which most free animation sets follow. The bind pose
// stands with the arms down and a little out. Positions are feet: feet on y = 0, facing +z, the
// character's left toward +x.

// A 6ft body's joints, before the look shapes it: [name, parent, position]. Bones ending in _l
// are mirrored to _r.
const JOINTS = [
  ["root", null, [0, 0, 0]],
  ["pelvis", "root", [0, 3.15, 0]],
  ["spine_01", "pelvis", [0, 3.5, 0]],
  ["spine_02", "spine_01", [0, 3.95, 0]],
  ["spine_03", "spine_02", [0, 4.4, 0]],
  ["neck_01", "spine_03", [0, 4.95, 0]],
  ["head", "neck_01", [0, 5.22, 0]],
  ["clavicle_l", "spine_03", [0.15, 4.75, 0]],
  ["upperarm_l", "clavicle_l", [0.74, 4.72, 0]],
  ["lowerarm_l", "upperarm_l", [0.86, 3.68, -0.02]],
  ["hand_l", "lowerarm_l", [0.94, 2.76, 0.03]],
  ["thigh_l", "pelvis", [0.32, 3.05, 0]],
  ["calf_l", "thigh_l", [0.34, 1.68, 0.04]],
  ["foot_l", "calf_l", [0.35, 0.32, 0]],
  ["ball_l", "foot_l", [0.36, 0.08, 0.48]],
];
// Where bones with no child end, for their direction.
const ENDS = { head: [0, 6, 0], hand_l: [0.97, 2.18, 0.05], ball_l: [0.36, 0.06, 0.75] };
const ARM = ["clavicle_l", "upperarm_l", "lowerarm_l", "hand_l"];
const LEG = ["thigh_l", "calf_l", "foot_l", "ball_l"];

export const BONE_NAMES = JOINTS.flatMap(([name]) => (name.endsWith("_l") ? [name, name.replace(/_l$/, "_r")] : [name]));

const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, s) => a.map((v) => v * s);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => mul(a, 1 / Math.hypot(...a));
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const shade = (rgb, f) => rgb.map((v) => v * f);

// The skeleton for a look: [{ name, parent, at }], parents first, `at` the bind position.
export function skeleton(look) {
  const s = look.height / 6;
  const shoulders = 1 - 0.12 * look.femininity + 0.12 * (look.build - 0.5);
  const hips = 1 + 0.12 * look.femininity + 0.2 * (look.hips - 0.5);
  const joints = new Map();
  for (const [name, parent, at] of JOINTS) {
    joints.set(name, { name, parent, at });
    if (name.endsWith("_l")) {
      joints.set(name.replace(/_l$/, "_r"), { name: name.replace(/_l$/, "_r"), parent: parent.replace(/_l$/, "_r"), at: [-at[0], at[1], at[2]] });
    }
  }
  // Shoulders and hips move their whole limb out or in.
  for (const [chain, width] of [
    [ARM, shoulders],
    [LEG, hips],
  ]) {
    for (const side of ["l", "r"]) {
      const moved = chain.filter((name) => !name.startsWith("clavicle"));
      const dx = joints.get(moved[0].replace(/_l$/, `_${side}`)).at[0] * (width - 1);
      for (const name of moved) {
        const j = joints.get(name.replace(/_l$/, `_${side}`));
        j.at = [j.at[0] + dx, j.at[1], j.at[2]];
      }
    }
  }
  // Parents come before children in JOINTS, and mirroring keeps that.
  return [...joints.values()].map((j) => ({ ...j, at: mul(j.at, s) }));
}

// Mesh data for a look: { bones, positions, colors, skinIndex, skinWeight }, one entry per corner
// of each triangle, so each face keeps its own flat color.
export function bodyMesh(look) {
  const bones = skeleton(look);
  const index = new Map(bones.map((b, i) => [b.name, i]));
  const at = (name) => bones[index.get(name)].at;
  const s = look.height / 6;
  const fem = look.femininity;
  const trunk = s * (0.85 + 0.4 * look.build);
  const limb = trunk * (0.8 + 0.4 * look.limbs);
  const c = Object.fromEntries(Object.entries(look.colors).map(([k, v]) => [k, hex(v)]));
  const boots = shade(c.secondary, 0.55);
  const belt = shade(c.primary, 0.45);
  const out = new MeshOut(index);

  // The end of a bone: its child's joint, or its own end point.
  const endOf = (name) => {
    const child = bones.find((b) => b.parent === name && !b.name.startsWith("clavicle") && !b.name.startsWith("thigh"));
    if (child) return child.at;
    const base = ENDS[name.replace(/_r$/, "_l")];
    return mul(name.endsWith("_r") ? [-base[0], base[1], base[2]] : base, s);
  };
  // A ring t of the way along a bone (past 1 or below 0 reaches beyond it).
  const along = (name, t, extra = {}) => {
    const from = at(name);
    const to = endOf(name);
    return { center: add(from, mul(sub(to, from), t)), dir: norm(sub(to, from)), bones: [[name, 1]], ...extra };
  };
  const up = [0, 1, 0];
  const level = (y, extra) => ({ center: [0, y * s, 0], dir: up, ...extra });

  // The trunk, crotch to neck. The bust pushes the chest's front out either side of the middle.
  const shoulders = 1 - 0.12 * fem + 0.12 * (look.build - 0.5);
  const hips = 1 + 0.12 * fem + 0.2 * (look.hips - 0.5);
  const waist = 1 - 0.14 * fem;
  const bust = (amount) => (angle) => amount * look.bust * 0.34 * s * Math.exp(-(((Math.abs(angle) - 0.5) / 0.32) ** 2)) * (Math.cos(angle) > 0 ? 1 : 0);
  const trunkRings = [
    level(2.92, { rx: 0.5 * hips * trunk, rz: 0.36 * trunk, bones: [["pelvis", 1]] }),
    level(3.18, { rx: 0.62 * hips * trunk, rz: 0.42 * trunk, bones: [["pelvis", 1]] }),
    level(3.32, { rx: 0.6 * hips * trunk, rz: 0.41 * trunk, bones: [["pelvis", 0.6], ["spine_01", 0.4]] }),
    level(3.44, { rx: 0.56 * waist * trunk, rz: 0.39 * trunk, bones: [["spine_01", 1]] }),
    level(3.65, { rx: 0.52 * waist * trunk, rz: 0.37 * trunk, bones: [["spine_01", 1]] }),
    level(4.05, { rx: 0.6 * shoulders * trunk, rz: 0.42 * trunk, push: bust(1), bones: [["spine_02", 1]] }),
    level(4.45, { rx: 0.68 * shoulders * trunk, rz: 0.42 * trunk, push: bust(0.45), bones: [["spine_03", 1]] }),
    level(4.8, { rx: 0.58 * shoulders * trunk, rz: 0.33 * trunk, bones: [["spine_03", 1]] }),
    level(4.95, { rx: 0.2 * trunk, rz: 0.2 * trunk, bones: [["spine_03", 0.5], ["neck_01", 0.5]] }),
    level(5.25, { rx: 0.18 * trunk, rz: 0.18 * trunk, bones: [["neck_01", 1]] }),
  ];
  const trunkColors = [c.secondary, c.secondary, belt, c.primary, c.primary, c.primary, c.primary, c.primary, c.skin];
  out.tube(trunkRings, 12, (band) => trunkColors[band], { capStart: true });

  for (const side of ["l", "r"]) {
    const n = (name) => name.replace(/_l$/, `_${side}`);
    // Arm, sleeved to the wrist.
    const arm = [
      along(n("upperarm_l"), -0.08, { rx: 0.2 * limb, rz: 0.2 * limb, bones: [[n("upperarm_l"), 0.7], ["spine_03", 0.3]] }),
      along(n("upperarm_l"), 0.15, { rx: 0.19 * limb, rz: 0.19 * limb }),
      along(n("upperarm_l"), 0.55, { rx: 0.16 * limb, rz: 0.16 * limb }),
      along(n("upperarm_l"), 1, { rx: 0.13 * limb, rz: 0.13 * limb, bones: [[n("upperarm_l"), 0.5], [n("lowerarm_l"), 0.5]] }),
      along(n("lowerarm_l"), 0.3, { rx: 0.14 * limb, rz: 0.14 * limb }),
      along(n("lowerarm_l"), 0.85, { rx: 0.1 * limb, rz: 0.1 * limb }),
      along(n("lowerarm_l"), 1, { rx: 0.09 * limb, rz: 0.09 * limb, bones: [[n("lowerarm_l"), 0.5], [n("hand_l"), 0.5]] }),
      along(n("hand_l"), 0.15, { rx: 0.05 * s, rz: 0.1 * s }),
      along(n("hand_l"), 0.55, { rx: 0.055 * s, rz: 0.12 * s }),
      along(n("hand_l"), 0.95, { rx: 0.045 * s, rz: 0.08 * s }),
    ];
    out.tube(arm, 8, (band) => (band < 6 ? c.primary : c.skin), { capEnd: true });

    // Leg, booted from mid-calf.
    const leg = [
      along(n("thigh_l"), -0.06, { rx: 0.3 * limb * hips, rz: 0.32 * limb, bones: [[n("thigh_l"), 0.7], ["pelvis", 0.3]] }),
      along(n("thigh_l"), 0.3, { rx: 0.26 * limb, rz: 0.27 * limb }),
      along(n("thigh_l"), 0.7, { rx: 0.2 * limb, rz: 0.21 * limb }),
      along(n("thigh_l"), 1, { rx: 0.17 * limb, rz: 0.18 * limb, bones: [[n("thigh_l"), 0.5], [n("calf_l"), 0.5]] }),
      along(n("calf_l"), 0.25, { rx: 0.18 * limb, rz: 0.21 * limb }),
      along(n("calf_l"), 0.5, { rx: 0.17 * limb, rz: 0.19 * limb }),
      along(n("calf_l"), 0.56, { rx: 0.18 * limb, rz: 0.2 * limb }),
      along(n("calf_l"), 0.97, { rx: 0.13 * limb, rz: 0.14 * limb, bones: [[n("calf_l"), 0.5], [n("foot_l"), 0.5]] }),
    ];
    out.tube(leg, 8, (band) => (band < 5 ? c.secondary : boots));
    // Foot, heel to toe, its rings standing upright.
    const [fx, , fz] = at(n("foot_l"));
    const fwd = [0, 0, 1];
    const foot = [
      { center: [fx, 0.16 * s, fz - 0.14 * s], dir: fwd, rx: 0.12 * s, rz: 0.13 * s, bones: [[n("foot_l"), 1]] },
      { center: [fx, 0.17 * s, fz + 0.12 * s], dir: fwd, rx: 0.14 * s, rz: 0.15 * s, bones: [[n("foot_l"), 1]] },
      { center: [fx, 0.1 * s, fz + 0.48 * s], dir: fwd, rx: 0.14 * s, rz: 0.09 * s, bones: [[n("foot_l"), 0.5], [n("ball_l"), 0.5]] },
      { center: [fx, 0.07 * s, fz + 0.7 * s], dir: fwd, rx: 0.1 * s, rz: 0.06 * s, bones: [[n("ball_l"), 1]] },
    ];
    out.tube(foot, 8, () => boots, { capStart: true, capEnd: true });
  }

  head(out, look, at("head"), s, c);
  return { bones, ...out.arrays() };
}

// The head: rings round the head bone, chin to crown, with hair and beard colored onto its faces
// (and hanging below it for long styles), a nose, eyes and any earrings and necklace.
function head(out, look, [hx, hy, hz], s, c) {
  const jaw = 1 - 0.16 * look.femininity;
  const full = look.beard === "full";
  const ring = (dy, rx, rz, dz, extra = {}) => ({ center: [hx, hy + dy * s, hz + dz * s], dir: [0, 1, 0], rx: rx * s, rz: rz * s, bones: [["head", 1]], ...extra });
  // A full beard pushes the chin forward and down.
  const chin = full ? (angle) => 0.05 * s * Math.max(0, Math.cos(angle)) : null;
  const rings = [
    ring(-0.1, 0.17, 0.18, 0, { bones: [["neck_01", 0.5], ["head", 0.5]] }),
    ring(0.02, 0.28 * jaw, 0.34, 0.05, { push: chin }),
    ring(0.25, 0.37, 0.4, 0.03),
    ring(0.45, 0.39, 0.42, 0),
    ring(0.62, 0.35, 0.39, -0.02),
    ring(0.74, 0.21, 0.26, -0.03),
  ];
  const long = look.hair === "long" || look.hair === "ponytail";
  const bald = look.hair === "bald";
  const color = (band, angle) => {
    const a = Math.abs(angle);
    if (full && ((band === 1 && a < 2.1) || (band === 0 && a < 1.6))) return c.hair;
    if (look.beard === "goatee" && band <= 1 && a < 0.45) return c.hair;
    if (!bald && (band >= 4 || (band === 3 && a > 0.9) || (band === 2 && a > 1.9) || (long && band === 1 && a > 2.1))) return c.hair;
    return c.skin;
  };
  out.tube(rings, 10, color, { capEnd: true, endColor: bald ? c.skin : c.hair });

  // Nose, between the eyes and the mouth.
  const front = (dy, x) => {
    // The face's surface at height dy, x across, between the cheek and brow rings.
    const t = (dy - 0.25) / 0.2;
    const rx = 0.37 + 0.02 * t;
    const rz = 0.4 + 0.02 * t;
    const dz = 0.03 - 0.03 * t;
    return [hx + x * s, hy + dy * s, hz + (dz + rz * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2))) * s];
  };
  const bones = [["head", 1]];
  const tip = add(front(0.24, 0), [0, 0, 0.1 * s]);
  const [top, left, right] = [front(0.36, 0), front(0.22, -0.06), front(0.22, 0.06)];
  const inside = [hx, hy + 0.3 * s, hz];
  out.face([top, left, tip], c.skin, bones, inside);
  out.face([top, tip, right], c.skin, bones, inside);
  out.face([left, right, tip], shade(c.skin, 0.85), bones, inside);
  // Eyes, a little proud of the face so they don't sink into it.
  for (const x of [-0.14, 0.14]) {
    const [cx, cy, cz] = front(0.34, x);
    const [w, h, z] = [0.055 * s, 0.035 * s, cz + 0.025 * s];
    const quad = [
      [cx - w, cy - h, z],
      [cx + w, cy - h, z],
      [cx + w, cy + h, z],
      [cx - w, cy + h, z],
    ];
    out.face([quad[0], quad[1], quad[2]], c.eyes, bones, inside);
    out.face([quad[0], quad[2], quad[3]], c.eyes, bones, inside);
  }

  if (look.hair === "long") {
    // A sheet of hair down the back to the shoulder blades.
    const neck = [["neck_01", 0.5], ["spine_03", 0.5]];
    const sheet = [
      { center: [hx, hy + 0.5 * s, hz - 0.18 * s], dir: [0, -1, 0], rx: 0.4 * s, rz: 0.3 * s, bones: [["head", 1]] },
      { center: [hx, hy + 0.05 * s, hz - 0.28 * s], dir: [0, -1, 0], rx: 0.4 * s, rz: 0.17 * s, bones: [["head", 1]] },
      { center: [hx, hy - 0.35 * s, hz - 0.33 * s], dir: [0, -1, 0], rx: 0.38 * s, rz: 0.1 * s, bones: neck },
      { center: [hx, hy - 0.85 * s, hz - 0.36 * s], dir: [0, -1, 0], rx: 0.32 * s, rz: 0.07 * s, bones: [["spine_03", 1]] },
    ];
    out.tube(sheet, 8, () => c.hair, { capEnd: true });
  }
  if (look.hair === "ponytail") {
    const tail = [
      { center: [hx, hy + 0.55 * s, hz - 0.36 * s], dir: norm([0, -0.3, -1]), rx: 0.1 * s, rz: 0.1 * s, bones: [["head", 1]] },
      { center: [hx, hy + 0.35 * s, hz - 0.55 * s], dir: [0, -1, -0.3], rx: 0.11 * s, rz: 0.1 * s, bones: [["head", 1]] },
      { center: [hx, hy - 0.05 * s, hz - 0.6 * s], dir: [0, -1, 0], rx: 0.08 * s, rz: 0.07 * s, bones: [["head", 1]] },
      { center: [hx, hy - 0.45 * s, hz - 0.52 * s], dir: [0, -1, 0.2], rx: 0.04 * s, rz: 0.04 * s, bones: [["neck_01", 1]] },
    ];
    out.tube(tail, 6, () => c.hair, { capEnd: true });
  }
  if (look.jewelry.includes("earrings")) {
    for (const x of [-0.385, 0.385]) out.gem([hx + x * s, hy + 0.14 * s, hz], 0.045 * s, c.metal, [["head", 1]]);
  }
  if (look.jewelry.includes("necklace")) {
    const ringAt = (dy, r) => ({ center: [hx, hy + dy * s, hz + 0.02 * s], dir: [0, 1, 0], rx: r * s, rz: r * s, bones: [["neck_01", 0.5], ["spine_03", 0.5]] });
    out.tube([ringAt(-0.31, 0.25), ringAt(-0.25, 0.22)], 10, () => c.metal);
    out.gem([hx, hy - 0.52 * s, hz + 0.34 * s * (0.85 + 0.4 * look.build)], 0.07 * s, c.metal, [["spine_03", 1]]);
  }
}

// Collects triangles, each corner with its own position, color and bone weights.
class MeshOut {
  constructor(index) {
    this.index = index;
    this.positions = [];
    this.colors = [];
    this.skinIndex = [];
    this.skinWeight = [];
  }

  // A triangle, turned to face away from `inside`.
  face(corners, color, bones, inside, cornerBones = null) {
    const normal = cross(sub(corners[1], corners[0]), sub(corners[2], corners[0]));
    const middle = mul(add(add(corners[0], corners[1]), corners[2]), 1 / 3);
    let order = [0, 1, 2];
    if (dot(normal, sub(middle, inside)) < 0) order = [0, 2, 1];
    for (const k of order) {
      this.positions.push(...corners[k]);
      this.colors.push(...color);
      const weights = (cornerBones?.[k] ?? bones).slice(0, 4);
      const total = weights.reduce((sum, [, w]) => sum + w, 0);
      for (let n = 0; n < 4; n++) {
        this.skinIndex.push(weights[n] ? this.index.get(weights[n][0]) : 0);
        this.skinWeight.push(weights[n] ? weights[n][1] / total : 0);
      }
    }
  }

  // Bands of faces between rings of `sides` corners, each colored by color(band, angle), angle 0
  // facing the ring's front. Caps close the first or last ring to a point.
  tube(rings, sides, color, { capStart = false, capEnd = false, endColor = null } = {}) {
    const points = rings.map((r) => {
      // The ring's side axis is +x where it can be; its front is square to that and the bone.
      const side = norm(Math.abs(r.dir[0]) > 0.9 ? [0, 0, -1] : sub([1, 0, 0], mul(r.dir, r.dir[0])));
      const front = cross(side, r.dir);
      return Array.from({ length: sides }, (_, k) => {
        const angle = (k / sides) * Math.PI * 2;
        const angleSigned = angle > Math.PI ? angle - Math.PI * 2 : angle;
        const push = r.push?.(angleSigned) ?? 0;
        return add(r.center, add(mul(side, Math.sin(angle) * r.rx), mul(front, Math.cos(angle) * (r.rz + push))));
      });
    });
    const weightsOf = (r) => r.bones ?? rings.find((q) => q.bones)?.bones;
    // Rings without bones of their own follow the nearest one before them that has some.
    const ringBones = [];
    rings.forEach((r, i) => (ringBones[i] = r.bones ?? ringBones[i - 1] ?? weightsOf(r)));
    for (let i = 0; i < rings.length - 1; i++) {
      const inside = mul(add(rings[i].center, rings[i + 1].center), 0.5);
      for (let k = 0; k < sides; k++) {
        const k1 = (k + 1) % sides;
        const mid = ((k + 0.5) / sides) * Math.PI * 2;
        const col = color(i, mid > Math.PI ? mid - Math.PI * 2 : mid);
        const [a, b, cc, d] = [points[i][k], points[i][k1], points[i + 1][k1], points[i + 1][k]];
        const [wa, wb] = [ringBones[i], ringBones[i + 1]];
        this.face([a, b, cc], col, wa, inside, [wa, wa, wb]);
        this.face([a, cc, d], col, wa, inside, [wa, wb, wb]);
      }
    }
    const cap = (i, outward, capColor) => {
      const r = rings[i];
      const tip = add(r.center, mul(r.dir, outward * Math.min(r.rx, r.rz) * 0.5));
      const inside = rings[i - outward]?.center ?? sub(r.center, mul(r.dir, outward));
      for (let k = 0; k < sides; k++) {
        this.face([points[i][k], points[i][(k + 1) % sides], tip], capColor, ringBones[i], inside);
      }
    };
    if (capStart) cap(0, -1, color(0, Math.PI));
    if (capEnd) cap(rings.length - 1, 1, endColor ?? color(rings.length - 2, Math.PI));
  }

  // A small eight-faced gem.
  gem(center, r, color, bones) {
    const p = [
      [r, 0, 0],
      [-r, 0, 0],
      [0, r * 1.4, 0],
      [0, -r * 1.4, 0],
      [0, 0, r],
      [0, 0, -r],
    ].map((d) => add(center, d));
    for (const [a, b] of [
      [0, 4],
      [4, 1],
      [1, 5],
      [5, 0],
    ]) {
      this.face([p[a], p[b], p[2]], color, bones, center);
      this.face([p[a], p[b], p[3]], color, bones, center);
    }
  }

  arrays() {
    return {
      positions: Float32Array.from(this.positions),
      colors: Float32Array.from(this.colors),
      skinIndex: Uint16Array.from(this.skinIndex),
      skinWeight: Float32Array.from(this.skinWeight),
    };
  }
}
