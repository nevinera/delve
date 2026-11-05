import { around, ba, cn, cy, disc, hang, ln, rd, shelf, strewn } from "./kit.js";

// Small plants and forest litter, mostly variant sets you can walk through.

const LEAF = "#4f7f30:leaves";
const STEM = "#5f8a3a";
const BARK = "#5a4430:bark";
const pick = (r, n) => Math.floor(r(0, n));

// A little patch of flowers: stems of color 1 with heads of color 0.
const flowers = (head, count) => (r) => strewn(r, count + pick(r, 4), 1.4, (x, z) => {
  const h = r(0.6, 1.5);
  return [cy(0.07, h, x, 0, z, 1), head(r, x, h, z)];
});
const petals = (r) => strewn(r, 18 + pick(r, 12), 2.2, (x, z, k) => ba(r(0.14, 0.3), 0.03, r(0.1, 0.2), x, 0.04, z, k % 2, r(0, 180)));
const frond = (r, long, yaw, tip) => {
  const a = (yaw * Math.PI) / 180;
  const flat = (long / 2) * Math.cos((tip * Math.PI) / 180);
  return { type: "sphere", size: [long, 0.12, r(0.4, 0.7)], at: [Math.cos(a) * flat, 0.2 + (long / 2) * Math.sin((tip * Math.PI) / 180), -Math.sin(a) * flat], turn: [yaw, 0, tip], color: 0 };
};
const blades = (r, count, radius, lo, hi) => strewn(r, count, radius, (x, z) => ln(r(0.05, 0.14), r(lo, hi), x, r(lo, hi) / 2, z, 0, r(0, 360), r(2, 20), 0.15));
const cap = (r, x, z, h, d) => [cy(d * 0.28, h, x, 0, z, 0), ba(d, d * 0.55, d, x, h, z, 1)];
const twig = (r, x, z) => rd(r(0.06, 0.15), r(0.8, 2.4), x, 0.06, z, 0, r(0, 180));

