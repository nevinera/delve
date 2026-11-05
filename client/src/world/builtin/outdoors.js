import { around, ba, bx, cn, cy, disc, ln, py, rd, shelf, strewn, tabled, tb, tile, wg } from "./kit.js";

// War camps, harbours and streets.

const OAK = "#8a6a44:wood";
const DARK = "#5c4630:wood";
const IRON = "#4a4a4e:iron";
const STEEL = "#a8acb0:steel";
const CANVAS = "#c8bc98:canvas";
const STONE = "#7c7a74:stone";
const ROPE = "#b8a878:rope";
const RED = "#8a2a2a:cloth";
const WATER = "#5a8aa0:water";

// A ridge tent `w` wide, `l` long and `h` tall.

const ridge = (w, l, h, c = 0) => {
  const slope = (Math.atan2(h, w / 2) * 180) / Math.PI;
  const side = Math.hypot(h, w / 2);
  return [tb(0.1, side, l, -w / 4, h / 2, 0, c, [0, 0, slope - 90]), tb(0.1, side, l, w / 4, h / 2, 0, c, [0, 0, 90 - slope])];
};
const palisade = (n, h, c = 0) => Array.from({ length: n }, (_, k) => [cy(0.9, h, (k - (n - 1) / 2) * 0.95, 0, 0, c), cn(0.9, 0.9, (k - (n - 1) / 2) * 0.95, h, 0, c)]);
const rail = (long, y, z = 0, c = 0) => bx(long, 0.2, 0.2, 0, y, z, c);
const boat = (l, w, c = 0, seat = 1) => [ba(l, w * 0.7, w, 0, w * 0.32, 0, c), bx(l * 0.62, 0.1, w * 0.72, 0, w * 0.5, 0, seat), bx(w * 0.7, 0.14, 0.7, l * 0.08, w * 0.52, 0, seat), bx(w * 0.7, 0.14, 0.7, -l * 0.16, w * 0.52, 0, seat)];

