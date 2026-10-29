import { box, color, cone, cut, object, post, rod, sphere, throughZ, tiled, wheel, withCuts } from "./pieces.js";

// Kobold and troglodyte den props, for caves and mines: candles, stone spikes, totems, bones,
// mushrooms, mine carts, rails and timbering.

const STONE = "#7a746c";
const WAX = "#efe6c8";
const CORE = "#ffe08a";
const WOOD = "#6a5038";
const IRON = "#4a4c50";
const BONE = "#e0d8c0";

const candle = (x, z, h) => [post(0.35, h, [x, h / 2, z], 0), cone([0.18, 0.35, 0.18], [x, h + 0.2, z], 1)];
const spike = (x, z, d, h, c, down = false) => cone([d, h, d], [x, down ? 30 - h / 2 : h / 2, z], c, down ? [0, 180, 0] : [0, 0, 0]);
const shroom = (x, z, h, d) => [post(d * 0.25, h, [x, h / 2, z], 0), sphere([d, d * 0.45, d], [x, h, z], 1)];

export const CAVE = {
  id: "cave",
  name: "cave dens",
  objects: [
    object("bcave001", "candle cluster", ["light", "kobold"], [color(WAX, "wax"), color(CORE, "flame")], [
      post(1.6, 0.1, [0, 0.05, 0], 0),
      ...candle(0, 0, 1.2),
      ...candle(0.5, 0.3, 0.8),
      ...candle(-0.4, 0.4, 0.6),
      ...candle(0.2, -0.5, 1),
    ]),
    object("bcave002", "candle on rock", ["light", "kobold"], [color(WAX, "wax"), color(CORE, "flame"), color(STONE, "rock")], [
      sphere([2.6, 2, 2.2], [0, 0.8, 0], 2),
      ...candle(0, 0, 0.9).map((p) => ({ ...p, at: [p.at[0], p.at[1] + 1.7, p.at[2]] })),
      post(0.8, 0.1, [0, 1.72, 0], 0),
    ]),
    object("bcave003", "stalagmites", ["rock", "cave"], [color(STONE, "stone")], [spike(0, 0, 2.4, 8, 0), spike(1.6, 0.8, 1.6, 5, 0), spike(-1.2, 1.2, 1.2, 3.5, 0), spike(0.4, -1.4, 1, 2.5, 0), sphere([3.6, 1, 3.4], [0.2, 0.2, 0.2], 0)]),
    object("bcave004", "cave column", ["rock", "cave"], [color(STONE, "stone")], [
      post(2.6, 30, [0, 15, 0], 0, { taper: 0.5 }),
      spike(0, 0, 4.5, 8, 0),
      spike(0, 0, 4, 9, 0, true),
      sphere([5, 1.4, 5], [0, 0.3, 0], 0),
    ]),
    object("bcave005", "crude totem", ["kobold", "troglodyte"], [color(WOOD, "wood"), color(BONE, "bone"), color("#a83a2a", "paint")], [
      post(1, 7, [0, 3.5, 0], 0),
      box([3, 0.4, 0.4], [0, 5.5, 0], 0),
      sphere([1.2, 1.3, 1.3], [0, 7.5, 0], 1),
      box([0.8, 0.4, 0.3], [0, 7.1, 0.55], 1),
      sphere([0.7, 0.8, 0.8], [-1.5, 5, 0], 1),
      sphere([0.7, 0.8, 0.8], [1.5, 5, 0], 1),
      post(1.06, 0.4, [0, 3, 0], 2),
      post(1.06, 0.4, [0, 4.2, 0], 2),
      cone([0.3, 1.4, 0.15], [0.3, 8.4, 0], 2, [0, 0, -20]),
      cone([0.3, 1.4, 0.15], [-0.3, 8.4, 0], 2, [0, 0, 20]),
    ]),
    object("bcave006", "bone pile", ["bones"], [color(BONE, "bone")], [
      rod(0.3, 3, [0, 0.2, 0], 0, 20),
      rod(0.3, 2.6, [0.4, 0.4, 0.3], 0, 100, 10),
      rod(0.25, 2, [-0.6, 0.35, -0.4], 0, -40, 8),
      rod(0.25, 2.2, [0.2, 0.15, 0.9], 0, 70),
      sphere([1, 1, 1.2], [-0.9, 0.5, 0.6], 0),
      sphere([0.9, 0.9, 1.1], [1, 0.45, -0.7], 0),
      sphere([0.5, 0.4, 0.5], [-0.2, 0.2, -1], 0),
    ]),
    object("bcave007", "glowing mushrooms", ["mushroom", "cave", "light"], [color("#c8c0a0", "stems"), color("#5ad8c8", "caps")], [
      ...shroom(0, 0, 2.2, 2),
      ...shroom(1.4, 0.6, 1.4, 1.3),
      ...shroom(-1.2, 0.9, 1, 1),
      ...shroom(0.5, -1.3, 0.8, 0.8),
      ...shroom(-0.8, -0.8, 0.6, 0.6),
    ]),
    object("bcave008", "mine cart", ["mine"], [color(IRON, "iron"), color(WOOD, "wood"), color("#8a6a4a", "ore")], [
      tiled(box([4, 2.2, 2.6], [0, 2, 0], 1), "planks", 1),
      box([4.1, 0.25, 2.7], [0, 3.05, 0], 0),
      box([4.1, 0.25, 2.7], [0, 1, 0], 0),
      ...[[-1.3, -1.2], [1.3, -1.2], [-1.3, 1.2], [1.3, 1.2]].map(([x, z]) => wheel(1.2, 0.25, [x, 0.6, z], 0)),
      sphere([3.6, 1.6, 2.2], [0, 3.1, 0], 2),
    ]),
    object("bcave009", "mine rails", ["mine"], [color(IRON, "rails"), color(WOOD, "sleepers")], [
      box([8, 0.3, 0.25], [0, 0.45, -1.2], 0),
      box([8, 0.3, 0.25], [0, 0.45, 1.2], 0),
      ...[-3.4, -1.7, 0, 1.7, 3.4].map((x) => box([0.6, 0.3, 3.4], [x, 0.15, 0], 1)),
    ]),
    withCuts(
      object("bcave010", "mine timbering", ["mine"], [color(WOOD, "wood")], [
        post(1, 9, [-4, 4.5, 0], 0),
        post(1, 9, [4, 4.5, 0], 0),
        tiled(box([10, 1, 1.1], [0, 9.4, 0], 0), "planks", 2),
        box([2, 0.8, 0.8], [-3.2, 8.4, 0], 0, [0, 0, -45]),
        box([2, 0.8, 0.8], [3.2, 8.4, 0], 0, [0, 0, 45]),
      ]),
      throughZ(-3.5, 3.5, -1, 7.4),
    ),
    object("bcave011", "pickaxe", ["mine", "tool"], [color(WOOD, "handle"), color(IRON, "head")], [
      rod(0.2, 3.4, [0, 0.15, 0], 0),
      { type: "cylinder", size: [0.3, 1.2, 0.3], at: [1.7, 0.15, 0.6], turn: [0, 90, 0], color: 1, taper: 0.3 },
      { type: "cylinder", size: [0.3, 1.2, 0.3], at: [1.7, 0.15, -0.6], turn: [0, -90, 0], color: 1, taper: 0.3 },
    ]),
    object("bcave012", "ore lumps", ["mine", "rock"], [color(STONE, "rock"), color("#c8a050", "ore")], [
      sphere([2, 1.4, 1.8], [0, 0.6, 0], 0),
      sphere([1.4, 1, 1.3], [1.4, 0.4, 0.6], 0),
      sphere([1.2, 0.9, 1], [-1.2, 0.4, 0.8], 0),
      sphere([0.5, 0.4, 0.5], [0.3, 1.2, 0.5], 1),
      sphere([0.4, 0.4, 0.4], [-0.5, 1, -0.4], 1),
      sphere([0.4, 0.3, 0.4], [1.6, 0.85, 0.5], 1),
    ]),
    object("bcave013", "cave rubble", ["rock", "cave"], [color(STONE, "stone")], [
      box([2, 1.4, 1.6], [0, 0.6, 0], 0, [20, 10, 5]),
      box([1.4, 1, 1.2], [1.6, 0.4, 0.8], 0, [-30, 0, 15]),
      box([1.2, 0.9, 1], [-1.4, 0.4, 0.6], 0, [50, 10, 0]),
      box([1, 0.8, 0.9], [0.6, 0.35, -1.3], 0, [10, -15, 10]),
      box([0.7, 0.5, 0.6], [-0.6, 0.25, -1], 0, [70, 0, 0]),
    ]),
    object("bcave014", "hide shelter", ["kobold", "troglodyte", "tent"], [color("#8a6a4a", "hides"), color(BONE, "poles")], [
      tiled(cone([7, 6, 7], [0, 3, 0], 0), "thatch", 1.5, 0.3),
      ...[0, 120, 240].map((a) => ({ ...post(0.2, 2, [Math.cos((a * Math.PI) / 180) * 0.3, 6.5, -Math.sin((a * Math.PI) / 180) * 0.3], 1), turn: [a, 0, 20] })),
      box([1.8, 2.4, 0.1], [0, 1.2, 2.6], 0, [0, -30, 0]),
    ]),
  ],
};
