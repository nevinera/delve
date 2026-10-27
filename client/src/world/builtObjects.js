import { signText } from "./pixelFont.js";

// Built objects: object types an author puts together from primitive pieces in the editor's object
// builder, stored per world as objects/<id>.json, and shared as collections of them.
//
// An object is { id, name, tags, collection, source, palette, pieces }:
// - id: 8 random base-36 characters, kept through exports; name is only a label.
// - tags: words to find it by, or absent.
// - collection: the id of the world's collection it's in (the editor's collections.json); left
//   out of exports.
// - source: where it was copied from (a collection's URL or file), or absent.
// - palette: the colors its pieces use, each { color: "#rrggbb", param, name }. Up to MAX_PARAMS of
//   them are parameters, which a placement can override; their colors are the defaults. The first
//   colors added are parameters until there are MAX_PARAMS of them.
// - pieces: up to MAX_PIECES, each { type, size: [x, y, z], at: [x, y, z], turn: [yaw, pitch, roll],
//   color }. size is the piece's bounding box in feet; at is its middle, in feet from the object's
//   centre, which sits on the ground (y up, x east, z south); turn is in degrees, applied roll
//   first, then pitch, then yaw (three.js's "YXZ" order), so yaw and pitch aim the piece and roll
//   spins it about its own axis; color indexes the palette.
//   A cylinder may have a taper, its top's width over its bottom's (0 to 1, 1 when absent).
//   decals: images stuck on its flat faces, each { image, face, at: [u, v], size: [w, h], turn }:
//   face names one by its outward normal before sizing and turning, rounded ("0,1,0" is the top);
//   at is where its middle is across the face, 0 to 1 each way; size is in feet; turn is degrees.
//   texts: signs on its flat faces, each a text parameter { name, text, ink, face, at, size, turn }
//   placed as a decal is: name is unique in the object; text is what it says unless a placement
//   says otherwise (pixelFont.js's characters, possibly empty); ink is an image ink.
//   tile: an image repeated over it, { image, every, jitter }: every is how wide one copy is, in
//   feet; jitter (0 to 1) how much each copy's brightness varies, the same way every time.
//   A piece with cut: true is a hole: it's taken out of every other piece, and the faces it leaves
//   take its color.
//
// Every piece stays within REACH_FT of the centre.
//
// A collection is { collection: name, objects: [object, ...], images: [image, ...], structures:
// [structure, ...] } (structures.js), structures absent when there are none.
//
// An image is { id, name, kind, collection, rows }, belonging to a collection, for its objects'
// pieces to wear:
// - kind: "decal" (stuck on one flat face) or "tiled" (repeated over a piece).
// - rows: IMAGE_PX strings of IMAGE_PX pixels (or for a tiled image, maybe TILED_SIZES' larger),
//   top row first, each pixel two characters: its ink
//   ("a" to "z" for the wearing object's palette colors in order, parameters overridden as its
//   pieces are; "0" to "7" for grays from white to black) then its opacity ("1" to "4", in
//   quarters), or ".." for none, where the piece's own color shows. Since inks name palette places,
//   saving keeps them (dropUnusedColors drops only from the end).

export const PIECE_TYPES = ["box", "wedge", "cylinder", "cone", "sphere", "pyramid", "tetrahedron"];
export const MAX_PIECES = 32;
export const MAX_PARAMS = 3;
export const REACH_FT = 32;
export const MIN_SIZE_FT = 0.1;
// Pieces reaching below this are what a character bumps into.
const BLOCK_BELOW_FT = 6;

export const objectPath = (id) => `objects/${id}.json`;
// Images (textures) belong to the whole world, not a collection: any object or structure can
// wear any of them. Worlds kept before that have them in images/, each naming a collection;
// adoptStrays (objects/collections.js) moves them.
export const imagePath = (id) => `textures/${id}.json`;
export const OLD_IMAGES = /^images\/[0-9a-z]{8}\.json$/;

export const IMAGE_PX = 32;
export const TILED_SIZES = [32, 64];
export const IMAGE_KINDS = ["decal", "tiled"];
export const PALETTE_INKS = [..."abcdefghijklmnopqrstuvwxyz"];
export const GRAY_INKS = ["0", "1", "2", "3", "4", "5", "6", "7"];
export const OPACITIES = ["1", "2", "3", "4"];
const MISSING_INK = "#808080"; // for an ink naming a palette place the object doesn't have

