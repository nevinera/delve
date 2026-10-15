// How a map looks: each theme is a style, a config of its palette, which
// shapes its decorations take and how thickly they're placed. Each kind of
// decoration is drawn as a few dozen sprite variants (see sprites.js) that
// the painter stamps wherever the scene places one, so a new theme is a new
// config here (and its colors in themes.json), not a change to the
// renderer.
import {hash01} from "./random";
import THEMES from "./themes.json";

// What every style shares; each theme overrides some of it.
const BASE = {
  seed: 1,
  // Line widths, in feet, and the shadows' fall, in cell sizes.
  crownInk: 0.16,
  tuftInk: 0.1,
  shadowOffset: {x: 0.3, y: 0.45},
  variants: {crowns: 32, patches: 12, tufts: 8, tallTufts: 8, hummocks: 12, reeds: 8, hatches: 8},
  // Trees: their mass ("canopy", dark under the crowns; or "rock", inked
  // and hatched along its edge), its crowns ("broadleaf", "pine" or none)
  // and the chance a cell that deep in from the edge gets one.
  forest: {mass: "canopy", crowns: "broadleaf", band: [1, 0.85, 0.6]},
  // Meadow: chances per cell of a patch of lighter or darker ground and of
  // a tuft, and what a tuft is ("grass", "leaves", "twigs" or "pebbles").
  meadow: {patches: 0.15, tufts: 0.65, tuft: "grass"},
  // Tall grass: clumps per cell, and what they are ("grass" or "gravel").
  tallGrass: {clumps: 3, clump: "grass"},
  // Marsh: hummocks of ground per cell (on average, less a half), rising
  // out of its shallow water, and the chance of reeds.
  marsh: {hummocks: 1.3, reeds: 0.6},
  // Water's edge: a pale "shore" line, or jagged "ice".
  water: {edge: "shore"},
};

const style = (key, fields) => ({...BASE, key, ...fields, forest: {...BASE.forest, ...fields.forest}, meadow: {...BASE.meadow, ...fields.meadow}, tallGrass: {...BASE.tallGrass, ...fields.tallGrass}, marsh: {...BASE.marsh, ...fields.marsh}, water: {...BASE.water, ...fields.water}});

// Path colors, the same in each forest.
const WOODLAND_PATHS = {
  trailEdge: "#8b7a55",
  trail: "#cdb98a",
  road: "#c4ad80",
  roadEdge: "#857252",
  roadRut: "rgba(110, 90, 60, 0.35)",
  deerPath: "#c2b688",
  deerPathEdge: "#9a8d63",
};

const WOOD = {bridge: "#a98053", bridgeEdge: "#6f4f2f", bridgeBeam: "#7d5a36"};

export const GLADE = style("glade", {
  palette: {
    meadow: "#b3c788",
    patchLight: "rgba(214, 226, 160, 0.22)",
    patchDark: "rgba(130, 160, 96, 0.14)",
    tuft: "#7f9b5a",
    shadow: "rgba(26, 38, 20, 0.32)",
    forest: "#34502f",
    // Each crown is a mix of one of these [dark, light] pairs.
    crownTones: [[[78, 118, 64], [96, 138, 72]]],
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
    reed: "#5f7442",
    ...WOODLAND_PATHS,
    worn: "#a9b97c",
    wornEdge: "#a9b97c",
    ...WOOD,
  },
});

export const AUTUMN = style("autumn", {
  palette: {
    meadow: "#bdb779",
    patchLight: "rgba(226, 214, 150, 0.25)",
    patchDark: "rgba(150, 130, 80, 0.16)",
    tuft: "#9a8a4a",
    // Fallen leaves, in the crowns' colors.
    leaves: ["#c8662f", "#d99a3a", "#a8452c", "#c9b04a"],
    shadow: "rgba(40, 28, 14, 0.32)",
    forest: "#4a3b24",
    crownTones: [
      [[176, 82, 38], [204, 114, 46]],
      [[198, 146, 50], [224, 180, 70]],
      [[148, 58, 38], [178, 84, 50]],
      [[188, 112, 40], [214, 146, 58]],
      [[110, 116, 54], [138, 142, 68]],
    ],
    highlight: "rgba(255, 222, 150, 0.4)",
    ink: "#2a1d12",
    tallGrass: "#b8a564",
    tallTuft: "#8f7a3c",
    tallTuftLight: "#dcc77c",
    marsh: "#a39b66",
    pool: "#6d847f",
    poolRim: "rgba(235, 230, 210, 0.6)",
    water: "#5b8590",
    waterDeep: "#4c7380",
    waterRim: "rgba(236, 232, 214, 0.7)",
    reed: "#6e5f34",
    ...WOODLAND_PATHS,
    trail: "#c9ad7e",
    worn: "#b0a66a",
    wornEdge: "#b0a66a",
    ...WOOD,
  },
  meadow: {tufts: 0.75, tuft: "leaves"},
});

