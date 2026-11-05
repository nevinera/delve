import { around, ba, bx, cn, cy, disc, legs, ln, rd, shelf, strewn, tabled, tb, tile, wg } from "./kit.js";

// Taverns, smiths and other workshops.

const OAK = "#8a6a44:wood";
const DARK = "#5c4630:wood";
const IRON = "#4a4a4e:iron";
const STEEL = "#a8acb0:steel";
const STONE = "#6f6d68:stone";
const FIRE = "#f08030:fire";
const CLOTH = "#b8a47c:cloth";
const LEATHER = "#7a5232:leather";
const tool = (long, head, x, y, z, yaw = 0) => [rd(0.14, long, x, y, z, 0, yaw, 0), head];
const keg = (x, y, z, c = 0, h = 1) => [rd(1.5, 2.2, x, y + 0.8, z, c, 90), rd(1.62, 0.12, x, y + 0.8, z - 0.6, h, 90), rd(1.62, 0.12, x, y + 0.8, z + 0.6, h, 90)];

export const TRADES = shelf("trades", "trades", (add, set) => {
  add("bar counter", ["tavern", "furniture"], [DARK, OAK], [tile(bx(10, 3.2, 2), "planks", 3), bx(10.4, 0.2, 2.4, 0, 3.2, 0, 1)]);
  add("corner bar", ["tavern", "furniture"], [DARK, OAK], [bx(8, 3.2, 2, 0, 0, -3), bx(2, 3.2, 6, 3, 0, 1), bx(8.4, 0.2, 2.4, 0, 3.2, -3, 1), bx(2.4, 0.2, 6.2, 3, 3.2, 1, 1)]);
  add("bottle shelf", ["tavern", "furniture"], [DARK, "#6a8a70:glass", "#7a4a2a:amber"], [bx(6, 7, 0.2, 0, 0, -0.6), ...[2, 4, 6].flatMap((y) => [bx(6, 0.15, 1, 0, y), ...[-2.2, -1.2, -0.3, 0.7, 1.6, 2.4].flatMap((x, k) => [cy(0.42, 0.75, x, y + 0.15, 0, 1 + (k + y) % 2), cy(0.14, 0.3, x, y + 0.9, 0, 1 + (k + y) % 2)]).slice(0, 8)])]);
  add("keg on a stand", ["tavern", "drink"], [OAK, IRON], [bx(0.2, 1, 2.2, -0.6), bx(0.2, 1, 2.2, 0.6), ...keg(0, 0.8, 0), cy(0.1, 0.3, 0, 1.2, 1.2, 1)]);
  add("keg rack", ["tavern", "drink", "storage"], [OAK, IRON], [bx(0.3, 4, 2.4, -3, 0), bx(0.3, 4, 2.4, 3, 0), bx(6.2, 0.2, 2.4, 0, 1), ...keg(-1.8, 1.2, 0), ...keg(0, 1.2, 0), ...keg(1.8, 1.2, 0)]);
  add("beer barrels", ["tavern", "drink", "storage"], [OAK, IRON], [...keg(-1, 0, 0), ...keg(1, 0, 0), ...keg(0, 1.45, 0)]);
  add("dartboard", ["tavern", "wall"], ["#3a3028:board", "#e0d0a8:rings", "#b83a30"], [{ ...cy(1.8, 0.15), at: [0, 5, 0], turn: [0, 90, 0] }, { ...cy(1.3, 0.16, 0, 0, 0, 1), at: [0, 5, 0.01], turn: [0, 90, 0] }, { ...cy(0.8, 0.17, 0, 0, 0, 0), at: [0, 5, 0.02], turn: [0, 90, 0] }, { ...cy(0.25, 0.18, 0, 0, 0, 2), at: [0, 5, 0.03], turn: [0, 90, 0] }], "see walk");
  add("menu board", ["tavern", "sign"], [OAK, "#2a2a28:slate", "#e0e0d8"], [bx(3, 4, 0.15, 0, 3), bx(2.6, 3.6, 0.17, 0, 3.2, 0, 1), ...[6, 5.4, 4.8, 4.2].map((y) => bx(1.8, 0.1, 0.19, 0, y, 0, 2)), bx(0.2, 3, 0.2, -1.2), bx(0.2, 3, 0.2, 1.2)], "see");
  add("dice table", ["tavern", "furniture"], [DARK, "#e8e0c8", "#2a6a4a:felt"], [...tabled(3.6, 3.6, 2.8), bx(3, 0.05, 3, 0, 2.8, 0, 2), bx(0.2, 0.2, 0.2, 0.3, 2.85, 0.1, 1, 20), bx(0.2, 0.2, 0.2, -0.1, 2.85, -0.2, 1, 50)]);
  add("pie on a sill", ["tavern", "food"], ["#b8884a:crust", "#8a3a4a"], [cy(1.3, 0.3), disc(1, 0, 0.3, 0, 1, 0.03)], "see walk");
  add("anvil", ["forge", "smith"], [IRON, OAK], [cy(1.6, 1.6, 0, 0, 0, 1), bx(1, 0.5, 0.8, 0, 1.6), bx(2.2, 0.5, 0.9, 0, 2.1), wg(0.9, 0.5, 0.9, 1.5, 2.1, 0, 0)]);
  add("stone forge", ["forge", "smith"], [STONE, FIRE, IRON], [tile(bx(5, 2.8, 4), "stone", 3.5), bx(3.6, 0.2, 2.8, 0, 2.8, 0, 1), strewnCoals(), bx(3.2, 5, 0.6, 0, 2.8, -1.7), wg(3.6, 2, 2.4, 0, 7, -0.8, 0, 180), bx(0.15, 0.15, 3, -2.4, 2.4, 2, 2)]);
  add("bellows", ["forge", "smith"], [LEATHER, OAK], [wg(3, 0.5, 1.4, 0, 1), bx(3, 0.8, 1.4, 0, 0.3, 0, 0), wg(2, 0.3, 1.2, 0.4, 0, 0, 1), cy(0.3, 1, -1.8, 0.5, 0, 1)]);
  add("quench tub", ["forge", "smith"], [OAK, IRON, "#3a5a6a:water"], [cy(2.6, 1.8), cy(2.7, 0.15, 0, 0.3, 0, 1), cy(2.7, 0.15, 0, 1.4, 0, 1), disc(2.3, 0, 1.75, 0, 2)]);
  add("tool rack", ["forge", "smith", "wall"], [OAK, IRON], [bx(5, 0.3, 0.2, 0, 5.6), bx(5, 0.3, 0.2, 0, 3), ...[-2, -1, 0, 1, 2].flatMap((x, k) => [bx(0.14, 2.6, 0.12, x, 3, 0.15), k % 2 ? bx(0.6, 0.35, 0.14, x, 3, 0.15, 1) : bx(0.3, 0.8, 0.14, x, 3, 0.15, 1)])], "see");
  add("tongs and hammer", ["forge", "smith"], [IRON, OAK], [rd(0.1, 2.4, 0, 0.1, -0.2), rd(0.1, 2.4, 0, 0.1, 0.1, 0, 10), rd(0.16, 1.8, 0, 0.1, 0.7, 1), bx(0.5, 0.3, 0.3, 0.9, 0, 0.7)], "see walk");
  add("horseshoes", ["forge", "smith"], [IRON], around(4, 0.5, (x, z, k, a) => tb(0.8, 0.08, 0.2, x, 0.05, z, 0, [a, 0, 0])), "see walk");
  set("iron ingots", 3, ["forge", "metal"], [IRON], (r) => strewn(r, 3 + Math.floor(r(0, 6)), 0.8, (x, z, k) => bx(1, 0.3, 0.4, x, (k % 3) * 0.3, z, 0, r(0, 180))), "see walk");
  add("ore cart", ["forge", "mine"], [OAK, "#5a5048:ore", IRON], [bx(4, 1.6, 2.6, 0, 0.7), ba(3.4, 1, 2.2, 0, 2.2, 0, 1), ...[[-1.3, -1.4], [1.3, -1.4], [-1.3, 1.4], [1.3, 1.4]].map(([x, z]) => ({ ...cy(1.2, 0.2, 0, 0, 0, 2), at: [x, 0.6, z], turn: [0, 90, 0] }))]);
  add("grindstone", ["forge", "smith"], [STONE, OAK], [bx(0.3, 2.2, 2, -1, 0, 0, 1), bx(0.3, 2.2, 2, 1, 0, 0, 1), rd(0.2, 3, 0, 2.2, 0, 1), { ...cy(2.4, 0.5), at: [0, 2.2, 0], turn: [90, 90, 0] }]);
  add("armor stand", ["forge", "armor"], [OAK, STEEL], [bx(2, 0.2, 2), cy(0.25, 5), bx(2.2, 0.2, 0.2, 0, 4.4), bx(1.8, 2.4, 1, 0, 2.6, 0, 1), ba(1, 1.1, 1.1, 0, 5.5, 0, 1), ba(0.7, 0.5, 0.9, -1, 4.6, 0, 1), ba(0.7, 0.5, 0.9, 1, 4.6, 0, 1)]);
  add("shield on the wall", ["forge", "armor", "wall"], ["#7a2a2a:shield", STEEL], [{ ...cy(2.6, 0.2), at: [0, 5, 0], turn: [0, 90, 0] }, ba(0.7, 0.7, 0.4, 0, 5, 0.15, 1)], "see walk");
  add("sword on a rack", ["forge", "weapon", "wall"], [OAK, STEEL], [bx(4.6, 0.2, 0.2, 0, 4), bx(4, 0.1, 0.14, 0, 4.4, 0.05, 1), bx(0.6, 0.14, 0.2, -2, 4.36, 0.05, 0)], "see walk");
  add("carpenter's bench", ["workshop", "wood"], [OAK, IRON, "#c8a878"], [...tabled(7, 2.4, 3, 0, 0.35, 0.4), bx(0.8, 0.5, 0.5, 2.8, 3), rd(0.4, 3, -1, 3.2, 0.2, 2, 90), bx(2, 0.12, 0.5, 0.8, 3, -0.4, 1, 20)]);
  add("wood shavings", ["workshop", "wood"], ["#c8a878:shavings"], [ba(2.4, 0.3, 2, 0, 0.05), ba(1.2, 0.2, 1, 0.8, 0.05, 0.6)], "see walk");
  add("lumber stack", ["workshop", "wood", "storage"], ["#a88a60:wood"], [0, 1, 2].flatMap((y) => [-1.2, 0, 1.2].map((z) => bx(9, 0.5, 1.1, y * 0.2, y * 0.55, z))));
  add("nail barrel", ["workshop", "container"], [OAK, IRON], [cy(1.8, 2.4), disc(1.6, 0, 2.3, 0, 1)]);
  add("cobbler's bench", ["workshop", "leather"], [OAK, LEATHER, IRON], [bx(4, 0.3, 1.6, 0, 1.4), ...legs(3.8, 1.5, 1.4, 0.25), ba(0.9, 0.5, 0.5, -0.8, 1.9, 0, 1), cy(0.2, 1.3, 1, 1.7, 0, 2)]);
  add("boots", ["workshop", "leather", "armor"], [LEATHER], [cy(0.6, 1.2, -0.35), bx(0.6, 0.35, 1.1, -0.35, 0, 0.3), cy(0.6, 1.2, 0.35), bx(0.6, 0.35, 1.1, 0.35, 0, 0.3)], "see walk");
  add("drying hides", ["workshop", "leather"], [OAK, "#9a7a58:hide", "#7a5e42:hide"], [cy(0.3, 7, -3), cy(0.3, 7, 3), rd(0.25, 7, 0, 6.8), bx(2.4, 4.5, 0.08, -1.5, 2, 0, 1), bx(2.2, 4, 0.08, 1.5, 2.6, 0, 2)], "see");
  add("tanning vat", ["workshop", "leather"], [OAK, "#6a5a30:liquor"], [cy(4, 2.6), disc(3.6, 0, 2.5, 0, 1)]);
  add("tailor's dummy", ["workshop", "cloth"], [OAK, CLOTH], [cy(1.4, 0.15), cy(0.2, 3), ba(1.5, 2.2, 1, 0, 4, 0, 1), cy(0.3, 0.5, 0, 5)]);
  add("bolts of cloth", ["workshop", "cloth", "market"], ["#8a3a3a:cloth", "#3a5a7a:cloth", "#c8b060:cloth"], [rd(0.9, 4, 0, 0.45, -0.5, 0, 10), rd(0.9, 4, 0, 0.45, 0.5, 1, -5), rd(0.9, 4, 0, 1.25, 0, 2)]);
  add("sewing table", ["workshop", "cloth"], [OAK, CLOTH, IRON], [...tabled(4, 2.4, 2.7), bx(2, 0.05, 1.5, 0, 2.7, 0, 1, 15), rd(0.4, 0.5, -1.2, 2.9, 0.7, 2, 40)]);
  add("potter's wheel", ["workshop", "pottery"], [OAK, "#a86a44:clay"], [bx(2.4, 1.4, 2), cy(1.6, 0.15, 0, 1.4), cy(0.8, 0.7, 0, 1.55, 0, 1, 0.7)]);
  add("kiln", ["workshop", "pottery"], [STONE, FIRE, "#2a2622"], [cy(5, 5, 0, 0, 0, 0, 0.75), cn(3.6, 1.8, 0, 5), bx(1.6, 1.8, 0.4, 0, 0, 2.3, 2), bx(1.2, 0.5, 0.42, 0, 0.2, 2.3, 1)]);
  add("bakery oven", ["workshop", "kitchen"], ["#a8785a:brick", "#2a2622", FIRE], [tile(bx(6, 2, 5), "brick", 3), ba(6, 4.4, 5, 0, 2, 0, 0), bx(1.8, 1.2, 0.4, 0, 2, 2.5, 1), cy(0.8, 3, -1.8, 3.6, -1.6)]);
  add("flour sacks", ["workshop", "kitchen", "storage"], ["#e0d8c0:sacks"], [[-1, 0, 0.5], [1, 0.1, 0.3], [0, 1.1, 0.6]].map(([x, y, z]) => ba(2, 1.5, 1.4, x, y + 0.7, z, 0, x * 30)));
  add("butcher's block", ["workshop", "kitchen", "market"], ["#b09068:block", "#a8acb0:cleaver", "#a85a4a"], [bx(2.6, 3, 2.6), bx(1, 0.08, 0.5, 0.2, 3, 0.1, 1, 30), ba(0.9, 0.3, 0.7, -0.5, 3.1, -0.4, 2)]);
  add("meat hooks", ["workshop", "kitchen", "market"], [OAK, "#a85a4a:meat", IRON], [bx(0.3, 7, 0.3, -3), bx(0.3, 7, 0.3, 3), bx(6.3, 0.3, 0.3, 0, 7), ...[-1.8, 0, 1.8].flatMap((x) => [bx(0.08, 0.7, 0.08, x, 6.3, 0, 2), ba(1, 2, 0.7, x, 5.3, 0, 1)])]);
  add("apothecary shelf", ["workshop", "potion", "magic"], [DARK, "#6a8a70:glass", "#8a4a7a:glass"], [bx(5, 7, 0.2, 0, 0, -0.5), ...[1.6, 3.4, 5.2].flatMap((y) => [bx(5, 0.15, 1, 0, y), ...[-1.9, -0.9, 0.1, 1.1, 2].map((x, k) => cy(0.55, 0.7 + (k % 2) * 0.3, x, y + 0.15, 0, 1 + (k + Math.round(y)) % 2))])]);
  set("potion bottles", 5, ["potion", "magic", "tableware"], ["#8a4a7a:potion", "#4a8a6a:potion", "#c84a40:potion"], (r) => strewn(r, 2 + Math.floor(r(0, 4)), 0.5, (x, z, k) => { const s = r(0.35, 0.6); return [ba(s, s, s, x, s / 2, z, k % 3), cy(s * 0.35, s * 0.6, x, s * 0.85, z, k % 3)]; }), "see walk");
  add("mortar and pestle", ["workshop", "potion"], [STONE, "#8a8780"], [cy(1, 0.6, 0, 0, 0, 0, 0.8), ln(0.16, 1, 0.1, 0.8, 0, 1, 0, 25)], "see walk");
  add("drying herbs", ["workshop", "potion", "hanging"], [OAK, "#6a8a48:herbs", "#8a7a48:herbs"], [bx(5, 0.15, 0.15, 0, 7), ...[-2, -1, 0, 1, 2].map((x, k) => cn(0.6, 1.3, x, 5.7, 0, 1 + k % 2))], "see walk");
  add("distillery", ["workshop", "potion", "drink"], ["#b87a48:copper", OAK], [ba(3, 3, 3, 0, 1.8), cn(1.4, 2, 0, 3), rd(0.25, 3.4, 1.4, 4.6, 0, 0, 0, -30), cy(1.4, 2.4, 3, 0, 0, 1), cy(0.8, 1, 0, 0, 0, 0)]);
  add("beehive skep", ["farm", "food"], ["#c8a860:straw", OAK], [bx(2, 0.15, 2, 0, 1.6, 0, 1), ...legs(2, 2, 1.6, 0.2, 1), ba(1.7, 2.4, 1.7, 0, 2.5)]);
  add("wax vats", ["workshop", "light"], [IRON, "#e8e0c8:wax"], [cy(2, 1.4), disc(1.8, 0, 1.35, 0, 1), cy(1.6, 1.2, 2, 0, 0.3), disc(1.4, 2, 1.15, 0.3, 1)]);
  add("scribe's desk", ["workshop", "study"], [DARK, "#e8e0c8", "#22221f"], [tb(4, 0.15, 2.6, 0, 3.1, 0, 0, [0, 15, 0]), ...legs(3.6, 2.2, 2.8, 0.25), bx(1, 0.04, 1.3, -0.5, 3.1, 0, 1), cy(0.25, 0.25, 1.4, 3.2, -0.7, 2)]);
  add("printing press", ["workshop", "study"], [DARK, IRON], [bx(0.5, 7, 0.5, -1.6, 0, -1), bx(0.5, 7, 0.5, 1.6, 0, -1), bx(0.5, 7, 0.5, -1.6, 0, 1), bx(0.5, 7, 0.5, 1.6, 0, 1), bx(3.6, 0.5, 2.6, 0, 7), bx(3.2, 0.4, 2.4, 0, 2.4), cy(0.6, 2.6, 0, 3.6, 0, 1), rd(0.2, 3, 0, 5, 0, 1, 40)]);
  add("market scales", ["market", "workshop"], ["#b89a48:brass"], [cy(1.2, 0.15), cy(0.15, 3), rd(0.1, 3, 0, 3), ...[-1.4, 1.4].flatMap((x) => [bx(0.04, 1, 0.04, x, 2, 0), disc(0.9, x, 1.9, 0)])], "see");
});

function strewnCoals() {
  return [-1, -0.3, 0.4, 1].map((x, k) => ba(0.7, 0.3, 0.6, x, 3.05, (k % 2) * 0.5 - 0.2, 1));
}
