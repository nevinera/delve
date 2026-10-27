// Built objects: object types an author puts together from primitive pieces in the editor's object
// builder, stored per world as objects/<id>.json, and shared as collections of them.
//
// An object is { id, name, source, palette, pieces }:
// - id: 8 random base-36 characters, kept through copies and exports; name is only a label.
// - source: where it was copied from (a collection's URL), or absent.
// - palette: the colors its pieces use, each { color: "#rrggbb", param, name }. Up to MAX_PARAMS of
//   them are parameters, which a placement can override; their colors are the defaults. The first
//   colors added are parameters until there are MAX_PARAMS of them.
// - pieces: up to MAX_PIECES, each { type, size: [x, y, z], at: [x, y, z], turn: [yaw, pitch, roll],
//   color }. size is the piece's bounding box in feet; at is its middle, in feet from the object's
//   centre, which sits on the ground (y up, x east, z south); turn is in degrees, applied roll
//   first, then pitch, then yaw (three.js's "YXZ" order), so yaw and pitch aim the piece and roll
//   spins it about its own axis; color indexes the palette.
//   A cylinder may have a taper, its top's width over its bottom's (0 to 1, 1 when absent).
//   A piece with cut: true is a hole: it's taken out of every other piece, and the faces it leaves
//   take its color.
//
// Every piece stays within REACH_FT of the centre.
//
// A collection is { collection: name, objects: [object, ...] }.

export const PIECE_TYPES = ["box", "wedge", "cylinder", "cone", "sphere", "pyramid", "tetrahedron"];
export const MAX_PIECES = 32;
export const MAX_PARAMS = 3;
export const REACH_FT = 32;
export const MIN_SIZE_FT = 0.1;
// Pieces reaching below this are what a character bumps into.
const BLOCK_BELOW_FT = 6;

export const objectPath = (id) => `objects/${id}.json`;

export function newObjectId(random = Math.random) {
  let id = "";
  for (let i = 0; i < 8; i++) id += Math.floor(random() * 36).toString(36);
  return id;
}

export function emptyObject(name = "new object", random = Math.random) {
  return { id: newObjectId(random), name, palette: [], pieces: [] };
}

// The palette index for a color, adding it when it's new: as a parameter while there are fewer
// than MAX_PARAMS.
export function addColor(object, color) {
  const found = object.palette.findIndex((p) => p.color === color);
  if (found >= 0) return found;
  const param = object.palette.filter((p) => p.param).length < MAX_PARAMS;
  object.palette.push({ color, param });
  return object.palette.length - 1;
}

// Drops palette colors no piece uses, renumbering the pieces' colors.
export function dropUnusedColors(object) {
  const used = new Set(object.pieces.map((p) => p.color));
  const renumber = new Map();
  object.palette = object.palette.filter((_, i) => {
    if (!used.has(i)) return false;
    renumber.set(i, renumber.size);
    return true;
  });
  for (const piece of object.pieces) piece.color = renumber.get(piece.color);
}

// The piece's colors, as "#rrggbb", with `params` (the parameters' colors in palette order, any
// left out keep their defaults) in place of the defaults.
export function paletteColors(object, params = []) {
  let n = 0;
  return object.palette.map((p) => (p.param ? (params[n++] ?? p.color) : p.color));
}

// Rotates [x, y, z] by a piece's turn: roll about z, pitch about x, then yaw about y.
export function turnPoint([x, y, z], [yaw, pitch, roll]) {
  const r = (d) => (d * Math.PI) / 180;
  const [cz, sz, cx, sx, cy, sy] = [Math.cos(r(roll)), Math.sin(r(roll)), Math.cos(r(pitch)), Math.sin(r(pitch)), Math.cos(r(yaw)), Math.sin(r(yaw))];
  [x, y] = [x * cz - y * sz, x * sz + y * cz];
  [y, z] = [y * cx - z * sx, y * sx + z * cx];
  [x, z] = [x * cy + z * sy, -x * sy + z * cy];
  return [x, y, z];
}

// The eight corners of a piece's bounding box, placed in the object.
export function pieceCorners({ size, at, turn }) {
  const corners = [];
  for (const sx of [-0.5, 0.5]) {
    for (const sy of [-0.5, 0.5]) {
      for (const sz of [-0.5, 0.5]) {
        const p = turnPoint([sx * size[0], sy * size[1], sz * size[2]], turn);
        corners.push([p[0] + at[0], p[1] + at[1], p[2] + at[2]]);
      }
    }
  }
  return corners;
}

