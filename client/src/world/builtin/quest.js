import { box, color, cone, crate, gable, object, post, rod, sack, sign, sphere, tiled, wedge } from "./pieces.js";

// Quest props: a notice board, an orb, a fine chest, a lectern, supplies, a rune stone, an altar and
// treasure.

const WOOD = "#7a5e40";
const DARK_WOOD = "#4e3a28";
const STONE = "#8a8680";
const GOLD = "#e0b040";
const PAPER = "#e8dcb8";
const GLOW = "#7ad8ff";
const WAX = "#efe6c8";
const CORE = "#ffe08a";

export const QUEST = {
  id: "quest",
  name: "quest props",
  objects: [
    object("bques001", "notice board", ["sign", "quest"], [color(WOOD, "wood"), color(PAPER, "paper"), color("#8a5040", "roof")], [
      post(0.5, 8, [-2.6, 4, 0], 0),
      post(0.5, 8, [2.6, 4, 0], 0),
      tiled(box([5, 3.6, 0.3], [0, 4.6, 0], 0), "planks", 1.2),
      sign(box([4.6, 0.6, 0.1], [0, 6.1, 0.18], 0), "title", "NOTICES", [3, 0.45], "0,0,1", "1"),
      box([1.2, 1.5, 0.1], [-1.4, 4.4, 0.18], 1, [0, 0, 4]),
      box([1.1, 1.3, 0.1], [0.1, 4.2, 0.18], 1, [0, 0, -6]),
      box([1.2, 1.4, 0.1], [1.5, 4.5, 0.18], 1, [0, 0, 3]),
      ...gable([6, 1, 1.6], 8, 2),
    ]),
    object("bques002", "orb on pedestal", ["magic", "quest"], [color(STONE, "stone"), color(GLOW, "glow"), color(GOLD, "gold")], [
      tiled(box([2.4, 0.6, 2.4], [0, 0.3, 0], 0), "stone", 1),
      tiled(post(1.2, 2.6, [0, 1.9, 0], 0, { taper: 0.8 }), "stone", 1),
      post(1.6, 0.3, [0, 3.35, 0], 2),
      sphere([1.4, 1.4, 1.4], [0, 4.15, 0], 1),
    ]),
    object("bques003", "ornate chest", ["treasure", "quest", "container"], [color("#6a2a2a", "wood"), color(GOLD, "trim")], [
      box([3.2, 1.8, 2], [0, 0.9, 0], 0),
      rod(2, 3.2, [0, 1.8, 0], 0),
      box([3.3, 0.2, 2.1], [0, 0.1, 0], 1),
      box([0.25, 1.85, 2.05], [-1.1, 0.9, 0], 1),
      box([0.25, 1.85, 2.05], [1.1, 0.9, 0], 1),
      rod(2.06, 0.25, [-1.1, 1.8, 0], 1),
      rod(2.06, 0.25, [1.1, 1.8, 0], 1),
      box([0.6, 0.7, 0.15], [0, 1.6, 1.05], 1),
    ]),
    object("bques004", "lectern with scroll", ["quest", "book"], [color(DARK_WOOD, "wood"), color(PAPER, "scroll")], [
      box([1.6, 0.3, 1.4], [0, 0.15, 0], 0),
      box([0.6, 3.4, 0.6], [0, 1.9, 0], 0),
      box([2, 0.2, 1.6], [0, 3.8, 0], 0, [0, -25, 0]),
      box([1.4, 0.1, 1.1], [0, 3.95, 0.1], 1, [0, -25, 0]),
      rod(0.3, 1.6, [0, 4.05, -0.5], 1, 0, 0),
    ]),
    object("bques005", "supply pile", ["quest", "container"], [color("#9a7a50", "crates"), color(DARK_WOOD), color("#b8a47c", "sacks"), color("#e8c040", "marker")], [
      ...crate(-1.4, 0, -0.4, 2.4, 0, 1, 10),
      ...crate(1.2, 0, -0.6, 2.2, 0, 1, -5),
      ...sack(0, 1.4, 2),
      ...sack(1.8, 1.2, 2, 0.9, 0, -15),
      ...sack(-1.6, 1.5, 2, 0.9, 0, 15),
      post(0.2, 5, [-1.4, 4.9, -0.4], 1),
      wedge([1.6, 1, 0.1], [-0.6, 6.9, -0.4], 3, [0, 0, -90]),
    ]),
    object("bques006", "rune stone", ["magic", "quest", "rock"], [color("#6e6a64", "stone"), color(GLOW, "runes")], [
      tiled(box([3, 8, 1.6], [0, 4, 0], 0, [0, 0, 3]), "stone", 2, 0.2),
      wedge([3, 1.2, 1.6], [0.2, 8.5, 0], 0, [90, 0, 0]),
      ...[2, 3.4, 4.8, 6.2].map((y, n) => box([0.6 + (n % 2) * 0.4, 0.5, 0.1], [(n % 2) * 0.3 - 0.15 + y * 0.05, y, 0.81], 1)),
      box([0.2, 3.6, 0.1], [-0.8, 4, 0.81], 1),
    ]),
    object("bques007", "altar", ["shrine", "quest", "magic"], [color(STONE, "stone"), color("#8a2a2a", "cloth"), color(WAX), color(CORE)], [
      tiled(box([6, 0.6, 3.6], [0, 0.3, 0], 0), "stone", 1.5),
      tiled(box([5, 2.8, 2.6], [0, 2, 0], 0), "stone", 1.5),
      box([5.2, 0.1, 1.4], [0, 3.45, 0], 1),
      box([1.4, 2, 0.1], [0, 2.4, 1.36], 1),
      ...[-2, 2].flatMap((x) => [post(0.3, 1, [x, 3.9, 0.6], 2), cone([0.15, 0.35, 0.15], [x, 4.6, 0.6], 3)]),
      post(0.3, 0.7, [-1.6, 3.75, -0.6], 2),
      cone([0.15, 0.35, 0.15], [-1.6, 4.3, -0.6], 3),
    ]),
    object("bques008", "treasure hoard", ["treasure", "quest"], [color(GOLD, "gold"), color("#3aa060", "gems"), color("#a02a4a", "rubies")], [
      sphere([6, 2, 5], [0, 0.4, 0], 0),
      sphere([3.4, 1.6, 3], [0.6, 1.2, -0.4], 0),
      post(0.8, 1.2, [-1.6, 1.6, 0.8], 0, { taper: 0.6 }),
      post(1.1, 0.15, [-1.6, 1, 0.8], 0),
      sphere([0.5, 0.5, 0.5], [1.4, 1.8, 0.8], 1),
      sphere([0.4, 0.4, 0.4], [-0.6, 1.9, -0.6], 2),
      sphere([0.45, 0.45, 0.45], [2.2, 1, -1], 2),
      sphere([0.4, 0.4, 0.4], [-2.4, 0.8, -0.8], 1),
      { ...post(1.6, 0.15, [2.6, 0.6, 1.2], 0), turn: [0, 70, 0] },
    ]),
  ],
};
