import { box, color, crate, cut, gable, object, post, rod, sign, sphere, tiled, wheel } from "./pieces.js";

// Roadside props: milestones, shrines, cobbles, cairns, low walls, hitching posts, lanterns,
// stepping stones and a broken cart.

const STONE = "#8c8a84";
const WOOD = "#7a5e40";
const DARK_WOOD = "#4e3a28";
const IRON = "#4a4c50";

export const ROADS = {
  id: "roads",
  name: "roads",
  objects: [
    object("broad001", "milestone", ["sign", "road"], [color(STONE, "stone")], [
      sign(tiled(box([1.8, 2.6, 0.9], [0, 1.3, 0], 0), "stone", 1.5, 0.1), "says", "GOLDSHIRE 2", [1.5, 0.8]),
      tiled(rod(1.8, 0.9, [0, 2.6, 0], 0, 90), "stone", 1.5, 0.1),
    ]),
    object("broad002", "wayside shrine", ["shrine", "road"], [color(STONE, "stone"), color("#8a5040", "roof"), color("#e8dcc0", "statue"), color("#2a2420")], [
      tiled(box([3, 3, 2.4], [0, 1.5, 0], 0), "stone", 1.5),
      box([1.8, 1.8, 0.1], [0, 1.9, 1.22], 3),
      post(0.6, 1.4, [0, 1.7, 1.6], 2, { taper: 0.6 }),
      sphere([0.45, 0.5, 0.45], [0, 2.65, 1.6], 2),
      ...gable([3.6, 1.2, 3], 3, 1),
      box([2.2, 1, 1], [0, 0.5, 1.6], 0),
    ]),
    object("broad003", "cobble patch", ["road", "floor"], [color("#7a766e", "cobbles")], [tiled(box([8, 0.2, 8], [0, 0.1, 0], 0), "cobbles", 2, 0.2)]),
    object("broad004", "cairn", ["marker", "road"], [color(STONE, "stone")], [
      sphere([2.6, 1.2, 2.4], [0, 0.5, 0], 0),
      sphere([2, 1, 1.8], [0.1, 1.4, 0], 0, [30, 0, 0]),
      sphere([1.4, 0.8, 1.3], [0, 2.2, 0.1], 0, [70, 0, 0]),
      sphere([0.9, 0.6, 0.8], [0.1, 2.8, 0], 0),
    ]),
    object("broad005", "dry stone wall", ["wall", "fence"], [color(STONE, "stone"), color("#5f7f3a", "moss")], [
      tiled(box([8, 3, 2], [0, 1.5, 0], 0), "stone", 1.2, 0.25),
      tiled(rod(1.6, 8, [0, 3, 0], 0), "stone", 1, 0.25),
      sphere([2, 0.4, 1.6], [-2, 3.75, 0], 1),
    ]),
    object("broad006", "hitching post", ["road", "animals"], [color(WOOD, "wood"), color(IRON, "rings")], [
      post(0.6, 4, [-3, 2, 0], 0),
      post(0.6, 4, [3, 2, 0], 0),
      rod(0.45, 7, [0, 3.6, 0], 0),
      { ...wheel(0.6, 0.1, [-1, 3.2, 0.25], 1), turn: [0, 0, 0] },
      { ...wheel(0.6, 0.1, [1, 3.2, 0.25], 1), turn: [0, 0, 0] },
    ]),
    object("broad007", "stone lantern", ["light", "road"], [color(STONE, "stone"), color("#ffd27a", "light")], [
      tiled(box([1.8, 0.6, 1.8], [0, 0.3, 0], 0), "stone", 1),
      tiled(post(0.9, 3, [0, 2.1, 0], 0), "stone", 1),
      box([1.6, 0.3, 1.6], [0, 3.75, 0], 0),
      box([1.1, 1.1, 1.1], [0, 4.45, 0], 1),
      { type: "pyramid", size: [2, 1, 2], at: [0, 5.5, 0], turn: [0, 0, 0], color: 0 },
    ]),
    object("broad008", "stepping stones", ["road", "water"], [color("#7a766e", "stone")], [
      [0, 0], [2.6, 0.8], [5, 0.2], [-2.6, -0.6], [-5, 0.3],
    ].map(([x, z], n) => sphere([2 - (n % 2) * 0.3, 0.8, 1.8], [x, 0.2, z], 0, [n * 37, 0, 0]))),
    object("broad009", "broken cart", ["cart", "road"], [color(WOOD, "wood"), color(DARK_WOOD), color("#9a7a50", "crates")], [
      tiled(box([7, 0.4, 4], [0, 1.6, 0], 0, [10, 0, -14]), "planks", 2),
      box([7, 1, 0.2], [0, 2.3, -2], 0, [10, 0, -14]),
      wheel(3.4, 0.3, [1, 1.4, -2.4], 1),
      { ...wheel(3.4, 0.3, [2.5, 0.2, 3.5], 1), turn: [0, 0, 0] },
      rod(0.25, 6, [5, 0.4, -1], 0, 20),
      ...crate(-2.6, 0, 2.6, 2, 2, 1, 25),
      box([1.2, 0.3, 0.3], [3.5, 0.15, 1.5], 1, [40, 0, 0]),
    ]),
  ],
};
