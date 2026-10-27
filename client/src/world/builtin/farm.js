import { box, color, cone, cut, gable, object, post, rod, sphere, tiled, wedge, wheel } from "./pieces.js";

// Farm props: hay, carts, tools, fences, crops and animals' things.

const HAY = "#d9b85c";
const WOOD = "#8a6a44";
const DARK_WOOD = "#5c4630";
const STONE = "#8c8a84";
const IRON = "#4a4a4e";
const LEAF = "#5f8f3a";
const SOIL = "#6b5034";

const pumpkin = (x, z, s = 1) => [
  sphere([1.8 * s, 1.2 * s, 1.8 * s], [x, 0.6 * s, z], 0),
  sphere([1.2 * s, 1.25 * s, 1.95 * s], [x, 0.6 * s, z], 0),
  sphere([1.95 * s, 1.25 * s, 1.2 * s], [x, 0.6 * s, z], 0),
];

const cabbage = (x) => [sphere([1.8, 0.5, 1.8], [x, 0.4, 0], 0), sphere([1.2, 1, 1.2], [x, 0.7, 0], 1)];

export const FARM = {
  id: "farm",
  name: "farm",
  objects: [
    object("bfarm001", "hay bale", ["hay"], [color(HAY, "hay"), color("#7a6a4a")], [
      tiled(box([3, 1.6, 1.8], [0, 0.8, 0], 0), "thatch", 1.5),
      box([0.12, 1.65, 1.85], [-0.8, 0.8, 0], 1),
      box([0.12, 1.65, 1.85], [0.8, 0.8, 0], 1),
    ]),
    object("bfarm002", "round hay bale", ["hay"], [color(HAY, "hay")], [tiled(rod(5, 4, [0, 2.5, 0], 0), "thatch", 2)]),
    object("bfarm003", "haystack", ["hay"], [color(HAY, "hay"), color(WOOD)], [
      tiled(post(8, 2.5, [0, 1.25, 0], 0), "thatch", 2),
      tiled(cone([8.4, 6, 8.4], [0, 5.5, 0], 0), "thatch", 2),
      post(0.25, 10, [0, 5, 0], 1),
    ]),
    object("bfarm004", "hay cart", ["cart", "hay"], [color(WOOD, "wood"), color(HAY, "hay"), color(DARK_WOOD)], [
      tiled(box([8, 0.4, 4.5], [0, 2.6, 0], 0), "planks", 2),
      box([8, 1.2, 0.2], [0, 3.4, -2.2], 0),
      box([8, 1.2, 0.2], [0, 3.4, 2.2], 0),
      box([0.2, 1.2, 4.5], [-3.9, 3.4, 0], 0),
      box([0.2, 1.2, 4.5], [3.9, 3.4, 0], 0),
      wheel(3.6, 0.3, [0, 1.8, -2.6], 2),
      wheel(3.6, 0.3, [0, 1.8, 2.6], 2),
      rod(0.3, 5.6, [0, 1.8, 0], 2, 90),
      rod(0.25, 6, [6.9, 2.2, -1.2], 0, 0, -8),
      rod(0.25, 6, [6.9, 2.2, 1.2], 0, 0, -8),
      tiled(sphere([7.5, 3, 4], [0, 4, 0], 1), "thatch", 1.5),
    ]),
    object("bfarm005", "wheelbarrow", ["tool"], [color(WOOD, "wood"), color(DARK_WOOD)], [
      box([3, 1, 2], [0, 1.6, 0], 0),
      cut(box([2.7, 0.9, 1.7], [0, 1.75, 0], 0)),
      wheel(1.4, 0.25, [2, 0.7, 0], 1),
      rod(0.15, 4, [-0.6, 1.4, -0.8], 0, 0, 12),
      rod(0.15, 4, [-0.6, 1.4, 0.8], 0, 0, 12),
      box([0.15, 1.1, 0.15], [-1, 0.55, -0.8], 1),
      box([0.15, 1.1, 0.15], [-1, 0.55, 0.8], 1),
    ]),
    object("bfarm006", "plough", ["tool"], [color(WOOD, "wood"), color(IRON)], [
      rod(0.35, 7, [0.5, 1.5, 0], 0, 0, -12),
      wedge([0.8, 0.6, 1.5], [3.6, 0.3, 0], 1, [90, 0, 0]),
      rod(0.2, 4, [-3.4, 2.4, -0.7], 0, 0, -35),
      rod(0.2, 4, [-3.4, 2.4, 0.7], 0, 0, -35),
      box([0.15, 0.15, 1.6], [-4.9, 3.5, 0], 0),
      wheel(1.4, 0.2, [2.6, 0.7, 0], 1),
    ]),
    object("bfarm007", "scarecrow", ["farm"], [color("#7a4a3a", "shirt"), color("#c8a860", "hat"), color("#4a5a6a", "trousers"), color(WOOD), color("#c4ae86")], [
      post(0.35, 6.5, [0, 3.25, 0], 3),
      rod(0.25, 5, [0, 4.6, 0], 3),
      box([2.2, 2.2, 0.8], [0, 4.1, 0], 0),
      rod(0.7, 4.6, [0, 4.6, 0], 0),
      box([0.6, 1.8, 0.6], [-0.45, 2.2, 0], 2),
      box([0.6, 1.8, 0.6], [0.45, 2.2, 0], 2),
      sphere([1.3, 1.4, 1.2], [0, 6.1, 0], 4),
      post(2.2, 0.12, [0, 6.75, 0], 1),
      post(1, 0.8, [0, 7.15, 0], 1, { taper: 0.7 }),
    ]),
    object("bfarm008", "trough", ["water", "animals"], [color(WOOD, "wood")], [
      tiled(box([6, 1.6, 2], [0, 0.8, 0], 0), "planks", 1.5),
      cut(box([5.6, 1.3, 1.6], [0, 1.15, 0], 0)),
    ]),
    object("bfarm009", "well", ["water"], [color(STONE, "stone"), color(WOOD, "wood"), color("#8a5040", "roof"), color("#1a2a38"), color(DARK_WOOD)], [
      tiled(post(5, 2.6, [0, 1.3, 0], 0), "stone", 2),
      cut(post(3.6, 2, [0, 1.8, 0], 0)),
      post(3.6, 0.1, [0, 0.75, 0], 3),
      box([0.4, 6, 0.4], [-2.2, 3, 0], 1),
      box([0.4, 6, 0.4], [2.2, 3, 0], 1),
      rod(0.3, 5, [0, 4.6, 0], 1),
      ...gable([5.6, 1.6, 4], 6, 2),
      post(0.1, 0.6, [0, 4.15, 0], 4),
      post(0.8, 0.8, [0, 3.5, 0], 4),
    ]),
    object("bfarm010", "chicken coop", ["animals"], [color(WOOD, "wood"), color("#8a5040", "roof"), color(DARK_WOOD)], [
      box([0.3, 1.5, 0.3], [-1.8, 0.75, -1.3], 2),
      box([0.3, 1.5, 0.3], [1.8, 0.75, -1.3], 2),
      box([0.3, 1.5, 0.3], [-1.8, 0.75, 1.3], 2),
      box([0.3, 1.5, 0.3], [1.8, 0.75, 1.3], 2),
      tiled(box([4.2, 2.6, 3], [0, 2.8, 0], 0), "planks", 1.5),
      cut(box([0.9, 1.1, 0.6], [1, 2.05, 1.5], 0)),
      ...gable([4.8, 1.2, 3.6], 4.1, 1),
      box([0.9, 0.1, 2.4], [1, 0.8, 2.5], 2, [0, 35, 0]),
    ]),
    object("bfarm011", "split-rail fence", ["fence"], [color(WOOD, "wood")], [
      box([0.4, 4, 0.4], [-4, 2, 0], 0),
      box([0.4, 4, 0.4], [4, 2, 0], 0),
      rod(0.3, 8.6, [0, 3, 0], 0),
      rod(0.3, 8.6, [0, 1.8, 0], 0),
    ]),
    object("bfarm012", "wattle fence", ["fence"], [color("#7a6040", "wattle"), color(DARK_WOOD)], [
      post(0.25, 3.2, [-3.6, 1.6, 0], 1),
      post(0.25, 3.2, [-1.2, 1.6, 0], 1),
      post(0.25, 3.2, [1.2, 1.6, 0], 1),
      post(0.25, 3.2, [3.6, 1.6, 0], 1),
      tiled(box([7.6, 2.4, 0.3], [0, 1.5, 0], 0), "thatch", 1),
    ]),
    object("bfarm013", "farm gate", ["fence"], [color(WOOD, "wood"), color(DARK_WOOD)], [
      box([0.5, 4.4, 0.5], [-2.4, 2.2, 0], 1),
      box([0.5, 4.4, 0.5], [2.4, 2.2, 0], 1),
      box([4.3, 0.35, 0.2], [0, 1.2, 0], 0),
      box([4.3, 0.35, 0.2], [0, 3.4, 0], 0),
      box([0.3, 2.5, 0.2], [-2, 2.3, 0], 0),
      box([0.3, 2.5, 0.2], [2, 2.3, 0], 0),
      box([4.6, 0.3, 0.18], [0, 2.3, 0], 0, [0, 0, 27]),
    ]),
    object("bfarm014", "pumpkin", ["crops"], [color("#d97a22", "pumpkin"), color(LEAF)], [...pumpkin(0, 0), post(0.15, 0.4, [0, 1.3, 0], 1, { taper: 0.7 })]),
    object("bfarm015", "pumpkin patch", ["crops"], [color("#d97a22", "pumpkin"), color(LEAF, "leaves"), color(SOIL)], [
      box([8, 0.2, 6], [0, 0.1, 0], 2),
      ...pumpkin(-2.5, -1.5),
      ...pumpkin(1, -1.8, 0.8),
      ...pumpkin(2.6, 1.2, 1.2),
      ...pumpkin(-1, 1.6, 0.9),
      sphere([2.4, 0.5, 2], [-0.6, 0.4, -0.2], 1),
      sphere([2, 0.5, 2.4], [0.4, 0.4, 2.2], 1),
      sphere([2.2, 0.5, 2], [-3, 0.4, 1.2], 1),
      sphere([2, 0.5, 2], [3.2, 0.4, -1.4], 1),
    ]),
    object("bfarm016", "cabbage row", ["crops"], [color(LEAF, "outer leaves"), color("#a8c878", "heart"), color(SOIL)], [
      box([9.5, 0.3, 1.8], [0, 0.15, 0], 2),
      ...[-3.6, -1.8, 0, 1.8, 3.6].flatMap(cabbage),
    ]),
    object("bfarm017", "wheat row", ["crops"], [color("#d4b048", "wheat"), color(SOIL)], [
      box([9.5, 0.3, 1.6], [0, 0.15, 0], 1),
      tiled(box([9, 3, 1.1], [0, 1.8, 0], 0), "thatch", 1),
      tiled(wedge([9, 0.5, 0.55], [0, 3.55, -0.275], 0, [180, 0, 0]), "thatch", 1),
      tiled(wedge([9, 0.5, 0.55], [0, 3.55, 0.275], 0), "thatch", 1),
    ]),
    object("bfarm018", "wheat sheaf", ["crops", "hay"], [color("#d4b048", "wheat"), color("#7a6a4a")], [
      post(1.4, 1.6, [0, 0.8, 0], 0, { taper: 0.6 }),
      cone([1.2, 1.4, 1.2], [0, 2.3, 0], 0, [0, 180, 0]),
      post(0.9, 0.2, [0, 1.65, 0], 1),
    ]),
    object("bfarm019", "beehive", ["animals"], [color("#c8a860", "straw"), color(WOOD, "stand"), color("#2a2018")], [
      box([2, 0.2, 2], [0, 1.8, 0], 1),
      post(0.2, 1.7, [-0.7, 0.85, -0.7], 1),
      post(0.2, 1.7, [0.7, 0.85, -0.7], 1),
      post(0.2, 1.7, [-0.7, 0.85, 0.7], 1),
      post(0.2, 1.7, [0.7, 0.85, 0.7], 1),
      post(1.8, 0.6, [0, 2.2, 0], 0, { taper: 0.92 }),
      post(1.65, 0.6, [0, 2.75, 0], 0, { taper: 0.85 }),
      post(1.4, 0.5, [0, 3.25, 0], 0, { taper: 0.7 }),
      sphere([1, 0.6, 1], [0, 3.5, 0], 0),
      box([0.4, 0.2, 0.1], [0, 2.05, 0.85], 2),
    ]),
    object("bfarm020", "milk churn", ["animals"], [color("#9aa0a4", "metal")], [
      post(1.1, 2.2, [0, 1.1, 0], 0),
      post(0.9, 0.5, [0, 2.45, 0], 0, { taper: 0.7 }),
      post(0.7, 0.15, [0, 2.75, 0], 0),
    ]),
  ],
};