export const WAR = shelf("war", "war camp", (add, set) => {
  add("ridge tent", ["tent", "camp"], [CANVAS, DARK], [...ridge(6, 8, 5), cy(0.2, 5, 0, 0, -4, 1), cy(0.2, 5, 0, 0, 4, 1), rd(0.15, 8, 0, 5, 0, 1, 90)], "see");
  add("small tent", ["tent", "camp"], ["#8a7a5a:canvas", DARK], [...ridge(4.4, 6, 3.4), cy(0.15, 3.4, 0, 0, -3, 1), cy(0.15, 3.4, 0, 0, 3, 1)], "see");
  add("round command tent", ["tent", "camp", "rich"], ["#a03a30:canvas", "#d8c8a0:trim", DARK], [cy(14, 6), cn(15, 6, 0, 6), cy(14.2, 0.5, 0, 5.6, 0, 1), bx(2.8, 5, 0.1, 0, 0, 7, 2), cy(0.25, 3, 0, 12, 0, 2)]);
  add("lean-to", ["tent", "camp", "poor"], [DARK, "#6a8a48:boughs"], [cy(0.4, 5.5, -3, 0, 2), cy(0.4, 5.5, 3, 0, 2), rd(0.3, 6.4, 0, 5.4, 2), tb(7, 0.3, 6.4, 0, 2.8, -0.5, 1, [0, 44, 0])]);
  add("supply wagon", ["camp", "cart", "war"], [OAK, CANVAS, DARK], [bx(9, 0.4, 4.4, 0, 2), bx(9, 1.4, 0.2, 0, 2.4, -2.1), bx(9, 1.4, 0.2, 0, 2.4, 2.1), bx(0.2, 1.4, 4.4, -4.4, 2.4), ...[-3, 3].flatMap((x) => [-2.4, 2.4].map((z) => ({ ...cy(3.2, 0.3, 0, 0, 0, 2), at: [x, 1.6, z], turn: [0, 90, 0] }))), { ...cy(4.2, 8.6, 0, 0, 0, 1), at: [0, 3.2, 0], turn: [0, 0, 90] }, rd(0.25, 6, 7, 1.8, 0, 2, 0, -12)]);
  add("training dummy", ["war", "training"], [OAK, "#c8b060:straw"], [cy(0.4, 6), bx(4, 0.3, 0.3, 0, 4), ba(1.8, 2.8, 1.4, 0, 3.6, 0, 1), ba(1, 1, 1, 0, 5.8, 0, 1)]);
  add("archery target", ["war", "training"], [OAK, "#e0d8c0:rings", "#b83a30:rings"], [bx(0.3, 5, 0.3, -1.3, 0, -0.4), bx(0.3, 5, 0.3, 1.3, 0, -0.4), bx(0.3, 5, 0.3, 0, 0, -1.6), { ...cy(4, 0.5, 0, 0, 0, 1), at: [0, 3, 0], turn: [0, 80, 0] }, { ...cy(2.4, 0.55, 0, 0, 0, 2), at: [0, 3, 0.02], turn: [0, 80, 0] }, { ...cy(0.9, 0.6, 0, 0, 0, 1), at: [0, 3, 0.03], turn: [0, 80, 0] }]);
  add("catapult", ["war", "siege"], [OAK, IRON, DARK], [bx(8, 0.6, 0.6, 0, 1, -2), bx(8, 0.6, 0.6, 0, 1, 2), bx(0.6, 0.6, 4.6, -3.4, 1), bx(0.6, 0.6, 4.6, 3.4, 1), ...[-3, 3].flatMap((x) => [-2.5, 2.5].map((z) => ({ ...cy(2, 0.4, 0, 0, 0, 2), at: [x, 1, z], turn: [0, 90, 0] }))), bx(0.5, 5, 0.5, 0.5, 1.6, -2), bx(0.5, 5, 0.5, 0.5, 1.6, 2), rd(0.4, 4.6, 0.5, 6, 0, 1, 90), rd(0.45, 9, -1.6, 4.4, 0, 2, 0, -32), cy(1.6, 0.6, -5.4, 1.8)]);
  add("siege ram", ["war", "siege"], [DARK, IRON, "#8a7a5a:hide"], [rd(1.6, 16, 0, 3, 0), cn(1.8, 2, 8.8, 2.1), ...[-5, 5].flatMap((x) => [-2.6, 2.6].map((z) => ({ ...cy(2.6, 0.4, 0, 0, 0, 1), at: [x, 1.3, z], turn: [0, 90, 0] }))), ...ridge(6, 14, 4).map((p) => ({ ...p, at: [p.at[0], p.at[1] + 5, p.at[2]], turn: [90, p.turn[1], p.turn[2]] }))].map((p) => p));
  add("siege ladder", ["war", "siege"], [OAK], [tb(0.4, 22, 0.4, -1.3, 10.5, 0, 0, [0, 10, 0]), tb(0.4, 22, 0.4, 1.3, 10.5, 0, 0, [0, 10, 0]), ...Array.from({ length: 12 }, (_, k) => bx(2.6, 0.2, 0.2, 0, 1.2 + k * 1.7, 1.7 - k * 0.3))], "see");
  add("mantlet", ["war", "siege", "barricade"], [OAK], [...Array.from({ length: 6 }, (_, k) => tb(1, 6, 0.3, (k - 2.5) * 1.05, 3, 0, 0, [0, -12, 0])), rd(0.3, 6.4, 0, 2, -0.4), bx(0.3, 3, 2.4, -2.6, 0, -1), bx(0.3, 3, 2.4, 2.6, 0, -1)]);
  set("palisade wall", 3, ["fort", "wall", "barricade"], [DARK], (r, k) => palisade(9 + k, r(7, 10)));
  add("palisade corner", ["fort", "wall", "barricade"], [DARK], [...palisade(7, 9), ...Array.from({ length: 5 }, (_, k) => [cy(0.9, 9, 2.9, 0, 0.95 * (k + 1)), cn(0.9, 0.9, 2.9, 9, 0.95 * (k + 1))])]);
  add("watch platform", ["fort", "tower"], [DARK, OAK], [...[[-3, -3], [3, -3], [-3, 3], [3, 3]].map(([x, z]) => cy(0.6, 15, x, 0, z)), bx(8, 0.4, 8, 0, 12, 0, 1), ...[-3.8, 3.8].flatMap((z) => [bx(8, 0.2, 0.2, 0, 15, z), bx(8, 0.2, 0.2, 0, 13.6, z)]), ...[-3.8, 3.8].map((x) => bx(0.2, 0.2, 8, x, 15, 0))]);
  add("cheval de frise", ["war", "barricade"], [DARK], [rd(0.7, 10, 0, 1.6, 0), ...[-3.5, -1.2, 1.2, 3.5].flatMap((x) => [tb(0.25, 5.4, 0.25, x, 1.8, 0, 0, [0, 45, 0]), tb(0.25, 5.4, 0.25, x, 1.8, 0, 0, [0, -45, 0])])], "see");
  set("ground spikes", 3, ["war", "trap", "barricade"], [DARK], (r) => strewn(r, 6 + Math.floor(r(0, 5)), 2, (x, z) => ln(0.3, r(2, 3.4), x, 0.9, z, 0, r(0, 360), r(8, 26), 0.1)), "see");
  add("sandbags", ["war", "barricade"], [CANVAS], [0, 1, 2].flatMap((y) => [-1.8, -0.6, 0.6, 1.8].slice(y).map((x) => ba(1.6, 0.8, 1, x + y * 0.5, 0.4 + y * 0.7, 0))));
  add("barricade of crates", ["war", "barricade", "container"], [OAK], [bx(3, 3, 3, -2.4, 0, 0, 0, 15), bx(3, 3, 3, 1, 0, 0.5, 0, -10), bx(2.4, 2.4, 2.4, -0.8, 3, 0.2, 0, 30), rd(0.5, 7, 0, 1.4, 2, 0, 15, 20)]);
  add("war banner", ["war", "banner"], [DARK, RED, "#c8a848:trim"], [cy(0.3, 14), cn(0.5, 0.8, 0, 14), rd(0.15, 4, 2, 13), bx(3.6, 7, 0.08, 2, 6, 0, 1), bx(3.6, 0.3, 0.1, 2, 6, 0, 2)], "see");
  add("long pennant", ["war", "banner"], [DARK, "#2a4a7a:cloth"], [cy(0.25, 12), wg(5, 1.8, 0.08, 2.6, 9.8, 0, 1, 0)], "see");
  add("spear rack", ["war", "weapon"], [OAK, STEEL], [bx(0.3, 4, 1.4, -2.6), bx(0.3, 4, 1.4, 2.6), bx(5.4, 0.3, 0.3, 0, 3.4), ...[-1.8, -0.9, 0, 0.9, 1.8].flatMap((x) => [cy(0.13, 7, x, 0, 0), cn(0.3, 0.8, x, 7, 0, 1)])], "see");
  add("sheaf of arrows", ["war", "weapon"], [OAK, "#e8e8e0:fletching", ROPE], [cy(0.6, 2.6), cy(0.68, 0.15, 0, 1.2, 0, 2), cy(1.1, 0.5, 0, 2.6, 0, 1, 0.6)], "see walk");
  add("quiver stand", ["war", "weapon"], [OAK, "#7a5232:leather", "#e8e8e0"], [cy(0.25, 3), cy(1, 0.1), cy(0.7, 2, 0, 2, 0, 1), cn(0.8, 0.5, 0, 4, 0, 2)], "see");
  set("dropped shields", 4, ["war", "armor"], ["#7a2a2a:shield", STEEL, "#2a4a7a:shield"], (r) => strewn(r, 1 + Math.floor(r(0, 3)), 1.3, (x, z, k) => [cy(r(2.2, 3), 0.15, x, 0.05, z, k % 2 ? 2 : 0), ba(0.5, 0.3, 0.5, x, 0.2, z, 1)]), "see walk");
  set("dropped swords", 3, ["war", "weapon"], [STEEL, DARK], (r) => strewn(r, 1 + Math.floor(r(0, 3)), 1.4, (x, z) => { const y = r(0, 180); return [tb(3, 0.05, 0.25, x, 0.06, z, 0, [y, 0, 0]), tb(0.15, 0.12, 0.9, x - 1.5 * Math.cos((y * Math.PI) / 180), 0.08, z + 1.5 * Math.sin((y * Math.PI) / 180), 1, [y, 0, 0])]; }), "see walk");
  add("war drum", ["war", "camp"], ["#7a4a2a:shell", "#e0d4b0:skin", ROPE], [cy(3, 2.4), disc(3.1, 0, 2.38, 0, 1), ...around(8, 1.52, (x, z, k, a) => tb(0.1, 2.4, 0.08, x, 1.2, z, 2, [a, 0, 0]))]);
  add("campfire", ["camp", "light"], ["#5a4430:logs", "#f08030:fire", STONE], [...around(8, 1.5, (x, z) => ba(0.8, 0.5, 0.7, x, 0.2, z, 2)), ...around(4, 0.5, (x, z, k, a) => rd(0.3, 2.2, x, 0.4, z, 0, a, 15)), cn(1.1, 1.8, 0, 0.3, 0, 1), cn(0.6, 1.1, 0.3, 0.3, 0.2, 1)], "see");
  add("burnt-out campfire", ["camp"], ["#2a2622:ash", STONE], [disc(2.6, 0, 0, 0, 0), ...around(7, 1.5, (x, z) => ba(0.7, 0.45, 0.6, x, 0.2, z, 1)), rd(0.25, 1.8, 0.1, 0.15, 0, 0, 30), rd(0.25, 1.8, -0.1, 0.2, 0.1, 0, 120)], "see walk");
  add("log seat", ["camp", "seat"], ["#5a4430:bark"], [rd(1.2, 5, 0, 0.6, 0)]);
  add("washing line", ["camp", "street"], [OAK, "#e0d8c4:cloth", "#8a6a8a:cloth"], [cy(0.3, 7, -5), cy(0.3, 7, 5), rd(0.05, 10, 0, 6.6), bx(1.6, 2.4, 0.05, -2.6, 4.2, 0, 1), bx(2, 1.5, 0.05, 0, 5.1, 0, 2), bx(1.3, 2, 0.05, 2.6, 4.6, 0, 1)], "see");
});

