import { around, ba, bx, cn, cy, disc, ln, py, rd, shelf, strewn, tb, tile, wg } from "./kit.js";

// Temples, shrines and burial grounds.

const MARBLE = "#c8c4b8:marble";
const STONE = "#7c7a74:stone";
const DARK = "#54524e:stone";
const GOLD = "#c8a848:gold";
const OAK = "#6a5038:wood";
const FIRE = "#f09a40:flame";
const MOSS = "#4f7a38:moss";

const column = (h, d, x = 0, z = 0) => [bx(d * 1.5, 0.5, d * 1.5, x, 0, z), cy(d, h - 1, x, 0.5, z, 0, 0.88), bx(d * 1.4, 0.5, d * 1.4, x, h - 0.5, z)];
const figure = (c = 0, base = 1) => [bx(2.6, 1.2, 2.6, 0, 0, 0, base), cy(1.6, 3.4, 0, 1.2, 0, c, 0.7), ba(1.5, 2.2, 1, 0, 5.4, 0, c), ba(0.9, 1, 0.9, 0, 7, 0, c)];

export const SACRED = shelf("sacred", "temple", (add, set) => {
  add("stone altar", ["temple", "altar"], [STONE, "#e8e0c8:cloth"], [tile(bx(6, 3.2, 3), "stone", 3.5), bx(6.4, 0.3, 3.4, 0, 3.2), bx(2, 0.05, 3.5, 0, 3.5, 0, 1)]);
  add("marble altar", ["temple", "altar", "rich"], [MARBLE, GOLD], [bx(7, 0.5, 4), bx(5.6, 3, 2.8, 0, 0.5), bx(6.4, 0.4, 3.4, 0, 3.5), bx(5.8, 0.15, 2.9, 0, 2.4, 0, 1)]);
  add("blood altar", ["temple", "altar", "dark"], [DARK, "#6a1a1a:blood"], [bx(6, 3, 3), wg(6, 0.5, 3, 0, 3), bx(1.3, 0.05, 1.8, 0, 3.1, 0, 1), bx(0.4, 2, 0.06, 0.8, 1, 1.52, 1)]);
  add("small shrine", ["temple", "wayside"], [STONE, OAK, GOLD], [bx(2.4, 3, 2), bx(2, 2.2, 0.15, 0, 3, -0.9), bx(0.2, 2.2, 1.8, -1, 3), bx(0.2, 2.2, 1.8, 1, 3), wg(3, 0.8, 1.3, 0, 5.2, 0.55, 1), wg(3, 0.8, 1.3, 0, 5.2, -0.55, 1, 180), ba(0.6, 1, 0.5, 0, 3.5, -0.3, 2)]);
  add("roadside shrine", ["temple", "wayside", "street"], [OAK, GOLD, "#a84a3a:roof"], [cy(0.5, 5), bx(1.8, 1.8, 1.2, 0, 5), wg(2.2, 0.7, 0.9, 0, 6.8, 0.45, 2), wg(2.2, 0.7, 0.9, 0, 6.8, -0.45, 2, 180), ba(0.5, 0.9, 0.4, 0, 5.6, 0.4, 1)]);
  add("offering bowl", ["temple", "altar"], [GOLD], [cy(0.8, 0.8), cy(2, 0.5, 0, 0.8, 0, 0, 0.7)], "see");
  add("brazier", ["temple", "light"], ["#4a4a4e:iron", FIRE], [...around(3, 0.6, (x, z, k, a) => ln(0.2, 3.4, x, 1.5, z, 0, a + 180, 10)), cy(2, 0.7, 0, 3, 0, 0, 0.8), cn(1.4, 1.6, 0, 3.5, 0, 1), cn(0.8, 2, 0.2, 3.5, 0.2, 1)], "see");
  add("standing brazier", ["temple", "light", "rich"], [GOLD, FIRE], [cy(1.6, 0.3), cy(0.4, 5, 0, 0, 0, 0, 0.6), cy(2.2, 0.8, 0, 5, 0, 0, 0.7), cn(1.5, 1.8, 0, 5.6, 0, 1)], "see");
  add("candle rack", ["temple", "light"], ["#4a4a4e:iron", "#e8e0c8:wax", "#ffd27a"], [bx(0.2, 3.5, 0.2, -2.4), bx(0.2, 3.5, 0.2, 2.4), ...[[3.5, 0], [2.7, 0.4]].flatMap(([y, z]) => [bx(5, 0.1, 0.5, 0, y, z), ...[-2, -1, 0, 1, 2].flatMap((x) => [cy(0.15, 0.5, x, y + 0.1, z, 1), cn(0.08, 0.15, x, y + 0.6, z, 2)])])], "see");
  add("censer", ["temple", "light", "hanging"], [GOLD], [cy(0.05, 3.5, 0, 7), ba(1, 0.9, 1, 0, 6.6), cn(0.7, 0.5, 0, 6.9)], "see walk");
  add("holy water font", ["temple", "water"], [MARBLE, "#7fa8b8:water"], [cy(1, 3, 0, 0, 0, 0, 0.7), cy(3, 0.7, 0, 3, 0, 0), disc(2.6, 0, 3.67, 0, 1), cy(1.6, 0.2)]);
  add("lectern", ["temple", "study"], [OAK, "#e8e0c8:pages"], [cy(0.4, 3.4), cy(1.5, 0.15), tb(1.8, 0.15, 1.4, 0, 3.6, 0, 0, [0, 20, 0]), tb(1.5, 0.12, 1.1, 0, 3.72, 0, 1, [0, 20, 0])], "see");
  add("bell frame", ["temple", "bell"], [OAK, "#a88a48:bronze"], [bx(0.5, 8, 0.5, -2.2), bx(0.5, 8, 0.5, 2.2), bx(5, 0.5, 0.6, 0, 8), cn(2.4, 2.8, 0, 5, 0, 1), cy(0.3, 0.3, 0, 7.7, 0, 1)], "see");
  add("gong", ["temple", "bell"], [OAK, "#a88a48:bronze"], [bx(0.4, 6, 0.4, -2.2), bx(0.4, 6, 0.4, 2.2), bx(5, 0.4, 0.4, 0, 6), { ...cy(3.6, 0.15, 0, 0, 0, 1), at: [0, 3.6, 0], turn: [0, 90, 0] }], "see");
  add("prayer mat", ["temple", "floor"], ["#6a2a4a:mat", GOLD], [bx(2.4, 0.05, 4.6), bx(1.9, 0.06, 4, 0, 0, 0, 1), bx(1.7, 0.07, 3.8)], "see walk");
  set("temple column", 3, ["temple", "column"], [MARBLE], (r, k) => column(10 + k * 4, 2 + k * 0.3));
  add("fluted column", ["temple", "column", "rich"], [MARBLE, GOLD], [...column(16, 2.8), ...around(8, 1.3, (x, z) => cy(0.3, 14, x, 0.8, z, 0, 0.88)), cy(3, 0.3, 0, 14.6, 0, 1)]);
  add("column pair and lintel", ["temple", "column", "ruin"], [MARBLE], [...column(13, 2.2, -5), ...column(13, 2.2, 5), bx(14, 1.6, 3, 0, 13)]);
  add("pedestal", ["temple", "statue"], [MARBLE], [bx(3.2, 0.4, 3.2), bx(2.4, 3, 2.4, 0, 0.4), bx(3, 0.4, 3, 0, 3.4)]);
  add("robed statue", ["temple", "statue"], [MARBLE, STONE], figure());
  add("praying statue", ["temple", "statue"], [MARBLE, STONE], [...figure(), ba(0.5, 1.5, 0.5, 0, 5.1, 0.6)]);
  add("sword statue", ["temple", "statue", "war"], [STONE, DARK, "#a8acb0:steel"], [...figure(), tb(0.3, 7, 0.1, 1.2, 4.8, 0.4, 2), bx(1.3, 0.2, 0.2, 1.2, 5.6, 0.4, 2)]);
  add("winged statue", ["temple", "statue", "angel"], [MARBLE, STONE], [...figure(), tb(3.4, 4, 0.2, -1.8, 5.5, -0.5, 0, [20, 0, 15]), tb(3.4, 4, 0.2, 1.8, 5.5, -0.5, 0, [-20, 0, -15])]);
  add("giant stone head", ["statue", "ancient", "ruin"], [STONE], [ba(6, 8, 6, 0, 3.6), wg(1.2, 1.5, 1.5, 0, 3.8, 2.8), bx(2, 0.4, 0.8, 0, 4.9, 2.7), bx(1.8, 0.3, 0.8, 0, 2.2, 2.7)]);
  add("obelisk", ["temple", "ancient", "monument"], [DARK, GOLD], [bx(5, 0.8, 5), cy(0.1, 0.1), tb(2.8, 15, 2.8, 0, 8.3, 0, 0), py(2.8, 2, 2.8, 0, 15.8, 0, 1)]);
  add("idol", ["temple", "statue", "dark"], ["#8a6a44:wood", "#c8a848:gold"], [cy(1.6, 4, 0, 0, 0, 0, 0.8), ba(1.6, 1.8, 1.4, 0, 4.8), bx(1.2, 0.3, 0.1, 0, 4.8, 0.7, 1), ba(0.3, 0.3, 0.15, -0.35, 5.2, 0.68, 1), ba(0.3, 0.3, 0.15, 0.35, 5.2, 0.68, 1)]);
  add("stained glass panel", ["temple", "wall", "rich"], ["#2f2f33:lead", "#3a6a9a:glass", "#b83a40:glass"], [bx(4, 8, 0.2), bx(3.4, 3.4, 0.25, 0, 4.2, 0, 1), bx(3.4, 3.4, 0.25, 0, 0.4, 0, 2), wg(3.8, 0, 0.2, 0, 8)]);
  add("wall banner", ["temple", "banner", "wall"], [OAK, "#6a2a4a:cloth", GOLD], [rd(0.15, 4, 0, 9), bx(3.2, 6.5, 0.1, 0, 2.4, 0, 1), ba(1, 1, 0.12, 0, 6, 0, 2)], "see walk");

  set("headstones", 6, ["graveyard", "grave"], [STONE], (r) => {
    const [w, h] = [r(1.6, 2.6), r(2, 3.4)];
    const lean = r(-9, 9);
    return [tb(w, h, 0.4, 0, h / 2 - 0.1, 0, 0, [r(-6, 6), lean, r(-5, 5)]), ...(r() < 0.6 ? [{ type: "cylinder", size: [w, 0.4, w], at: [0, h - 0.1, Math.sin((lean * Math.PI) / 180) * -h * 0.5], turn: [0, 90 + lean, 0], color: 0 }] : [])];
  });
  set("broken headstones", 4, ["graveyard", "grave", "ruin"], [STONE], (r) => [tb(2, r(0.8, 1.6), 0.4, 0, 0.5, 0, 0, [r(-8, 8), r(-10, 10), r(-14, 14)]), tb(1.8, 1.2, 0.35, r(-1, 1), 0.2, r(1, 2), 0, [r(0, 180), r(70, 90), 0])]);
  set("grave crosses", 4, ["graveyard", "grave"], [STONE], (r) => { const h = r(3, 5); const t = [r(-5, 5), r(-8, 8), r(-6, 6)]; return [tb(0.5, h, 0.4, 0, h / 2, 0, 0, t), tb(2, 0.5, 0.4, 0, h * 0.68, 0, 0, t), bx(1.4, 0.3, 1, 0, 0)]; });
  set("wooden grave markers", 4, ["graveyard", "grave", "poor"], [OAK], (r) => { const t = [r(-10, 10), r(-10, 10), r(-10, 10)]; return [tb(0.3, 3.4, 0.2, 0, 1.6, 0, 0, t), tb(1.6, 0.3, 0.2, 0, 2.4, 0, 0, t)]; }, "see");
  add("grave mound", ["graveyard", "grave"], ["#5a4430:earth"], [ba(3, 0.8, 7, 0, 0)], "see walk");
  add("open grave", ["graveyard", "grave"], ["#5a4430:earth", "#241c16"], [bx(3.6, 0.2, 7.6), bx(2.8, 0.22, 6.6, 0, 0, 0, 1), ba(2.2, 1.4, 3, 3, 0.2, 0.5), bx(0.1, 3.6, 0.3, 2.6, 0.5, -2)], "see");
  add("stone tomb", ["graveyard", "tomb"], [STONE, MOSS], [tile(bx(4, 2.4, 8), "stone", 3.5), bx(4.5, 0.5, 8.5, 0, 2.4), ba(1.6, 0.3, 3, -1, 2.8, 1, 1)]);
  add("effigy tomb", ["graveyard", "tomb", "rich"], [MARBLE], [bx(4.4, 2.6, 8), bx(4.8, 0.3, 8.4, 0, 2.6), ba(1.6, 0.8, 5, 0, 3.2, 0.4), ba(0.9, 0.8, 0.9, 0, 3.3, -2.8)]);
  add("wooden coffin", ["graveyard", "coffin"], ["#5a4634:wood"], [wg(2.6, 0.01, 0.1, 0, 0), bx(2.4, 1.2, 6.4), bx(2.6, 0.15, 6.6, 0, 1.2)]);
  add("open coffin", ["graveyard", "coffin"], ["#5a4634:wood", "#e0d8c0:bone"], [bx(2.4, 1.2, 6.4), tb(2.6, 0.15, 6.6, 2.4, 0.7, 0, 0, [0, 0, 25]), ba(0.9, 0.9, 0.9, 0, 1.2, -2.2, 1), ba(1.4, 0.5, 3, 0, 1.1, 0.2, 1)]);
  add("sarcophagus", ["graveyard", "tomb", "ancient"], ["#b8a070:stone", GOLD, "#3a6a7a:paint"], [bx(3.4, 3, 8), ba(2.4, 1, 6, 0, 3, 0), ba(1.5, 1.2, 1.4, 0, 3.2, -2.7, 1), bx(3.45, 0.3, 8.05, 0, 1.4, 0, 2)]);
  add("mausoleum", ["graveyard", "tomb", "building"], [STONE, "#2a2622"], [tile(bx(12, 9, 14), "stone", 4), bx(13, 0.6, 15, 0, 9), wg(13, 3, 7.5, 0, 9.6, 3.75), wg(13, 3, 7.5, 0, 9.6, -3.75, 0, 180), bx(4, 6.6, 0.3, 0, 0, 7, 1), ...[-3.6, 3.6].map((x) => cy(1, 8, x, 0, 8)), bx(10, 0.8, 2.6, 0, 8, 8)]);
  add("graveyard gate", ["graveyard", "fence"], [STONE, "#2f2f33:iron"], [bx(1.4, 7, 1.4, -4.4), bx(1.4, 7, 1.4, 4.4), ba(1.2, 1.2, 1.2, -4.4, 7.6), ba(1.2, 1.2, 1.2, 4.4, 7.6), ...[-3, -2, -1, 0, 1, 2, 3].map((x) => cy(0.14, 6 + (3 - Math.abs(x)) * 0.3, x, 0, 0, 1)), rd(0.15, 7.4, 0, 2.5, 0, 1), rd(0.15, 7.4, 0, 5, 0, 1)], "see");
  add("spiked iron fence", ["graveyard", "fence"], ["#2f2f33:iron"], [rd(0.14, 10, 0, 1, 0), rd(0.14, 10, 0, 4, 0), ...[-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5].flatMap((x) => [cy(0.14, 4.6, x), cn(0.3, 0.6, x, 4.6)])], "see");
  add("crypt stair", ["graveyard", "tomb"], [DARK, "#1a1816"], [bx(8, 2, 1.2, 0, 0, -3), bx(1.2, 2, 7, -3.4, 0, 0), bx(1.2, 2, 7, 3.4, 0, 0), bx(5.6, 0.1, 6, 0, 0, 0, 1), ...[0, 1, 2].map((k) => bx(5.6, 0.1, 1, 0, 0.3 + k * 0.4, 2.5 - k))]);
  add("reaper statue", ["graveyard", "statue", "dark"], [DARK], [bx(3, 1, 3), cn(3, 6, 0, 1), ba(1.5, 1.8, 1.5, 0, 7.4), ln(0.25, 9, 1.4, 5, 0.4, 0, 0, 4), tb(3, 0.8, 0.1, 0.4, 9.2, 0.4)]);
  set("skull piles", 4, ["graveyard", "bones", "dark"], ["#e0d8c0:bone", "#241c16"], (r) => strewn(r, 4 + Math.floor(r(0, 6)), 1.1, (x, z, k) => { const y = 0.3 + (k % 3) * 0.45; return [ba(0.6, 0.6, 0.7, x, y, z), ba(0.14, 0.14, 0.06, x + 0.13, y + 0.04, z + 0.33, 1), ba(0.14, 0.14, 0.06, x - 0.13, y + 0.04, z + 0.33, 1)]; }), "see");
  add("bone pile", ["graveyard", "bones"], ["#e0d8c0:bone"], [ba(3, 1, 2.6, 0, 0.1), ...[0, 30, 60, 90, 120, 150, 170].map((a, k) => rd(0.2, 2.8, Math.cos(a) * 0.6, 0.7 + (k % 3) * 0.15, Math.sin(a) * 0.5, 0, a, (k - 3) * 5))], "see");
  add("hangman's gallows", ["graveyard", "dark", "execution"], [OAK, "#b8a878:rope"], [bx(6, 3, 6), cy(0.1, 0.1), bx(0.6, 9, 0.6, -2, 3), bx(5, 0.5, 0.6, 0, 11.6), tb(0.3, 3, 0.3, -1, 10.6, 0, 0, [0, 0, -45]), cy(0.1, 2.8, 1.8, 8.8, 0, 1), { ...cy(0.7, 0.1, 0, 0, 0, 1), at: [1.8, 8.5, 0], turn: [0, 90, 0] }]);
});
