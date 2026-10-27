// A tiny pixel font for signs: capitals, digits, space, "-", ".", "!" and "?", 5 pixels tall and
// mostly 3 wide (M, N and W are wider, to stay readable), a pixel apart.

export const GLYPH_PX = 5;
export const LINE_GAP_PX = 1;
export const MAX_TEXT = 32;
const SPACE_PX = 2;
// What an empty text shows where an author looks at it, but not in the world.
export const TEXT_PLACEHOLDER = "ABCDEFG";

const GLYPHS = {
  A: [".#.", "#.#", "###", "#.#", "#.#"],
  B: ["##.", "#.#", "##.", "#.#", "##."],
  C: [".##", "#..", "#..", "#..", ".##"],
  D: ["##.", "#.#", "#.#", "#.#", "##."],
  E: ["###", "#..", "##.", "#..", "###"],
  F: ["###", "#..", "##.", "#..", "#.."],
  G: [".##", "#..", "#.#", "#.#", ".##"],
  H: ["#.#", "#.#", "###", "#.#", "#.#"],
  I: ["###", ".#.", ".#.", ".#.", "###"],
  J: ["..#", "..#", "..#", "#.#", ".#."],
  K: ["#.#", "#.#", "##.", "#.#", "#.#"],
  L: ["#..", "#..", "#..", "#..", "###"],
  M: ["#...#", "##.##", "#.#.#", "#...#", "#...#"],
  N: ["#..#", "##.#", "#.##", "#..#", "#..#"],
  O: [".#.", "#.#", "#.#", "#.#", ".#."],
  P: ["##.", "#.#", "##.", "#..", "#.."],
  Q: [".#.", "#.#", "#.#", "##.", ".##"],
  R: ["##.", "#.#", "##.", "#.#", "#.#"],
  S: [".##", "#..", ".#.", "..#", "##."],
  T: ["###", ".#.", ".#.", ".#.", ".#."],
  U: ["#.#", "#.#", "#.#", "#.#", "###"],
  V: ["#.#", "#.#", "#.#", "#.#", ".#."],
  W: ["#...#", "#...#", "#.#.#", "##.##", "#...#"],
  X: ["#.#", "#.#", ".#.", "#.#", "#.#"],
  Y: ["#.#", "#.#", ".#.", ".#.", ".#."],
  Z: ["###", "..#", ".#.", "#..", "###"],
  0: ["###", "#.#", "#.#", "#.#", "###"],
  1: [".#.", "##.", ".#.", ".#.", "###"],
  2: ["##.", "..#", ".#.", "#..", "###"],
  3: ["##.", "..#", ".#.", "..#", "##."],
  4: ["#.#", "#.#", "###", "..#", "..#"],
  5: ["###", "#..", "##.", "..#", "##."],
  6: [".##", "#..", "###", "#.#", "###"],
  7: ["###", "..#", "..#", ".#.", ".#."],
  8: ["###", "#.#", "###", "#.#", "###"],
  9: ["###", "#.#", "###", "..#", "##."],
  "-": ["...", "...", "###", "...", "..."],
  ".": [".", ".", ".", ".", "#"],
  "!": ["#", "#", "#", ".", "#"],
  "?": ["##.", "..#", ".#.", "...", ".#."],
};

// Text as the font can show it: capitals, its characters only, single spaces, at most MAX_TEXT.
export function signText(text) {
  return String(text ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9 .!?-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT);
}

const charPx = (c) => (c === " " ? SPACE_PX : GLYPHS[c][0].length);
const linePx = (line) => [...line].reduce((sum, c) => sum + charPx(c), 0) + Math.max(0, line.length - 1);

// The words in `count` lines, as even as greedy filling makes them.
function wrap(words, count) {
  const total = linePx(words.join(" "));
  const lines = [];
  let line = [];
  for (const word of words) {
    const tried = [...line, word].join(" ");
    if (line.length && linePx(tried) > total / count && lines.length < count - 1) {
      lines.push(line.join(" "));
      line = [word];
    } else line.push(word);
  }
  lines.push(line.join(" "));
  return lines;
}

// The text laid out to fill a box `width` by `height` (any units) as big as it can, with a pixel
// of margin all round, in up to 3 lines: { cols, rows, on: [[x, y], ...] }, the pixels the
// ink covers, (0, 0) the top left, across a grid cols by rows covering the box.
export function layoutText(text, width, height) {
  const words = signText(text).split(" ").filter(Boolean);
  if (!words.length || width <= 0 || height <= 0) return { cols: 1, rows: 1, on: [] };
  let best = null;
  for (let count = 1; count <= Math.min(3, words.length); count++) {
    const lines = wrap(words, count);
    const wide = Math.max(...lines.map(linePx)) + 2;
    const tall = count * (GLYPH_PX + LINE_GAP_PX) - LINE_GAP_PX + 2;
    const px = Math.min(width / wide, height / tall);
    if (!best || px > best.px) best = { lines, px };
  }
  const { lines, px } = best;
  const cols = Math.max(1, Math.round(width / px));
  const rows = Math.max(1, Math.round(height / px));
  const tall = lines.length * (GLYPH_PX + LINE_GAP_PX) - LINE_GAP_PX;
  const on = [];
  lines.forEach((line, l) => {
    let x = Math.floor((cols - linePx(line)) / 2);
    const y = Math.floor((rows - tall) / 2) + l * (GLYPH_PX + LINE_GAP_PX);
    for (const c of line) {
      if (c !== " ") GLYPHS[c].forEach((row, j) => [...row].forEach((p, i) => p === "#" && on.push([x + i, y + j])));
      x += charPx(c) + 1;
    }
  });
  return { cols, rows, on };
}