export const WINTER = style("winter", {
  palette: {
    meadow: "#e6edf1",
    patchLight: "rgba(255, 255, 255, 0.3)",
    patchDark: "rgba(170, 192, 212, 0.14)",
    tuft: "#6f6a58",
    shadow: "rgba(40, 60, 84, 0.28)",
    forest: "#1f3328",
    crownTones: [[[34, 66, 48], [50, 88, 62]], [[30, 58, 46], [44, 78, 58]]],
    // Snow on the boughs.
    highlight: "rgba(244, 249, 252, 0.9)",
    ink: "#15221b",
    tallGrass: "#dde5ea",
    tallTuft: "#8a8468",
    tallTuftLight: "#b9b296",
    marsh: "#cbd7de",
    pool: "#a7c1ce",
    poolRim: "rgba(255, 255, 255, 0.85)",
    water: "#3f6478",
    waterDeep: "#35576a",
    waterRim: "rgba(240, 248, 252, 0.8)",
    ice: "#e8f2f7",
    iceEdge: "#a9c6d4",
    reed: "#7b7558",
    ...WOODLAND_PATHS,
    trail: "#cfd2cc",
    trailEdge: "#a3aba8",
    road: "#c2bcae",
    roadEdge: "#958e80",
    roadRut: "rgba(110, 104, 92, 0.4)",
    deerPath: "#d6dcda",
    deerPathEdge: "#b6c0c0",
    worn: "#d3dce0",
    wornEdge: "#d3dce0",
    ...WOOD,
  },
  forest: {crowns: "pine", band: [1, 0.9, 0.7]},
  meadow: {patches: 0.12, tufts: 0.3, tuft: "twigs"},
  tallGrass: {clumps: 2},
  water: {edge: "ice"},
});

export const CAVE = style("cave", {
  palette: {
    meadow: "#d2c9b6",
    patchLight: "rgba(238, 232, 216, 0.35)",
    patchDark: "rgba(150, 136, 114, 0.18)",
    tuft: "#9c9282",
    shadow: "rgba(24, 20, 16, 0.3)",
    forest: "#4b4640",
    hatch: "#2b2723",
    crownTones: [[[90, 84, 76], [110, 104, 94]]],
    highlight: "rgba(230, 222, 206, 0.5)",
    ink: "#1a1714",
    tallGrass: "#c6bca8",
    tallTuft: "#8c8272",
    tallTuftLight: "#e2dccd",
    marsh: "#bfb8a8",
    pool: "#738992",
    poolRim: "rgba(220, 232, 236, 0.55)",
    water: "#4f6f80",
    waterDeep: "#43606f",
    waterRim: "rgba(220, 230, 234, 0.6)",
    reed: "#6d6656",
    trail: "#c4b9a2",
    trailEdge: "#a39883",
    road: "#bdb19a",
    roadEdge: "#958a76",
    roadRut: "rgba(100, 90, 74, 0.35)",
    deerPath: "#c8bea8",
    deerPathEdge: "#b0a590",
    worn: "#bcaf97",
    wornEdge: "#bcaf97",
    ...WOOD,
  },
  forest: {mass: "rock", crowns: null},
  meadow: {patches: 0.12, tufts: 0.35, tuft: "pebbles"},
  tallGrass: {clumps: 3, clump: "gravel"},
  marsh: {hummocks: 1.4, reeds: 0},
});

// A dungeon is square rooms and corridors, drawn by dungeon.js instead of the
// woodland renderer: so it needs only a palette.
export const DUNGEON = style("dungeon", {
  renderer: "dungeon",
  palette: {
    meadow: "#cfc8bb",
    tallGrass: "#c2baab",
    marsh: "#b8b4aa",
    water: "#4f6f80",
    waterRim: "rgba(220, 230, 234, 0.55)",
    forest: "#45403b",
    grout: "#8f887b",
    stone: "#9b9387",
    worn: "#d9d2c4",
    shadow: "rgba(21, 18, 15, 0.38)",
    ink: "#15120f",
    ...WOOD,
  },
});

export const STYLES = {glade: GLADE, autumn: AUTUMN, winter: WINTER, cave: CAVE, dungeon: DUNGEON};

