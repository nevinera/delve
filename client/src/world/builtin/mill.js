import { box, color, cone, object, post, rod, sphere, tiled, wheel } from "./pieces.js";

// Lumber mill props: logs, planks, saws, a waterwheel and a crane.

const BARK = "#6a4e34";
const CUT = "#c8a070";
const WOOD = "#8a6a44";
const DARK_WOOD = "#5c4630";
const IRON = "#55565a";

// A log `long` ft along z with its ends showing cut wood.
const log = (d, long, at, yaw = 90) => [tiled(rod(d, long, at, 0, yaw), "thatch", 2, 0.1), rod(d * 0.92, long + 0.1, at, 1, yaw)];

const legs = (x, z, c) => [
  box([0.3, 3.2, 0.3], [x, 1.5, z - 0.7], c, [0, -20, 0]),
  box([0.3, 3.2, 0.3], [x, 1.5, z + 0.7], c, [0, 20, 0]),
];

export const MILL = {
  id: "mill",
  name: "lumber mill",
  objects: [
    object("bmill001", "log pile", ["wood", "logs"], [color(BARK, "bark"), color(CUT, "cut wood"), color(DARK_WOOD)], [
      ...[-3, -1, 1, 3].flatMap((x) => log(2, 14, [x, 1, 0])),
      ...[-2, 0, 2].flatMap((x) => log(2, 14, [x, 2.75, 0])),
      ...[-1, 1].flatMap((x) => log(2, 14, [x, 4.5, 0])),
      box([0.6, 1, 0.6], [-4.4, 0.5, -5], 2),
      box([0.6, 1, 0.6], [4.4, 0.5, -5], 2),
      box([0.6, 1, 0.6], [-4.4, 0.5, 5], 2),
      box([0.6, 1, 0.6], [4.4, 0.5, 5], 2),
    ]),
    object("bmill002", "single log", ["wood", "logs"], [color(BARK, "bark"), color(CUT, "cut wood")], log(2.2, 16, [0, 1.05, 0], 0)),
    object("bmill003", "plank stack", ["wood", "planks"], [color("#b08a5a", "planks"), color(DARK_WOOD)], [
      ...[0, 1, 2, 3, 4].map((n) => tiled(box([12, 0.4, 3.6], [0, 0.6 + n * 0.55, 0], 0), "planks", 2)),
      ...[-5, 0, 5].flatMap((x) => [0, 1, 2, 3].map((n) => box([0.3, 0.15, 3.8], [x, 0.875 + n * 0.55, 0], 1))).slice(0, 12),
      box([12, 0.4, 0.4], [0, 0.2, -1.4], 1),
      box([12, 0.4, 0.4], [0, 0.2, 1.4], 1),
    ]),
    object("bmill004", "sawhorse", ["tool"], [color(WOOD, "wood")], [
      box([5, 0.5, 0.5], [0, 2.95, 0], 0),
      ...legs(-2, 0, 0),
      ...legs(2, 0, 0),
    ]),
    object("bmill005", "sawhorse with log", ["tool", "logs"], [color(WOOD, "wood"), color(BARK, "bark"), color(CUT), color(IRON)], [
      box([0.5, 0.5, 4.5], [-3, 2.95, 0], 0),
      box([0.5, 0.5, 4.5], [3, 2.95, 0], 0),
      ...[-3, 3].flatMap((x) => [box([0.3, 3.2, 0.3], [x - 0.6, 1.5, -1.8], 0, [0, 0, -20]), box([0.3, 3.2, 0.3], [x + 0.6, 1.5, -1.8], 0, [0, 0, 20]), box([0.3, 3.2, 0.3], [x - 0.6, 1.5, 1.8], 0, [0, 0, -20]), box([0.3, 3.2, 0.3], [x + 0.6, 1.5, 1.8], 0, [0, 0, 20])]),
      tiled(rod(1.6, 10, [0, 4, 0], 1), "thatch", 2, 0.1),
      rod(1.5, 10.1, [0, 4, 0], 2),
      box([0.12, 1.8, 3.4], [1.2, 4.6, 0], 3),
    ]),
    object("bmill006", "cut stumps", ["wood", "logs"], [color(BARK, "bark"), color(CUT, "cut wood")], [
      post(2.4, 1.6, [-1.5, 0.8, 0], 0),
      post(2.3, 0.1, [-1.5, 1.62, 0], 1),
      post(1.8, 1.1, [1.4, 0.55, -0.8], 0),
      post(1.7, 0.1, [1.4, 1.12, -0.8], 1),
      post(2, 0.8, [0.6, 0.4, 1.8], 0),
      post(1.9, 0.1, [0.6, 0.82, 1.8], 1),
    ]),
    object("bmill007", "waterwheel", ["machine", "water"], [color(WOOD, "wood"), color(DARK_WOOD), color(IRON)], [
      // Paddles standing out from a rim of boards, on four spokes.
      ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((k) => {
        const a = (k / 10) * 360;
        const r = (a * Math.PI) / 180;
        const m = ((a + 18) * Math.PI) / 180;
        return [
          box([1.8, 0.3, 3], [Math.cos(r) * 6.8, 8.4 + Math.sin(r) * 6.8, 0], 0, [0, 0, a]),
          box([3.9, 0.4, 3.2], [Math.cos(m) * 5.8, 8.4 + Math.sin(m) * 5.8, 0], 1, [0, 0, a + 18 + 90]),
        ];
      }),
      ...[0, 45, 90, 135].map((a) => box([11.4, 0.4, 0.5], [0, 8.4, 0], 1, [0, 0, a])),
      wheel(1.6, 3.6, [0, 8.4, 0], 2),
      rod(0.6, 7.5, [0, 8.4, 3.5], 2, 90),
      box([1, 9, 1], [0, 4.5, 6.5], 1),
      box([1, 9, 1], [0, 4.5, -2.6], 1),
    ]),
    object("bmill008", "timber crane", ["machine", "logs"], [color(WOOD, "wood"), color("#b8a47c", "rope"), color(BARK), color(CUT)], [
      box([1, 14, 1], [0, 7, 0], 0),
      box([3, 0.6, 3], [0, 0.3, 0], 0),
      rod(0.7, 11, [4.6, 12.4, 0], 0, 0, 15),
      rod(0.5, 7, [2.2, 9.2, 0], 0, 0, 55),
      post(0.12, 6, [9.6, 10.9, 0], 1),
      tiled(rod(1.4, 8, [9.6, 7.3, 0], 2, 90), "thatch", 2, 0.1),
      rod(1.3, 8.1, [9.6, 7.3, 0], 3, 90),
    ]),
    object("bmill009", "log chute", ["wood"], [color(WOOD, "wood"), color(DARK_WOOD)], [
      box([20, 0.4, 3], [0, 3.2, 0], 0, [0, 0, -14]),
      box([20, 1.2, 0.3], [0, 3.8, -1.5], 0, [0, 0, -14]),
      box([20, 1.2, 0.3], [0, 3.8, 1.5], 0, [0, 0, -14]),
      box([0.6, 5.4, 0.6], [-7, 2.7, -1.6], 1),
      box([0.6, 5.4, 0.6], [-7, 2.7, 1.6], 1),
      box([0.6, 1.4, 0.6], [7, 0.7, -1.6], 1),
      box([0.6, 1.4, 0.6], [7, 0.7, 1.6], 1),
    ]),
    object("bmill010", "bark heap", ["wood"], [color("#5a4430", "bark")], [tiled(sphere([7, 2.2, 5], [0, 0.6, 0], 0), "thatch", 1.5), tiled(sphere([4, 1.6, 3], [1.5, 1, 0.5], 0), "thatch", 1.5)]),
    object("bmill011", "sawdust pile", ["wood"], [color("#d8b884", "sawdust")], [cone([6, 2, 6], [0, 1, 0], 0), cone([3.5, 1.4, 3.5], [2.2, 0.7, 1.2], 0)]),
    object("bmill012", "saw bench", ["machine", "tool"], [color(WOOD, "wood"), color("#a8aab0", "blade"), color(IRON)], [
      tiled(box([8, 0.4, 3], [0, 3, 0], 0), "planks", 2),
      ...[[-3.6, -1.2], [3.6, -1.2], [-3.6, 1.2], [3.6, 1.2]].map(([x, z]) => box([0.4, 2.8, 0.4], [x, 1.4, z], 0)),
      wheel(3, 0.08 + 0.04, [0, 3.2, 0], 1),
      wheel(0.6, 0.6, [0, 2.4, 0], 2),
    ]),
  ],
};
