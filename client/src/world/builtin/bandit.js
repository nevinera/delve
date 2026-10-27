import { box, color, cone, fire, gable, object, post, ring, rod, sack, sign, sphere, tiled, wedge, wheel } from "./pieces.js";

// Bandit camp props: tents, a fire, bedrolls, racks, loot, barricades and a lookout.

const CANVAS = "#a89878";
const WOOD = "#7a5e40";
const DARK_WOOD = "#4e3a28";
const STONE = "#7c7a74";
const IRON = "#5a5c60";
const FLAME = "#f08a24";
const CORE = "#ffe08a";
const GOLD = "#e0b040";

const stake = (x, z, h, yaw, tilt, c) => ({ ...post(0.35, h, [x, h / 2 * Math.cos((tilt * Math.PI) / 180), z], c), turn: [yaw, tilt, 0] });

export const BANDIT = {
  id: "bandit",
  name: "bandit camp",
  objects: [
    object("bband001", "tent", ["tent", "camp"], [color(CANVAS, "canvas"), color(WOOD, "poles"), color("#2a241c")], [
      ...gable([8, 5, 6.5], 0, 0, "thatch").map((p) => ({ ...p, tile: undefined })),
      rod(0.25, 8.6, [0, 5, 0], 1),
      post(0.25, 5, [-4.1, 2.5, 0], 1),
      post(0.25, 5, [4.1, 2.5, 0], 1),
      wedge([0.1, 3, 1.4], [4.02, 1.5, 0.7], 2, [0, 0, 0]),
    ]),
    object("bband002", "large tent", ["tent", "camp"], [color(CANVAS, "canvas"), color(WOOD, "poles"), color("#2a241c")], [
      post(14, 5, [0, 2.5, 0], 0),
      cone([16, 6, 16], [0, 8, 0], 0),
      post(0.4, 12, [0, 6, 0], 1),
      box([3, 4, 0.1], [0, 2, 7.02], 2),
    ]),
    object("bband003", "lean-to", ["shelter", "camp"], [color("#8a7a50", "thatch"), color(WOOD, "poles")], [
      post(0.4, 5.5, [-3.5, 2.75, 2], 1),
      post(0.4, 5.5, [3.5, 2.75, 2], 1),
      rod(0.35, 8, [0, 5.4, 2], 1),
      tiled(box([8, 0.4, 7], [0, 3.1, -0.6], 0, [0, -40, 0]), "thatch", 1.5),
    ]),
    object("bband004", "campfire", ["fire", "camp"], [color(STONE, "stones"), color(DARK_WOOD), color(FLAME, "flame"), color(CORE)], [...ring(0, 0, 1.8, 9, 0), ...fire(0, 0, 1, 2, 3)]),
    object("bband005", "bedroll", ["sleep", "camp"], [color("#6a5a3c", "blanket"), color("#8a3a30", "roll")], [box([2.6, 0.25, 5.5], [0, 0.13, 0.4], 0), rod(1.1, 2.6, [0, 0.55, -2.5], 1)]),
    object("bband006", "weapon rack", ["weapons", "camp"], [color(WOOD, "wood"), color(IRON, "iron"), color("#8a3a30", "shields")], [
      box([0.35, 4.5, 0.35], [-2.5, 2.25, 0], 0),
      box([0.35, 4.5, 0.35], [2.5, 2.25, 0], 0),
      box([5.4, 0.3, 0.3], [0, 4, 0], 0),
      box([5.4, 0.3, 1.2], [0, 0.6, 0], 0),
      ...[-1.8, -0.9, 0, 0.9, 1.8].flatMap((x) => [post(0.15, 6, [x, 3.2, -0.1], 0, { turn: [0, -6, 0] }), cone([0.3, 0.8, 0.12], [x, 6.6, -0.42], 1, [0, -6, 0])]),
      { ...wheel(2.4, 0.2, [-1.3, 1.6, 1], 2), turn: [0, 70, 0] },
      { ...wheel(2.4, 0.2, [1.3, 1.6, 1], 2), turn: [0, 70, 0] },
    ]),
    object("bband007", "loot pile", ["treasure", "camp"], [color(WOOD, "wood"), color(GOLD, "gold"), color("#a89878", "sacks"), color(IRON)], [
      tiled(box([2.6, 1.4, 1.6], [-1.2, 0.7, -0.4], 0, [20, 0, 0]), "planks", 1),
      tiled(rod(1.6, 2.6, [-1.2, 1.4, -0.4], 0, 20), "planks", 1),
      sphere([3, 1, 2.4], [1, 0.3, 0.6], 1),
      sphere([1.6, 0.8, 1.4], [0.3, 0.5, 1.2], 1),
      post(0.6, 0.8, [1.6, 0.9, 0.3], 1, { taper: 0.6 }),
      ...sack(2.2, -1.1, 2, 0.9, 0, -15),
      ...sack(-2.6, 1, 2, 0.8, 0, 20),
      box([0.15, 0.15, 2.6], [0.4, 0.5, -1.3], 3, [30, 0, 15]),
    ]),
    object("bband008", "spiked barricade", ["barrier", "defence"], [color(WOOD, "wood"), color(DARK_WOOD)], [
      rod(1, 10, [0, 2.2, 0], 0),
      ...[-4, -2, 0, 2, 4].flatMap((x) => [
        { ...post(0.4, 6.5, [x, 2.2, 0], 1, { taper: 0.2 }), turn: [0, 45, 0] },
        { ...post(0.4, 6.5, [x, 2.2, 0], 1, { taper: 0.2 }), turn: [0, -45, 0] },
      ]),
    ]),
    object("bband009", "palisade", ["barrier", "defence", "fence"], [color(WOOD, "wood"), color("#b8a47c", "rope")], [
      ...[-3.5, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 3.5].flatMap((x, n) => [post(1, 8 + (n % 3) * 0.6, [x, 4 + (n % 3) * 0.3, 0], 0), cone([1, 1.4, 1], [x, 8.7 + (n % 3) * 0.6, 0], 0)]),
      box([8.2, 0.4, 1.1], [0, 2, 0], 1),
      box([8.2, 0.4, 1.1], [0, 6, 0], 1),
    ]),
    object("bband010", "lookout post", ["lookout", "defence"], [color(WOOD, "wood"), color("#8a7a50", "roof")], [
      ...[[-2, -2], [2, -2], [-2, 2], [2, 2]].map(([x, z]) => box([0.5, 14, 0.5], [x, 7, z], 0)),
      tiled(box([5.4, 0.4, 5.4], [0, 10, 0], 0), "planks", 1.5),
      ...[-2.5, 2.5].map((z) => box([5.4, 1.6, 0.25], [0, 11, z], 0)),
      box([0.25, 1.6, 5.4], [2.5, 11, 0], 0),
      box([0.25, 1.6, 5.4], [-2.5, 11, 0], 0),
      ...gable([5.8, 2, 5.8], 14, 1, "thatch"),
      box([1.4, 0.2, 0.2], [0, 1.5, 2.6], 0),
      ...[3, 4.5, 6, 7.5, 9].map((y) => box([1.4, 0.2, 0.2], [0, y, 2.6], 0)),
      box([0.2, 10, 0.2], [-0.7, 5, 2.65], 0),
      box([0.2, 10, 0.2], [0.7, 5, 2.65], 0),
    ]),
    object("bband011", "wanted poster", ["sign"], [color(WOOD, "wood"), color("#e0d4b0", "paper")], [
      post(0.4, 6, [-1.4, 3, 0], 0),
      post(0.4, 6, [1.4, 3, 0], 0),
      tiled(box([3.6, 2.6, 0.2], [0, 4, 0], 0), "planks", 1),
      sign(box([1.6, 2, 0.1], [0, 4, 0.13], 1), "title", "WANTED", [1.4, 0.35]),
    ]),
    object("bband012", "cook spit", ["fire", "cooking", "camp"], [color(DARK_WOOD, "wood"), color("#8a4a2a", "meat"), color(FLAME), color(CORE), color(STONE)], [
      stake(-2, 0, 3.6, 0, 0, 0),
      stake(2, 0, 3.6, 0, 0, 0),
      box([0.6, 0.25, 0.25], [-2, 3.5, 0], 0, [0, 0, 30]),
      box([0.6, 0.25, 0.25], [2, 3.5, 0], 0, [0, 0, -30]),
      rod(0.15, 5, [0, 3.4, 0], 0),
      sphere([2, 1.2, 1.2], [0, 3.4, 0], 1),
      ...fire(0, 0, 0, 2, 3, 0.9),
      ...ring(0, 0, 1.6, 7, 4),
    ]),
  ],
};
