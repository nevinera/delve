import { around, ba, bx, cn, cy, disc, hang, legs, ln, py, rd, shelf, strewn, tabled, tb, wg } from "./kit.js";

// Magic, dungeons, treasure, harsh lands, remains and the farmyard.

const OAK = "#8a6a44:wood";
const DARK = "#5c4630:wood";
const IRON = "#4a4a4e:iron";
const STONE = "#7c7a74:stone";
const BONE = "#e0d8c0:bone";
const GOLD = "#d8b040:gold";
const GLOW = "#70c8f0:glow";
const VIOLET = "#9060d8:glow";
const pick = (r, n) => Math.floor(r(0, n));

const bars = (w, h, n, c = 0) => [...Array.from({ length: n }, (_, k) => cy(0.14, h, (k - (n - 1) / 2) * (w / (n - 1)), 0, 0, c)), bx(w, 0.2, 0.2, 0, h * 0.04, 0, c), bx(w, 0.2, 0.2, 0, h - 0.2, 0, c)];

export const ARCANE = shelf("arcane", "arcane", (add, set) => {
  add("floating crystal", ["magic", "crystal"], [GLOW, STONE], [bx(3, 0.8, 3, 0, 0, 0, 1), cy(1.4, 1.4, 0, 0.8, 0, 1, 0.6), hang(1.6, 2.6, 0, 5.4, 0), cn(1.6, 2.6, 0, 5.4)]);
  add("orb on a stand", ["magic", "study"], [DARK, VIOLET], [cy(1.4, 0.2), cy(0.3, 3), cy(0.9, 0.2, 0, 3), ba(1.3, 1.3, 1.3, 0, 3.8, 0, 1)], "see");
  set("runestones", 5, ["magic", "rock", "ancient"], [STONE, GLOW], (r) => {
    const [w, h, t] = [r(1.8, 3), r(3.5, 7), [r(0, 40), r(-5, 5), r(-5, 5)]];
    return [tb(w, h, 1.2, 0, h / 2, 0, 0, t), ...[0.3, 0.5, 0.7].map((f) => tb(w * 0.5, 0.2, 0.1, Math.sin((t[0] * Math.PI) / 180) * 0.6, h * f, Math.cos((t[0] * Math.PI) / 180) * 0.6, 1, t))];
  });
  add("rune circle", ["magic", "floor"], [GLOW, "#26304a:ink"], [disc(10, 0, 0, 0, 1, 0.03), disc(9.6, 0, 0, 0, 0, 0.04), disc(9.2, 0, 0, 0, 1, 0.05), disc(5.4, 0, 0, 0, 0, 0.06), disc(5, 0, 0, 0, 1, 0.07), ...around(6, 3.6, (x, z, k, a) => tb(0.9, 0.08, 0.2, x, 0.08, z, 0, [a + 90, 0, 0]))], "see walk");
  add("summoning circle", ["magic", "floor", "dark"], ["#c83030:blood", "#2a1a1a:ink", "#e8e0c8:wax"], [disc(11, 0, 0, 0, 0, 0.03), disc(10.4, 0, 0, 0, 1, 0.04), ...around(5, 3.4, (x, z, k, a) => tb(6.4, 0.06, 0.2, x * 0.4, 0.05, z * 0.4, 0, [a + 90 + 54, 0, 0])), ...around(5, 5, (x, z) => cy(0.4, 0.8, x, 0, z, 2))], "see walk");
  add("portal arch", ["magic", "gate"], [STONE, VIOLET], [bx(2, 11, 2, -5), bx(2, 11, 2, 5), bx(12, 2, 2, 0, 11), py(2.4, 2.4, 2.4, 0, 13), { ...cy(8, 0.2, 0, 0, 0, 1), at: [0, 5.6, 0], turn: [0, 90, 0], size: [8, 0.2, 10] }]);
  add("ley pylon", ["magic", "machine"], ["#5a6880:metal", GLOW], [py(4, 2, 4), tb(1.2, 12, 1.2, 0, 7, 0), ...[3, 6, 9].map((y) => bx(2, 0.4, 2, 0, y, 0, 1)), ba(1.6, 2.4, 1.6, 0, 14.4, 0, 1)]);
  add("wizard's table", ["magic", "study"], [DARK, "#e0d0a8:paper", VIOLET], [...tabled(6, 3, 2.9), bx(1.4, 0.05, 1, -1.4, 2.9, 0, 1, 10), cy(0.5, 0.8, 0.4, 2.9, -0.6, 2), ba(0.7, 0.7, 0.7, 1.7, 3.3, 0.2, 2), bx(1, 0.3, 0.8, -0.2, 2.9, 0.6)]);
  add("alembic rig", ["magic", "potion"], ["#7a8a8a:glass", "#6ae0a0:brew", IRON], [ba(1.6, 1.6, 1.6, -1.6, 1.3, 0, 1), cy(0.4, 1, -1.6, 2, 0), rd(0.14, 3.2, 0, 3, 0, 0, 0, -18), ba(1.2, 1.2, 1.2, 1.6, 0.6), ...around(3, 0.7, (x, z) => cy(0.1, 0.6, x - 1.6, 0, z, 2))]);
  add("astrolabe", ["magic", "study"], ["#b89a48:brass", OAK], [cy(1.8, 0.2, 0, 0, 0, 1), cy(0.3, 2.4, 0, 0, 0, 1), ...[[0, 90, 0], [0, 90, 60], [0, 0, 90]].map((turn) => ({ ...cy(3.2, 0.1), at: [0, 4, 0], turn }))], "see");
  add("spellbook on a stand", ["magic", "study", "books"], ["#4a2a5a:cover", "#e8e0c8:pages", IRON], [cy(0.3, 3, 0, 0, 0, 2), cy(1.3, 0.15, 0, 0, 0, 2), tb(2, 0.2, 1.5, 0, 3.2, 0, 0, [0, 18, 0]), tb(1.8, 0.12, 1.3, 0, 3.34, 0, 1, [0, 18, 0])], "see");
  add("mage's staff", ["magic", "weapon"], [DARK, GLOW], [ln(0.2, 7, 0, 3.5, 0, 0, 0, 3), ba(0.7, 0.7, 0.7, 0.2, 7.2, 0, 1)], "see");
  set("floating stones", 4, ["magic", "rock"], [STONE, GLOW], (r) => [disc(3, 0, 0, 0, 1, 0.04), ...strewn(r, 3 + pick(r, 3), 1.3, (x, z) => ba(r(0.6, 1.3), r(0.5, 1), r(0.6, 1.2), x, r(2, 5.5), z, 0, r(0, 180)))], "see");
  set("arcane shards", 4, ["magic", "crystal"], [VIOLET, "#e8d8ff"], (r) => strewn(r, 3 + pick(r, 4), 1.2, (x, z, k) => ln(r(0.25, 0.6), r(1, 3), x, r(0.3, 0.9), z, k % 3 ? 0 : 1, r(0, 360), r(10, 50), 0.15)), "see");
  add("elven lamp", ["magic", "light", "elf"], ["#d8d0a8:pale wood", GLOW], [ln(0.4, 8, 0, 4, 0, 0, 0, 3, 0.5), tb(2, 0.2, 0.2, 0.8, 8, 0, 0, [0, 0, 12]), hang(0.8, 1.2, 1.7, 8, 0, 1), ba(0.5, 0.5, 0.5, 1.7, 6.9, 0, 1)], "see");
  add("planar rift", ["magic", "dark"], ["#30145a:rift", "#c080ff:edge"], [tb(0.3, 11, 3, 0, 5.8, 0, 1, [0, 0, 8]), tb(0.5, 9.6, 2, 0, 5.8, 0, 0, [0, 0, 8])], "see");

  set("treasure heap", 5, ["treasure", "gold"], [GOLD, "#b89030:shade", "#c83a50:gem"], (r) => [ba(r(3, 5), r(1, 2.2), r(3, 5), 0, 0.1, 0), ...strewn(r, 18, 2.2, (x, z) => disc(r(0.3, 0.5), x, r(0.05, 1), z, 1, 0.05)), ...strewn(r, 2, 1.2, (x, z) => ba(0.35, 0.35, 0.35, x, r(0.8, 1.4), z, 2))], "see");
  set("scattered coins", 4, ["treasure", "gold", "ground"], [GOLD, "#a88a30"], (r) => strewn(r, 10 + pick(r, 14), 1.8, (x, z, k) => disc(r(0.26, 0.4), x, r(0.02, 0.08), z, k % 2, 0.04)), "see walk");
  set("gem piles", 4, ["treasure", "crystal"], ["#3ab880:gem", "#c83a50:gem", "#4a70d8:gem"], (r) => strewn(r, 5 + pick(r, 6), 0.9, (x, z, k) => py(r(0.25, 0.55), r(0.3, 0.6), r(0.25, 0.55), x, r(0, 0.2), z, k % 3, r(0, 90))), "see walk");
  add("treasure chest", ["treasure", "container"], ["#6a3a22:wood", GOLD, "#d8b040:coins"], [bx(3.6, 1.8, 2.4), { type: "cylinder", size: [2.4, 3.6, 2.4], at: [0, 1.8, 0], turn: [0, 0, 90], color: 0 }, bx(0.25, 3, 2.5, -1.3, 0.02, 0, 1), bx(0.25, 3, 2.5, 1.3, 0.02, 0, 1), bx(0.5, 0.6, 0.1, 0, 1.4, 1.25, 1)]);
  add("open treasure chest", ["treasure", "container"], ["#6a3a22:wood", GOLD, "#e8c850:coins"], [bx(3.6, 1.8, 2.4), ba(3.2, 0.8, 2, 0, 1.8, 0, 2), tb(3.6, 1.8, 0.3, 0, 3, -1.3, 0, [0, -20, 0]), bx(0.25, 1.85, 2.45, -1.3, 0, 0, 1), bx(0.25, 1.85, 2.45, 1.3, 0, 0, 1)]);
  add("iron strongbox", ["treasure", "container"], [IRON, GOLD], [bx(2.4, 1.6, 1.6), bx(2.5, 0.2, 1.7, 0, 0.7), bx(0.4, 0.5, 0.1, 0, 0.9, 0.83, 1)]);
  add("money sack", ["treasure", "container"], ["#b8a47c:sack", GOLD], [ba(1.4, 1.4, 1.4, 0, 0.6), cy(0.4, 0.5, 0, 1.2), disc(0.3, 0.8, 0.02, 0.3, 1, 0.05), disc(0.3, 0.6, 0.02, 0.7, 1, 0.05)], "see walk");
  add("golden idol", ["treasure", "statue"], [GOLD], [cy(0.9, 0.3), cy(0.6, 1.2, 0, 0.3, 0, 0, 0.7), ba(0.7, 0.7, 0.7, 0, 1.8), ba(0.3, 0.2, 0.2, -0.4, 1.3), ba(0.3, 0.2, 0.2, 0.4, 1.3)], "see walk");
  add("jewelled crown", ["treasure", "royal"], [GOLD, "#c83a50:gem"], [cy(1, 0.3), ...around(6, 0.46, (x, z) => [cn(0.25, 0.4, x, 0.3, z), ba(0.1, 0.1, 0.1, x, 0.15, z * 1.05, 1)])], "see walk");

  add("cell bars", ["dungeon", "wall"], [IRON], bars(8, 9, 9), "see");
  add("cell door", ["dungeon", "door"], [IRON], [...bars(4, 8, 5), bx(4, 0.3, 0.2, 0, 4), bx(0.5, 0.7, 0.3, 1.6, 3.8)], "see");
  add("iron-bound door", ["dungeon", "door"], [DARK, IRON], [bx(4, 8, 0.4), ...[1.4, 4, 6.6].map((y) => bx(4.1, 0.3, 0.5, 0, y, 0, 1)), ba(0.4, 0.4, 0.3, 1.5, 3.4, 0.2, 1)]);
  add("hanging cage", ["dungeon", "hanging"], [IRON], [cy(0.1, 4, 0, 8), ...around(8, 1.3, (x, z) => cy(0.1, 4, x, 4, z)), cy(2.8, 0.15, 0, 4), cn(2.9, 0.6, 0, 8)], "see");
  add("floor cage", ["dungeon", "creature"], [IRON], [bx(4.4, 0.2, 4.4), bx(4.4, 0.2, 4.4, 0, 5), ...around(12, 2.5, (x, z) => cy(0.12, 5, Math.max(-2.1, Math.min(2.1, x)), 0, Math.max(-2.1, Math.min(2.1, z))))], "see");
  add("wall shackles", ["dungeon", "wall"], [IRON], [bx(4, 0.2, 0.2, 0, 6), ...[-1.6, 1.6].flatMap((x) => [...[5.6, 5.2, 4.8].map((y) => ba(0.14, 0.24, 0.1, x, y)), { ...cy(0.6, 0.15), at: [x, 4.4, 0], turn: [0, 90, 0] }])], "see walk");
  add("floor manacles", ["dungeon"], [IRON], [bx(0.8, 0.2, 0.8), ...[0.8, 1.2, 1.6].map((x) => ba(0.25, 0.12, 0.15, x, 0.08)), { ...cy(0.6, 0.12), at: [2.1, 0.08, 0], turn: [0, 0, 0] }], "see walk");
  add("torture rack", ["dungeon", "dark"], [DARK, IRON], [bx(3, 0.3, 8, 0, 3), ...legs(3, 8, 3, 0.4), rd(0.4, 3.6, 0, 3.5, -3.6, 1), rd(0.4, 3.6, 0, 3.5, 3.6, 1), rd(0.2, 3, 1.8, 3.5, 3.6, 1, 90)]);
  add("iron maiden", ["dungeon", "dark"], [IRON, "#6a1a1a:rust"], [cy(3.4, 6.4, 0, 0, 0, 0, 0.8), ba(2.4, 1.8, 2.4, 0, 6.6), bx(0.1, 7, 0.15, 0, 0.2, 1.7, 1)]);
  add("guillotine", ["dungeon", "execution"], [OAK, "#a8acb0:blade"], [bx(5, 0.5, 3), bx(0.5, 11, 0.5, -1.2, 0.5), bx(0.5, 11, 0.5, 1.2, 0.5), bx(3.2, 0.5, 0.7, 0, 11.5), wg(1.9, 0.9, 0.1, 0, 8, 0, 1), bx(2.4, 0.8, 0.5, 0, 3)]);
  add("executioner's block", ["dungeon", "execution"], ["#7a5a3a:wood", "#6a1a1a:stain", "#a8acb0:steel"], [cy(2.2, 2), disc(1, 0.2, 2, 0.2, 1, 0.02), tb(0.1, 1.6, 0.9, 0.3, 2.7, 0, 2, [20, 0, 25]), ln(0.15, 3, 0.8, 3.6, 0, 0, 20, 25)]);
  add("spike pit cover", ["dungeon", "trap"], ["#2a2622:pit", DARK], [bx(6, 0.05, 6, 0, 0), ...around(9, 2, (x, z) => cn(0.5, 2, x, 0, z, 1)), cn(0.5, 2, 0, 0, 0, 1)], "see");
  add("pressure plate", ["dungeon", "trap"], [STONE], [bx(3, 0.14, 3), bx(2.4, 0.2, 2.4)], "see walk");
  add("wall lever", ["dungeon", "machine", "wall"], [IRON, DARK], [bx(1, 2, 0.2, 0, 3.4), ln(0.2, 2, 0.3, 5, 0.5, 1, 90, 25), ba(0.4, 0.4, 0.4, 0, 5.8, 0.9)], "see walk");
  add("sewer grate", ["dungeon", "floor"], [IRON, "#1a1816"], [bx(4, 0.1, 4, 0, 0, 0, 1), ...[-1.5, -0.75, 0, 0.75, 1.5].map((x) => bx(0.14, 0.14, 4, x)), ...[-1, 1].map((z) => bx(4, 0.14, 0.14, 0, 0, z))], "see walk");
  add("drain pipe", ["dungeon", "wall", "water"], ["#6a6a60:pipe", "#7a8a60:slime"], [rd(1.8, 3, 0, 3, 0, 0, 90), ba(1.2, 0.5, 1.2, 0, 2, 1, 1), bx(0.6, 2, 0.1, 0, 0, 1.5, 1)]);
  add("dungeon pillar", ["dungeon", "column"], [STONE, "#5a5048"], [bx(4, 13, 4), bx(4.6, 0.8, 4.6), bx(4.6, 0.8, 4.6, 0, 12.2)]);
  add("wall sconce skull", ["dungeon", "light", "wall", "dark"], [BONE, "#40e0a0:flame"], [ba(1, 1.1, 1, 0, 5), cn(0.5, 1, 0, 5.4, 0, 1), bx(0.2, 0.15, 0.1, -0.2, 5.1, 0.5, 1)], "see walk");
  add("straw pallet", ["dungeon", "bed", "poor"], ["#a89860:straw"], [ba(3.2, 0.5, 6, 0, 0.1)], "see walk");
  add("slop bucket", ["dungeon", "poor"], [DARK, "#6a7a40:slop", IRON], [cy(1.4, 1.2), disc(1.2, 0, 1.15, 0, 1), rd(0.05, 1.4, 0, 1.5, 0, 2)], "see walk");
  add("jailer's desk", ["dungeon", "study"], [DARK, IRON, "#ffd27a"], [...tabled(4.4, 2.4, 2.8), ...[-1.2, -0.8, -0.4].map((x) => ba(0.2, 0.2, 0.1, x, 3, 0.4, 1)), cy(0.5, 0.8, 1.3, 2.8, 0, 2)]);
});

