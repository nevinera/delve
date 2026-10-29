// Helpers for writing builtin objects (builtinObjects.js) in builtObjects.js's format, in feet.
// Each takes its color as a palette index; turn is [yaw, pitch, roll] in degrees.

export const box = (size, at, color = 0, turn = [0, 0, 0]) => ({ type: "box", size, at, turn, color });
export const wedge = (size, at, color = 0, turn = [0, 0, 0]) => ({ type: "wedge", size, at, turn, color });
export const sphere = (size, at, color = 0, turn = [0, 0, 0]) => ({ type: "sphere", size, at, turn, color });
export const cone = (size, at, color = 0, turn = [0, 0, 0]) => ({ type: "cone", size, at, turn, color });
export const pyramid = (size, at, color = 0, turn = [0, 0, 0]) => ({ type: "pyramid", size, at, turn, color });

// An upright cylinder `d` across and `h` tall, its middle at `at`.
export function post(d, h, at, color = 0, { taper, turn = [0, 0, 0] } = {}) {
  return { type: "cylinder", size: [d, h, d], at, turn, color, ...(taper === undefined ? {} : { taper }) };
}

// A cylinder `d` across and `long` long lying along x, turned `yaw` degrees about up and tipped
// `tip` degrees up at its east end.
export function rod(d, long, at, color = 0, yaw = 0, tip = 0) {
  return { type: "cylinder", size: [d, long, d], at, turn: [yaw, 0, 90 + tip], color };
}

// A wheel `d` across and `wide` thick, its axle along z.
export const wheel = (d, wide, at, color = 0) => ({ type: "cylinder", size: [d, wide, d], at, turn: [0, 90, 0], color });

// A piece that's a hole in the others.
export const cut = (piece) => ({ ...piece, cut: true });

// A piece wearing a builtin tiled image.
export const TILES = { stone: "bistone0", brick: "bibrick0", planks: "biplank0", thatch: "bithtch0", shingles: "bishngl0", cobbles: "bicobbl0" };
export const tiled = (piece, image, every = 2, jitter = 0.15) => ({ ...piece, tile: { image: TILES[image], every, jitter } });

// A palette color: a parameter when it has a name.
export const color = (hex, name) => (name ? { color: hex, param: true, name } : { color: hex, param: false });

export const object = (id, name, tags, palette, pieces) => ({ id, name, tags, palette, pieces });

// Holes through what an object's line of sight shape fills in (builtObjects.js sightCuts): a
// rectangle seen along z, x0 to x1 across and y0 to y1 up, or seen along x, z0 to z1 across.
export const throughZ = (x0, x1, y0, y1) => ({ along: [0, 0, 1], outline: [[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]] });
export const throughX = (z0, z1, y0, y1) => ({ along: [1, 0, 0], outline: [[0, y0, z0], [0, y0, z1], [0, y1, z1], [0, y1, z0]] });
export const withCuts = (made, ...sightCuts) => ({ ...made, sightCuts });

// Words on a piece's face (named by its outward normal, "0,0,1" its south face), `size` feet.
export const sign = (piece, name, text, size, face = "0,0,1", ink = "7") => ({ ...piece, texts: [...(piece.texts ?? []), { name, text, ink, face, at: [0.5, 0.5], size, turn: 0 }] });

// --- parts several collections use, each a list of pieces ---

// A gable roof `size` big (y its rise) along x from two wedges back to back, its eaves at `y`,
// its middle at (x, z).
export const gable = ([w, rise, d], y, c, image = "shingles", [x, z] = [0, 0]) => [
  tiled(wedge([w, rise, d / 2], [x, y + rise / 2, z - d / 4], c, [180, 0, 0]), image),
  tiled(wedge([w, rise, d / 2], [x, y + rise / 2, z + d / 4], c), image),
];

// A barrel `s` times 3 ft tall standing at (x, y, z): staves of color c, hoops of color hoop.
export const barrel = (x, z, c, hoop, s = 1, y = 0) => [
  tiled(post(2 * s, 3 * s, [x, y + 1.5 * s, z], c), "planks", 0.8 * s),
  post(2.2 * s, 1.6 * s, [x, y + 1.5 * s, z], c),
  post(2.08 * s, 0.15 * s, [x, y + 0.45 * s, z], hoop),
  post(2.08 * s, 0.15 * s, [x, y + 2.55 * s, z], hoop),
  post(2.25 * s, 0.15 * s, [x, y + 1.5 * s, z], hoop),
];

// A crate `s` ft on a side with its middle at (x, y + s / 2, z), banded in color band.
export const crate = (x, y, z, s, c, band, yaw = 0) => [
  tiled(box([s, s, s], [x, y + s / 2, z], c, [yaw, 0, 0]), "planks", s / 2),
  box([s * 1.04, s * 0.12, s * 1.04], [x, y + s * 0.08, z], band, [yaw, 0, 0]),
  box([s * 1.04, s * 0.12, s * 1.04], [x, y + s * 0.92, z], band, [yaw, 0, 0]),
];

// A sack about 2 ft tall at (x, z), leaning `lean` degrees.
export const sack = (x, z, c, s = 1, y = 0, lean = 0) => [
  sphere([1.6 * s, 2 * s, 1.4 * s], [x, y + 1 * s, z], c, [0, 0, lean]),
  post(0.5 * s, 0.45 * s, [x, y + 2.05 * s, z], c, { taper: 0.6 }),
];

// A small fire at (x, z): crossed logs of color log and flames of colors flame and core.
export const fire = (x, z, log, flame, core, s = 1) => [
  rod(0.4 * s, 2.6 * s, [x, 0.25 * s, z], log, 0),
  rod(0.4 * s, 2.6 * s, [x, 0.25 * s, z], log, 60),
  rod(0.4 * s, 2.6 * s, [x, 0.25 * s, z], log, 120),
  cone([1.6 * s, 2.2 * s, 1.6 * s], [x, 1.3 * s, z], flame),
  cone([0.9 * s, 1.5 * s, 0.9 * s], [x, 1.05 * s, z], core),
];

// A ring of `n` stones `r` ft out from (x, z).
export const ring = (x, z, r, n, c, s = 0.8) =>
  Array.from({ length: n }, (_, k) => {
    const a = (k / n) * Math.PI * 2;
    return sphere([s * 1.2, s * 0.8, s], [x + Math.cos(a) * r, s * 0.3, z + Math.sin(a) * r], c, [(-a * 180) / Math.PI, 0, 0]);
  });
