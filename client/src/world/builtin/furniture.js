import { around, ba, bx, cn, cy, disc, ln, rd, shelf, strewn, tabled, tb, tile, wg, legs } from "./kit.js";

// Furniture and what sits on it, indoors.

const OAK = "#8a6a44:wood";
const DARK = "#5c4630:wood";
const IRON = "#4a4a4e";
const CLOTH = "#a84a3a:cloth";
const LINEN = "#e0d8c4:linen";
const BRASS = "#b89a48:brass";
const pl = (piece, every = 3) => tile(piece, "planks", every);

const shelves = (w, h, d, n, c = 0) => [bx(0.2, h, d, -w / 2, 0, 0, c), bx(0.2, h, d, w / 2, 0, 0, c), bx(w, h, 0.1, 0, 0, -d / 2, c), ...Array.from({ length: n + 1 }, (_, k) => bx(w, 0.15, d, 0, (k * (h - 0.15)) / n, 0, c))];
const bookRow = (w, y, z, r, a = 1, b = 2, h = 1.1) => {
  let x = -w / 2 + 0.2;
  const out = [];
  while (x < w / 2 - 0.3 && out.length < 8) {
    const t = r(0.18, 0.4);
    out.push(bx(t, h * r(0.75, 1), 0.7, x + t / 2, y, z, r() < 0.5 ? a : b));
    x += t + 0.02;
  }
  return out;
};
const chair = (back, seat = 1.5, w = 1.5) => [bx(w, 0.2, w, 0, seat, 0), ...legs(w, w, seat, 0.18), ...(back ? [bx(0.18, back, 0.18, -(w - 0.18) / 2, seat, -(w - 0.18) / 2), bx(0.18, back, 0.18, (w - 0.18) / 2, seat, -(w - 0.18) / 2), bx(w, 0.5, 0.12, 0, seat + back - 0.5, -(w - 0.12) / 2)] : [])];
const bed = (w, l, h, posts) => [
  pl(bx(w, 0.4, l, 0, h - 0.4)), ...legs(w, l, h - 0.4, 0.3), bx(w, 2 + h / 2, 0.25, 0, 0, -l / 2), bx(w, 1 + h / 2, 0.25, 0, 0, l / 2),
  bx(w - 0.2, 0.5, l - 0.5, 0, h, 0.1, 1), bx(w - 0.3, 0.2, l * 0.55, 0, h + 0.45, l * 0.2, 2), ba(w * 0.7, 0.45, 1, 0, h + 0.65, -l / 2 + 0.9, 1),
  ...(posts ? [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => cy(0.25, posts, (a * w) / 2, 0, (b * l) / 2)) : []),
];

