import { emptyImage, setPixel } from "./builtObjects.js";

// Tiled images that ship with the game, for walls, floors and roofs: stone blocks, bricks, planks,
// thatch, shingles and cobbles. They're drawn mostly in see-through grays, so the color of what
// wears them shows through and one image serves granite and sandstone alike. Each is drawn by code
// from a fixed seed, so it's the same every time; they're read-only (copy one to change it).

const LIGHT = "1";
const DARK = "6";
const DARKER = "7";

// A steady random sequence.
function random(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

// Paints with wrapping, so an image tiles without seams.
function painter(image, size) {
  return (x, y, ink, opacity) => setPixel(image, ((x % size) + size) % size, ((y % size) + size) % size, { ink, opacity: String(opacity) });
}

// A shade over a whole stone or board: some lighter, some darker, most as they are.
function shade(paint, rand, cells) {
  const r = rand();
  if (r < 0.3) for (const [x, y] of cells) paint(x, y, DARKER, 1);
  else if (r > 0.75) for (const [x, y] of cells) paint(x, y, "0", 1);
}

// Courses of blocks `tall` high, about `wide` across, each course's joints moved along; mortar
// lines between in light gray.
function courses(id, name, size, tall, wide, seed, { staggered = true } = {}) {
  const image = { ...emptyImage(name, "tiled", undefined, size), id };
  const paint = painter(image, size);
  const rand = random(seed);
  for (let row = 0; row * tall < size; row++) {
    const top = row * tall;
    const offset = staggered ? (row % 2) * Math.round(wide / 2) : Math.floor(rand() * wide);
    const joints = [];
    for (let x = offset; x < offset + size; x += wide) joints.push(x);
    for (let k = 0; k < joints.length; k++) {
      const [from, to] = [joints[k], k + 1 < joints.length ? joints[k + 1] : joints[0] + size];
      const cells = [];
      for (let x = from + 1; x < to; x++) for (let y = top + 1; y < top + tall; y++) cells.push([x, y]);
      shade(paint, rand, cells);
      for (let y = top; y < top + tall; y++) paint(from, y, LIGHT, 3);
    }
    for (let x = 0; x < size; x++) paint(x, top, LIGHT, 3);
  }
  // Speckles.
  for (let n = 0; n < size; n++) paint(Math.floor(rand() * size), Math.floor(rand() * size), DARK, 1);
  return image;
}

function planks(id, name, seed) {
  const size = 32;
  const image = { ...emptyImage(name, "tiled", undefined, size), id };
  const paint = painter(image, size);
  const rand = random(seed);
  for (let row = 0; row < 4; row++) {
    const top = row * 8;
    const cells = [];
    for (let x = 0; x < size; x++) for (let y = top + 1; y < top + 8; y++) cells.push([x, y]);
    shade(paint, rand, cells);
    for (let x = 0; x < size; x++) paint(x, top, DARKER, 2);
    // An end joint, and some grain.
    const joint = Math.floor(rand() * size);
    for (let y = top; y < top + 8; y++) paint(joint, y, DARKER, 2);
    for (let n = 0; n < 4; n++) {
      const [x, y, long] = [Math.floor(rand() * size), top + 2 + Math.floor(rand() * 5), 3 + Math.floor(rand() * 6)];
      for (let i = 0; i < long; i++) paint(x + i, y, DARK, 1);
    }
  }
  return image;
}

function thatch(id, name, seed) {
  const size = 32;
  const image = { ...emptyImage(name, "tiled", undefined, size), id };
  const paint = painter(image, size);
  const rand = random(seed);
  // Straws hanging down, darker and lighter, a band of shadow under each layer.
  for (let n = 0; n < 140; n++) {
    const [x, y, long] = [Math.floor(rand() * size), Math.floor(rand() * size), 3 + Math.floor(rand() * 5)];
    const [ink, opacity] = rand() < 0.6 ? [DARK, 1 + Math.floor(rand() * 2)] : [LIGHT, 1];
    for (let i = 0; i < long; i++) paint(x, y + i, ink, opacity);
  }
  for (const band of [7, 15, 23, 31]) for (let x = 0; x < size; x++) paint(x, band, DARKER, 2);
  return image;
}

function shingles(id, name, seed) {
  const size = 32;
  const image = { ...emptyImage(name, "tiled", undefined, size), id };
  const paint = painter(image, size);
  const rand = random(seed);
  for (let row = 0; row < 4; row++) {
    const bottom = row * 8 + 7;
    const offset = (row % 2) * 4;
    for (let x = offset; x < offset + size; x += 8) {
      const cells = [];
      for (let i = 1; i < 8; i++) for (let y = bottom - 6; y < bottom; y++) cells.push([x + i, y]);
      shade(paint, rand, cells);
      for (let y = bottom - 7; y <= bottom; y++) paint(x, y, DARKER, 2);
    }
    for (let x = 0; x < size; x++) paint(x, bottom, DARKER, 3);
  }
  return image;
}

// Rounded stones packed together: each pixel goes with its nearest stone's middle, with gaps
// where two are nearly as near.
function cobbles(id, name, seed) {
  const size = 32;
  const image = { ...emptyImage(name, "tiled", undefined, size), id };
  const paint = painter(image, size);
  const rand = random(seed);
  const middles = Array.from({ length: 14 }, () => [rand() * size, rand() * size]);
  const stones = middles.map(() => []);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const near = middles
        .map(([mx, my], i) => {
          const [dx, dy] = [Math.abs(x - mx), Math.abs(y - my)].map((d) => Math.min(d, size - d));
          return { i, d: Math.hypot(dx, dy) };
        })
        .sort((a, b) => a.d - b.d);
      if (near[1].d - near[0].d < 1.2) paint(x, y, DARKER, 3);
      else stones[near[0].i].push([x, y]);
    }
  }
  for (const cells of stones) shade(paint, rand, cells);
  return image;
}

export const BUILTIN_IMAGES = [
  courses("bistone0", "stone blocks", 64, 16, 24, 11),
  courses("bibrick0", "bricks", 32, 8, 16, 23),
  planks("biplank0", "planks", 37),
  thatch("bithtch0", "thatch", 41),
  shingles("bishngl0", "shingles", 53),
  cobbles("bicobbl0", "cobbles", 67),
].map((image) => ({ ...image, builtin: true }));

const byId = new Map(BUILTIN_IMAGES.map((image) => [image.id, image]));
export const builtinImage = (id) => byId.get(id);
