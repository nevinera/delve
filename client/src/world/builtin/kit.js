import { TILES } from "./pieces.js";

// Compact helpers for the larger builtin collections. A shelf is a collection whose objects get
// their ids from their names, so don't rename one once it's shipped. In the piece helpers x, y and
// z are feet from the object's centre, and y is where the piece's bottom sits, except for a ball,
// where it's the middle.

const fnv = (text) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
};
const idOf = (text) => `b${fnv(text).toString(36).padStart(7, "0").slice(-7)}${""}`;

// "#rrggbb:name" is a parameter, up to three of them; a bare "#rrggbb" is fixed.
const paletteOf = (colors) => {
  let params = 0;
  return colors.map((text) => {
    const [color, name] = text.split(":");
    return name && params++ < 3 ? { color, param: true, name } : { color, param: false };
  });
};

function randomOf(seed) {
  let a = seed;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return (lo = 0, hi = 1) => lo + next() * (hi - lo);
}

const near = (v) => Math.round(v * 1000) / 1000;
// Pieces with sizes no smaller than a piece may be, and numbers without long tails.
const tidy = (p) => ({ ...p, size: p.size.map((v) => Math.max(0.1, near(v))), at: p.at.map(near), turn: p.turn.map(near) });

// Flags: "see" for what doesn't block sight, "walk" for what a character walks through.
const flagged = (flags = "") => ({ ...(flags.includes("see") ? { blocksSight: false } : {}), ...(flags.includes("walk") ? { walkThrough: true } : {}) });

// A collection. fill(add, set) lists it: add(name, tags, colors, pieces, flags) one object;
// set(name, count, tags, colors, make, flags) a variant set, make(r, k) giving each one's pieces
// from a seeded random r(lo, hi).
export function shelf(id, name, fill) {
  const objects = [];
  const add = (made, tags, colors, pieces, flags, extra) => objects.push({ id: idOf(`${id}/${made}`), name: made, tags, palette: paletteOf(colors), pieces: pieces.flat(Infinity).map(tidy), ...flagged(flags), ...extra });
  const set = (made, count, tags, colors, make, flags) => {
    for (let k = 1; k <= count; k++) add(`${made} ${k}`, tags, colors, make(randomOf(fnv(`${id}/${made}/${k}`)), k), flags, { variantSet: made });
  };
  fill(add, set);
  return { id, name, objects };
}

const flat = [0, 0, 0];
export const bx = (w, h, d, x = 0, y = 0, z = 0, c = 0, yaw = 0) => ({ type: "box", size: [w, h, d], at: [x, y + h / 2, z], turn: yaw ? [yaw, 0, 0] : flat, color: c });
export const wg = (w, h, d, x = 0, y = 0, z = 0, c = 0, yaw = 0) => ({ type: "wedge", size: [w, h, d], at: [x, y + h / 2, z], turn: yaw ? [yaw, 0, 0] : flat, color: c });
export const cy = (d, h, x = 0, y = 0, z = 0, c = 0, taper) => ({ type: "cylinder", size: [d, h, d], at: [x, y + h / 2, z], turn: flat, color: c, ...(taper === undefined ? {} : { taper }) });
export const cn = (d, h, x = 0, y = 0, z = 0, c = 0) => ({ type: "cone", size: [d, h, d], at: [x, y + h / 2, z], turn: flat, color: c });
export const py = (w, h, d, x = 0, y = 0, z = 0, c = 0, yaw = 0) => ({ type: "pyramid", size: [w, h, d], at: [x, y + h / 2, z], turn: yaw ? [yaw, 0, 0] : flat, color: c });
export const ba = (w, h, d, x = 0, y = 0, z = 0, c = 0, yaw = 0) => ({ type: "sphere", size: [w, h, d], at: [x, y, z], turn: yaw ? [yaw, 0, 0] : flat, color: c });
// A cone hanging point down, its top at y.
export const hang = (d, h, x = 0, y = 0, z = 0, c = 0) => ({ type: "cone", size: [d, h, d], at: [x, y - h / 2, z], turn: [0, 0, 180], color: c });
// A cylinder `long` ft long lying along x with its middle at (x, y, z), turned `yaw` about up and tipped `tip` up at its east end.
export const rd = (d, long, x = 0, y = 0, z = 0, c = 0, yaw = 0, tip = 0) => ({ type: "cylinder", size: [d, long, d], at: [x, y, z], turn: [yaw, 0, 90 + tip], color: c });
// A cylinder leaning from upright: `lean` degrees toward yaw, with its middle at (x, y, z).
export const ln = (d, long, x = 0, y = 0, z = 0, c = 0, yaw = 0, lean = 10, taper) => ({ type: "cylinder", size: [d, long, d], at: [x, y, z], turn: [yaw, 0, lean], color: c, ...(taper === undefined ? {} : { taper }) });
// A box turned any way, with its middle at (x, y, z).
export const tb = (w, h, d, x, y, z, c = 0, turn = flat) => ({ type: "box", size: [w, h, d], at: [x, y, z], turn, color: c });
export const tile = (piece, image, every = 2, jitter = 0.15) => ({ ...piece, tile: { image: TILES[image], every, jitter } });
// A disc lying flat, its underside at y.
export const disc = (d, x = 0, y = 0, z = 0, c = 0, h = 0.1) => cy(d, h, x, y, z, c);

// Four legs at the corners of a w by d rectangle, `h` tall.
export const legs = (w, d, h, t = 0.3, c = 0, y = 0) => [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => bx(t, h, t, (a * (w - t)) / 2, y, (b * (d - t)) / 2, c));
// A flat top on four legs, its surface at h.
export const tabled = (w, d, h, c = 0, thick = 0.25, leg = 0.3, lc = c) => [bx(w, thick, d, 0, h - thick, 0, c), ...legs(w - 0.2, d - 0.2, h - thick, leg, lc)];
// A ring of `n` things around (0, 0) made by f(x, z, k, angle in degrees).
export const around = (n, radius, f, start = 0) => Array.from({ length: n }, (_, k) => {
  const a = start + (k / n) * Math.PI * 2;
  return f(Math.cos(a) * radius, Math.sin(a) * radius, k, (-a * 180) / Math.PI);
});
// Things scattered in a disc of the radius by f(x, z, k), using r.
export const strewn = (r, n, radius, f) => Array.from({ length: n }, (_, k) => {
  const [a, d] = [r(0, Math.PI * 2), radius * Math.sqrt(r())];
  return f(Math.cos(a) * d, Math.sin(a) * d, k);
});
