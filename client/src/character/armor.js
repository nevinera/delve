// Armor over a body (body.js), so it fits any body shape: each piece recolors parts of the body,
// adds shells (copies of the body's own rings pushed out, with the same bone weights, so they
// bend as the body does), or adds pieces built round a bone, sized from the body under them.
//
// A look's armor has a piece per slot (ARMOR_SLOTS), each { type, colors: [main, trim] } with type
// one of ARMOR_TYPES. Each type has a fixed pattern in those two colors: cloth is a robe, leather
// strapped hide, chain mail (body.js marks its faces for the mail texture), plate segmented steel.

export const ARMOR_SLOTS = ["head", "shoulders", "chest", "hands", "legs", "feet"];
export const ARMOR_TYPES = ["cloth", "leather", "chain", "plate"];
// Colors each type starts with when picked in the builder.
export const ARMOR_COLORS = {
  cloth: ["#4a3e7a", "#c8b070"],
  leather: ["#6b4a2e", "#3a2a1a"],
  chain: ["#8a8e94", "#5a3a2a"],
  plate: ["#a8adb5", "#c8a040"],
};

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const add = (a, b) => a.map((v, i) => v + b[i]);
const mul = (a, s) => a.map((v) => v * s);
const SIDES = ["l", "r"];

// Puts the look's armor on: recolors `parts` (body.js's rings and colors for each part of the body)
// and adds shells and pieces to `out`. ctx has the body's scale (s), trunk and limb thickness,
// shoulder and hip widths, and its along(bone, t, extra) and level(y, extra) ring makers.
export function dressArmor(out, parts, look, ctx) {
  for (const slot of ARMOR_SLOTS) {
    const piece = look.armor?.[slot];
    if (!piece || !ARMOR_TYPES.includes(piece.type)) continue;
    const [main, trim] = piece.colors.map(hex);
    DRESS[slot][piece.type]({ out, parts, look, ctx, main, trim, chain: piece.type === "chain" });
  }
}

// A shell over `rings`: each pushed out by `thick`, closed at either end back down onto the body
// so there's no gap to see into. color(band, angle) colors its bands; skip(band, angle) leaves
// faces out, as for a hood's face.
function shell(out, rings, sides, thick, color, { mail = false, skip = null, capEnd = false, edge = null } = {}) {
  const pushed = rings.map((r) => ({ ...r, rx: r.rx + thick, rz: r.rz + thick }));
  const close = (r, toward) => ({ ...r, center: add(r.center, mul(r.dir, toward * thick * 0.4)), rx: r.rx * 0.98, rz: r.rz * 0.98 });
  const all = [close(rings[0], -1), ...pushed, ...(capEnd ? [] : [close(rings[rings.length - 1], 1)])];
  const last = pushed.length - 1;
  out.mail = mail;
  out.tube(all, sides, (band, angle) => (band === 0 || band > last ? (edge ?? color(0, angle)) : color(band - 1, angle)), {
    capEnd,
    endColor: capEnd ? color(last - 1, Math.PI) : null,
    skip: skip && ((band, angle) => band > 0 && band <= last && skip(band - 1, angle)),
  });
  out.mail = false;
}

// A trunk ring's height, in the 6ft body's feet.
const heightOf = (ring, s) => ring.center[1] / s;
const trunkBetween = (parts, s, y0, y1) => parts.trunk.rings.filter((r) => heightOf(r, s) >= y0 - 0.001 && heightOf(r, s) <= y1 + 0.001);

// Recolors a part's bands with the color which(band, angle) gives, keeping the rest where it
// gives none.
function recolor(part, which) {
  const before = part.color;
  part.color = (band, angle) => which(band, angle) ?? before(band, angle);
}

// A skirt hanging from the belt, `heights` down, its lower rings following the thigh on their side
// so it sways with the legs without tearing.
function skirt(out, ctx, heights, widths, color, mail = false) {
  const { s, trunk, hips } = ctx;
  const top = heights[0];
  const rings = heights.map((y, i) => {
    const sway = Math.min(0.85, ((top - y) / (top - heights[heights.length - 1])) * 0.85);
    return ctx.level(y, {
      rx: widths[i][0] * hips * trunk,
      rz: widths[i][1] * trunk,
      bones: [["pelvis", 1]],
      weights: (angle) => {
        const left = 0.5 + 0.5 * Math.sin(angle);
        return [
          ["pelvis", 1 - sway],
          ["thigh_l", sway * left],
          ["thigh_r", sway * (1 - left)],
        ].filter(([, w]) => w > 0);
      },
    });
  });
  out.mail = mail;
  out.tube(rings, 16, color, {});
  out.mail = false;
  return rings;
}