export const HARBOUR = shelf("harbour", "harbour", (add, set) => {
  add("rowboat", ["boat", "water"], ["#6a7a8a:hull", OAK], [...boat(10, 3.6), rd(0.15, 7, 0, 1.8, 1.2, 1, 20), rd(0.15, 7, 0, 1.8, -1.2, 1, -20)]);
  add("upturned boat", ["boat"], ["#5a6a7a:hull", OAK], [ba(10, 3, 3.8, 0, 0.5), bx(1, 1, 1.6, -3, 0, 0, 1), bx(1, 1, 1.6, 3, 0, 0, 1)]);
  add("fishing boat", ["boat", "water"], ["#7a5a42:hull", OAK, "#d8cca8:sail"], [...boat(18, 6), cy(0.5, 15, 1, 2), rd(0.3, 8, 5, 6, 0, 1, 0, 10), wg(7, 8, 0.1, 5, 6.6, 0, 2)]);
  add("wrecked hull", ["boat", "wreck", "coast"], ["#5a4634:hull", "#3a3028:ribs"], [tb(14, 3, 0.4, 0, 2, -2.6, 0, [0, 0, 8]), tb(9, 3, 0.4, -1, 1.2, 2.2, 0, [0, 0, -14]), ...[-5, -2.5, 0, 2.5, 5].flatMap((x, k) => [tb(0.4, 6 - (k % 2), 0.4, x, 2.2, 2.4, 1, [0, -22, 0]), tb(0.4, 6.4, 0.4, x, 2.5, -2.5, 1, [0, 18, 0])])]);
  add("anchor", ["harbour", "iron"], [IRON], [cy(0.5, 7), rd(0.4, 3.6, 0, 6), tb(4.6, 0.5, 0.5, -1.7, 1, 0, 0, [0, 0, -30]), tb(4.6, 0.5, 0.5, 1.7, 1, 0, 0, [0, 0, 30]), { ...cy(1.2, 0.2), at: [0, 7.2, 0], turn: [0, 90, 0] }]);
  add("ship's wheel", ["harbour", "boat"], [DARK, "#b89a48:brass"], [bx(0.7, 3.2, 0.7), ...around(8, 1.5, (x, z, k, a) => tb(0.15, 0.15, 1.6, x, 4.3 + z, 0.5, 0, [0, a - 90 + 180, 0])), rd(0.15, 3.4, 0, 4.3, 0.5, 0), { ...rd(0.15, 3.4, 0, 4.3, 0.5, 0), turn: [0, 0, 0] }, { ...cy(0.7, 0.3, 0, 0, 0, 1), at: [0, 4.3, 0.5], turn: [0, 90, 0] }], "see");
  add("mast section", ["harbour", "boat", "wreck"], [DARK, ROPE], [rd(1, 18, 0, 0.5, 0), rd(0.4, 7, 2, 0.6, 1, 0, 70), ...[-3, 0, 3].map((x) => ba(1.2, 0.5, 2, x, 0.3, 0.8, 1))], "see");
  set("coiled rope", 3, ["harbour", "rope"], [ROPE], (r) => { const n = 3 + Math.floor(r(0, 4)); return Array.from({ length: n }, (_, k) => cy(2.2 - k * 0.15, 0.25, 0, k * 0.22, 0)); }, "see walk");
  add("bollard", ["harbour", "dock"], [IRON, ROPE], [cy(1.2, 2, 0, 0, 0, 0, 0.7), ba(1.5, 0.6, 1.5, 0, 2), cy(1.3, 0.3, 0, 0.7, 0, 1)]);
  add("mooring post", ["harbour", "dock"], [DARK, ROPE], [cy(1, 6), cy(1.1, 0.5, 0, 4, 0, 1), cy(1.1, 0.5, 0, 4.7, 0, 1)]);
  add("pier section", ["harbour", "dock"], ["#7a6a54:planks", DARK], [tile(bx(8, 0.4, 16, 0, 5.6), "planks", 3), ...[-3.6, 3.6].flatMap((x) => [-7, 0, 7].map((z) => cy(0.9, 7, x, 0, z, 1)))]);
  add("gangplank", ["harbour", "dock"], [OAK], [tb(2.6, 0.2, 12, 0, 2.5, 0, 0, [0, 22, 0]), ...[-4, -2, 0, 2, 4].map((k) => tb(2.6, 0.2, 0.25, 0, 2.5 - k * 0.4, k * 0.92, 0, [0, 22, 0]))], "see");
  add("dock crane", ["harbour", "dock", "machine"], [DARK, IRON, ROPE], [bx(5, 1, 5), cy(1, 13, 0, 1), rd(0.7, 13, 3.6, 13.4, 0, 0, 0, 25), bx(1.2, 2, 1.6, -1.4, 1, 0, 1), cy(0.1, 8, 9.4, 8.2, 0, 2), bx(1.2, 0.8, 1.2, 9.4, 7.4)]);
  set("buoys", 3, ["harbour", "water"], ["#b83a30:float", "#e8e0d0:band", IRON], (r) => [cn(1.8, r(2.2, 3.2), 0, 0.6, 0, 0), cy(1.7, 0.6, 0, 0, 0, 1), ba(0.4, 0.4, 0.4, 0, 3.8, 0, 2)]);
  add("glass floats", ["harbour", "fishing"], ["#5aa890:glass", ROPE], [[0, 0, 0.6], [0.8, 0.3, 0.5], [-0.7, 0.4, 0.45], [0.1, -0.8, 0.5]].map(([x, z, s]) => ba(s * 1.6, s * 1.6, s * 1.6, x, s * 0.8, z)), "see walk");
  add("hanging net", ["harbour", "fishing"], [OAK, "#9a9070:net"], [cy(0.4, 8, -4), cy(0.4, 8, 4), rd(0.25, 8.4, 0, 7.6), bx(7, 5.6, 0.08, 0, 2, 0, 1)], "see");
  add("net pile", ["harbour", "fishing"], ["#9a9070:net", "#5aa890:floats"], [ba(4, 1.4, 3.4, 0, 0.3), ...[[-1, 0.8], [1.1, 0.5], [0.2, -1]].map(([x, z]) => ba(0.4, 0.4, 0.4, x, 0.8, z, 1))], "see");
  add("lobster pot", ["harbour", "fishing"], [OAK, "#9a9070:net"], [bx(2.6, 0.1, 1.6), rd(0.08, 2.6, 0, 1.4), ba(2.4, 2.4, 1.5, 0, 0.1, 0, 1)]);
  add("lobster pot stack", ["harbour", "fishing"], ["#a08a60:wicker"], [[0, -1.5], [0, 1.5], [1.4, 0]].map(([y, x]) => cy(2.4, 2, x, y < 1 ? 0 : 2, 0, 0, 0.8)));
  set("fish barrels", 3, ["harbour", "fishing", "container"], [OAK, IRON, "#8a9aa8:fish"], (r) => [cy(2, 2.6), cy(2.05, 0.15, 0, 0.5, 0, 1), cy(2.05, 0.15, 0, 2, 0, 1), ...strewn(r, 5, 0.7, (x, z) => ba(1, 0.2, 0.3, x, 2.65, z, 2, r(0, 180)))]);
  add("gutting table", ["harbour", "fishing"], [OAK, "#8a9aa8:fish", STEEL], [...tabled(5, 2.6, 2.8), ba(1.4, 0.24, 0.45, -0.8, 2.95, 0.2, 1, 25), ba(1.2, 0.2, 0.4, 0.8, 2.95, -0.3, 1, -15), bx(0.8, 0.05, 0.2, 0.2, 2.8, 0.7, 2, 40)]);
  add("lighthouse lamp", ["harbour", "light"], [IRON, "#ffd27a:glass"], [cy(3, 0.5), cy(2.2, 3.4, 0, 0.5, 0, 1), ...around(6, 1.2, (x, z) => cy(0.12, 3.4, x, 0.5, z)), cn(3, 1.6, 0, 3.9)], "see");
  add("ship's figurehead", ["harbour", "boat", "statue"], ["#c8a868:wood", "#c8a848:gold"], [tb(1.6, 3.4, 1.2, 0, 2, 0, 0, [0, 25, 0]), ba(1, 1.2, 1, 0, 4.4, 0.8), wg(1.8, 1, 1, 0, 0, -0.6)]);
  add("treasure map table", ["harbour", "quest"], [OAK, "#d8c090:map", "#b83a30"], [...tabled(4.4, 3, 2.8), bx(3, 0.04, 2.1, 0, 2.8, 0, 1, 8), bx(0.2, 0.05, 0.2, 0.4, 2.84, 0.3, 2)]);
});

