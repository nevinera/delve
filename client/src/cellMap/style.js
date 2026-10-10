// How a map looks: its palette and the shapes of its decorations. Each kind
// of decoration is drawn as a few dozen sprite variants (see sprites.js)
// that the painter stamps wherever the scene places one. Forest types will
// be other styles.
import {hash01} from "./random";

export const GLADE = {
  key: "glade",
  seed: 1,
  palette: {
    meadow: "#b3c788",
    patchLight: "rgba(214, 226, 160, 0.22)",
    patchDark: "rgba(130, 160, 96, 0.14)",
    tuft: "#7f9b5a",
    shadow: "rgba(26, 38, 20, 0.32)",
    forest: "#34502f",
    crownDark: [78, 118, 64],
    crownLight: [96, 138, 72],
    highlight: "rgba(140, 180, 100, 0.55)",
    ink: "#1d2818",
  },
  // Line widths, in feet, and the shadows' fall, in cell sizes.
  crownInk: 0.16,
  tuftInk: 0.1,
  shadowOffset: {x: 0.3, y: 0.45},
  variants: {crowns: 32, patches: 12, tufts: 8},
};

// Each shape below is for a unit radius, made from variant i's own hashes.
const variantHash = (style, kind, i) => (salt) => hash01(style.seed, kind, i, salt);

// A crown is a cluster of lobes: one in the middle and three to five around
// it, about 1.8 radii across in all.
export function crownShape(style, i) {
  const h = variantHash(style, 1, i);
  const outer = 3 + Math.floor(h(20) * 3);
  const turn = h(21) * Math.PI * 2;
  const lobes = [{dx: 0, dy: 0, r: 0.55, shape: lumps(9, 0.1, h, 30)}];
  for (let j = 0; j < outer; j++) {
    const a = turn + (j / outer) * Math.PI * 2 + (h(22 + j) - 0.5) * 0.6;
    const out = 0.38 + 0.1 * h(100 + j);
    lobes.push({dx: Math.cos(a) * out, dy: Math.sin(a) * out, r: 0.45 + 0.12 * h(110 + j), shape: lumps(9, 0.1, h, 120 + j * 12)});
  }
  return {tone: h(7), lobes};
}

// Half the patches are lighter than the meadow, half darker.
export function patchShape(style, i) {
  const h = variantHash(style, 2, i);
  return {light: i % 2 === 0, shape: lumps(9, 0.18, h, 15)};
}

// A cluster of one to three grass tufts, scattered over a unit radius.
export function tuftShape(style, i) {
  const h = variantHash(style, 3, i);
  const count = 1 + Math.floor(h(1) * 3);
  return Array.from({length: count}, (_, j) => ({x: (h(10 + j) - 0.5) * 1.6, y: (h(20 + j) - 0.5) * 1.6, size: 0.25 + 0.15 * h(30 + j)}));
}

// Radius multipliers for a lumpy circle of n points.
function lumps(n, amount, h, salt) {
  const phase = h(salt) * Math.PI * 2;
  const waves = 3 + Math.floor(h(salt + 1) * 3);
  return Array.from({length: n}, (_, i) => 1 + amount * (0.6 * Math.sin(waves * (i / n) * Math.PI * 2 + phase) + 0.8 * (h(salt + 2 + i) - 0.5)));
}