// Shades derived from a theme color, for when a map overrides it: the
// defaults above are hand-tuned, so they're only replaced then.
const DERIVED = {
  meadow: (c) => ({patchLight: rgba(mix(c, WHITE, 0.35), 0.22), patchDark: rgba(scale(c, 0.75), 0.14)}),
  // A pine's highlight is snow, so it stays.
  crown: (c, base) => ({crownTones: [[scale(c, 0.9), scale(c, 1.1)]], ...(base.forest.crowns === "pine" ? {} : {highlight: rgba(scale(c, 1.5), 0.55)})}),
  ice: (c) => ({iceEdge: hex(scale(c, 0.78))}),
  tallTuft: (c) => ({tallTuftLight: hex(mix(c, WHITE, 0.5))}),
  trail: (c) => ({trailEdge: hex(scale(c, 0.68)), deerPath: hex(scale(c, 0.95)), deerPathEdge: hex(scale(c, 0.76))}),
  road: (c) => ({roadEdge: hex(scale(c, 0.68)), roadRut: rgba(scale(c, 0.55), 0.35)}),
  worn: (c) => ({wornEdge: hex(c)}),
  water: (c) => ({waterDeep: hex(scale(c, 0.86))}),
  bridge: (c) => ({bridgeEdge: hex(scale(c, 0.66)), bridgeBeam: hex(scale(c, 0.74))}),
  forest: (c) => ({hatch: hex(scale(c, 0.58))}),
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
    Object.assign(palette, DERIVED[key]?.(rgb(value), base));
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

// Kinds of path a trail can be: its width (in cells) when picked, its
// colors (palette keys), the darker edge's width each side (feet), how
// long a free end takes to fade (in widths), and whether it has ruts.
export const PATHS = {
  trail: {label: "trail", width: 0.8, color: "trail", edgeColor: "trailEdge", edge: 0.3, fade: 2.5},
  deerPath: {label: "deer path", width: 0.4, color: "deerPath", edgeColor: "deerPathEdge", edge: 0.12, fade: 4},
  road: {label: "road", width: 1.6, color: "road", edgeColor: "roadEdge", edge: 0.35, fade: 1, ruts: true},
  worn: {label: "worn floor", width: 1, color: "worn", edgeColor: "wornEdge", edge: 0, fade: 3},
};
export const DEFAULT_PATH = "trail";

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

// A hummock of ground in a marsh: lumpy, and drawn out (up to twice as
// long as it's wide) in some direction.
export function hummockShape(style, i) {
  const h = variantHash(style, 5, i);
  const stretch = Math.sqrt(1 + h(40));
  const turn = h(41) * Math.PI;
  return lumps(12, 0.3, h, 1).map((k, j) => {
    const a = (j / 12) * Math.PI * 2 - turn;
    return k / Math.hypot(Math.cos(a) / stretch, Math.sin(a) * stretch);
  });
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

// A pine from above: a star of boughs (eight to eleven points) over a
// smaller one turned half a point, with dabs of snow or light on it - from
// none to most of the tree, mostly toward the top left.
export function pineShape(style, i) {
  const h = variantHash(style, 7, i);
  const points = 8 + Math.floor(h(1) * 4);
  const turn = h(2) * Math.PI * 2;
  const star = (inner, salt) => Array.from({length: points * 2}, (_, j) => (j % 2 ? inner + 0.08 * h(salt + j) : 0.92 + 0.12 * h(salt + j)));
  const snow = h(3) ** 1.3;
  const dabs = Array.from({length: Math.round(snow * 9)}, (_, j) => {
    const a = -2.36 + (h(40 + j) - 0.5) * (1 + 3.5 * snow);
    const out = 0.1 + 0.55 * h(50 + j);
    return {x: Math.cos(a) * out, y: Math.sin(a) * out, r: 0.08 + (0.08 + 0.14 * snow) * h(60 + j)};
  });
  return {tone: h(7), turn, outer: star(0.62, 100), inner: star(0.6, 200), dabs};
}

// Two to four fallen leaves over a unit radius, each one of the palette's
// leaf colors.
export function leafShape(style, i) {
  const h = variantHash(style, 8, i);
  const count = 2 + Math.floor(h(1) * 3);
  return Array.from({length: count}, (_, j) => ({x: (h(10 + j) - 0.5) * 1.6, y: (h(20 + j) - 0.5) * 1.6, angle: h(30 + j) * Math.PI, size: 0.18 + 0.1 * h(40 + j), color: h(50 + j)}));
}

// One to three bare stalks poking out of snow.
export function twigShape(style, i) {
  const h = variantHash(style, 9, i);
  const count = 1 + Math.floor(h(1) * 3);
  return Array.from({length: count}, (_, j) => ({x: (h(10 + j) - 0.5) * 1.2, y: (h(20 + j) - 0.5) * 1.2, lean: (h(30 + j) - 0.5) * 1.2, size: 0.4 + 0.4 * h(40 + j), fork: h(50 + j) < 0.5}));
}

// Stones: min to min + extra of them, scattered over spread unit radii,
// each size to twice that (and now and then a bigger one, for gravel).
// One to three pebbles; for gravel, a scatter of small stones.
export function stoneShape(style, i, {min, extra, kind, size = 0.16, spread = 1.4}) {
  const h = variantHash(style, kind, i);
  const count = min + Math.floor(h(1) * (extra + 1));
  return Array.from({length: count}, (_, j) => ({x: (h(10 + j) - 0.5) * spread, y: (h(20 + j) - 0.5) * spread, size: size * (1 + h(30 + j)) * (h(36 + j) < 0.1 ? 1.8 : 1), light: h(35 + j) < 0.4, shape: lumps(7, 0.2, h, 100 + j * 10)}));
}

// A few strokes side by side, for hatching rock.
export function hatchShape(style, i) {
  const h = variantHash(style, 12, i);
  const count = 3 + Math.floor(h(1) * 3);
  return {angle: h(2) * Math.PI, strokes: Array.from({length: count}, (_, j) => ({offset: (j - (count - 1) / 2) * 0.28, length: 0.5 + 0.4 * h(10 + j)}))};
}