export const LANDS = shelf("lands", "harsh lands", (add, set) => {
  const CACTUS = "#4a7a48:cactus";
  const SAND = "#c9b285:sand";
  const SNOW = "#e8eef4:snow";
  const ICE = "#a8d0e8:ice";
  const MUD = "#4a4030:mud";
  const SICK = "#6a7a38:bog";
  set("saguaro cactus", 5, ["desert", "plant"], [CACTUS], (r) => {
    const h = r(8, 16);
    return [cy(r(1.2, 1.7), h, 0, 0, 0, 0, 0.8), ...(r() < 0.8 ? [rd(0.6, 2, 1, h * 0.45, 0), cy(0.6, h * 0.3, 2, h * 0.45, 0)] : []), ...(r() < 0.7 ? [rd(0.6, 1.8, -0.9, h * 0.55, 0), cy(0.6, h * 0.22, -1.8, h * 0.55, 0)] : [])];
  });
  set("barrel cactus", 4, ["desert", "plant"], [CACTUS, "#d85060:flowers"], (r) => strewn(r, 1 + pick(r, 4), 1.2, (x, z) => { const s = r(0.9, 2); return [ba(s, s * 1.1, s, x, s * 0.45, z), ba(s * 0.3, s * 0.15, s * 0.3, x, s, z, 1)]; }));
  set("prickly pear", 3, ["desert", "plant"], [CACTUS], (r) => strewn(r, 4 + pick(r, 4), 0.9, (x, z) => tb(r(1, 1.7), r(1.3, 2), 0.2, x, r(0.7, 2.2), z, 0, [r(0, 180), r(-20, 20), r(-30, 30)])));
  set("agave", 3, ["desert", "plant"], ["#6a9a80:leaves"], (r) => around(9 + pick(r, 4), 0.5, (x, z, k, a) => ln(0.5, r(2.2, 3.6), x * 2, 1.2, z * 2, 0, a, r(18, 42), 0.1)), "see");
  set("dead bush", 5, ["desert", "plant", "dead"], ["#7a6a50:twigs"], (r) => strewn(r, 8 + pick(r, 6), 0.5, (x, z) => ln(r(0.05, 0.14), r(1.5, 3.4), x, r(0.8, 1.5), z, 0, r(0, 360), r(10, 50))), "see walk");
  set("tumbleweed", 3, ["desert", "plant", "dead"], ["#a89868:twigs"], (r) => [...strewn(r, 12, 0.8, (x, z) => ln(0.07, r(1.2, 2), x, r(0.7, 1.4), z, 0, r(0, 360), r(0, 90)))], "see walk");
  set("sandstone hoodoo", 4, ["desert", "rock"], ["#b88858:sandstone", "#8a5f3e"], (r) => { const h = r(9, 16); return [cy(r(2.4, 3.6), h, 0, 0, 0, 0, 0.7), ...[0.25, 0.55, 0.8].map((f) => cy(r(2.2, 3), 0.5, 0, h * f, 0, 1)), ba(r(3, 5), r(1.4, 2.4), r(3, 5), 0, h + 0.4, 0, 1, r(0, 180))]; });
  add("desert skull", ["desert", "bones"], [BONE, "#241c16"], [ba(1.2, 0.9, 2, 0, 0.45), ba(0.4, 0.4, 0.2, -0.3, 0.55, 0.3, 1), ba(0.4, 0.4, 0.2, 0.3, 0.55, 0.3, 1), ln(0.2, 1.8, -1, 0.9, -0.3, 0, 90, 60, 0.2), ln(0.2, 1.8, 1, 0.9, -0.3, 0, -90, 60, 0.2)], "see");
  add("termite mound", ["desert", "earth"], ["#a86a40:earth"], [cn(4, 8), cn(2.4, 5.4, 1.2, 0, 0.6), cn(1.6, 3.4, -1.2, 0, 0.8), ba(4.6, 1, 4.2, 0, 0.1)]);
  add("oasis palm sapling", ["desert", "plant", "tree"], ["#8a6a44:trunk", "#4f8a3a:fronds"], [ln(0.5, 8, 0, 4, 0, 0, 0, 6, 0.6), ...around(7, 1.4, (x, z, k, a) => tb(3.4, 0.08, 0.9, 0.4 + x * 0.9, 7.8, z * 0.9, 1, [a, 0, -18]))], "see");
  add("sun-bleached wagon wheel", ["desert", "wreck"], ["#b8aa88:wood"], [...around(8, 2, (x, z, k, a) => tb(1.8, 0.2, 0.3, x, 0.2, z, 0, [a + 90, 0, 0])), ...[0, 45, 90, 135].map((a) => rd(0.16, 3.8, 0, 0.15, 0, 0, a)), cy(0.8, 0.3, 0, 0.05)], "see walk");
  add("adobe oven", ["desert", "building"], ["#b89468:adobe", "#2a2622"], [ba(5, 4, 5, 0, 1.4), cy(5.4, 0.8), bx(1.6, 1.2, 0.6, 0, 0.8, 2.3, 1)]);
  set("clay water jars", 3, ["desert", "pottery"], ["#a86a44:clay"], (r) => strewn(r, 2 + pick(r, 3), 1, (x, z) => { const s = r(1.2, 2.2); return [ba(s, s * 1.2, s, x, s * 0.6, z), cy(s * 0.45, s * 0.3, x, s * 1.1, z)]; }));
  add("half-buried pillar", ["desert", "ruin"], ["#b8a070:stone", SAND], [tb(3, 12, 3, 1, 2, 0, 0, [0, 0, 70]), ba(6, 2, 5, -1.6, 0.2, 0, 1)]);

  set("snowdrift", 5, ["snow", "ground"], [SNOW], (r) => [ba(r(4, 8), r(0.8, 2.2), r(3, 6), 0, 0, 0, 0, r(0, 180)), ba(r(2, 4), r(0.5, 1.4), r(2, 3), r(-1.4, 1.4), 0, r(-1.4, 1.4))], "see");
  set("snowy rocks", 4, ["snow", "rock"], ["#7c7a74:stone", SNOW], (r) => { const s = r(2, 4); return [ba(s, s * 0.8, s * 0.9, 0, s * 0.3, 0, 0, r(0, 180)), ba(s * 0.86, s * 0.28, s * 0.8, 0, s * 0.62, 0, 1, r(0, 180))]; });
  set("icicles", 4, ["snow", "ice", "hanging"], [ICE], (r) => [bx(5, 0.3, 1, 0, 9), ...Array.from({ length: 6 + pick(r, 4) }, (_, k) => hang(r(0.25, 0.5), r(1, 4), -2.2 + k * 0.5, 9, r(-0.2, 0.2)))], "see walk");
  set("ice spikes", 5, ["snow", "ice"], [ICE, "#d8ecf8"], (r) => [cn(r(2, 3.4), r(6, 12), 0, 0, 0, 0), ...strewn(r, 2 + pick(r, 4), 2, (x, z, k) => ln(r(0.6, 1.3), r(2, 6), x, 1.4, z, k % 2, r(0, 360), r(4, 24), 0.1))]);
  set("ice chunks", 4, ["snow", "ice"], [ICE], (r) => strewn(r, 3 + pick(r, 4), 2, (x, z) => { const s = r(0.8, 2); return tb(s, s * r(0.5, 1), s, x, s * 0.3, z, 0, [r(0, 90), r(-20, 20), r(-20, 20)]); }));
  add("frozen pond patch", ["snow", "ice", "floor"], [ICE, SNOW], [ba(9, 0.2, 7, 0, 0.02, 0, 1), disc(7, 0, 0.1, 0, 0, 0.05)], "see walk");
  set("snowy firs", 4, ["snow", "tree"], ["#3a5a44:needles", SNOW, "#5a4430:bark"], (r) => { const h = r(8, 15); return [cy(0.7, h * 0.3, 0, 0, 0, 2), cn(h * 0.56, h * 0.42, 0, h * 0.18), cn(h * 0.5, h * 0.2, 0, h * 0.38, 0, 1), cn(h * 0.4, h * 0.4, 0, h * 0.4), cn(h * 0.32, h * 0.2, 0, h * 0.6, 0, 1), cn(h * 0.24, h * 0.3, 0, h * 0.68, 0, 1)]; });
  add("snowman", ["snow", "toy"], [SNOW, "#d87a30:nose", "#22221f"], [ba(3.2, 3, 3.2, 0, 1.4), ba(2.3, 2.2, 2.3, 0, 3.6), ba(1.6, 1.5, 1.6, 0, 5.2), ln(0.1, 0.8, 0, 5.2, 1, 1, 90, 90, 0.1), ba(0.14, 0.14, 0.1, -0.3, 5.5, 0.7, 2), ba(0.14, 0.14, 0.1, 0.3, 5.5, 0.7, 2), cy(1.4, 0.1, 0, 5.8, 0, 2), cy(0.9, 0.8, 0, 5.85, 0, 2)]);
  add("sled", ["snow", "cart"], [OAK, IRON], [bx(5, 0.25, 2.6, 0, 1), ...[-1.2, 1.2].flatMap((z) => [bx(6, 0.15, 0.2, 0, 0, z, 1), bx(0.2, 1, 0.2, -1.8, 0, z), bx(0.2, 1, 0.2, 1.8, 0, z)])], "see");
  add("ice fishing hole", ["snow", "fishing"], ["#1a3040:water", SNOW, OAK], [ba(5, 0.2, 5, 0, 0, 0, 1), disc(1.6, 0, 0.1, 0, 0, 0.05), ln(0.1, 4, 1.6, 1.4, 0, 2, 180, 40)], "see walk");
  add("hide yurt", ["snow", "tent", "camp"], ["#9a846a:hide", "#5a4634:frame"], [cy(13, 5), cn(13.6, 5, 0, 5), bx(3, 4.4, 0.2, 0, 0, 6.5, 1), cy(1.4, 0.8, 0, 9.2, 0, 1)]);
  add("frozen statue", ["snow", "ice", "statue"], [ICE, "#7a8a98:figure"], [cy(3, 7, 0, 0, 0, 0, 0.7), ba(3, 4.4, 3, 0, 6.2), cy(1, 3, 0, 1, 0, 1), ba(1.3, 2, 0.8, 0, 5, 0, 1), ba(0.8, 0.8, 0.8, 0, 6.6, 0, 1)]);

  set("cypress knees", 4, ["swamp", "wood"], ["#5a4634:wood"], (r) => strewn(r, 4 + pick(r, 5), 1.8, (x, z) => cn(r(0.6, 1.2), r(1, 3), x, 0, z)));
  set("swamp mound", 4, ["swamp", "earth"], [MUD, SICK], (r) => [ba(r(4, 7), r(0.8, 1.8), r(4, 6), 0, 0), ba(r(2, 4), 0.3, r(2, 4), 0, r(0.5, 0.9), 0, 1)], "see");
  set("hanging moss", 4, ["swamp", "plant", "hanging"], [SICK], (r) => [bx(4, 0.15, 0.15, 0, 10), ...Array.from({ length: 6 + pick(r, 5) }, (_, k) => bx(0.2, r(2, 6), 0.15, -1.8 + k * 0.4, 4 + r(0, 2), 0))], "see walk");
  set("rotten stump", 4, ["swamp", "wood", "dead"], ["#3e3224:rot", SICK], (r) => { const [d, h] = [r(2, 3.4), r(1.4, 4)]; return [cy(d, h, 0, 0, 0, 0, 0.8), ba(d * 0.5, 0.3, d * 0.5, 0, h * 0.8, d * 0.3, 1), ...around(4, d * 0.5, (x, z, k, a) => rd(0.5, r(1.2, 2), x, 0.2, z, 0, a, -6))]; });
  set("bog bubbles", 3, ["swamp", "water"], [SICK, "#8a9a58:bubbles"], (r) => [disc(4, 0, 0, 0, 0, 0.04), ...strewn(r, 6, 1.5, (x, z) => { const s = r(0.2, 0.5); return ba(s, s * 0.7, s, x, 0.1, z, 1); })], "see walk");
  add("sunken cart", ["swamp", "wreck", "cart"], ["#4a3c2c:wood", MUD], [tb(6, 0.4, 3, 0, 1, 0, 0, [0, 8, -14]), tb(6, 1, 0.2, 0, 1.4, -1.5, 0, [0, 0, -14]), { ...cy(3, 0.25, 0, 0, 0, 0), at: [1.7, 1.2, 1.7], turn: [0, 90, 0] }, ba(8, 1.2, 5.4, -0.6, 0, 0, 1)]);
  add("reed hut", ["swamp", "building", "poor"], ["#8a7c50:reeds", "#5a4634:posts"], [...[[-3.4, -3.4], [3.4, -3.4], [-3.4, 3.4], [3.4, 3.4]].map(([x, z]) => cy(0.5, 4, x, 0, z, 1)), bx(8, 0.3, 8, 0, 3, 0, 1), bx(7, 4.2, 7, 0, 3.3), cn(11, 5, 0, 7.4)]);
  add("swamp lantern", ["swamp", "light"], ["#3e3224:post", "#b8e070:glow"], [ln(0.3, 6, 0, 3, 0, 0, 0, 8), rd(0.15, 1.6, 0.9, 6, 0), bx(0.05, 0.6, 0.05, 1.5, 5.4, 0), ba(0.6, 0.8, 0.6, 1.5, 5, 0, 1)], "see");
  add("giant lily", ["swamp", "plant", "water"], ["#3f7a3a:pad", "#e8a0c0:flower"], [disc(6, 0, 0.05, 0, 0, 0.1), ...around(8, 0.5, (x, z) => ln(0.5, 1.6, x, 0.7, z, 1, 0, 0, 0.3)), cy(0.6, 1, 0, 0.1, 0, 1)], "see walk");
});

