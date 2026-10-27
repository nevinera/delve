import { box, color, cone, cut, object, post, rod, sphere, tiled, wedge, wheel } from "./pieces.js";

// Graveyard and ruin props: gravestones, tombs, broken pillars and walls, statues, dead trees, iron
// fences and an arch.

const STONE = "#8a8680";
const OLD = "#6e6a62";
const MOSS = "#5f7a3a";
const IRON = "#2e3034";
const DEAD = "#6a5a48";
const EARTH = "#5a4430";

export const RUINS = {
  id: "ruins",
  name: "graveyard and ruins",
  objects: [
    object("bruin001", "gravestone", ["grave"], [color(STONE, "stone")], [
      tiled(box([1.8, 2.4, 0.4], [0, 1.2, 0], 0), "stone", 1.5, 0.1),
      rod(1.8, 0.4, [0, 2.4, 0], 0, 90),
    ]),
    object("bruin002", "cross gravestone", ["grave"], [color(STONE, "stone")], [box([0.5, 3.6, 0.4], [0, 1.8, 0], 0), box([1.8, 0.5, 0.4], [0, 2.7, 0], 0), box([1, 0.4, 0.8], [0, 0.2, 0], 0)]),
    object("bruin003", "leaning gravestone", ["grave"], [color(OLD, "stone"), color(MOSS, "moss")], [
      tiled(box([1.6, 2.6, 0.45], [0, 1.2, 0], 0, [0, 12, -8]), "stone", 1.5, 0.15),
      sphere([1.4, 0.4, 0.9], [0, 0.1, 0.2], 1),
    ]),
    object("bruin004", "grave mound", ["grave"], [color(EARTH, "earth"), color(STONE, "stone")], [sphere([3, 1, 6.4], [0, 0.1, 0.4], 0), box([1.2, 1.6, 0.3], [0, 0.8, -3], 1)]),
    object("bruin005", "tomb", ["grave", "crypt"], [color(STONE, "stone"), color(OLD, "lid")], [
      tiled(box([3.6, 2.6, 7], [0, 1.3, 0], 0), "stone", 1.5),
      tiled(box([4, 0.5, 7.4], [0, 2.85, 0], 1), "stone", 1.5),
      box([4, 0.4, 7.4], [0, 0.2, 0], 1),
      wedge([1.6, 0.4, 3], [0, 3.3, -1.5], 1, [90, 0, 0]),
    ]),
    object("bruin006", "broken pillar", ["ruin"], [color(STONE, "stone"), color(MOSS, "moss")], [
      tiled(box([3, 1, 3], [0, 0.5, 0], 0), "stone", 1.5),
      tiled(post(2.2, 6, [0, 4, 0], 0), "stone", 1.5),
      cut(box([3, 2, 3], [0.4, 7.8, 0], 0, [0, 0, 30])),
      tiled(rod(2.2, 3, [3.5, 1.1, 1.2], 0, 30), "stone", 1.5),
      sphere([2.4, 0.5, 2], [0.4, 1.1, 0.4], 1),
    ]),
    object("bruin007", "ruined wall", ["ruin", "wall"], [color(OLD, "stone"), color(MOSS, "moss")], [
      tiled(box([12, 6, 2], [0, 3, 0], 0), "stone", 1.5, 0.2),
      cut(box([3, 4, 3], [-1.5, 2.4, 0], 0)),
      cut(rod(3, 3, [-1.5, 4.4, 0], 0, 90)),
      cut(box([6, 4, 3], [4.4, 6.6, 0], 0, [0, 0, 35])),
      tiled(wedge([4, 2, 2], [-4, 7, 0], 0, [90, 0, 0]), "stone", 1.5, 0.2),
      box([1.2, 0.8, 1], [6.6, 0.4, 1.5], 0, [20, 0, 10]),
      box([1, 0.7, 0.9], [5.6, 0.35, 2.3], 0, [-30, 0, 0]),
      sphere([3, 0.5, 2.2], [-4.5, 6, 0], 1),
    ]),
    object("bruin008", "broken statue", ["ruin", "statue"], [color(STONE, "stone"), color("#c8c0b0", "marble")], [
      tiled(box([3.4, 2.4, 3.4], [0, 1.2, 0], 0), "stone", 1.5),
      box([3.8, 0.4, 3.8], [0, 2.6, 0], 0),
      box([0.7, 3, 0.8], [-0.5, 4.3, 0], 1),
      box([0.7, 2.2, 0.8], [0.5, 3.9, 0], 1),
      box([1.9, 1.4, 1], [0, 6.3, 0], 1, [0, 0, 8]),
      sphere([1, 1.2, 1], [2.6, 0.5, 1.6], 1),
    ]),
    object("bruin009", "dead tree", ["tree", "dead"], [color(DEAD, "wood")], [
      post(1.8, 12, [0, 6, 0], 0, { taper: 0.4 }),
      post(2.6, 1.2, [0, 0.6, 0], 0, { taper: 0.6 }),
      rod(0.6, 6, [2.2, 9, 0], 0, 0, 40),
      rod(0.5, 5, [-1.8, 8, 0.6], 0, 160, 35),
      rod(0.4, 4, [0.4, 11, -1.6], 0, 80, 45),
      rod(0.3, 3, [4.4, 11.2, 0], 0, 0, 70),
      rod(0.3, 2.6, [-3.6, 10, 1.2], 0, 200, 60),
    ]),
    object("bruin010", "iron fence", ["fence", "grave"], [color(IRON, "iron"), color(STONE, "stone")], [
      tiled(box([8, 0.8, 1], [0, 0.4, 0], 1), "stone", 1.2),
      ...[-3.5, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 3.5].flatMap((x) => [box([0.16, 4, 0.16], [x, 2.8, 0], 0), cone([0.35, 0.6, 0.35], [x, 5.1, 0], 0)]),
      box([8, 0.2, 0.2], [0, 1.6, 0], 0),
      box([8, 0.2, 0.2], [0, 4.2, 0], 0),
    ]),
    object("bruin011", "fallen column", ["ruin"], [color(STONE, "stone")], [
      tiled(rod(2.2, 4, [-3, 1.1, 0], 0, 5), "stone", 1.5),
      tiled(rod(2.2, 3, [0.6, 1.1, 0.4], 0, -12), "stone", 1.5),
      tiled(rod(2.2, 3.2, [4.2, 1.1, 0.2], 0, 8), "stone", 1.5),
      tiled(box([3, 1, 3], [7, 0.5, -1], 0, [30, 0, 0]), "stone", 1.5),
    ]),
    object("bruin012", "ruined arch", ["ruin"], [color(STONE, "stone"), color(MOSS, "moss")], [
      tiled(box([2.4, 10, 2.4], [-4, 5, 0], 0), "stone", 1.5),
      tiled(box([2.4, 10, 2.4], [4, 5, 0], 0), "stone", 1.5),
      tiled(box([10.4, 3, 2.4], [0, 11.5, 0], 0), "stone", 1.5),
      cut(wheel(5.6, 3, [0, 9, 0], 0)),
      cut(box([3, 4, 3], [3.8, 13.4, 0], 0, [0, 0, -30])),
      sphere([3, 0.6, 2.4], [-3.4, 13, 0], 1),
      box([1.4, 1, 1.2], [5.8, 0.5, 1.4], 0, [20, 0, 0]),
    ]),
  ],
};