// A cap over the top of each upper arm, its radii (by `t` along the bone) from the arm under it.
function pauldrons(out, ctx, shape, color) {
  const { limb, shoulders } = ctx;
  for (const side of SIDES) {
    const bone = ctx.n("upperarm_l", side);
    const weights = [
      [bone, 0.75],
      ["spine_03", 0.25],
    ];
    const rings = shape.map(([t, r]) => ctx.along(bone, t, { rx: r * limb * shoulders, rz: r * limb, bones: weights }));
    // Closed underneath back onto the arm.
    const [t] = shape[shape.length - 1];
    rings.push(ctx.along(bone, t + 0.02, { rx: 0.17 * limb, rz: 0.17 * limb, bones: weights }));
    out.tube(rings, 10, color, { capStart: true });
  }
}

// What each slot's piece does, by type. Arm bands: 0-6 shoulder to wrist (6 is the cuff), 7-9 the
// hand. Leg bands: 0-2 the thigh, 3 the knee, 4-6 the calf, booted from 5.
const DRESS = {
  chest: {
    cloth: ({ out, parts, ctx, main, trim }) => {
      const { s } = ctx;
      // A robe: the shirt and sleeves recolored, a sash at the belt, and a skirt to the ankles.
      recolor(parts.trunk, (band) => {
        const y = heightOf(parts.trunk.rings[band], s);
        return y >= 3.3 && y < 3.44 ? trim : y >= 3.44 && y < 4.95 ? (y >= 4.85 ? trim : main) : null;
      });
      for (const side of SIDES) recolor(parts[`arm_${side}`], (band) => (band === 6 ? trim : band < 6 ? main : null));
      skirt(out, ctx, [3.36, 2.9, 2.2, 1.4, 0.62, 0.55], [[0.66, 0.46], [0.7, 0.5], [0.78, 0.56], [0.86, 0.62], [0.92, 0.66], [0.9, 0.64]], (band) => (band >= 3 ? trim : main));
    },
    leather: ({ out, parts, ctx, main, trim }) => {
      const { s } = ctx;
      // A jerkin with a strap across the chest, front and back.
      const rings = trunkBetween(parts, s, 3.18, 4.8);
      shell(out, rings, 16, 0.035 * s, (band, angle) => {
        const y = heightOf(rings[band], s);
        return Math.abs(y - (4.15 + 0.45 * Math.sin(angle))) < 0.12 || (y >= 3.3 && y < 3.44) ? trim : main;
      });
    },
    chain: ({ out, parts, ctx, main, trim }) => {
      const { s } = ctx;
      // A hauberk: mail from the hips to the neck, a hem below the belt, and short sleeves.
      const rings = trunkBetween(parts, s, 3.18, 4.9);
      shell(out, rings, 16, 0.03 * s, () => main, { mail: true, edge: trim });
      skirt(out, ctx, [3.25, 2.95, 2.7], [[0.7, 0.5], [0.74, 0.53], [0.74, 0.53]], (band) => (band === 1 ? trim : main), true);
      for (const side of SIDES) shell(out, parts[`arm_${side}`].rings.slice(1, 4), 10, 0.025 * s, () => main, { mail: true, edge: trim });
    },
    plate: ({ out, parts, ctx, main, trim }) => {
      const { s } = ctx;
      // A breastplate over lames at the belly, a gorget at the neck, and tassets over the hips.
      const rings = trunkBetween(parts, s, 3.32, 4.8);
      shell(out, rings, 16, 0.06 * s, (band) => {
        const y = heightOf(rings[band], s);
        return y < 3.44 || (y >= 3.65 && y < 3.92) ? trim : main;
      });
      shell(out, trunkBetween(parts, s, 4.8, 4.97), 16, 0.05 * s, () => trim);
      skirt(out, ctx, [3.4, 3.1, 2.75], [[0.72, 0.52], [0.78, 0.56], [0.8, 0.57]], (band) => (band === 1 ? trim : main));
    },
  },

  shoulders: {
    cloth: ({ out, parts, ctx, main, trim }) => {
      const rings = trunkBetween(parts, ctx.s, 4.55, 4.97);
      shell(out, rings, 16, 0.05 * ctx.s, (band) => (band === 0 ? trim : main));
    },
    leather: ({ out, ctx, main, trim }) => {
      pauldrons(out, ctx, [[-0.13, 0.12], [0.02, 0.27], [0.22, 0.27], [0.3, 0.25]], (band) => (band === 2 ? trim : main));
    },
    chain: ({ out, parts, ctx, main, trim }) => {
      const rings = trunkBetween(parts, ctx.s, 4.42, 4.97);
      shell(out, rings, 16, 0.04 * ctx.s, (band) => (band === 0 ? trim : main), { mail: true });
    },
    plate: ({ out, ctx, main, trim }) => {
      pauldrons(out, ctx, [[-0.2, 0.1], [-0.06, 0.3], [0.12, 0.35], [0.28, 0.34], [0.36, 0.3]], (band) => (band === 1 || band === 3 ? trim : main));
    },
  },

  hands: {
    cloth: ({ parts, main, trim }) => {
      for (const side of SIDES) {
        recolor(parts[`arm_${side}`], (band) => (band === 6 ? trim : band >= 7 ? main : null));
        parts[`arm_${side}`].opts = { ...parts[`arm_${side}`].opts, endColor: main };
      }
    },
    leather: ({ out, parts, ctx, main, trim }) => {
      for (const side of SIDES) shell(out, parts[`arm_${side}`].rings.slice(5), 10, 0.025 * ctx.s, (band) => (band === 0 ? trim : main), { capEnd: true });
    },
    chain: ({ out, parts, ctx, main, trim }) => {
      for (const side of SIDES) shell(out, parts[`arm_${side}`].rings.slice(6), 10, 0.025 * ctx.s, (band) => (band === 0 ? trim : main), { capEnd: true, mail: true });
    },
    plate: ({ out, parts, ctx, main, trim }) => {
      for (const side of SIDES) {
        // A gauntlet, its cuff flaring over the forearm.
        const rings = parts[`arm_${side}`].rings.slice(5).map((r, i) => (i === 0 ? { ...r, rx: r.rx * 1.5, rz: r.rz * 1.5 } : r));
        shell(out, rings, 10, 0.045 * ctx.s, (band) => (band === 3 ? trim : main), { capEnd: true });
      }
    },
  },

  legs: {
    cloth: ({ parts, ctx, main, trim }) => {
      lowerTrunk(parts, ctx, main);
      for (const side of SIDES) recolor(parts[`leg_${side}`], (band) => (band === 0 ? trim : band < 5 ? main : null));
    },
    leather: ({ out, parts, ctx, main, trim }) => {
      lowerTrunk(parts, ctx, shadeOf(main, 0.8));
      for (const side of SIDES) shell(out, parts[`leg_${side}`].rings.slice(0, 6), 8, 0.03 * ctx.s, (band) => (band === 3 ? trim : main));
    },
    chain: ({ out, parts, ctx, main, trim }) => {
      lowerTrunk(parts, ctx, shadeOf(main, 0.8));
      for (const side of SIDES) shell(out, parts[`leg_${side}`].rings.slice(0, 7), 8, 0.025 * ctx.s, () => main, { mail: true, edge: trim });
    },
    plate: ({ out, parts, ctx, main, trim }) => {
      lowerTrunk(parts, ctx, shadeOf(main, 0.6));
      for (const side of SIDES) {
        const leg = parts[`leg_${side}`].rings;
        shell(out, leg.slice(0, 4), 8, 0.05 * ctx.s, () => main);
        shell(out, leg.slice(3, 5), 8, 0.08 * ctx.s, () => trim);
        shell(out, leg.slice(4, 8), 8, 0.05 * ctx.s, () => main);
      }
    },
  },

  feet: {
    cloth: ({ parts, main, trim }) => {
      for (const side of SIDES) {
        parts[`foot_${side}`].color = () => main;
        recolor(parts[`leg_${side}`], (band) => (band >= 5 ? trim : null));
      }
    },
    leather: ({ out, parts, ctx, main, trim }) => {
      for (const side of SIDES) {
        parts[`foot_${side}`].color = () => main;
        recolor(parts[`leg_${side}`], (band) => (band >= 5 ? main : null));
        // A cuff turned over at the top of the boot.
        shell(out, parts[`leg_${side}`].rings.slice(5, 7), 8, 0.04 * ctx.s, () => trim);
      }
    },
    chain: ({ out, parts, ctx, main, trim }) => {
      for (const side of SIDES) {
        recolor(parts[`leg_${side}`], (band) => (band >= 5 ? main : null));
        shell(out, parts[`foot_${side}`].rings, 8, 0.025 * ctx.s, (band) => (band === 1 ? trim : main), { mail: true, capEnd: true });
      }
    },
    plate: ({ out, parts, ctx, main, trim }) => {
      for (const side of SIDES) {
        recolor(parts[`leg_${side}`], (band) => (band >= 5 ? main : null));
        // Sabatons in overlapping plates.
        shell(out, parts[`foot_${side}`].rings, 8, 0.04 * ctx.s, (band) => (band % 2 ? trim : main), { capEnd: true });
      }
    },
  },

  head: {
    cloth: ({ out, parts, ctx, main, trim }) => {
      // A hood, open at the face, over a cowl on the shoulders.
      hood(out, parts, ctx, main, trim, 0);
    },
    leather: ({ out, parts, ctx, main, trim }) => {
      // A cap from the brow up.
      shell(out, parts.head.rings.slice(3), 10, 0.05 * ctx.s, (band) => (band === 0 ? trim : main), { capEnd: true });
    },
    chain: ({ out, parts, ctx, main, trim }) => {
      // A coif: a mail hood.
      hood(out, parts, ctx, main, trim, true);
    },
    plate: ({ out, parts, ctx, main, trim }) => {
      // A helm open at the face, with a brow band and a nasal.
      const { s } = ctx;
      const rings = parts.head.rings.slice(1);
      shell(out, rings, 10, 0.08 * s, (band) => (band === 2 ? trim : main), { capEnd: true, skip: (band, angle) => band <= 1 && Math.abs(angle) < 0.8 });
      const brow = rings[2];
      const front = (dy) => add(brow.center, [0, dy * s, brow.rz + 0.1 * s]);
      out.path([front(0.08), front(-0.05), front(-0.2)], [0.035 * s, 0.03 * s, 0.022 * s], 4, () => trim, () => [["head", 1]], { capStart: true, capEnd: true });
    },
  },
};