export const REMAINS = shelf("remains", "remains", (add, set) => {
  const STAIN = "#6a1a1a:stain";
  const rib = (x, h, w, c = 0) => [tb(0.3, h, 0.3, x, h / 2, w / 2, c, [0, -18, 0]), tb(0.3, h, 0.3, x, h / 2, -w / 2, c, [0, 18, 0])];
  add("giant ribcage", ["bones", "landmark"], [BONE], [rd(0.8, 20, 0, 0.5, 0), ...[-8, -5, -2, 1, 4, 7].flatMap((x, k) => rib(x, 8 - Math.abs(k - 2.5), 8 - Math.abs(k - 2.5)))]);
  add("giant skull", ["bones", "landmark"], [BONE, "#241c16"], [ba(8, 7, 10, 0, 3), ba(1.8, 1.8, 0.8, -2, 4.2, 4.4, 1), ba(1.8, 1.8, 0.8, 2, 4.2, 4.4, 1), bx(5, 1.4, 4, 0, 0, 5), ...[-1.8, -0.6, 0.6, 1.8].map((x) => cn(0.6, 1, x, 1.4, 6.6)), ln(1, 6, -5, 6, -2, 0, 90, 50, 0.1), ln(1, 6, 5, 6, -2, 0, -90, 50, 0.1)]);
  set("loose bones", 5, ["bones", "ground"], [BONE], (r) => strewn(r, 4 + pick(r, 6), 1.8, (x, z) => { const y = r(0, 180); return [rd(0.15, r(0.8, 2), x, 0.08, z, 0, y), ba(0.3, 0.25, 0.3, x, 0.1, z)]; }), "see walk");
  set("skeletons", 4, ["bones", "dead"], [BONE], (r) => [ba(0.7, 0.7, 0.8, r(-0.2, 0.2), 0.3, -2.6), ...[0, 0.5, 1, 1.5].flatMap((z) => [rd(0.1, 1.5, 0, 0.25, z - 1.8, 0, r(-6, 6))]), rd(0.12, 2.6, 0, 0.12, -1, 0, 90), ba(1.1, 0.4, 0.7, 0, 0.2, 0.3), ...[-0.4, 0.4].flatMap((x) => [rd(0.12, 2.8, x + r(-0.2, 0.2), 0.1, 1.8, 0, 90 + r(-14, 14))]), rd(0.1, 2.4, -1.2, 0.1, -1, 0, 80 + r(-30, 30)), rd(0.1, 2.4, 1.2, 0.1, -1, 0, 100 + r(-30, 30))], "see walk");
  add("skeleton in armor", ["bones", "dead", "armor"], [BONE, "#6a6a68:rusty iron", DARK], [bx(1.6, 2, 0.8, 0, 0.7, 0, 1), ba(0.8, 0.9, 0.8, 0, 3.2), cy(0.95, 0.5, 0, 3.4, 0, 1), rd(0.14, 2, -1.1, 1.3, 0.4, 0, 30, -20), rd(0.14, 2, 1.1, 1.3, 0.4, 0, -30, 20), rd(0.15, 2.4, -0.5, 0.2, 1.3, 0, 80), rd(0.15, 2.4, 0.5, 0.2, 1.3, 0, 100), tb(0.3, 0.12, 4, 1.6, 0.2, 1, 1)], "see");
  add("antler pile", ["bones", "hunt"], ["#c8b898:antler"], [...[0, 60, 120, 170, 230, 300].flatMap((a, k) => [rd(0.2, 2.8, Math.cos(a) * 0.5, 0.2 + (k % 3) * 0.2, Math.sin(a) * 0.5, 0, a, 8 + k * 2), ln(0.1, 1, Math.cos(a) * 1.1, 0.7, Math.sin(a) * 1.1, 0, a, 30, 0.2)])], "see");
  add("mounted antlers", ["hunt", "wall"], ["#c8b898:antler", OAK], [{ ...cy(1.6, 0.2, 0, 0, 0, 1), at: [0, 6, 0], turn: [0, 90, 0] }, ...[-1, 1].flatMap((s) => [ln(0.2, 2.4, s * 0.9, 7, 0.2, 0, 0, s * 35), ln(0.1, 1, s * 1.6, 7.8, 0.2, 0, 0, s * 5), ln(0.1, 1, s * 0.9, 7.8, 0.2, 0, 0, s * -15)])], "see walk");
  add("mammoth tusks", ["bones", "landmark"], ["#e0d4b0:ivory"], [ln(1, 12, -3.6, 5, 0, 0, 0, -22, 0.2), ln(1, 12, 3.6, 5, 0, 0, 0, 22, 0.2), ba(4, 1.2, 3, 0, 0.3, 0)]);
  set("eggs", 4, ["nest", "creature"], ["#d8d0b0:shell", "#8a7a5a:speckle"], (r) => strewn(r, 2 + pick(r, 5), 1, (x, z) => { const s = r(0.5, 1.1); return ba(s, s * 1.3, s, x, s * 0.6, z); }), "see");
  add("big nest", ["nest", "creature"], ["#6a5238:twigs", "#d8d0b0:shell"], [...around(14, 2.4, (x, z, k, a) => rd(0.3, 3.2, x, 0.4 + (k % 3) * 0.3, z, 0, a + 70, (k % 5) * 3)), ...[[0, 0], [0.7, 0.4], [-0.6, 0.5]].map(([x, z]) => ba(1, 1.3, 1, x, 0.65, z, 1))]);
  add("spider cocoon", ["web", "creature", "dark"], ["#d8d4c8:silk"], [ba(1.6, 3.4, 1.6, 0, 3), cy(0.1, 4, 0, 4.6), ...[0.6, -0.6].map((x) => ln(0.05, 2.4, x, 2, 0, 0, 0, x * 40))], "see");
  set("cocoon cluster", 3, ["web", "creature", "dark"], ["#d8d4c8:silk"], (r) => strewn(r, 2 + pick(r, 4), 1.3, (x, z) => { const s = r(0.8, 1.8); return ba(s, s * 2, s, x, s * 0.9, z, 0, r(0, 180)); }));
  add("egg sac", ["web", "creature", "dark"], ["#b8c090:sac", "#6a7a40:veins"], [ba(2.8, 2.2, 2.8, 0, 1), ba(1.8, 1.4, 1.8, 1.6, 0.6, 0.6), ba(1.4, 1.1, 1.4, -1.4, 0.5, 0.8), cn(3.6, 0.4, 0, 0, 0, 1)], "see");
  add("beast carcass", ["bones", "dead", "hunt"], ["#7a5a42:hide", "#a85a4a:meat", BONE], [ba(6, 2.4, 3, 0, 1), ba(2, 1.4, 1.6, 3.8, 0.7), ...[-2, -1, 0, 1, 2].flatMap((x) => [tb(0.2, 1.6, 0.2, x, 2, 0.8, 2, [0, -25, 0])]), ba(2.6, 0.5, 1, 0, 1.4, 1, 1), rd(0.4, 3, -1.6, 0.3, -2, 0, 30), rd(0.4, 3, 1.6, 0.3, -2, 0, -30)], "see");
  set("blood spatter", 3, ["ground", "dark"], [STAIN], (r) => strewn(r, 6 + pick(r, 8), 1.8, (x, z) => disc(r(0.2, 1.2), x, 0.01, z, 0, 0.02)), "see walk");
  add("scorch mark", ["ground", "fire"], ["#1e1a18:soot", "#3a3028"], [disc(6, 0, 0, 0, 1, 0.02), disc(4.4, 0.2, 0, 0.1, 0, 0.03)], "see walk");
  set("ash piles", 3, ["ground", "fire"], ["#5a5650:ash", "#3a3734"], (r) => strewn(r, 3 + pick(r, 3), 1.2, (x, z, k) => ba(r(0.8, 2), r(0.2, 0.5), r(0.8, 2), x, 0.05, z, k % 2)), "see walk");
  add("wolf trap", ["hunt", "trap"], [IRON], [cy(2.4, 0.12), ...around(9, 1.1, (x, z) => cn(0.2, 0.5, x, 0.1, z)), rd(0.1, 2, 1.8, 0.1, 0.5, 0, -20)], "see walk");
  add("trophy pole", ["hunt", "goblin", "dark"], [DARK, BONE, "#a84a3a:rags"], [cy(0.4, 9), ba(1, 1.1, 1.2, 0, 9.4, 0, 1), rd(0.2, 3, 0, 7), ba(0.7, 0.7, 0.8, -1.5, 6.7, 0, 1), bx(0.7, 3, 0.05, 1.4, 4, 0, 2), ba(0.6, 0.6, 0.6, 0, 5.6, 0.3, 1)], "see");
  add("drying fish rack", ["hunt", "fishing", "camp"], [OAK, "#8a9aa8:fish"], [ln(0.2, 7, -2.4, 3.2, 0, 0, 0, 12), ln(0.2, 7, -1.2, 3.2, 0, 0, 0, -12), ln(0.2, 7, 1.2, 3.2, 0, 0, 0, 12), ln(0.2, 7, 2.4, 3.2, 0, 0, 0, -12), rd(0.15, 6, 0, 5.8), ...[-2, -1, 0, 1, 2].map((x) => ba(0.5, 1.6, 0.1, x, 4.8, 0, 1))], "see");
});