export const FLORA = shelf("flora", "wild plants", (add, set) => {
  set("daisies", 5, ["plant", "flowers"], ["#f4f0e0:petals", STEM, "#e8c030"], flowers((r, x, h, z) => [ba(0.34, 0.08, 0.34, x, h, z), ba(0.13, 0.08, 0.13, x, h + 0.04, z, 2)], 6), "see walk");
  set("poppies", 5, ["plant", "flowers"], ["#c8352a:petals", STEM, "#241c18"], flowers((r, x, h, z) => [ba(0.42, 0.26, 0.42, x, h, z), ba(0.12, 0.1, 0.12, x, h + 0.12, z, 2)], 5), "see walk");
  set("bluebells", 5, ["plant", "flowers"], ["#5a68c8:bells", STEM], flowers((r, x, h, z) => [hang(0.24, 0.3, x + 0.08, h, z), hang(0.2, 0.26, x - 0.08, h - 0.2, z + 0.05)], 7), "see walk");
  set("violets", 4, ["plant", "flowers"], ["#7a4ab0:petals", STEM, "#e8c030"], flowers((r, x, h, z) => ba(0.26, 0.1, 0.26, x, h * 0.5, z), 9), "see walk");
  set("buttercups", 4, ["plant", "flowers"], ["#e8cc30:petals", STEM], flowers((r, x, h, z) => cn(0.3, 0.16, x, h, z), 9), "see walk");
  set("foxgloves", 4, ["plant", "flowers"], ["#b85aa0:bells", STEM], (r) => strewn(r, 2 + pick(r, 3), 1, (x, z) => {
    const h = r(2.6, 4.2);
    return [cy(0.1, h, x, 0, z, 1), ...[0.55, 0.65, 0.75, 0.85, 0.95].map((f) => hang(0.35 * (1.2 - f), 0.34, x + 0.08, h * f, z))];
  }), "see walk");
  set("fallen petals", 5, ["plant", "flowers", "ground"], ["#f0b8c8:petals", "#f8d8e0"], petals, "see walk");
  set("white petals", 4, ["plant", "flowers", "ground"], ["#f4f0e8:petals", "#e8e0d0"], petals, "see walk");
  set("fallen leaves", 6, ["plant", "autumn", "ground"], ["#b86a28:leaves", "#a84a20", "#c8982c"], (r) => strewn(r, 16 + pick(r, 12), 2.4, (x, z, k) => ba(r(0.25, 0.5), 0.03, r(0.15, 0.3), x, 0.04, z, k % 3, r(0, 180))), "see walk");
  set("grass tuft", 6, ["plant", "grass"], ["#6a8f3a:grass"], (r) => blades(r, 12 + pick(r, 10), 0.6, 0.5, 1.4), "see walk");
  set("tall grass", 5, ["plant", "grass"], ["#8a9a48:grass"], (r) => blades(r, 16 + pick(r, 10), 0.9, 2, 4), "see walk");
  set("dry grass", 4, ["plant", "grass", "desert"], ["#b8a868:grass"], (r) => blades(r, 14 + pick(r, 8), 0.8, 0.8, 2.2), "see walk");
  set("ferns", 5, ["plant"], [LEAF], (r) => {
    const n = 6 + pick(r, 5);
    return Array.from({ length: n }, (_, k) => frond(r, r(1.8, 3.2), (k * 360) / n + r(-12, 12), r(18, 44)));
  }, "see walk");
  set("clover", 4, ["plant", "ground"], ["#4e8a3c:leaves", "#f0e8f0"], (r) => strewn(r, 12 + pick(r, 6), 1.2, (x, z, k) => ba(r(0.2, 0.36), 0.08, r(0.2, 0.36), x, 0.12, z, k % 6 ? 0 : 1)), "see walk");
  set("thistles", 4, ["plant", "weed"], ["#6e8a58:stalks", "#9050a8:heads"], (r) => strewn(r, 3 + pick(r, 3), 0.9, (x, z) => {
    const h = r(1.5, 3);
    return [cy(0.12, h, x, 0, z, 0), ba(0.5, 0.15, 0.5, x, h * 0.6, z, 0), ba(0.3, 0.3, 0.3, x, h, z, 0), cn(0.28, 0.3, x, h + 0.08, z, 1)];
  }), "see walk");
  set("toadstools", 5, ["mushroom"], ["#e8e0c8:stems", "#c83a2a:caps"], (r) => strewn(r, 2 + pick(r, 4), 1, (x, z) => cap(r, x, z, r(0.5, 1.6), r(0.6, 1.5))), "see walk");
  set("brown mushrooms", 5, ["mushroom"], ["#ddd2b8:stems", "#7a5a38:caps"], (r) => strewn(r, 3 + pick(r, 5), 1, (x, z) => cap(r, x, z, r(0.25, 0.8), r(0.35, 0.9))), "see walk");
  set("pale mushrooms", 4, ["mushroom", "cave"], ["#e8e8d8:stems", "#c8d8c8:caps"], (r) => strewn(r, 4 + pick(r, 5), 1.1, (x, z) => cap(r, x, z, r(0.4, 1.4), r(0.3, 0.8))), "see walk");
  set("glowcaps", 4, ["mushroom", "cave", "magic"], ["#6a8a90:stems", "#60e8c8:caps"], (r) => strewn(r, 3 + pick(r, 4), 1, (x, z) => cap(r, x, z, r(0.5, 1.8), r(0.5, 1.2))), "see walk");
  set("cattails", 4, ["plant", "water"], ["#7a9040:reeds", "#5a3a22:heads"], (r) => strewn(r, 5 + pick(r, 4), 0.9, (x, z) => {
    const h = r(3, 5.5);
    return [cy(0.09, h, x, 0, z, 0, 0.7), cy(0.22, 0.8, x, h * 0.72, z, 1)];
  }), "see walk");
  set("shrubs", 6, ["plant", "bush"], ["#3f6a2c:leaves", "#4f7f30"], (r) => strewn(r, 3 + pick(r, 3), 1, (x, z, k) => {
    const s = r(1.6, 3);
    return ba(s, s * r(0.7, 1), s, x, s * 0.4, z, k % 2, r(0, 180));
  }));
  set("flowering shrubs", 4, ["plant", "bush", "flowers"], ["#3f6a2c:leaves", "#e878a0:flowers"], (r) => [ba(3.4, 2.6, 3.2, 0, 1.2, 0), ba(2.4, 1.8, 2.2, r(-0.9, 0.9), 1, r(-0.9, 0.9)), ...strewn(r, 12, 1.4, (x, z) => ba(0.28, 0.22, 0.28, x, r(1, 2.4), z, 1))]);
  set("saplings", 5, ["plant", "tree"], [BARK, LEAF], (r) => {
    const h = r(4, 8);
    return [cy(0.25, h, 0, 0, 0, 0, 0.5), ...strewn(r, 3 + pick(r, 3), 0.7, (x, z) => ba(r(1, 2), r(0.9, 1.6), r(1, 2), x, h - r(0, 1.2), z, 1))];
  }, "see");
  set("fir saplings", 4, ["plant", "tree"], [BARK, "#2f5a38:needles"], (r) => {
    const h = r(4, 7);
    return [cy(0.25, h * 0.4, 0, 0, 0, 0), cn(h * 0.55, h * 0.5, 0, h * 0.2, 0, 1), cn(h * 0.42, h * 0.42, 0, h * 0.42, 0, 1), cn(h * 0.28, h * 0.34, 0, h * 0.66, 0, 1)];
  }, "see");
  set("twigs", 4, ["forest", "ground"], [BARK], (r) => strewn(r, 5 + pick(r, 6), 1.6, (x, z) => twig(r, x, z)), "see walk");
  set("pine cones", 3, ["forest", "ground"], ["#6a4a2a:cones"], (r) => strewn(r, 3 + pick(r, 5), 1.5, (x, z) => ba(0.3, 0.42, 0.3, x, 0.15, z, 0, r(0, 180))), "see walk");
  set("moss patch", 4, ["plant", "moss", "ground"], ["#4f7a38:moss", "#638a42"], (r) => strewn(r, 4 + pick(r, 4), 1.5, (x, z, k) => ba(r(1, 2.4), r(0.1, 0.25), r(1, 2.4), x, 0.03, z, k % 2)), "see walk");
  set("ivy patch", 4, ["plant", "ground"], ["#3a6a30:leaves"], (r) => strewn(r, 26, 2, (x, z) => ba(r(0.2, 0.4), 0.05, r(0.2, 0.35), x, r(0.03, 0.15), z, 0, r(0, 180))), "see walk");
  set("exposed roots", 4, ["forest", "roots"], [BARK], (r) => around(4 + pick(r, 3), 1.3, (x, z, k, a) => rd(r(0.25, 0.5), r(2, 3.4), x, 0.12, z, 0, a + r(-20, 20), r(-6, 0))), "see walk");
  set("small stumps", 5, ["forest", "wood"], [BARK, "#b89a68:cut"], (r) => {
    const [d, h] = [r(1.2, 2.2), r(0.6, 1.6)];
    return [cy(d, h, 0, 0, 0, 0, 0.9), disc(d * 0.86, 0, h, 0, 1, 0.03), ...around(3, d * 0.5, (x, z, k, a) => rd(0.3, r(0.8, 1.2), x, 0.12, z, 0, a, -6))];
  });
  set("fallen branches", 5, ["forest", "wood"], [BARK], (r) => {
    const long = r(3, 7);
    return [rd(r(0.3, 0.5), long, 0, 0.2, 0, 0, r(0, 180)), ...strewn(r, 3, long / 2.6, (x, z) => rd(r(0.1, 0.2), r(0.8, 2), x, 0.3, z, 0, r(0, 180), r(-10, 24)))];
  }, "see");
  set("flat lily pads", 4, ["plant", "water"], ["#4f8a3a:pads", "#f0c0d0:flowers"], (r) => [...strewn(r, 4 + pick(r, 3), 1.8, (x, z) => disc(r(0.8, 1.7), x, 0.02, z, 0, 0.05)), ...(r() < 0.6 ? [cn(0.5, 0.3, r(-0.5, 0.5), 0.05, r(-0.5, 0.5), 1)] : [])], "see walk");
  add("bracket fungus log", ["mushroom", "forest"], [BARK, "#b8884a:fungus"], [rd(1.6, 8, 0, 0.75, 0, 0), ...[-2.4, -1, 0.4, 2].map((x, k) => ba(1, 0.2, 0.9, x, 0.9 + (k % 2) * 0.3, 0.8, 1))]);
  add("giant mushroom", ["mushroom", "cave"], ["#e0d8c0:stem", "#8a5ab0:cap"], [cy(1.6, 7, 0, 0, 0, 0, 0.7), ba(7, 2.8, 7, 0, 7, 0, 1), ba(1.5, 0.3, 1.5, 0, 0.1, 0, 0)]);
  add("wild rosebush", ["plant", "flowers", "bush"], ["#37592c:leaves", "#c8304a:roses"], [ba(4, 3, 3.6, 0, 1.4, 0), ...[[1.4, 2, 1], [-1.2, 2.2, 1.1], [0.2, 2.9, 0.5], [0.9, 1.3, 1.6], [-0.7, 1.2, 1.6], [-1.6, 1.3, 0.4], [1.7, 1.3, -0.3], [0, 2.4, -1.2]].map(([x, y, z]) => ba(0.4, 0.35, 0.4, x, y, z, 1))]);
});