// The head's rings shelled from the jaw up, leaving the face open, plus a cowl down onto the
// shoulders.
function hood(out, parts, ctx, main, trim, mail) {
  const { s, trunk, shoulders } = ctx;
  const rings = parts.head.rings.slice(1);
  const face = (band, angle) => band <= 1 && Math.abs(angle) < 1.0;
  const rim = (band, angle) => (band <= 2 && Math.abs(angle) < 1.35) || (band === 2 && Math.abs(angle) < 1.0);
  shell(out, rings, 10, 0.07 * s, (band, angle) => (rim(band, angle) ? trim : main), { capEnd: true, skip: face, mail });
  const neck = parts.head.rings[0];
  const cowl = [
    { ...neck, rx: neck.rx + 0.12 * s, rz: neck.rz + 0.12 * s, center: add(neck.center, [0, 0.12 * s, 0]) },
    ctx.level(4.97, { rx: 0.42 * trunk, rz: 0.34 * trunk, bones: [["neck_01", 0.5], ["spine_03", 0.5]] }),
    ctx.level(4.78, { rx: 0.66 * shoulders * trunk, rz: 0.4 * trunk, bones: [["spine_03", 1]] }),
    ctx.level(4.62, { rx: 0.7 * shoulders * trunk, rz: 0.4 * trunk, bones: [["spine_03", 1]] }),
  ];
  out.mail = mail;
  out.tube(cowl, 12, (band) => (band === 2 ? trim : main), {});
  out.mail = false;
}

const shadeOf = (rgb, f) => rgb.map((v) => v * f);

// The trunk below the belt, recolored for armored legs.
function lowerTrunk(parts, ctx, color) {
  recolor(parts.trunk, (band) => (heightOf(parts.trunk.rings[band], ctx.s) < 3.3 ? color : null));
}