// What's wrong with an object, as a list of messages; empty when it's fine.
export function problems(object) {
  const out = [];
  if (!/^[0-9a-z]{8}$/.test(object.id ?? "")) out.push("its id should be 8 letters and digits");
  if (!Array.isArray(object.pieces) || !Array.isArray(object.palette)) return [...out, "it needs pieces and a palette"];
  if (object.pieces.length > MAX_PIECES) out.push(`it has ${object.pieces.length} pieces, more than ${MAX_PIECES}`);
  if (object.palette.filter((p) => p.param).length > MAX_PARAMS) out.push(`more than ${MAX_PARAMS} of its colors are parameters`);
  for (const p of object.palette) if (!/^#[0-9a-f]{6}$/i.test(p.color ?? "")) out.push(`${JSON.stringify(p.color)} isn't a #rrggbb color`);
  object.pieces.forEach((piece, n) => {
    const name = `piece ${n + 1}`;
    const before = out.length;
    if (!PIECE_TYPES.includes(piece.type)) out.push(`${name} is an unknown type, ${JSON.stringify(piece.type)}`);
    for (const key of ["size", "at", "turn"]) {
      if (!Array.isArray(piece[key]) || piece[key].length !== 3 || !piece[key].every(Number.isFinite)) out.push(`${name} needs three numbers for ${key}`);
    }
    if (!Number.isInteger(piece.color) || !object.palette[piece.color]) out.push(`${name}'s color isn't in the palette`);
    if (out.length > before) return;
    if (piece.taper !== undefined && (piece.type !== "cylinder" || !(piece.taper >= 0 && piece.taper <= 1))) out.push(`${name}'s taper should be 0 to 1, on a cylinder`);
    if (piece.cut !== undefined && typeof piece.cut !== "boolean") out.push(`${name}'s cut should be true or false`);
    if (piece.size.some((s) => s < MIN_SIZE_FT)) out.push(`${name} is smaller than ${MIN_SIZE_FT} ft across`);
    if (pieceCorners(piece).some(([x, y, z]) => Math.hypot(x, y, z) > REACH_FT + 1e-6)) out.push(`${name} reaches more than ${REACH_FT} ft from the centre`);
  });
  return out;
}

// What the game needs to block movement and sight, as world/objects.js keeps for every object:
// { footprint, height } for scale 1. The footprint is round or a rectangle about the centre,
// whichever covers less, of the pieces reaching below head height. Holes don't change it.
export function shapeOf(object) {
  let height = 0;
  let [halfX, halfZ, radius] = [0, 0, 0];
  for (const piece of object.pieces) {
    if (piece.cut) continue;
    const corners = pieceCorners(piece);
    height = Math.max(height, ...corners.map((c) => c[1]));
    if (Math.min(...corners.map((c) => c[1])) >= BLOCK_BELOW_FT) continue;
    for (const [x, , z] of corners) {
      [halfX, halfZ] = [Math.max(halfX, Math.abs(x)), Math.max(halfZ, Math.abs(z))];
      radius = Math.max(radius, Math.hypot(x, z));
    }
  }
  const round = (v) => Math.round(v * 100) / 100;
  const footprint = Math.PI * radius ** 2 <= 4 * halfX * halfZ ? { circle: round(radius) } : { rect: [round(2 * halfX), round(2 * halfZ)] };
  return { footprint, height: round(height) };
}

// An object or collection read from JSON text, as a list of objects, each checked. Throws with
// what's wrong when something is.
export function readObjects(text, source) {
  const data = JSON.parse(text);
  const list = Array.isArray(data.objects) ? data.objects : [data];
  for (const object of list) {
    const wrong = problems(object);
    if (wrong.length) throw new Error(`${object.name ?? object.id ?? "an object"}: ${wrong.join("; ")}`);
  }
  return list.map((object) => (source ? { ...object, source } : object));
}

// A collection of objects, as JSON text to share.
export function collectionJson(name, objects) {
  return JSON.stringify({ collection: name, objects }, null, 2);
}