export const STREET = shelf("street", "street", (add, set) => {
  add("stone well", ["street", "water"], [STONE, OAK, ROPE], [tile(cy(5, 2.8), "stone", 3), rd(0.3, 5.4, 0, 6), cy(0.4, 6, -2.4), cy(0.4, 6, 2.4), wg(6.4, 1.2, 2.2, 0, 6.2, 1.1, 1), wg(6.4, 1.2, 2.2, 0, 6.2, -1.1, 1, 180), cy(0.05, 2, 0, 4, 0, 2), cy(0.8, 0.8, 0, 3.4, 0, 1)]);
  add("town fountain", ["street", "water", "rich"], [STONE, WATER], [cy(12, 1.8), disc(11, 0, 1.75, 0, 1), cy(1.6, 4, 0, 1.7), cy(5, 0.6, 0, 5.3), disc(4.4, 0, 5.85, 0, 1), cy(0.7, 2.2, 0, 5.8), ba(1.4, 1, 1.4, 0, 8.2, 0, 1)]);
  add("drinking fountain", ["street", "water"], [STONE, WATER, "#b89a48:brass"], [bx(2.4, 5, 0.8), bx(2.8, 1, 1.8, 0, 0, 1), bx(2.2, 0.1, 1.2, 0, 0.95, 1, 1), bx(0.2, 0.2, 0.7, 0, 3, 0.6, 2)]);
  add("horse trough", ["street", "water", "farm"], [OAK, WATER], [bx(7, 1.8, 2.4), bx(6.5, 0.1, 2, 0, 1.75, 0, 1)]);
  add("water pump", ["street", "water", "farm"], [IRON, OAK], [cy(0.8, 4), rd(0.2, 3, 0.8, 4.5, 0, 0, 0, 25), cy(0.25, 0.6, 0, 3, 0.6), bx(1.8, 0.3, 1.8, 0, 0, 0, 1)]);
  add("village lamp", ["street", "light"], [IRON, "#ffd27a:glass"], [cy(0.3, 9), cy(1, 0.4), bx(1.5, 0.15, 0.15, 0.5, 9), bx(0.1, 0.5, 0.1, 1.1, 8.5), cy(0.6, 0.9, 1.1, 7.6, 0, 1), cn(1, 0.4, 1.1, 8.5)], "see");
  add("double lamp post", ["street", "light"], [IRON, "#ffd27a:glass"], [cy(0.35, 10), cy(1, 0.4), bx(3.6, 0.15, 0.15, 0, 10), ...[-1.6, 1.6].flatMap((x) => [cy(0.6, 0.9, x, 9, 0, 1), cn(1, 0.4, x, 9.9)])], "see");
  add("stone lantern", ["street", "light"], [STONE, "#ffd27a:glow"], [bx(1.8, 0.5, 1.8), cy(0.7, 2.5, 0, 0.5), bx(1.4, 1.1, 1.4, 0, 3), bx(0.9, 0.7, 1.42, 0, 3.2, 0, 1), py(2, 1, 2, 0, 4.1)]);
  add("wall torch", ["street", "light", "wall"], [IRON, "#f08030:fire", OAK], [bx(0.3, 0.8, 0.1, 0, 4.4), ln(0.2, 1.8, 0, 5, 0.4, 2, 90, 15), cn(0.5, 1, 0, 5.8, 0.65, 1)], "see walk");
  add("standing torch", ["street", "light", "camp"], [OAK, "#f08030:fire", ROPE], [cy(0.25, 6), cy(0.5, 0.8, 0, 5.2, 0, 2), cn(0.6, 1.4, 0, 6, 0, 1)], "see");
  add("milestone", ["street", "road", "marker"], [STONE], [bx(1.6, 3, 1), { ...cy(1.6, 1), at: [0, 3, 0], turn: [0, 90, 0] }]);
  add("road marker", ["street", "road", "marker"], [OAK, "#e0e0d8:paint"], [cy(0.4, 4), bx(0.45, 0.8, 0.45, 0, 3, 0, 1)], "see");
  add("crossroads sign", ["street", "road", "sign"], [OAK], [cy(0.4, 9), bx(3.6, 0.8, 0.15, 1.2, 7.6), bx(3.6, 0.8, 0.15, -1, 6.4, 0, 0, 20), bx(3, 0.8, 0.15, 0.8, 5.2, 0, 0, -30)], "see");
  add("notice board", ["street", "sign", "quest"], [DARK, "#e0d8c0:paper"], [bx(0.5, 8, 0.5, -3), bx(0.5, 8, 0.5, 3), bx(6, 4, 0.2, 0, 3.4), wg(7.4, 0.8, 1, 0, 7.6, 0.5), wg(7.4, 0.8, 1, 0, 7.6, -0.5, 0, 180), ...[[-1.6, 5.4], [0.4, 4.6], [1.9, 5.6], [-0.4, 6]].map(([x, y]) => bx(1.1, 1.3, 0.22, x, y - 0.6, 0, 1))]);
  add("wanted poster", ["street", "sign", "quest"], [OAK, "#d8c090:paper"], [cy(0.4, 6), bx(1.8, 2.4, 0.42, 0, 3.4, 0, 1)], "see");
  add("shop sign", ["street", "sign", "wall"], [IRON, OAK], [rd(0.1, 3, 1.4, 8), bx(2.4, 1.5, 0.12, 1.5, 6.2, 0, 1), bx(0.06, 0.4, 0.06, 0.6, 7.6), bx(0.06, 0.4, 0.06, 2.4, 7.6)], "see walk");
  add("striped awning", ["street", "market", "wall"], ["#b84a3a:stripe", "#e8e0d0:stripe", IRON], [...[-2.4, -1.2, 0, 1.2, 2.4].map((x, k) => tb(1.2, 0.08, 4.2, x, 7.5, 2, k % 2, [0, 25, 0])), cy(0.15, 7.6, -3, 0, 3.6, 2), cy(0.15, 7.6, 3, 0, 3.6, 2)], "see");
  add("covered stall", ["street", "market"], [OAK, "#3a6a7a:cloth", "#e8e0d0:cloth"], [...tabled(7, 3, 2.8), ...[[-3.4, -1.4, 7.4], [3.4, -1.4, 7.4], [-3.4, 1.4, 6.4], [3.4, 1.4, 6.4]].map(([x, z, h]) => cy(0.2, h, x, 0, z)), ...[-3, -1, 1, 3].map((x, k) => tb(2, 0.08, 4, x, 6.9, 0, 1 + k % 2, [0, 18, 0]))]);
  add("fruit stall", ["street", "market", "food"], [OAK, "#b83a30:apples", "#d8a030:pears"], [bx(6, 2, 2.4), tb(6, 0.2, 2.4, 0, 2.3, 0, 0, [0, 18, 0]), ...[-2.2, -1.1, 0, 1.1, 2.2].flatMap((x, k) => [ba(1, 0.5, 1.2, x, 2.6, 0, 1 + k % 2)])]);
  add("flower cart", ["street", "market", "flowers"], [OAK, "#c84a70:flowers", "#e8c030:flowers"], [bx(5, 1, 3, 0, 1.6), { ...cy(3, 0.2, 0, 0, 0, 0), at: [0.5, 1.5, -1.7], turn: [0, 90, 0] }, { ...cy(3, 0.2, 0, 0, 0, 0), at: [0.5, 1.5, 1.7], turn: [0, 90, 0] }, ...[-1.6, -0.5, 0.6, 1.7].flatMap((x, k) => [ba(1.2, 0.8, 2.4, x, 2.8, 0, 1 + k % 2)]), rd(0.2, 3, 3.6, 2, -0.8, 0, 0, -12), rd(0.2, 3, 3.6, 2, 0.8, 0, 0, -12)]);
  add("hay bale", ["farm", "market"], ["#c8b060:hay"], [bx(4, 2, 2.2)]);
  set("baskets", 4, ["market", "container"], ["#a88a58:wicker", "#b83a30:contents", "#7a9040:contents"], (r) => [cy(r(1.6, 2.2), r(1, 1.8), 0, 0, 0, 0), ba(1.5, 0.5, 1.5, 0, r(1, 1.8), 0, 1 + Math.floor(r(0, 2)))], "see");
  add("empty crates", ["market", "container"], ["#a08a60:wood"], [bx(2, 1.4, 2, -1.2, 0, 0, 0, 12), bx(1.8, 1.2, 1.8, 1.1, 0, 0.6, 0, -18), tb(1.9, 1.3, 1.9, -0.4, 2, 0, 0, [30, 8, 8])]);
  add("garden bench", ["street", "seat"], [STONE], [bx(5.6, 0.4, 1.6, 0, 1.4), bx(1, 1.4, 1.5, -2), bx(1, 1.4, 1.5, 2)]);
  add("wooden park bench", ["street", "seat"], [OAK, IRON], [...[-0.5, 0, 0.5].map((z) => bx(6, 0.15, 0.4, 0, 1.6, z)), ...[1.9, 2.4, 2.9].map((y) => bx(6, 0.35, 0.1, 0, y, -0.7)), bx(0.2, 3.4, 1.8, -2.6, 0, 0, 1), bx(0.2, 3.4, 1.8, 2.6, 0, 0, 1)]);
  set("low stone wall", 4, ["wall", "street", "farm"], [STONE], (r) => Array.from({ length: 11 }, (_, k) => tb(r(1.4, 2.2), r(0.9, 1.4), r(1.4, 1.9), -5 + k, 0.5 + (k % 3) * 0.3, r(-0.1, 0.1), 0, [r(-12, 12), 0, 0])));
  set("picket fence", 2, ["fence", "street"], ["#d8d0b8:paint"], (r, k) => [rail(8, 1), rail(8, 2.6), ...Array.from({ length: 9 }, (_, n) => [bx(0.5, 3.2, 0.1, -3.8 + n * 0.95, 0, 0.14), py(0.5, 0.4, 0.1, -3.8 + n * 0.95, 3.2, 0.14)])], "see");
  add("wattle fence", ["fence", "farm", "poor"], ["#8a7048:wattle"], [...[-4, -2, 0, 2, 4].map((x) => cy(0.25, 4, x)), ...[0.6, 1.2, 1.8, 2.4, 3, 3.6].map((y) => rd(0.16, 8.4, 0, y))], "see");
  add("wrought iron gate", ["fence", "street", "rich"], ["#2f2f33:iron"], [cy(0.5, 8, -4.2), cy(0.5, 8, 4.2), ...[-3, -2, -1, 0, 1, 2, 3].map((x) => cy(0.12, 7 - Math.abs(x) * 0.35, x)), rd(0.14, 8, 0, 1), rd(0.14, 8, 0, 4)], "see");
  add("stone archway", ["street", "gate"], [STONE], [tile(bx(2.4, 11, 3, -5), "stone", 3.5), tile(bx(2.4, 11, 3, 5), "stone", 3.5), tile(bx(12.4, 3, 3, 0, 11), "stone", 3.5), wg(2, 2, 3, -3, 9, 0, 0, 180), wg(2, 2, 3, 3, 9, 0, 0)]);
  add("stone bridge", ["road", "bridge"], [STONE], [bx(9, 0.8, 7, -7, 2.8, 0), bx(9, 0.8, 7, 7, 2.8, 0), tb(6, 0.8, 7, -2.6, 3.9, 0, 0, [0, 0, 18]), tb(6, 0.8, 7, 2.6, 3.9, 0, 0, [0, 0, -18]), bx(2, 3, 7, -9.6), bx(2, 3, 7, 9.6)]);
  add("plank footbridge", ["road", "bridge"], [OAK, ROPE], [tb(14, 0.3, 3.6, 0, 1.4, 0), ...[-6, 6].flatMap((x) => [-1.8, 1.8].map((z) => cy(0.4, 4, x, 0, z))), rd(0.12, 12, 0, 3.4, -1.8, 1), rd(0.12, 12, 0, 3.4, 1.8, 1)]);
  set("stepping logs", 3, ["road"], ["#6a5238:logs", "#b89a68:cut"], (r) => strewn(r, 3 + Math.floor(r(0, 3)), 2.4, (x, z) => { const d = r(1.1, 2); return [cy(d, 0.4, x, 0, z), disc(d * 0.9, x, 0.4, z, 1, 0.03)]; }), "see");
  add("cobbled drain", ["road", "street"], [STONE, "#2a2622"], [bx(4, 0.1, 2.4), bx(2.4, 0.12, 1, 0, 0, 0, 1), ...[-0.9, -0.3, 0.3, 0.9].map((x) => bx(0.14, 0.14, 1, x))], "see walk");
  add("chimney pot", ["street", "wall"], ["#a8785a:clay", "#2a2622"], [cy(1.3, 2.4, 0, 0, 0, 0, 0.75), disc(1, 0, 2.38, 0, 1)]);
  add("barrel fire", ["street", "light", "poor"], [IRON, "#f08030:fire"], [cy(2.2, 3), cn(1.5, 1.8, 0, 2.8, 0, 1)]);
  add("stocks", ["street", "execution"], [OAK, IRON], [bx(0.5, 4, 0.5, -2.4), bx(0.5, 4, 0.5, 2.4), bx(5.4, 1, 0.5, 0, 2.6), ...[-1.3, 0, 1.3].map((x) => ({ ...cy(0.5, 0.52, 0, 0, 0, 1), at: [x, 3.1, 0], turn: [0, 90, 0] }))]);
  add("pillory", ["street", "execution"], [OAK], [cy(0.6, 5.8), bx(4, 1, 0.5, 0, 4.8), bx(3, 0.5, 2, 0, 0)]);
  add("market bell", ["street", "bell"], [OAK, "#a88a48:bronze"], [cy(0.5, 9), bx(2.4, 0.3, 0.3, 0.9, 8.8), cn(1.5, 1.5, 1.6, 7.3, 0, 1)], "see");
});
