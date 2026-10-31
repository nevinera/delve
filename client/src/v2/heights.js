import { bytesToDigits, digit, digits, digitsToBytes, readDigits } from "./digits.js";
import { unzip, zip } from "./zstd.js";

// Heights in text world files (plate.js, platter.js), in quarter feet, as lines of base64 digits
// (digits.js). A line is a format letter, its base (its lowest height, as 3 digits of the height
// plus 32,768), and the heights over the base:
// - f: none, every height is the base (a span of 0);
// - 1: a digit each (a span under 16 ft);
// - 2: two digits each (a span under 1,024 ft);
// - d: by rows, each row's first height a space and two digits over the base, and each after it a
//   digit, its change from the one before plus 31, or where it changes by more than 31, a space
//   and two digits (a span under 1,024 ft);
// - 3: three digits each, of the height plus 32,768 (anything).
// A tile's 65×65 corners are kept either as a line for each of its 8×8 chunks (their own 8×8
// corners) and one for its far edge, or where it spans under 1,024 ft, as its rows in d's form
// zipped with zstd (encodeTile, once zstd.js's writer is loaded).

const OFFSET = 32768;
const NEAR = 31; // the most a d height changes by in one digit
const ONE = 64; // spans under this many quarter feet take a digit a height
const TWO = 4096; // and under this, two

const CORNERS = 65;
const CHUNK = 8;

// Feet as whole quarter feet, as the files keep them.
export const quarters = (feet) => Math.max(-OFFSET, Math.min(OFFSET - 1, Math.round(feet * 4)));

// Quarter feet `q` (any array of whole numbers) as a line, d taking rows of `row`.
export function encodeLine(q, row) {
  let [lo, hi, jumps] = [Infinity, -Infinity, 0];
  for (let k = 0; k < q.length; k++) {
    lo = Math.min(lo, q[k]);
    hi = Math.max(hi, q[k]);
    if (k % row && Math.abs(q[k] - q[k - 1]) > NEAR) jumps++;
  }
  const base = digits(lo + OFFSET, 3);
  const span = hi - lo;
  if (span === 0) return `f${base}`;
  let out = "";
  if (span < ONE) {
    for (let k = 0; k < q.length; k++) out += digit(q[k] - lo);
    return `1${base}${out}`;
  }
  // d is a digit a height and two more for each row's start and each jump; 2 is two a height.
  if (span < TWO && Math.ceil(q.length / row) + jumps < q.length / 2) return `d${base}${deltaRows(q, row, lo)}`;
  if (span < TWO) {
    for (let k = 0; k < q.length; k++) out += digits(q[k] - lo, 2);
    return `2${base}${out}`;
  }
  for (let k = 0; k < q.length; k++) out += digits(q[k] + OFFSET, 3);
  return `3${base}${out}`;
}

// `q` in d's form, by rows of `row`, over `lo`.
function deltaRows(q, row, lo) {
  let out = "";
  for (let k = 0; k < q.length; k++) {
    const change = k % row ? q[k] - q[k - 1] : null;
    out += change !== null && Math.abs(change) <= NEAR ? digit(change + NEAR) : ` ${digits(q[k] - lo, 2)}`;
  }
  return out;
}

// The `count` heights in quarter feet a line holds, from `at` in `text` (a line's first letter).
// Gives them and where the line ends.
export function decodeLine(text, at, count) {
  const q = new Int32Array(count);
  const kind = text[at];
  const lo = readDigits(text, at + 1, 3) - OFFSET;
  let p = at + 4;
  if (kind === "f") q.fill(lo);
  else if (kind === "1") for (let k = 0; k < count; k++) q[k] = lo + readDigits(text, p++, 1);
  else if (kind === "2") for (let k = 0; k < count; k++, p += 2) q[k] = lo + readDigits(text, p, 2);
  else if (kind === "3") for (let k = 0; k < count; k++, p += 3) q[k] = readDigits(text, p, 3) - OFFSET;
  else if (kind === "d") {
    for (let k = 0; k < count; k++) {
      if (text[p] === " ") {
        q[k] = lo + readDigits(text, p + 1, 2);
        p += 3;
      } else q[k] = q[k - 1] + readDigits(text, p++, 1) - NEAR;
    }
  } else throw new Error(`unknown heights format ${JSON.stringify(kind)}`);
  return [q, p];
}

// A tile's 65×65 corner heights (feet) as its lines: ["h z <zipped>"], or ["h c"] and a line for
// each chunk and the far edge, each "h <line>".
export function encodeTile(heights) {
  const q = Int32Array.from(heights, quarters);
  let [lo, hi] = [Infinity, -Infinity];
  for (const v of q) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  if (hi - lo < TWO) {
    let text = `${digits(lo + OFFSET, 3)}\n`;
    for (let r = 0; r < CORNERS; r++) text += `${deltaRows(q.subarray(r * CORNERS, (r + 1) * CORNERS), CORNERS, lo)}\n`;
    const zipped = zip(new TextEncoder().encode(text));
    if (zipped) return [`h z ${bytesToDigits(zipped)}`];
  }
  const lines = ["h c"];
  for (const part of tileParts()) lines.push(`h ${encodeLine(part.map((k) => q[k]), part.row)}`);
  return lines;
}

// Tile heights (feet) from its lines, as encodeTile writes them.
export function decodeTile(lines) {
  const heights = new Float32Array(CORNERS * CORNERS);
  const [first] = lines;
  if (first.startsWith("h z ")) {
    const text = new TextDecoder().decode(unzip(digitsToBytes(first.slice(4))));
    const lo = readDigits(text, 0, 3) - OFFSET;
    // Each row as a d line over the base.
    let p = 4;
    for (let r = 0; r < CORNERS; r++) {
      const [q, end] = decodeLine(`d${digits(lo + OFFSET, 3)}${text.slice(p, text.indexOf("\n", p))}`, 0, CORNERS);
      for (let c = 0; c < CORNERS; c++) heights[r * CORNERS + c] = q[c] / 4;
      p += end - 4 + 1;
    }
    return heights;
  }
  if (first !== "h c") throw new Error(`unknown tile heights ${JSON.stringify(first.slice(0, 8))}`);
  tileParts().forEach((part, n) => {
    const [q] = decodeLine(lines[n + 1], 2, part.length);
    part.forEach((k, i) => (heights[k] = q[i] / 4));
  });
  return heights;
}

// The corner indexes of each chunk's own 8×8 corners, in chunk order, then the far edge's (row
// 64, then column 64 down to row 63), each with its row length.
let PARTS = null;
function tileParts() {
  if (PARTS) return PARTS;
  PARTS = [];
  for (let cj = 0; cj < CHUNK; cj++) {
    for (let ci = 0; ci < CHUNK; ci++) {
      const part = [];
      for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) part.push((cj * CHUNK + j) * CORNERS + ci * CHUNK + i);
      part.row = CHUNK;
      PARTS.push(part);
    }
  }
  const edge = [];
  for (let c = 0; c < CORNERS; c++) edge.push((CORNERS - 1) * CORNERS + c);
  for (let r = 0; r < CORNERS - 1; r++) edge.push(r * CORNERS + CORNERS - 1);
  edge.row = edge.length;
  PARTS.push(edge);
  return PARTS;
}