export function emptyImage(name = "new image", kind = "decal", random = Math.random, size = IMAGE_PX) {
  return { id: newObjectId(random), name, kind, rows: Array.from({ length: size }, () => "..".repeat(size)) };
}

// How many pixels an image is on a side.
export const imageSize = (image) => image.rows.length;

// The image at another size, each pixel doubled, or every other one kept.
export function resizeImage(image, size) {
  const from = imageSize(image);
  const rows = Array.from({ length: size }, (_, y) => {
    let row = "";
    for (let x = 0; x < size; x++) {
      const [sx, sy] = [Math.floor((x * from) / size), Math.floor((y * from) / size)];
      row += image.rows[sy].slice(sx * 2, sx * 2 + 2);
    }
    return row;
  });
  return { ...image, rows };
}

// A pixel as { ink, opacity } ("a" to "z" or "0" to "7", and "1" to "4"), or null when clear.
export function pixelAt(image, x, y) {
  const s = image.rows[y].slice(x * 2, x * 2 + 2);
  return s === ".." ? null : { ink: s[0], opacity: s[1] };
}

// Sets a pixel, or clears it with null; changes `image` in place.
export function setPixel(image, x, y, pixel) {
  const row = image.rows[y];
  image.rows[y] = row.slice(0, x * 2) + (pixel ? pixel.ink + pixel.opacity : "..") + row.slice(x * 2 + 2);
}

// An ink's color as "#rrggbb", given the wearer's colors (paletteColors).
export function inkColor(ink, colors) {
  const gray = GRAY_INKS.indexOf(ink);
  if (gray >= 0) {
    const v = Math.round(255 * (1 - gray / (GRAY_INKS.length - 1)));
    return `#${v.toString(16).padStart(2, "0").repeat(3)}`;
  }
  return colors[PALETTE_INKS.indexOf(ink)] ?? MISSING_INK;
}

// The image as RGBA bytes (imageSize square, top row first), given the wearer's colors.
export function imageRgba(image, colors) {
  const size = imageSize(image);
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const pixel = pixelAt(image, x, y);
      if (!pixel) continue;
      const hex = inkColor(pixel.ink, colors);
      const i = (y * size + x) * 4;
      out.set([parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), Math.round((255 * Number(pixel.opacity)) / OPACITIES.length)], i);
    }
  }
  return out;
}

// What's wrong with an image, as a list of messages; empty when it's fine.
export function imageProblems(image) {
  const out = [];
  if (!/^[0-9a-z]{8}$/.test(image.id ?? "")) out.push("its id should be 8 letters and digits");
  if (!IMAGE_KINDS.includes(image.kind)) out.push(`its kind should be one of ${IMAGE_KINDS.join(", ")}`);
  const pixel = new RegExp(`^(\\.\\.|[${PALETTE_INKS.join("")}${GRAY_INKS.join("")}][${OPACITIES.join("")}])*$`);
  const sizes = image.kind === "tiled" ? TILED_SIZES : [IMAGE_PX];
  const size = image.rows?.length;
  if (!Array.isArray(image.rows) || !sizes.includes(size) || !image.rows.every((row) => typeof row === "string" && row.length === size * 2 && pixel.test(row))) out.push(`its rows should be ${sizes.join(" or ")} rows of as many pixels`);
  return out;
}

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

