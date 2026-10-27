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
