import { around, ba, bx, cn, cy, hang, ln, py, shelf, strewn, tb } from "./kit.js";

// Stones and earth to place in numbers, mostly as variant sets. builtinObjects.js moves stalagmites
// and stalactites to the natural caves collection.

const GRAY = "#7c7a74:stone";
const lump = (r, x, y, z, s) => ba(s * r(0.8, 1.3), s * r(0.5, 0.9), s * r(0.8, 1.3), x, y, z, 0, r(0, 180));
const spike = (r, x, z, d, h) => cn(d, h, x, 0, z);

export const STONES = shelf("stones", "stones", (add, set) => {
  set("loose rocks", 6, ["rock", "cave"], [GRAY], (r) => strewn(r, 3 + Math.floor(r(0, 5)), 2, (x, z) => lump(r, x, 0.2, z, r(0.4, 1.3))), "see walk");
  set("pebbles", 5, ["rock", "small"], [GRAY, "#99958c"], (r) => strewn(r, 8 + Math.floor(r(0, 8)), 1.6, (x, z, k) => ba(r(0.15, 0.4), r(0.08, 0.2), r(0.15, 0.4), x, 0.05, z, k % 2)), "see walk");
  set("flat stones", 4, ["rock", "path"], ["#8a8780:stone"], (r) => strewn(r, 2 + Math.floor(r(0, 3)), 1.6, (x, z) => cy(r(1, 2.4), r(0.1, 0.25), x, 0, z)), "see walk");
  set("stalagmites", 6, ["rock", "cave"], [GRAY], (r) => [spike(r, 0, 0, r(1.8, 3), r(5, 10)), ...strewn(r, 1 + Math.floor(r(0, 4)), 2.2, (x, z) => spike(r, x, z, r(0.7, 1.6), r(1.5, 5)))]);
  set("stalactites", 5, ["rock", "cave", "hanging"], [GRAY], (r) => {
    const top = 10;
    return [ba(5, 0.8, 5, 0, top, 0), hang(r(1.5, 2.6), r(4, 8), 0, top, 0), ...strewn(r, 2 + Math.floor(r(0, 4)), 2, (x, z) => hang(r(0.5, 1.3), r(1.5, 5), x, top, z))];
  });
  set("low boulders", 6, ["rock"], [GRAY], (r) => [lump(r, 0, r(0.6, 1), 0, r(2.5, 4)), lump(r, r(-1.4, 1.4), 0.4, r(-1.4, 1.4), r(1, 2))]);
  set("mossy rocks", 5, ["rock", "moss"], [GRAY, "#4f7a38:moss"], (r) => {
    const s = r(2, 3.6);
    return [ba(s, s * 0.7, s * 0.9, 0, s * 0.3, 0, 0, r(0, 180)), ba(s * 0.8, s * 0.3, s * 0.7, r(-0.2, 0.2), s * 0.56, r(-0.2, 0.2), 1, r(0, 180)), lump(r, s * 0.7, 0.2, r(-0.6, 0.6), s * 0.3)];
  });
  set("slate shards", 5, ["rock"], ["#5e6068:slate"], (r) => strewn(r, 3 + Math.floor(r(0, 4)), 2, (x, z) => {
    const h = r(1, 3);
    return tb(r(0.5, 1.4), h, r(0.12, 0.3), x, h * 0.42, z, 0, [r(0, 180), r(-22, 22), r(-22, 22)]);
  }));
  set("crystal cluster", 6, ["rock", "crystal", "cave", "magic"], ["#7fb8d8:crystal", "#d8f0ff"], (r) => [ba(2.4, 0.7, 2.4, 0, 0.1, 0, 1), ...strewn(r, 4 + Math.floor(r(0, 5)), 1, (x, z, k) => ln(r(0.3, 0.8), r(1.4, 4), x, r(0.8, 1.6), z, k % 3 ? 0 : 1, r(0, 360), r(4, 26), 0.2))]);
  set("gravel patch", 4, ["rock", "ground"], ["#83807a:gravel"], (r) => [ba(r(3, 5), 0.25, r(3, 5), 0, 0, 0), ...strewn(r, 14, 2.1, (x, z) => ba(r(0.2, 0.5), r(0.1, 0.25), r(0.2, 0.5), x, 0.1, z))], "see walk");
  set("dirt mound", 4, ["earth", "ground"], ["#5a4430:earth"], (r) => [ba(r(3, 5), r(1, 2.2), r(3, 5), 0, 0.1, 0), ba(r(1.5, 2.5), r(0.5, 1), r(1.5, 2.5), r(-1, 1), r(0.1, 0.5), r(-1, 1))], "see");
  set("sand heap", 4, ["earth", "desert"], ["#c9b285:sand"], (r) => [ba(r(3, 6), r(0.8, 2), r(3, 6), 0, 0, 0), ba(r(2, 3), r(0.4, 1), r(2, 3), r(-1.3, 1.3), 0, r(-1.3, 1.3))], "see");
  set("standing stone", 5, ["rock", "ancient"], ["#6f6d68:stone"], (r) => {
    const h = r(7, 13);
    return [tb(r(2, 3.6), h, r(1.2, 2), 0, h / 2 - 0.3, 0, 0, [r(0, 180), r(-4, 4), r(-6, 6)]), lump(r, r(-1.6, 1.6), 0.2, r(-1.6, 1.6), r(0.7, 1.3))];
  });
  set("cairn", 4, ["rock", "marker"], [GRAY], (r) => {
    let y = 0;
    const n = 4 + Math.floor(r(0, 4));
    return Array.from({ length: n }, (_, k) => {
      const s = 2.8 * (1 - k / (n + 1)) * r(0.85, 1.1);
      const made = ba(s, s * 0.5, s, r(-0.12, 0.12), y + s * 0.2, r(-0.12, 0.12), 0, r(0, 180));
      y += s * 0.42;
      return made;
    });
  });
  add("rock arch", ["rock", "landmark"], [GRAY], [ln(4, 10, -4.6, 4.4, 0, 0, 0, -10, 0.8), ln(4, 10, 4.6, 4.4, 0, 0, 0, 10, 0.8), ba(11, 3.4, 4.2, 0, 10, 0)]);
  add("balancing stones", ["rock", "landmark"], [GRAY], [ba(5, 3, 4.4, 0, 1.3, 0), ba(3.4, 2.4, 3, 0.2, 3.8, 0.1, 0, 40), ba(2.2, 1.6, 2, -0.1, 5.6, 0, 0, 70)]);
  add("rock spire cluster", ["rock", "landmark"], [GRAY], [cn(6, 22, 0, 0, 0), cn(4, 14, 3.6, 0, 1.6), cn(3.4, 10, -3.2, 0, 1.8), cn(3, 8, 0.6, 0, -3.4), ba(9, 2, 8, 0, 0.3, 0)]);
  add("stone ring", ["rock", "ancient"], [GRAY], around(9, 7, (x, z, k, a) => tb(2, 5 + (k % 3), 1, x, 2.5 + (k % 3) / 2, z, 0, [a, 0, 0])));
  add("fire ring", ["rock", "camp"], [GRAY, "#2a2622"], [cy(3.2, 0.1, 0, 0, 0, 1), ...around(9, 1.9, (x, z) => ba(0.9, 0.6, 0.8, x, 0.25, z))], "see");
  add("pointed rock", ["rock"], [GRAY], [py(4.4, 7, 3.6, 0, 0, 0, 0, 25), py(2.4, 3.2, 2, 2, 0, 1, 0, 70)]);
});
