import { box, color, object, post, rod, sphere, throughX, throughZ, tiled, wedge, wheel, withCuts } from "./pieces.js";

// Market props: stalls, baskets, meat and cloth, scales, a fruit cart, an awning and pots.

const WOOD = "#8a6a44";
const DARK_WOOD = "#5c4630";
const WICKER = "#b08a50";
const RED = "#b83a2a";
const STRIPE = "#e8e0cc";
const APPLE = "#c83a2a";
const PEAR = "#a8b040";
const IRON = "#4a4c50";

// A wicker basket `d` across at (x, y, z), heaped with `fruit`.
const basket = (x, z, d, fruit, y = 0) => [
  tiled(post(d, d * 0.5, [x, y + d * 0.25, z], 0, { taper: 1 }), "thatch", 0.4, 0.2),
  sphere([d * 0.9, d * 0.4, d * 0.9], [x, y + d * 0.5, z], fruit),
];

export const MARKET = {
  id: "market",
  name: "market",
  objects: [
    withCuts(
      object("bmark001", "market stall", ["stall", "shop"], [color(RED, "awning"), color(STRIPE, "stripes"), color(WOOD, "wood"), color(APPLE), color(WICKER)], [
        ...[[-3.6, -2], [3.6, -2], [-3.6, 2], [3.6, 2]].map(([x, z]) => box([0.4, z < 0 ? 8 : 7, 0.4], [x, z < 0 ? 4 : 3.5, z], 2)),
        tiled(box([7.8, 0.3, 2.4], [0, 3, 1], 2), "planks", 1.5),
        box([7.8, 2.8, 0.2], [0, 1.5, 2.1], 2),
        ...[-3, -1, 1, 3].map((x, n) => wedge([2, 1.4, 5.4], [x, 7.6, 0], n % 2 ? 1 : 0, [180, 0, 0])),
        ...basket(-2.4, 1, 1.6, 3, 3.15),
        ...basket(0, 1, 1.6, 3, 3.15),
        ...basket(2.4, 1, 1.6, 3, 3.15),
        tiled(box([7.6, 0.25, 1], [0, 5, -1.8], 2), "planks", 1.5),
      ]),
      throughZ(-3.4, 3.4, 3.3, 6.8),
      throughX(-1.8, 1.8, 3.3, 6.8),
    ),
    object("bmark002", "produce baskets", ["food", "container"], [color(WICKER, "wicker"), color(APPLE, "apples"), color(PEAR, "pears"), color("#d88a30")], [
      ...basket(0, 0, 2, 1),
      ...basket(2.2, 0.4, 1.8, 2),
      ...basket(-2, 0.6, 1.8, 3),
      ...basket(1, -1.8, 1.6, 2),
    ]),
    object("bmark003", "meat rack", ["food", "butcher"], [color(DARK_WOOD, "wood"), color("#8a3a2a", "meat"), color("#e8d0b8", "fat")], [
      box([0.4, 7, 0.4], [-3, 3.5, 0], 0),
      box([0.4, 7, 0.4], [3, 3.5, 0], 0),
      box([6.6, 0.4, 0.4], [0, 6.8, 0], 0),
      ...[-2, -0.7, 0.6, 1.9].flatMap((x, n) => [box([0.1, 0.8, 0.1], [x, 6.2, 0], 0), sphere([0.9, 2 - (n % 2) * 0.4, 0.9], [x, 5 + (n % 2) * 0.2, 0], 1), sphere([0.6, 0.4, 0.6], [x, 5.8 + (n % 2) * 0.1, 0], 2)]),
    ]),
    object("bmark004", "cloth bolts", ["shop", "cloth"], [color("#a03a5a", "cloth"), color("#3a6a9a", "second cloth"), color("#d8b850", "third cloth"), color(WOOD)], [
      tiled(box([5, 0.3, 2.6], [0, 2.6, 0], 3), "planks", 1.2),
      ...[[-2.2, -1], [2.2, -1], [-2.2, 1], [2.2, 1]].map(([x, z]) => box([0.3, 2.45, 0.3], [x, 1.23, z], 3)),
      rod(1, 4, [0, 3.25, -0.6], 0, 90),
      rod(1, 4, [-1.2, 3.25, 0.5], 1, 90),
      rod(1, 4, [1.2, 3.25, 0.5], 2, 90),
      rod(1, 3.6, [0, 4.1, 0], 1, 95),
    ]),
    object("bmark005", "weighing scale", ["shop"], [color("#c8a040", "brass"), color(WOOD, "wood")], [
      box([1.6, 0.3, 1.2], [0, 0.15, 0], 1),
      post(0.25, 3, [0, 1.6, 0], 0),
      box([3.2, 0.15, 0.15], [0, 3.1, 0], 0),
      box([0.08 + 0.04, 1.2, 0.08 + 0.04], [-1.5, 2.5, 0], 0),
      box([0.12, 1.2, 0.12], [1.5, 2.5, 0], 0),
      post(1.1, 0.2, [-1.5, 1.85, 0], 0),
      post(1.1, 0.2, [1.5, 1.85, 0], 0),
    ]),
    object("bmark006", "fruit cart", ["cart", "food"], [color(WOOD, "wood"), color(DARK_WOOD), color(WICKER), color(APPLE, "fruit"), color(PEAR, "more fruit")], [
      tiled(box([5, 0.3, 3], [0, 2, 0], 0), "planks", 1.5),
      box([5, 1, 0.15], [0, 2.6, -1.45], 0),
      box([5, 1, 0.15], [0, 2.6, 1.45], 0),
      wheel(2.8, 0.25, [0.6, 1.4, -1.7], 1),
      wheel(2.8, 0.25, [0.6, 1.4, 1.7], 1),
      rod(0.2, 4, [4.3, 2, -1], 0, 0, -10),
      rod(0.2, 4, [4.3, 2, 1], 0, 0, -10),
      box([0.25, 1.8, 0.25], [-2.2, 0.9, 0], 1),
      ...basket(-1.4, -0.6, 1.4, 3, 2.15),
      ...basket(0.2, -0.5, 1.4, 4, 2.15),
      ...basket(-0.6, 0.7, 1.4, 4, 2.15),
      ...basket(1.4, 0.6, 1.4, 3, 2.15),
    ]),
    withCuts(
      object("bmark007", "awning", ["shade", "stall"], [color("#3a6a5a", "cloth"), color(WOOD, "poles")], [
        post(0.35, 7, [-3.6, 3.5, 3], 1),
        post(0.35, 7, [3.6, 3.5, 3], 1),
        box([8, 0.15, 6.4], [0, 7.6, 0], 0, [0, -12, 0]),
        wedge([8, 0.8, 0.15], [0, 6.6, 3.15], 0, [0, 0, 180]),
      ]),
      throughZ(-3.4, 3.4, -1, 6.2),
      throughX(-3, 2.8, -1, 6.2),
    ),
    object("bmark008", "fish basket", ["food", "fishing"], [color(WICKER, "wicker"), color("#a8a8a0", "fish")], [
      ...basket(0, 0, 2.4, 1).slice(0, 1),
      ...[[-0.4, 0.2, 20], [0.3, -0.3, -30], [0.1, 0.5, 70], [-0.2, -0.5, 110]].map(([x, z, yaw]) => sphere([1.6, 0.35, 0.45], [x, 1.25, z], 1, [yaw, 0, 8])),
    ]),
    object("bmark009", "pottery", ["shop", "container"], [color("#b8683a", "clay"), color("#8a4a2a", "dark clay"), color(WOOD)], [
      tiled(box([5, 0.3, 2], [0, 1.6, 0], 2), "planks", 1.2),
      box([0.3, 1.45, 1.8], [-2.2, 0.73, 0], 2),
      box([0.3, 1.45, 1.8], [2.2, 0.73, 0], 2),
      sphere([1.2, 1.4, 1.2], [-1.6, 2.4, 0], 0),
      post(0.5, 0.5, [-1.6, 3.2, 0], 0, { taper: 0.8 }),
      sphere([1, 1, 1], [0, 2.25, 0.2], 1),
      post(0.6, 0.3, [0, 2.85, 0.2], 1),
      sphere([1.3, 1.6, 1.3], [1.5, 2.5, -0.1], 0),
      post(0.45, 0.6, [1.5, 3.5, -0.1], 0, { taper: 0.7 }),
      sphere([1.6, 1.8, 1.6], [3.4, 0.9, 0.6], 1),
      post(0.7, 0.5, [3.4, 1.9, 0.6], 1, { taper: 0.8 }),
    ]),
  ],
};