// Drops palette colors nothing uses: no piece, no text, and no ink of `images` (the ones its pieces wear).
// Colors keep their places, since images name them by place, so only unused ones at the end go.
export function dropUnusedColors(object, images = []) {
  const used = new Set(object.pieces.map((p) => p.color));
  for (const text of textsOf(object)) if (PALETTE_INKS.includes(text.ink)) used.add(PALETTE_INKS.indexOf(text.ink));
  for (const image of images) for (const row of image.rows) for (let x = 0; x < row.length; x += 2) if (PALETTE_INKS.includes(row[x])) used.add(PALETTE_INKS.indexOf(row[x]));
  while (object.palette.length && !used.has(object.palette.length - 1)) object.palette.pop();
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
  if (object.tags !== undefined && !(Array.isArray(object.tags) && object.tags.every((t) => typeof t === "string"))) out.push("its tags should be a list of words");
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
    (piece.decals ?? []).forEach((d, k) => {
      const ok = typeof d.image === "string" && typeof d.face === "string" && Array.isArray(d.at) && d.at.length === 2 && d.at.every((v) => v >= 0 && v <= 1) && Array.isArray(d.size) && d.size.length === 2 && d.size.every((v) => v >= MIN_SIZE_FT) && Number.isFinite(d.turn);
      if (!ok) out.push(`${name}'s decal ${k + 1} needs an image, a face, where across it (0 to 1), a size and a turn`);
    });
    (piece.texts ?? []).forEach((t, k) => {
      const ok = typeof t.name === "string" && t.name && typeof t.text === "string" && t.text === signText(t.text) && (PALETTE_INKS.includes(t.ink) || GRAY_INKS.includes(t.ink)) && typeof t.face === "string" && Array.isArray(t.at) && t.at.length === 2 && t.at.every((v) => v >= 0 && v <= 1) && Array.isArray(t.size) && t.size.length === 2 && t.size.every((v) => v >= MIN_SIZE_FT) && Number.isFinite(t.turn);
      if (!ok) out.push(`${name}'s text ${k + 1} needs a name, sign text, an ink, a face, where across it (0 to 1), a size and a turn`);
    });
    if (piece.tile !== undefined && !(typeof piece.tile.image === "string" && piece.tile.every >= MIN_SIZE_FT && piece.tile.jitter >= 0 && piece.tile.jitter <= 1)) out.push(`${name}'s tile needs an image, a width (feet) and a jitter (0 to 1)`);
    if (piece.cut !== undefined && typeof piece.cut !== "boolean") out.push(`${name}'s cut should be true or false`);
    if (piece.size.some((s) => s < MIN_SIZE_FT)) out.push(`${name} is smaller than ${MIN_SIZE_FT} ft across`);
    if (pieceCorners(piece).some(([x, y, z]) => Math.hypot(x, y, z) > REACH_FT + 1e-6)) out.push(`${name} reaches more than ${REACH_FT} ft from the centre`);
  });
  const names = textsOf(object).map((t) => t.name);
  if (new Set(names).size < names.length) out.push("two of its texts have the same name");
  return out;
}

// The object's texts, every piece's in order.
export const textsOf = (object) => object.pieces.flatMap((p) => (p.cut ? [] : (p.texts ?? [])));

// What a text says, given a placement's texts ({ name: text }, overriding the object's).
export const textSays = (text, placed = {}) => signText(placed[text.name] ?? text.text);

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

// An object or collection read from JSON text, as { name, objects, images, structures }: name is
// the collection's, or null for a lone object. Each object and image is checked, and records
// `source` when given; structures come as they are, for structures.js to check. Throws with what's
// wrong when something is.
export function readCollection(text, source) {
  const data = JSON.parse(text);
  const list = Array.isArray(data.objects) ? data.objects : [data];
  for (const object of list) {
    const wrong = problems(object);
    if (wrong.length) throw new Error(`${object.name ?? object.id ?? "an object"}: ${wrong.join("; ")}`);
  }
  const images = Array.isArray(data.images) ? data.images : [];
  for (const image of images) {
    const wrong = imageProblems(image);
    if (wrong.length) throw new Error(`image ${image.name ?? image.id ?? ""}: ${wrong.join("; ")}`);
  }
  const sourced = ({ collection, ...thing }) => (source ? { ...thing, source } : thing);
  const structures = Array.isArray(data.structures) ? data.structures : [];
  return { name: typeof data.collection === "string" ? data.collection : null, objects: list.map(sourced), images: images.map(sourced), structures: structures.map(sourced) };
}

// A collection of objects and their images, as JSON text to share.
export function collectionJson(name, objects, images = [], structures = []) {
  const bare = ({ collection, ...thing }) => thing;
  return JSON.stringify({ collection: name, objects: objects.map(bare), images: images.map(bare), ...(structures.length ? { structures: structures.map(bare) } : {}) }, null, 2);
}

// Whether an object, in a collection named `collectionName`, matches a search: its collection's
// name, its name or one of its tags contains the text, ignoring case.
export function matches(text, collectionName, name, tags = []) {
  const want = text.trim().toLowerCase();
  return !want || [collectionName, name, ...tags].some((s) => s.toLowerCase().includes(want));
}