export const FURNITURE = shelf("furniture", "furniture", (add, set) => {
  add("single bed", ["bed", "furniture"], [OAK, LINEN, CLOTH], bed(3.4, 7, 2));
  add("double bed", ["bed", "furniture"], [OAK, LINEN, CLOTH], bed(5.4, 7, 2));
  add("four-poster bed", ["bed", "furniture", "rich"], [DARK, LINEN, "#6a2a4a:cloth"], [...bed(5.6, 7.4, 2.2, 8), bx(5.8, 0.3, 7.6, 0, 8, 0, 2)]);
  add("cot", ["bed", "furniture", "camp"], ["#7a6a4e:wood", "#b8ac8c:canvas"], [bx(2.8, 0.15, 6.4, 0, 1.2, 0, 1), ...legs(2.8, 6.4, 1.2, 0.15)]);
  add("straw bed", ["bed", "poor"], ["#c8b060:straw", "#8a7a5a:blanket"], [ba(3.6, 1, 6.8, 0, 0.3, 0), bx(3, 0.2, 3.4, 0, 0.6, 1.2, 1)], "see");
  add("bunk bed", ["bed", "furniture", "barracks"], [OAK, LINEN, CLOTH], [...[0, 3.4].flatMap((y) => [pl(bx(3.2, 0.25, 6.8, 0, y + 1.4)), bx(3, 0.4, 6.4, 0, y + 1.65, 0, 1), bx(2.9, 0.15, 3.6, 0, y + 2, 1.2, 2)]), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => bx(0.3, 6.6, 0.3, a * 1.5, 0, b * 3.3))]);
  add("cradle", ["bed", "furniture", "child"], [OAK, LINEN], [bx(1.8, 1, 3, 0, 0.6), bx(1.5, 0.2, 2.7, 0, 1.3, 0, 1), rd(0.3, 2.6, 0, 0.25, -1, 0, 0), rd(0.3, 2.6, 0, 0.25, 1, 0, 0)]);
  add("wardrobe", ["storage", "furniture"], [DARK, BRASS], [pl(bx(4.4, 7, 2.2)), bx(0.06, 6.4, 0.1, 0, 0.3, 1.12), ba(0.2, 0.2, 0.2, -0.25, 3.5, 1.15, 1), ba(0.2, 0.2, 0.2, 0.25, 3.5, 1.15, 1), bx(4.7, 0.3, 2.5, 0, 7)]);
  add("dresser", ["storage", "furniture"], [OAK, BRASS], [bx(4, 3, 1.8), ...[0.6, 1.5, 2.4].flatMap((y) => [bx(3.6, 0.7, 0.06, 0, y - 0.35, 0.93), ba(0.18, 0.18, 0.1, -0.9, y, 1, 1), ba(0.18, 0.18, 0.1, 0.9, y, 1, 1)])]);
  add("nightstand", ["storage", "furniture"], [OAK, BRASS], [bx(1.6, 2, 1.6), bx(1.3, 0.7, 0.06, 0, 1, 0.82), ba(0.16, 0.16, 0.1, 0, 1.35, 0.87, 1)]);
  add("sideboard", ["storage", "furniture"], [DARK, BRASS], [bx(6, 3, 1.8), ...[-2, 0, 2].map((x) => bx(1.7, 2.3, 0.06, x, 0.3, 0.93)), ...[-2, 0, 2].map((x) => ba(0.16, 0.16, 0.1, x, 1.5, 1, 1))]);
  add("plain chest", ["storage", "container"], [OAK, IRON], [pl(bx(3.4, 1.7, 2.2)), rd(2.2, 3.4, 0, 1.7, 0, 0), bx(0.2, 2.8, 2.3, -1.2, 0.05, 0, 1), bx(0.2, 2.8, 2.3, 1.2, 0.05, 0, 1)]);
  add("flat chest", ["storage", "container"], [DARK, BRASS], [bx(3.6, 1.5, 2), bx(3.7, 0.3, 2.1, 0, 1.5), bx(0.5, 0.5, 0.1, 0, 1.2, 1.03, 1)]);
  add("blanket box", ["storage", "furniture"], [OAK], [bx(4, 1.6, 1.8), bx(4.1, 0.2, 1.9, 0, 1.6)]);
  set("tall bookcase", 3, ["books", "furniture", "study"], [DARK, "#7a2a2a:books", "#2a4a6a:books"], (r) => [...shelves(4.4, 8, 1.2, 4), ...bookRow(4.4, 0.15, 0, r), ...bookRow(4.4, 2.1, 0, r), ...bookRow(4.4, 4.1, 0, r)]);
  set("bookshelf", 4, ["books", "furniture", "study"], [OAK, "#7a2a2a:books", "#2a5a4a:books"], (r) => [...shelves(4, 6, 1.2, 3), ...bookRow(4, 0.15, 0, r), ...bookRow(4, 2.1, 0, r), ...bookRow(4, 4.05, 0, r)]);
  add("empty shelves", ["furniture", "storage"], [OAK], shelves(4, 6, 1.2, 3), "see");
  add("wall shelf", ["furniture", "wall"], [OAK, IRON], [bx(3.6, 0.15, 0.9, 0, 5.2), bx(0.1, 0.6, 0.7, -1.4, 4.6, 0, 1), bx(0.1, 0.6, 0.7, 1.4, 4.6, 0, 1)], "see walk");
  add("writing desk", ["study", "furniture"], [DARK, "#e8e0c8", "#22221f"], [...tabled(4.6, 2.4, 2.8), bx(1.2, 0.05, 0.9, 0.2, 2.8, 0, 1), cy(0.25, 0.3, -1.4, 2.8, -0.5, 2)]);
  add("roll-top desk", ["study", "furniture"], [DARK, BRASS], [bx(1.3, 2.6, 2.4, -1.8), bx(1.3, 2.6, 2.4, 1.8), bx(5, 0.2, 2.4, 0, 2.6), rd(1.8, 5, 0, 3.1, -0.35, 0), ba(0.15, 0.15, 0.1, -1.8, 1.3, 1.22, 1), ba(0.15, 0.15, 0.1, 1.8, 1.3, 1.22, 1)]);
  add("round table", ["table", "furniture"], [OAK], [cy(4.6, 0.25, 0, 2.6), cy(0.6, 2.6), cy(2, 0.2)]);
  add("small round table", ["table", "furniture"], [OAK], [cy(2.6, 0.2, 0, 2.5), cy(0.4, 2.5), cy(1.4, 0.15)], "see");
  add("long table", ["table", "furniture", "hall"], [OAK], tabled(12, 3.4, 2.8, 0, 0.3, 0.45));
  add("trestle table", ["table", "furniture", "hall"], [OAK], [pl(bx(10, 0.25, 3, 0, 2.6)), ...[-3.6, 3.6].flatMap((x) => [tb(0.25, 3, 0.25, x, 1.3, -0.9, 0, [0, 25, 0]), tb(0.25, 3, 0.25, x, 1.3, 0.9, 0, [0, -25, 0])]), rd(0.3, 7.2, 0, 1.3, 0, 0)]);
  add("low table", ["table", "furniture"], [DARK], tabled(4, 2.4, 1.3, 0, 0.15, 0.2));
  add("side chair", ["seat", "furniture"], [OAK], chair(2), "see");
  add("armchair", ["seat", "furniture", "rich"], [DARK, CLOTH], [...chair(2.6, 1.5, 2.2), bx(2, 0.3, 2, 0, 1.7, 0, 1), bx(0.2, 0.9, 2, -1.1, 1.7), bx(0.2, 0.9, 2, 1.1, 1.7)]);
  add("throne", ["seat", "furniture", "rich", "royal"], ["#b89a48:gold", "#7a2a4a:cloth"], [bx(4, 1, 4), bx(3, 2, 3, 0, 1), bx(2.8, 0.4, 2.8, 0, 2.9, 0, 1), bx(3.2, 6, 0.4, 0, 2.8, -1.4), bx(2.6, 4.6, 0.1, 0, 3.4, -1.15, 1), bx(0.4, 1.3, 2.6, -1.5, 3), bx(0.4, 1.3, 2.6, 1.5, 3), cn(0.7, 1, -1.4, 8.8, -1.4), cn(0.7, 1, 1.4, 8.8, -1.4), cn(0.9, 1.5, 0, 8.8, -1.4)]);
  add("three-legged stool", ["seat", "furniture"], [OAK], [cy(1.2, 0.18, 0, 1.6), ...around(3, 0.42, (x, z) => cy(0.14, 1.6, x, 0, z))], "see");
  add("settle", ["seat", "furniture", "tavern"], [DARK], [bx(5, 0.25, 1.5, 0, 1.5), bx(5, 4.2, 0.2, 0, 0, -0.7), bx(0.2, 1.5, 1.5, -2.4), bx(0.2, 1.5, 1.5, 2.4)]);
  add("pew", ["seat", "furniture", "temple"], [DARK], [bx(8, 0.2, 1.4, 0, 1.5), bx(8, 2.2, 0.15, 0, 1.5, -0.65), bx(0.2, 3.6, 1.6, -3.9), bx(0.2, 3.6, 1.6, 3.9)]);
  add("rocking chair", ["seat", "furniture"], [OAK], [...chair(2.2), rd(0.15, 2.8, -0.68, 0.1, 0, 0, 90), rd(0.15, 2.8, 0.68, 0.1, 0, 0, 90)], "see");
  add("cushion", ["seat", "furniture", "rich"], [CLOTH], [ba(2, 0.5, 2, 0, 0.2, 0)], "see walk");
  add("floor rug", ["rug", "floor"], ["#8a3030:rug", "#c8a860:border"], [bx(6, 0.05, 4), bx(5.2, 0.06, 3.2, 0, 0, 0, 1), bx(4.6, 0.07, 2.6)], "see walk");
  add("round rug", ["rug", "floor"], ["#3a5a7a:rug", "#d8c8a0:border"], [disc(6, 0, 0, 0, 0, 0.05), disc(5, 0, 0, 0, 1, 0.06), disc(4.4, 0, 0, 0, 0, 0.07)], "see walk");
  add("runner rug", ["rug", "floor", "hall"], ["#6a2a4a:rug", "#c8a860:border"], [bx(3, 0.05, 12, 0, 0, 0, 1), bx(2.5, 0.06, 11.5)], "see walk");
  add("fur rug", ["rug", "floor", "camp"], ["#7a6048:fur", "#5a4634:dark fur"], [ba(5, 0.15, 7, 0, 0.03), ...[[-2.4, -2.6], [2.4, -2.6], [-2.4, 2.6], [2.4, 2.6]].map(([x, z]) => ba(2, 0.1, 1, x, 0.03, z)), ba(1.2, 0.35, 1.4, 0, 0.12, 3.4, 1)], "see walk");
  add("stone fireplace", ["hearth", "wall", "furniture"], ["#6f6d68:stone", "#2a2622", "#f08030:fire"], [tile(bx(1.4, 5, 2.4, -2.4), "stone", 3.5), tile(bx(1.4, 5, 2.4, 2.4), "stone", 3.5), tile(bx(6.2, 1.6, 2.4, 0, 3.4), "stone", 3.5), bx(3.4, 3.4, 0.2, 0, 0, -1.1, 1), bx(6.8, 0.3, 2.8, 0, 5), tile(bx(3.4, 9, 1.8, 0, 5, -0.3), "stone", 3.5), cn(1.6, 1.8, 0, 0.1, 0, 2), rd(0.4, 2.2, 0, 0.2, 0.1, 1, 25), rd(0.4, 2.2, 0, 0.2, 0.1, 1, -25)]);
  add("small hearth", ["hearth", "furniture"], ["#6f6d68:stone", "#2a2622"], [bx(4, 0.5, 3), bx(0.7, 3, 2.4, -1.65, 0.5), bx(0.7, 3, 2.4, 1.65, 0.5), bx(4, 0.8, 2.4, 0, 3.5), bx(2.6, 3, 0.2, 0, 0.5, -1.1, 1)]);
  add("iron stove", ["hearth", "furniture"], [IRON, "#2a2622"], [bx(2.6, 2.6, 2.2, 0, 0.5), ...legs(2.4, 2, 0.5, 0.2), cy(0.6, 5, 0, 3.1, -0.5), bx(1.2, 1, 0.06, 0, 1.2, 1.12, 1)]);
  add("standing mirror", ["furniture", "rich"], ["#b89a48:frame", "#bcd0d8:glass"], [bx(2, 5.4, 0.2, 0, 0.8), bx(1.6, 5, 0.06, 0, 1, 0.12, 1), bx(2.4, 0.3, 1.6)]);
  add("wall mirror", ["furniture", "wall", "rich"], ["#b89a48:frame", "#bcd0d8:glass"], [bx(2.2, 3, 0.15, 0, 3.8), bx(1.8, 2.6, 0.06, 0, 4, 0.1, 1)], "see walk");
  add("wash stand", ["furniture", "bath"], [OAK, "#c8c0b0:basin"], [...tabled(2.2, 1.8, 2.8), cy(1.3, 0.35, 0, 2.8, 0, 1), cy(0.45, 0.9, 0.7, 2.8, 0.45, 1, 0.8)], "see");
  add("bathtub", ["furniture", "bath"], [OAK, IRON, "#7fa8b8:water"], [cy(4, 2.4, 0, 0, 0, 0), cy(4.1, 0.2, 0, 0.4, 0, 1), cy(4.1, 0.2, 0, 1.8, 0, 1), disc(3.6, 0, 2.3, 0, 2)]);
  add("folding screen", ["furniture", "rich"], [DARK, "#c8b890:panels"], [-2, 0, 2].flatMap((x, k) => [bx(1.9, 5.6, 0.1, x, 0.2, k % 2 ? 0.25 : -0.25, 1, k % 2 ? 20 : -20), bx(2, 0.15, 0.2, x, 5.8, k % 2 ? 0.25 : -0.25, 0, k % 2 ? 20 : -20)]));
  add("grandfather clock", ["furniture", "rich"], [DARK, "#e8e0c8", "#b89a48"], [bx(1.6, 1.6, 1), bx(1.1, 3.4, 0.8, 0, 1.6), bx(1.6, 1.7, 1, 0, 5), wg(1.6, 0.5, 1, 0, 6.7), { ...cy(1.1, 0.05, 0, 0, 0, 1), at: [0, 5.85, 0.52], turn: [0, 90, 0] }, cy(0.1, 1.8, 0, 2, 0.45, 2)]);
  add("coat rack", ["furniture"], [OAK], [cy(0.25, 5.6), cy(1.3, 0.15), ...around(4, 0.3, (x, z, k, a) => rd(0.1, 0.8, x, 5.2, z, 0, a, 30))], "see");
  add("sword stand", ["furniture", "weapon"], [DARK, "#b8bcc0:steel"], [bx(1.4, 0.2, 1), bx(0.2, 2.4, 0.2, 0, 0.2), bx(0.1, 3.6, 0.3, 0.3, 0.2, 0, 1)], "see");
  add("birdcage", ["furniture", "rich"], ["#b89a48:brass"], [cy(0.15, 4.2), cy(1, 0.1), ...around(8, 0.6, (x, z) => cy(0.05, 1.5, x, 4.2, z)), cy(1.3, 0.08, 0, 4.2), cn(1.3, 0.5, 0, 5.7)], "see");
  add("hat stand", ["furniture"], [OAK, "#2a2a30:hat"], [cy(0.2, 4.8), cy(1.1, 0.12), cy(1.2, 0.08, 0, 4.8, 0, 1), cy(0.6, 0.7, 0, 4.85, 0, 1)], "see");
  add("spinning stool", ["seat", "furniture", "study"], [DARK], [cy(1.3, 0.2, 0, 2), cy(0.4, 2), ...around(3, 0.4, (x, z, k, a) => rd(0.16, 1.2, x, 0.12, z, 0, a))], "see");
  add("umbrella stand", ["furniture"], ["#6a6660:pot", "#2a3a4a:cloth"], [cy(1, 2, 0, 0, 0, 0, 0.8), ln(0.2, 3.4, 0.1, 2, 0, 1, 0, 8), ln(0.08, 3.2, -0.2, 2, 0.1, 0, 0, -6)], "see");
});