export const FARMYARD = shelf("farmyard", "farmyard", (add, set) => {
  const STALK = "#7a9040:stalks";
  set("wheat", 4, ["crop", "farm"], ["#c8b050:wheat"], (r) => strewn(r, 28, 1.6, (x, z) => ln(0.06, r(2.6, 3.6), x, 1.6, z, 0, r(0, 360), r(0, 10))), "see walk");
  set("corn", 4, ["crop", "farm"], [STALK, "#e0c850:cobs"], (r) => strewn(r, 4 + pick(r, 3), 1.2, (x, z) => { const h = r(5, 7.5); return [cy(0.2, h, x, 0, z, 0, 0.6), ba(0.2, 0.7, 0.2, x + 0.2, h * 0.55, z, 1), ...[0.3, 0.5, 0.7].map((f) => tb(1.6, 0.05, 0.3, x, h * f, z, 0, [r(0, 360), 0, 25]))]; }), "see walk");
  set("cabbages", 4, ["crop", "farm", "food"], ["#6a9a48:leaves", "#88b858:hearts"], (r) => strewn(r, 2 + pick(r, 4), 1.4, (x, z) => { const s = r(0.8, 1.4); return [ba(s, s * 0.7, s, x, s * 0.3, z), ba(s * 0.6, s * 0.5, s * 0.6, x, s * 0.42, z, 1)]; }), "see walk");
  set("pumpkins", 4, ["crop", "farm", "food"], ["#d87a28:pumpkins", "#4f7f30:vine"], (r) => strewn(r, 2 + pick(r, 4), 1.6, (x, z) => { const s = r(0.8, 1.9); return [ba(s, s * 0.8, s, x, s * 0.36, z), cy(0.12, 0.3, x, s * 0.74, z, 1)]; }));
  set("carrot tops", 3, ["crop", "farm", "food"], ["#5f9a40:tops", "#d87a30:carrot"], (r) => strewn(r, 3 + pick(r, 5), 1.3, (x, z) => [cn(0.5, r(0.4, 0.9), x, 0.05, z), cy(0.2, 0.08, x, 0, z, 1)]), "see walk");
  set("beanpoles", 3, ["crop", "farm"], [OAK, "#4f8a3a:vines"], (r) => [-1, 0, 1].flatMap((x) => [ln(0.1, 6, x * 1.2, 3, 0, 0, 0, x * 7), ...[1, 2.2, 3.4, 4.6].map((y) => ba(0.7, 0.7, 0.7, x * (1.2 - y * 0.1) + r(-0.1, 0.1), y, r(-0.1, 0.1), 1))]), "see");
  set("grapevines", 3, ["crop", "farm", "food"], [OAK, "#4f7f30:leaves", "#6a2a6a:grapes"], (r) => [cy(0.3, 5, -3.6), cy(0.3, 5, 3.6), rd(0.08, 7.2, 0, 4.4), rd(0.08, 7.2, 0, 2.6), ...Array.from({ length: 6 }, (_, k) => [ba(1.3, 1, 0.7, -3 + k * 1.2, r(2.8, 4.2), 0, 1), ...(k % 2 ? [ba(0.4, 0.7, 0.4, -3 + k * 1.2, r(2, 2.8), 0.2, 2)] : [])])], "see");
  add("apple crate", ["crop", "market", "food"], [OAK, "#b83a30:apples"], [bx(2.8, 1.4, 2), ...[[-0.8, -0.4], [0, -0.4], [0.8, -0.4], [-0.8, 0.4], [0, 0.4], [0.8, 0.4]].map(([x, z]) => ba(0.7, 0.6, 0.7, x, 1.5, z, 1))]);
  add("potato sacks", ["crop", "market", "food"], ["#a8926c:sacks", "#9a7a50:potatoes"], [ba(2, 2.4, 1.6, -0.8, 1.1), ba(1.8, 2.2, 1.5, 0.9, 1, 0.2), ba(1.2, 0.5, 1.2, 0, 0.2, 1.4, 1)]);
  set("hay piles", 4, ["farm", "hay"], ["#c8b060:hay", "#b0983c"], (r) => [ba(r(3, 6), r(2, 4), r(3, 6), 0, r(0.7, 1.2)), ba(r(1, 2.4), r(0.5, 1), r(1, 2.4), r(-2, 2), 0.2, r(-2, 2), 1)]);
  add("round haystack", ["farm", "hay"], ["#c8b060:hay"], [cy(8, 6, 0, 0, 0, 0, 0.8), cn(6.6, 4, 0, 6)]);
  add("corn shock", ["farm", "hay"], ["#b8a050:stalks"], [cn(3, 6), ...around(6, 1, (x, z, k, a) => ln(0.1, 6, x * 0.7, 3, z * 0.7, 0, a, 8))], "see");
  add("chicken coop", ["farm", "building"], [OAK, "#a84a3a:roof"], [bx(5, 3, 3.4, 0, 1.4), ...legs(5, 3.4, 1.4, 0.3), wg(5.6, 1.2, 2, 0, 4.4, 1, 1), wg(5.6, 1.2, 2, 0, 4.4, -1, 1, 180), bx(1, 1.1, 0.1, 1, 1.5, 1.72), tb(1, 0.1, 2.2, 1, 0.7, 2.6, 0, [0, 40, 0])]);
  add("rabbit hutch", ["farm", "building"], [OAK, "#9a9070:wire"], [bx(5, 2, 2.2, 0, 1.6), ...legs(5, 2.2, 1.6, 0.3), bx(3, 1.5, 0.05, -0.8, 1.85, 1.12, 1), wg(5.4, 0.5, 2.6, 0, 3.6)]);
  add("pig pen", ["farm", "fence"], [OAK, "#5a4430:mud"], [bx(11, 0.05, 9, 0, 0, 0, 1), ...[-4, 4].flatMap((z) => [rail(11, 1, z), rail(11, 2.2, z)]), ...[-5.4, 5.4].flatMap((x) => [bx(0.2, 0.2, 8, x, 1), bx(0.2, 0.2, 8, x, 2.2)]), ...[[-5.4, -4], [5.4, -4], [-5.4, 4], [5.4, 4], [0, -4], [0, 4]].map(([x, z]) => cy(0.35, 3.2, x, 0, z))], "see");
  add("feed trough", ["farm"], [OAK, "#c8b060:grain"], [bx(5, 0.15, 1.4, 0, 1), bx(0.2, 1.8, 1.8, -2.4), bx(0.2, 1.8, 1.8, 2.4), bx(4.6, 0.6, 0.1, 0, 1.1, -0.65), bx(4.6, 0.6, 0.1, 0, 1.1, 0.65), bx(4.6, 0.2, 1.2, 0, 1.3, 0, 1)]);
  add("butter churn", ["farm", "kitchen"], [OAK, IRON], [cy(1.8, 3, 0, 0, 0, 0, 0.75), cy(1.85, 0.12, 0, 0.5, 0, 1), cy(1.5, 0.12, 0, 2.4, 0, 1), cy(0.14, 2.4, 0, 3)], "see");
  add("milk cans", ["farm", "kitchen"], ["#b0b4b8:tin"], [[-0.7, 0], [0.7, 0.2], [0, -1]].flatMap(([x, z]) => [cy(1.1, 1.8, x, 0, z), cn(1.1, 0.5, x, 1.8, z), cy(0.5, 0.25, x, 2.3, z)]));
  add("cider press", ["farm", "machine", "drink"], [OAK, IRON], [bx(4, 0.4, 3, 0, 1.2), ...legs(4, 3, 1.2, 0.4), cy(2.2, 2, 0, 1.6, 0, 0), bx(0.4, 5, 0.4, -1.8, 1.6), bx(0.4, 5, 0.4, 1.8, 1.6), bx(4, 0.5, 0.5, 0, 6.6), cy(0.3, 3, 0, 3.6, 0, 1), rd(0.15, 2.6, 0, 5.2, 0, 0, 30)]);
  add("grain silo", ["farm", "building"], ["#a8a090:stone", "#8a4a34:roof"], [cy(8, 16), cn(9, 4, 0, 16, 0, 1), bx(1.4, 3, 0.3, 0, 0, 4)]);
  add("windvane post", ["farm", "machine"], [OAK, IRON], [cy(0.3, 12), rd(0.1, 3, 0, 12.2, 0, 1), wg(0.8, 0.8, 0.06, 1.8, 11.9, 0, 1), tb(1, 0.8, 0.04, -1.5, 12.2, 0, 1)], "see");
  add("scythe", ["farm", "tool"], [OAK, "#a8acb0:blade"], [ln(0.14, 6, 0, 3, 0, 0, 0, 12), tb(3, 0.08, 0.4, -0.2, 5.8, 0, 1, [0, 0, -8]), rd(0.1, 0.8, 0.3, 4, 0.3, 0, 90)], "see");
  add("pitchfork", ["farm", "tool"], [OAK, IRON], [ln(0.14, 6, 0, 3, 0, 0, 0, 6), bx(0.8, 0.1, 0.1, 0.3, 6, 0, 1), ...[-0.3, 0, 0.3].map((x) => cn(0.08, 1, x + 0.3, 6, 0, 1))], "see");
  add("rake", ["farm", "tool"], [OAK], [ln(0.12, 6, 0, 3, 0, 0, 0, 4), bx(2, 0.15, 0.15, 0.2, 5.9), ...[-0.8, -0.4, 0, 0.4, 0.8].map((x) => bx(0.08, 0.4, 0.08, 0.2 + x, 5.5))], "see");
  add("wheelbarrow of dung", ["farm", "cart"], [OAK, "#4a3a28:dung"], [bx(3, 0.8, 2.2, -0.4, 1), ba(2.6, 0.8, 1.9, -0.4, 1.8, 0, 1), { ...cy(1.5, 0.2), at: [1.4, 0.75, 0], turn: [0, 90, 0] }, rd(0.14, 3.2, -1.8, 1, -0.9, 0, 0, 8), rd(0.14, 3.2, -1.8, 1, 0.9, 0, 0, 8), bx(0.2, 1, 0.2, -1.6, 0, -0.8), bx(0.2, 1, 0.2, -1.6, 0, 0.8)]);
  add("orchard ladder", ["farm", "tool"], [OAK], [ln(0.2, 11, -0.8, 5.3, 0, 0, 0, 8), ln(0.2, 11, 0.8, 5.3, 0, 0, 0, -6), ...[1.5, 3, 4.5, 6, 7.5, 9].map((y) => bx(1.6 - y * 0.05, 0.14, 0.14, 0, y))], "see");
  add("scarecrow with hat", ["farm"], [OAK, "#8a6a4a:clothes", "#c8b060:straw"], [cy(0.3, 7), rd(0.2, 5, 0, 5), bx(1.6, 2.6, 0.7, 0, 3, 0, 1), rd(0.5, 3.2, 0, 5, 0, 1), ba(1, 1.1, 1, 0, 6.6, 0, 2), cy(1.6, 0.1, 0, 7, 0, 1), cn(0.9, 0.8, 0, 7, 0, 1)], "see");
  add("seed furrows", ["farm", "ground"], ["#5a4430:earth", "#7f9a40:shoots"], [...[-1.5, 0, 1.5].map((z) => ba(9, 0.5, 1.1, 0, 0.05, z)), ...[-3.6, -1.2, 1.2, 3.6].flatMap((x) => [-1.5, 0, 1.5].map((z) => ba(0.25, 0.3, 0.25, x, 0.45, z, 1)))], "see walk");
});
function rail(long, y, z = 0, c = 0) {
  return bx(long, 0.2, 0.2, 0, y, z, c);
}
