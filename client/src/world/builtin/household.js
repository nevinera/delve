import { box, color, cone, cut, fire, object, post, rod, sphere, tiled, wheel } from "./pieces.js";

// Household furniture, for furnishing houses: beds, chests, cupboards, a hearth and things to cook,
// sit and work at.

const WOOD = "#8a6a44";
const DARK_WOOD = "#5c4630";
const IRON = "#3e3e42";
const STONE = "#8c8a84";
const FLAME = "#f08a24";
const CORE = "#ffe08a";

const chairAt = (x, z, yaw, c) => {
  const [cs, sn] = [Math.cos((yaw * Math.PI) / 180), Math.sin((yaw * Math.PI) / 180)];
  const at = (dx, y, dz) => [x + dx * cs + dz * sn, y, z - dx * sn + dz * cs];
  return [
    box([1.5, 0.2, 1.5], at(0, 1.5, 0), c, [yaw, 0, 0]),
    box([1.5, 1.8, 0.2], at(0, 2.5, -0.65), c, [yaw, 0, 0]),
    ...[[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]].map(([dx, dz]) => box([0.18, 1.45, 0.18], at(dx, 0.73, dz), c, [yaw, 0, 0])),
  ];
};

export const HOUSEHOLD = {
  id: "household",
  name: "household",
  objects: [
    object("bhome001", "bed", ["furniture", "sleep"], [color("#a84a3a", "blanket"), color("#e8e0cc", "sheets"), color(WOOD, "wood")], [
      box([3.8, 0.8, 6.8], [0, 0.9, 0], 2),
      box([3.8, 3.4, 0.3], [0, 1.7, -3.3], 2),
      box([3.8, 1.8, 0.3], [0, 0.9, 3.3], 2),
      box([3.5, 0.6, 6.2], [0, 1.6, 0], 1),
      box([2.6, 0.4, 1.2], [0, 2.1, -2.4], 1),
      box([3.6, 0.25, 4.2], [0, 2, 0.9], 0),
    ]),
    object("bhome002", "cot", ["furniture", "sleep"], [color("#7a6a4a", "blanket"), color(WOOD, "wood")], [
      box([2.8, 0.3, 6.4], [0, 1.1, 0], 1),
      ...[[-1.2, -3], [1.2, -3], [-1.2, 3], [1.2, 3]].map(([x, z]) => box([0.25, 1, 0.25], [x, 0.5, z], 1)),
      box([2.6, 0.3, 4.5], [0, 1.4, 0.8], 0),
      rod(0.8, 2.4, [0, 1.6, -2.6], 0),
    ]),
    object("bhome003", "chest", ["container", "treasure"], [color(WOOD, "wood"), color(IRON, "bands"), color("#c8a040")], [
      tiled(box([3, 1.6, 1.8], [0, 0.8, 0], 0), "planks", 1),
      tiled(rod(1.8, 3, [0, 1.6, 0], 0), "planks", 1),
      box([0.2, 1.65, 1.85], [-1, 0.8, 0], 1),
      box([0.2, 1.65, 1.85], [1, 0.8, 0], 1),
      rod(1.86, 0.2, [-1, 1.6, 0], 1, 0),
      rod(1.86, 0.2, [1, 1.6, 0], 1, 0),
      box([0.4, 0.5, 0.15], [0, 1.45, 0.92], 2),
    ]),
    object("bhome004", "wardrobe", ["furniture", "container"], [color(DARK_WOOD, "wood"), color("#2a2018"), color("#c8a040")], [
      tiled(box([3.6, 6.4, 2], [0, 3.4, 0], 0), "planks", 1.2),
      box([4, 0.3, 2.3], [0, 6.7, 0], 0),
      box([0.08 + 0.04, 5.4, 0.1], [0, 3.6, 1.02], 1),
      box([0.15, 0.6, 0.15], [-0.3, 3.6, 1.05], 2),
      box([0.15, 0.6, 0.15], [0.3, 3.6, 1.05], 2),
      ...[[-1.6, -0.8], [1.6, -0.8], [-1.6, 0.8], [1.6, 0.8]].map(([x, z]) => box([0.3, 0.2, 0.3], [x, 0.1, z], 0)),
    ]),
    object("bhome005", "shelf", ["furniture", "storage"], [color(WOOD, "wood"), color("#a87a50", "pots"), color("#6a8aa0", "jars")], [
      box([0.25, 6, 1.3], [-2.4, 3, 0], 0),
      box([0.25, 6, 1.3], [2.4, 3, 0], 0),
      box([4.6, 0.12, 0.12 + 0.03], [0, 3, -0.6], 0),
      ...[0.4, 2.2, 4, 5.8].map((y) => box([4.6, 0.2, 1.3], [0, y, 0], 0)),
      post(0.6, 0.9, [-1.6, 0.95, 0], 1, { taper: 0.6 }),
      post(0.5, 0.7, [-0.9, 0.85, 0.1], 2),
      sphere([0.9, 0.9, 0.9], [0.4, 2.75, 0], 1),
      post(0.5, 0.8, [1.4, 2.7, 0], 2),
      post(0.5, 0.8, [1.9, 2.7, 0], 2),
      box([1.6, 1.1, 0.9], [-1, 4.65, 0], 0),
      post(0.6, 0.9, [1.3, 4.55, 0], 1, { taper: 0.6 }),
    ]),
    object("bhome006", "hearth", ["fire", "cooking"], [color(STONE, "stone"), color("#2a2420"), color(DARK_WOOD), color(FLAME), color(CORE)], [
      tiled(box([6, 4.5, 2.5], [0, 2.25, 0], 0), "stone", 1.5),
      box([3.6, 2.8, 0.1], [0, 1.4, 1.27], 1),
      tiled(box([2.8, 7, 2], [0, 8, -0.25], 0), "stone", 1.5),
      tiled(box([6.6, 0.5, 2.9], [0, 4.6, 0.1], 0), "stone", 1.5),
      ...fire(0, 2, 2, 3, 4, 0.7),
    ]),
    object("bhome007", "cauldron", ["cooking", "magic"], [color(IRON, "iron"), color("#5a8a3a", "brew")], [
      sphere([3, 2.4, 3], [0, 1.8, 0], 0),
      cut(post(2.3, 1.2, [0, 3, 0], 1)),
      post(2.3, 0.12, [0, 2.45, 0], 1),
      post(2.7, 0.25, [0, 2.95, 0], 0),
      ...[0, 120, 240].map((a) => post(0.3, 0.8, [Math.cos((a * Math.PI) / 180) * 1, 0.4, Math.sin((a * Math.PI) / 180) * 1], 0)),
    ]),
    object("bhome008", "cooking pot on tripod", ["cooking", "camp"], [color(IRON, "iron"), color(DARK_WOOD, "wood"), color(FLAME), color(CORE)], [
      ...[0, 120, 240].map((a) => {
        const r = (a * Math.PI) / 180;
        return { ...post(0.2, 5.2, [Math.cos(r) * 1, 2.45, -Math.sin(r) * 1], 1), turn: [a, 0, 22] };
      }),
      post(0.08 + 0.04, 1.2, [0, 3.9, 0], 0),
      sphere([1.5, 1.2, 1.5], [0, 2.9, 0], 0),
      ...fire(0, 0, 1, 2, 3, 0.6),
    ]),
    object("bhome009", "rug", ["floor"], [color("#8a3a30", "field"), color("#d8b860", "border")], [box([6.4, 0.1, 4.4], [0, 0.05, 0], 1), box([5.6, 0.12, 3.6], [0, 0.06, 0], 0), box([3, 0.14, 1.4], [0, 0.07, 0], 1)]),
    object("bhome010", "candlestick", ["light"], [color("#c8a040", "holder"), color("#efe6d0", "wax"), color(CORE)], [
      post(0.6, 0.12, [0, 0.06, 0], 0),
      post(0.15, 0.8, [0, 0.5, 0], 0),
      post(0.45, 0.1, [0, 0.9, 0], 0),
      post(0.2, 0.8, [0, 1.35, 0], 1),
      cone([0.15, 0.3, 0.15], [0, 1.9, 0], 2),
    ]),
    object("bhome011", "chair", ["seat", "furniture"], [color(WOOD, "wood")], chairAt(0, 0, 0, 0)),
    object("bhome012", "dresser with plates", ["furniture", "storage"], [color(WOOD, "wood"), color("#d8d4c8", "plates"), color("#6a7aa0", "jugs")], [
      tiled(box([4.6, 3, 1.8], [0, 1.5, 0], 0), "planks", 1.2),
      box([4.6, 3, 0.2], [0, 4.5, -0.8], 0),
      box([4.6, 0.2, 0.9], [0, 4.6, -0.4], 0),
      box([4.8, 0.25, 2], [0, 3.1, 0], 0),
      ...[-1.6, -0.5, 0.6, 1.7].map((x) => ({ ...wheel(1, 0.08 + 0.04, [x, 5.25, -0.55], 1), turn: [0, 75, 0] })),
      post(0.6, 0.8, [-1.2, 3.65, 0.3], 2, { taper: 0.7 }),
      post(0.6, 0.8, [1.2, 3.65, 0.3], 2, { taper: 0.7 }),
    ]),
    object("bhome013", "table setting", ["cooking", "table"], [color("#d8d4c8", "plates"), color("#8a6a44", "tankards"), color("#c8a060", "bread")], [
      post(1, 0.1, [-0.8, 0.05, 0], 0),
      post(1, 0.1, [0.8, 0.05, 0.3], 0),
      post(0.45, 0.7, [-0.2, 0.35, -0.7], 1),
      post(0.45, 0.7, [1.3, 0.35, -0.5], 1),
      sphere([0.7, 0.4, 0.5], [-0.8, 0.25, 0], 2),
      sphere([0.5, 0.35, 0.5], [0.8, 0.22, 0.3], 2),
    ]),
    object("bhome014", "loom", ["craft"], [color(WOOD, "wood"), color("#a04a4a", "cloth")], [
      box([0.3, 5, 0.3], [-2, 2.5, -1], 0),
      box([0.3, 5, 0.3], [2, 2.5, -1], 0),
      box([0.3, 3, 0.3], [-2, 1.5, 1], 0),
      box([0.3, 3, 0.3], [2, 1.5, 1], 0),
      rod(0.35, 4.4, [0, 4.8, -1], 0),
      rod(0.35, 4.4, [0, 2.8, 1], 0),
      box([4.2, 0.2, 2], [0, 0.6, 0], 0),
      box([3.6, 2, 0.1], [0, 3.8, -0.85], 1, [0, -45, 0]),
      box([3.6, 0.12, 2], [0, 2.9, 0], 1),
    ]),
    object("bhome015", "spinning wheel", ["craft"], [color(WOOD, "wood"), color("#e8dcc0", "wool")], [
      box([3.2, 0.3, 0.9], [0, 1.4, 0], 0, [0, 0, 8]),
      post(0.2, 1.4, [-1.2, 0.7, -0.3], 0),
      post(0.2, 1.4, [-1.2, 0.7, 0.3], 0),
      post(0.2, 1.2, [1.3, 0.6, 0], 0),
      box([0.2, 2.2, 0.2], [0.7, 2.5, -0.25], 0),
      box([0.2, 2.2, 0.2], [0.7, 2.5, 0.25], 0),
      wheel(2.6, 0.15, [0.7, 3.2, 0], 0),
      wheel(0.6, 0.6, [0.7, 3.2, 0], 0),
      box([0.2, 1, 0.2], [-1.1, 2.1, 0], 0),
      sphere([0.6, 0.5, 0.5], [-1.1, 2.75, 0], 1),
    ]),
  ],
};
