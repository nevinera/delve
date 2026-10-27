import { box, color, crate, cut, object, post, rod, sphere, tiled, wedge } from "./pieces.js";

// Coast and dock props: boats, nets, pots, buoys, posts, rope and an anchor.

const WOOD = "#7a5e40";
const DARK_WOOD = "#4e3a28";
const ROPE = "#c4ae80";
const IRON = "#3e4044";
const NET = "#8a8070";

// A rowboat's hull, hollowed, tipped `roll` degrees onto its side.
const hull = (long, wide, deep, roll = 0) => [
  tiled(sphere([long, deep * 2, wide], [0, deep, 0], 0, [0, 0, 0]), "planks", 1.5),
  cut(box([long + 1, deep * 2, wide + 1], [0, deep * 2, 0], 1)),
  cut(sphere([long - 0.6, deep * 1.7, wide - 0.6], [0, deep * 1.1, 0], 1)),
].map((p) => ({ ...p, turn: [0, roll, 0], at: roll ? [p.at[0], p.at[1] + Math.abs(roll) / 30, p.at[2]] : p.at }));

export const COAST = {
  id: "coast",
  name: "coast",
  objects: [
    object("bcoas001", "rowboat", ["boat", "water"], [color(WOOD, "hull"), color(DARK_WOOD, "inside")], [
      ...hull(12, 4.6, 1.6),
      rod(0.2, 7, [0.5, 1.8, 1.6], 1, 8),
      rod(0.2, 7, [0.5, 1.8, -1.6], 1, -8),
    ]),
    object("bcoas002", "beached boat", ["boat"], [color("#6a5038", "hull"), color(DARK_WOOD, "inside")], [...hull(16, 6, 2, 20), box([0.5, 4, 0.5], [0, 3, 0], 1, [0, 20, 0])]),
    object("bcoas003", "upturned boat", ["boat"], [color(WOOD, "hull"), color(DARK_WOOD, "inside")], [
      ...hull(12, 4.6, 1.6).map((p) => ({ ...p, at: [p.at[0], 3.2 - p.at[1], p.at[2]], turn: [0, 180, 0] })),
      box([0.6, 0.6, 0.6], [-4, 0.3, 0], 1),
      box([0.6, 0.6, 0.6], [4, 0.3, 0], 1),
    ]),
    object("bcoas004", "net rack", ["fishing"], [color(NET, "net"), color(WOOD, "wood")], [
      post(0.4, 6, [-4, 3, 0], 1),
      post(0.4, 6, [4, 3, 0], 1),
      rod(0.3, 8.6, [0, 5.8, 0], 1),
      tiled(box([7.6, 4.4, 0.12], [0, 3.6, 0], 0), "thatch", 0.8, 0.3),
      tiled(sphere([7, 1.2, 0.8], [0, 1.4, 0], 0), "thatch", 0.8, 0.3),
    ]),
    object("bcoas005", "crab pot", ["fishing"], [color(NET, "mesh"), color(DARK_WOOD, "frame"), color(ROPE)], [
      tiled(rod(2, 3, [0, 1, 0], 0, 90), "thatch", 0.6, 0.3),
      box([3.1, 0.15, 0.15], [0, 2, 0], 1),
      box([0.15, 0.15, 2.2], [-1.3, 0.1, 0], 1),
      box([0.15, 0.15, 2.2], [1.3, 0.1, 0], 1),
      post(0.6, 0.15, [1.3, 0.08, 1.4], 2),
    ]),
    object("bcoas006", "buoy", ["water"], [color("#c8402c", "paint"), color("#e8e0d0", "band"), color(IRON)], [
      sphere([2.4, 2.4, 2.4], [0, 1.2, 0], 0),
      post(2.42, 0.4, [0, 1.2, 0], 1),
      post(0.3, 1.2, [0, 2.8, 0], 2),
      sphere([0.5, 0.5, 0.5], [0, 3.5, 0], 0),
    ]),
    object("bcoas007", "mooring post", ["dock"], [color(DARK_WOOD, "wood"), color(ROPE, "rope")], [
      post(1.3, 4, [0, 2, 0], 0, { taper: 0.9 }),
      post(1.5, 0.35, [0, 2.6, 0], 1),
      post(1.5, 0.35, [0, 2.95, 0], 1),
      rod(0.3, 3, [1.6, 2.2, 0], 1, 0, -40),
    ]),
    object("bcoas008", "rope coil", ["dock"], [color(ROPE, "rope")], [
      post(2.4, 0.3, [0, 0.15, 0], 0),
      post(2.1, 0.3, [0, 0.42, 0], 0),
      post(1.8, 0.3, [0, 0.69, 0], 0),
      cut(post(0.9, 1.2, [0, 0.6, 0], 0)),
    ]),
    object("bcoas009", "anchor", ["dock", "boat"], [color(IRON, "iron")], [
      box([0.4, 5, 0.4], [0, 2.9, 0], 0),
      rod(0.3, 3, [0, 5.2, 0], 0, 90),
      box([2.4, 0.4, 0.4], [-0.9, 0.9, 0], 0, [0, 0, -35]),
      box([2.4, 0.4, 0.4], [0.9, 0.9, 0], 0, [0, 0, 35]),
      wedge([0.8, 0.9, 0.4], [-1.9, 1.7, 0], 0, [90, 0, 0]),
      wedge([0.8, 0.9, 0.4], [1.9, 1.7, 0], 0, [-90, 0, 0]),
      { ...post(0.9, 0.2, [0, 5.8, 0], 0), turn: [0, 90, 0] },
    ]),
    object("bcoas010", "fish drying rack", ["fishing", "food"], [color(WOOD, "wood"), color("#a8a090", "fish"), color(ROPE)], [
      box([0.3, 6, 0.3], [-3, 2.8, -0.9], 0, [0, -18, 0]),
      box([0.3, 6, 0.3], [-3, 2.8, 0.9], 0, [0, 18, 0]),
      box([0.3, 6, 0.3], [3, 2.8, -0.9], 0, [0, -18, 0]),
      box([0.3, 6, 0.3], [3, 2.8, 0.9], 0, [0, 18, 0]),
      rod(0.25, 7.2, [0, 5.5, 0], 0),
      ...[-2.4, -1.2, 0, 1.2, 2.4].flatMap((x, n) => [box([0.1, 0.8, 0.1], [x, 5, 0], 2), sphere([0.5, 1.6 - (n % 2) * 0.3, 0.25], [x, 3.9, 0], 1)]),
    ]),
    object("bcoas011", "fish crates", ["fishing", "container"], [color("#9a7a50", "wood"), color(DARK_WOOD, "bands"), color("#a8a8a0", "fish")], [
      ...crate(-1.3, 0, 0, 2.4, 0, 1),
      ...crate(1.3, 0, 0.2, 2.4, 0, 1, 6),
      ...[-2, -1.3, -0.6].map((x) => sphere([0.5, 0.3, 1.8], [x, 2.45, 0], 2, [20, 0, 0])),
      ...crate(0, 2.4, 0, 2, 0, 1, -10),
    ]),
    object("bcoas012", "harbour lamp", ["light", "dock"], [color(IRON, "iron"), color("#ffd27a", "light"), color("#8c8a84")], [
      tiled(box([2, 3, 2], [0, 1.5, 0], 2), "stone", 1),
      post(0.4, 9, [0, 7.5, 0], 0),
      box([1.4, 1.8, 1.4], [0, 12.6, 0], 1),
      { type: "pyramid", size: [2, 1, 2], at: [0, 14, 0], turn: [0, 0, 0], color: 0 },
      box([1.6, 0.25, 1.6], [0, 11.6, 0], 0),
    ]),
  ],
};