// Things to set on tables and shelves, standing on the floor unless you raise them.
export const TABLEWARE = shelf("tableware", "tableware", (add, set) => {
  const CLAY = "#a86a44:clay";
  const TIN = "#a0a4a8:tin";
  const GLASS = "#6a8a70:glass";
  add("plate", ["tableware"], [TIN], [disc(1, 0, 0, 0, 0, 0.08)], "see walk");
  add("wooden bowl", ["tableware"], [OAK], [cy(1, 0.4, 0, 0, 0, 0, 0.7)], "see walk");
  add("bowl of stew", ["tableware", "food"], [OAK, "#8a5a2a:stew"], [cy(1, 0.4), disc(0.8, 0, 0.36, 0, 1, 0.06)], "see walk");
  add("tankard", ["tableware", "drink", "tavern"], [TIN], [cy(0.6, 0.9), bx(0.1, 0.5, 0.15, 0.36, 0.2)], "see walk");
  add("wooden mug", ["tableware", "drink", "tavern"], [OAK, IRON], [cy(0.6, 0.85), cy(0.65, 0.08, 0, 0.1, 0, 1), cy(0.65, 0.08, 0, 0.65, 0, 1), bx(0.1, 0.5, 0.15, 0.36, 0.2)], "see walk");
  add("goblet", ["tableware", "drink", "rich"], ["#b89a48:gold"], [cn(0.6, 0.5, 0, 0.5), cy(0.1, 0.5), cy(0.4, 0.05), cy(0.62, 0.45, 0, 0.75, 0, 0, 0.8)], "see walk");
  add("wine bottle", ["tableware", "drink"], [GLASS], [cy(0.5, 1, 0, 0), cn(0.5, 0.35, 0, 1), cy(0.16, 0.5, 0, 1.2)], "see walk");
  set("bottles", 4, ["tableware", "drink", "tavern"], [GLASS, "#7a4a2a:amber"], (r) => strewn(r, 3 + Math.floor(r(0, 3)), 0.6, (x, z, k) => { const h = r(0.7, 1.2); return [cy(0.42, h, x, 0, z, k % 2), cy(0.14, 0.45, x, h, z, k % 2)]; }), "see walk");
  add("clay jug", ["tableware", "pottery"], [CLAY], [ba(1.2, 1.2, 1.2, 0, 0.55), cy(0.4, 0.6, 0, 1), bx(0.12, 0.7, 0.2, 0.55, 0.6)], "see walk");
  set("clay pots", 5, ["pottery", "container"], [CLAY, "#7a4a30"], (r) => strewn(r, 2 + Math.floor(r(0, 3)), 0.9, (x, z, k) => { const h = r(0.8, 2); return [cy(h * 0.7, h, x, 0, z, k % 2, 0.75), cy(h * 0.6, 0.1, x, h, z, 1)]; }));
  set("urns", 5, ["pottery", "container", "temple"], ["#8a6a50:clay", "#2f2a26:band"], (r) => { const h = r(2.2, 3.6); return [cy(h * 0.3, h * 0.12), ba(h * 0.55, h * 0.6, h * 0.55, 0, h * 0.42), cy(h * 0.26, h * 0.26, 0, h * 0.68), cy(h * 0.38, 0.1, 0, h * 0.93), cy(h * 0.56, 0.12, 0, h * 0.42, 0, 1), ...(r() < 0.5 ? [bx(0.1, h * 0.4, 0.3, h * 0.28, h * 0.5, 0), bx(0.1, h * 0.4, 0.3, -h * 0.28, h * 0.5, 0)] : [])]; });
  add("cooking pot", ["kitchen"], [IRON], [cy(1.6, 1.1, 0, 0, 0, 0, 1), cy(1.7, 0.08, 0, 1.1), bx(0.1, 0.3, 2, 0, 1)], "see walk");
  add("frying pan", ["kitchen"], [IRON], [cy(1.1, 0.15), rd(0.12, 1.5, 1.2, 0.1)], "see walk");
  add("cauldron", ["kitchen", "magic"], [IRON, "#5a8a40:brew"], [ba(3, 2.4, 3, 0, 1.3), cy(2.4, 0.2, 0, 2.3), disc(2.1, 0, 2.48, 0, 1), ...around(3, 1, (x, z) => cy(0.3, 0.5, x, 0, z))]);
  add("cooking tripod", ["kitchen", "camp"], [IRON], [...around(3, 1.1, (x, z, k, a) => ln(0.12, 4.4, x * 0.5, 2, z * 0.5, 0, a + 180, 14)), cy(1.5, 1, 0, 0.8), bx(0.05, 1.3, 0.05, 0, 1.8)], "see");
  add("bread loaf", ["food"], ["#b8884a:crust"], [ba(1.2, 0.5, 0.6, 0, 0.22)], "see walk");
  add("bread basket", ["food", "market"], ["#a88a58:wicker", "#b8884a:crust"], [cy(1.8, 0.7), ...[[-0.4, 0.2], [0.3, -0.2], [0, 0.4]].map(([x, z]) => ba(0.8, 0.4, 0.4, x, 0.7, z, 1, x * 90))], "see walk");
  add("wheel of cheese", ["food"], ["#e0c060:cheese"], [cy(1.6, 0.5)], "see walk");
  add("ham hock", ["food"], ["#a85a4a:meat", "#e0d8c0"], [ba(1.2, 0.8, 0.9, 0, 0.35), cy(0.2, 0.6, 0.6, 0.3, 0, 1)], "see walk");
  add("fish on a plate", ["food"], ["#a0a4a8:tin", "#7a8a98:fish"], [disc(1.3, 0, 0, 0, 0, 0.06), ba(1, 0.2, 0.34, 0, 0.14, 0, 1), wg(0.3, 0.1, 0.34, 0.58, 0.08, 0, 1)], "see walk");
  add("fruit bowl", ["food"], [OAK, "#b83a30:apples", "#d8a030:pears"], [cy(1.6, 0.4, 0, 0, 0, 0, 0.7), ...[[0, 0, 0], [0.35, 0.2, 1], [-0.35, 0.15, 0], [0.05, -0.4, 1]].map(([x, z, c]) => ba(0.45, 0.45, 0.45, x, 0.5, z, c + 1)), ba(0.45, 0.45, 0.45, 0, 0.82, 0, 2)], "see walk");
  add("candle", ["light"], ["#e8e0c8:wax", "#ffd27a"], [cy(0.2, 0.8), cn(0.1, 0.2, 0, 0.82, 0, 1)], "see walk");
  add("candle dish", ["light"], ["#e8e0c8:wax", "#ffd27a", TIN], [disc(0.7, 0, 0, 0, 2), cy(0.2, 0.5, 0, 0.1), cn(0.1, 0.2, 0, 0.62, 0, 1), bx(0.06, 0.2, 0.3, 0.38, 0.05, 0, 2)], "see walk");
  add("hand lantern", ["light"], [IRON, "#ffd27a"], [cy(0.8, 0.1), ...around(4, 0.35, (x, z) => cy(0.05, 1, x, 0.1, z)), cy(0.45, 0.8, 0, 0.15, 0, 1), cn(0.9, 0.3, 0, 1.1)], "see walk");
  add("oil lamp", ["light"], [CLAY, "#ffd27a"], [ba(0.8, 0.3, 0.5, 0, 0.15), cn(0.1, 0.25, 0.4, 0.2, 0, 1)], "see walk");
  add("candelabra", ["light", "rich"], ["#b89a48:brass", "#e8e0c8", "#ffd27a"], [cy(1, 0.1), cy(0.15, 3), rd(0.1, 2, 0, 3), ...[-1, 0, 1].flatMap((x) => [cy(0.2, 0.6, x, 3, 0, 1), cn(0.1, 0.2, x, 3.62, 0, 2)])], "see");
  add("chandelier", ["light", "rich", "hanging"], [IRON, "#e8e0c8", "#ffd27a"], [cy(0.1, 2.4, 0, 9), cy(3.2, 0.15, 0, 9), ...around(6, 1.5, (x, z) => [cy(0.2, 0.5, x, 9.15, z, 1), cn(0.1, 0.2, x, 9.66, z, 2)])], "see walk");
  add("hanging lantern", ["light", "hanging"], [IRON, "#ffd27a"], [cy(0.06, 1.6, 0, 8), cn(1, 0.35, 0, 7.8), cy(0.55, 1, 0, 6.8, 0, 1), cy(0.9, 0.08, 0, 6.75)], "see walk");
  add("book", ["books", "study"], ["#7a2a2a:cover", "#e8e0c8"], [bx(0.9, 0.2, 1.2), bx(0.8, 0.12, 1.1, 0.04, 0.04, 0, 1)], "see walk");
  add("open book", ["books", "study"], ["#e8e0c8:pages", "#5a2a20"], [bx(1.8, 0.05, 1.2, 0, 0, 0, 1), bx(0.85, 0.1, 1.1, -0.45, 0.05), bx(0.85, 0.1, 1.1, 0.45, 0.05)], "see walk");
  set("book piles", 4, ["books", "study"], ["#7a2a2a:covers", "#2a4a6a:covers", "#3a5a3a:covers"], (r) => { let y = 0; return Array.from({ length: 3 + Math.floor(r(0, 5)) }, (_, k) => { const t = r(0.15, 0.35); const made = bx(r(0.8, 1.2), t, r(1, 1.5), r(-0.1, 0.1), y, r(-0.1, 0.1), k % 3, r(-25, 25)); y += t; return made; }); }, "see walk");
  add("scroll", ["books", "study"], ["#e0d0a8:paper"], [rd(0.3, 1.6, 0, 0.15, 0)], "see walk");
  set("scroll piles", 3, ["books", "study"], ["#e0d0a8:paper", "#b84a3a:ties"], (r) => strewn(r, 4 + Math.floor(r(0, 5)), 0.7, (x, z, k) => rd(0.28, r(1.2, 1.8), x, 0.15 + (k % 3) * 0.26, z, k % 5 ? 0 : 1, r(0, 180))), "see walk");
  add("inkwell and quill", ["study"], ["#22221f:ink", "#e8e8e8:quill"], [cy(0.3, 0.3), ln(0.05, 1.3, 0.2, 0.7, 0, 1, 0, 25)], "see walk");
  add("potted plant", ["plant", "furniture"], [CLAY, "#4f7f30:leaves"], [cy(1.2, 1.1, 0, 0, 0, 0, 1), ba(1.6, 1.6, 1.6, 0, 1.8, 0, 1), ba(0.9, 0.9, 0.9, 0.5, 2.3, 0.2, 1)]);
  add("window box", ["plant", "flowers", "wall"], [OAK, "#4f7f30:leaves", "#c84a70:flowers"], [bx(4, 0.8, 1, 0, 0), ...[-1.4, -0.5, 0.5, 1.4].flatMap((x, k) => [ba(0.9, 0.7, 0.8, x, 1, 0, 1), ba(0.3, 0.25, 0.3, x + 0.2, 1.3, 0.3, 2), k % 2 ? ba(0.3, 0.25, 0.3, x - 0.2, 1.2, -0.2, 2) : []])], "see");
  add("vase of flowers", ["plant", "flowers"], [CLAY, "#4f7f30", "#e8c030:flowers"], [cy(0.7, 1, 0, 0, 0, 0, 0.8), ...[-0.2, 0.05, 0.25].flatMap((x, k) => [ln(0.05, 1.2, x, 1.4, 0, 1, k * 120, 12), ba(0.3, 0.25, 0.3, x * 1.6, 2, (k - 1) * 0.1, 2)])], "see walk");
});
