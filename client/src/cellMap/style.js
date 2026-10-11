// How a map looks: its palette and the shapes of its decorations. Each kind
// of decoration is drawn as a few dozen sprite variants (see sprites.js)
// that the painter stamps wherever the scene places one. Forest types will
// be other styles.
import {hash01} from "./random";
import THEMES from "./themes.json";

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
    tallGrass: "#a6bd70",
    tallTuft: "#6f8f45",
    tallTuftLight: "#c2d68a",
    marsh: "#98a874",
    pool: "#6f8f8a",
    poolRim: "rgba(220, 235, 220, 0.6)",
    water: "#5f8f9a",
    waterDeep: "#4f7d8b",
    waterRim: "rgba(222, 238, 232, 0.7)",
    bridge: "#a98053",
    bridgeEdge: "#6f4f2f",
    bridgeBeam: "#7d5a36",
    reed: "#5f7442",
    trailEdge: "#8b7a55",
    trail: "#cdb98a",
  },
  // Line widths, in feet, and the shadows' fall, in cell sizes.
  crownInk: 0.16,
  tuftInk: 0.1,
  // Each side of a trail's darker edge.
  trailEdge: 0.3,
  shadowOffset: {x: 0.3, y: 0.45},
  variants: {crowns: 32, patches: 12, tufts: 8, tallTufts: 8, pools: 12, reeds: 8},
};

export const STYLES = {glade: GLADE};

// Shades derived from a theme color, for when a map overrides it: the
// defaults above are hand-tuned, so they're only replaced then.
const DERIVED = {
  meadow: (c) => ({patchLight: rgba(mix(c, WHITE, 0.35), 0.22), patchDark: rgba(scale(c, 0.75), 0.14)}),
  crown: (c) => ({crownDark: scale(c, 0.9), crownLight: scale(c, 1.1), highlight: rgba(scale(c, 1.5), 0.55)}),
  tallTuft: (c) => ({tallTuftLight: hex(mix(c, WHITE, 0.5))}),
  trail: (c) => ({trailEdge: hex(scale(c, 0.68))}),
  water: (c) => ({waterDeep: hex(scale(c, 0.86))}),
  bridge: (c) => ({bridgeEdge: hex(scale(c, 0.66)), bridgeBeam: hex(scale(c, 0.74))}),
  ink: (c) => ({shadow: rgba(c, 0.32)}),
};

// A cellmap's style: its theme's, with the map's colors over the palette.
export function resolveStyle(map) {
  const base = STYLES[map.theme] ?? GLADE;
  const colors = Object.entries(map.colors ?? {}).filter(([key]) => key in (THEMES[base.key]?.colors ?? {}));
  if (!colors.length) return base;
  const palette = {...base.palette};
  for (const [key, value] of colors) {
    palette[key] = value;
    Object.assign(palette, DERIVED[key]?.(rgb(value)));
  }
  return {...base, palette, key: `${base.key}:${colors.map(([k, v]) => `${k}=${v}`).sort().join(",")}`};
}

const WHITE = [255, 255, 255];
const rgb = (value) => {
  const n = parseInt(value.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
const scale = (c, f) => c.map((v) => clamp(v * f));
const mix = (a, b, t) => a.map((v, i) => clamp(v + (b[i] - v) * t));
const rgba = (c, alpha) => `rgba(${c.join(", ")}, ${alpha})`;
const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;

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

// A dense clump of five to eight tall blades, over a unit radius.
export function tallTuftShape(style, i) {
  const h = variantHash(style, 4, i);
  const count = 5 + Math.floor(h(1) * 4);
  return Array.from({length: count}, (_, j) => ({x: (h(10 + j) - 0.5) * 1.2, y: (h(20 + j) - 0.5) * 0.6, lean: (h(30 + j) - 0.5) * 0.9, size: 0.6 + 0.4 * h(40 + j), light: h(50 + j) < 0.3}));
}

// A pool of standing water.
export function poolShape(style, i) {
  const h = variantHash(style, 5, i);
  return lumps(10, 0.22, h, 1);
}

// Three to five reeds rising from a point.
export function reedShape(style, i) {
  const h = variantHash(style, 6, i);
  const count = 3 + Math.floor(h(1) * 3);
  return Array.from({length: count}, (_, j) => ({lean: (j / (count - 1) - 0.5) * 0.9 + (h(10 + j) - 0.5) * 0.2, size: 0.7 + 0.3 * h(20 + j)}));
}

// Radius multipliers for a lumpy circle of n points.
function lumps(n, amount, h, salt) {
  const phase = h(salt) * Math.PI * 2;
  const waves = 3 + Math.floor(h(salt + 1) * 3);
  return Array.from({length: n}, (_, i) => 1 + amount * (0.6 * Math.sin(waves * (i / n) * Math.PI * 2 + phase) + 0.8 * (h(salt + 2 + i) - 0.5)));
}
