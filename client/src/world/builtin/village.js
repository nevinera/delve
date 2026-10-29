import { barrel, box, color, cone, crate, cut, object, post, rod, sack, sign, tiled, wedge, wheel } from "./pieces.js";

// Village dressing: barrels, crates, sacks, benches, tables, carts, lamps and signs.

const WOOD = "#8a6a44";
const DARK_WOOD = "#5c4630";
const IRON = "#4a4a4e";
const CLOTH = "#b8a47c";
const LIGHT = "#ffd27a";

export const VILLAGE = {
  id: "village",
  name: "village",
  objects: [
    object("bvill001", "barrel", ["container"], [color(WOOD, "wood"), color(IRON, "hoops")], barrel(0, 0, 0, 1)),
    object("bvill002", "barrel stack", ["container"], [color(WOOD, "wood"), color(IRON, "hoops")], [...barrel(-1.15, 0, 0, 1), ...barrel(1.15, 0.2, 0, 1), ...barrel(0, 0.1, 0, 1, 1, 3)]),
    object("bvill003", "crate", ["container"], [color("#9a7a50", "wood"), color(DARK_WOOD, "bands")], crate(0, 0, 0, 2, 0, 1)),
    object("bvill004", "large crate", ["container"], [color("#9a7a50", "wood"), color(DARK_WOOD, "bands")], crate(0, 0, 0, 3.5, 0, 1)),
    object("bvill005", "crate stack", ["container"], [color("#9a7a50", "wood"), color(DARK_WOOD, "bands")], [
      ...crate(-1.4, 0, 0, 2.6, 0, 1, 5),
      ...crate(1.3, 0, 0.2, 2.4, 0, 1, -8),
      ...crate(-0.9, 2.6, 0, 2, 0, 1, 15),
    ]),
    object("bvill006", "sack", ["container"], [color(CLOTH, "cloth")], sack(0, 0, 0)),
    object("bvill007", "sack pile", ["container"], [color(CLOTH, "cloth")], [
      ...sack(-1.2, 0, 0, 1, 0, 10),
      ...sack(0.3, -0.4, 0, 1.1, 0, -5),
      ...sack(1.6, 0.3, 0, 0.9, 0, -15),
      ...sack(-0.3, 0.9, 0, 1, 0, 5),
      ...sack(-0.4, 0, 0, 0.9, 1.6, 80),
    ]),
    object("bvill008", "bench", ["seat"], [color(WOOD, "wood")], [
      tiled(box([6, 0.3, 1.3], [0, 1.6, 0], 0), "planks", 1.3),
      box([0.3, 1.45, 1.1], [-2.3, 0.73, 0], 0),
      box([0.3, 1.45, 1.1], [2.3, 0.73, 0], 0),
      box([4.4, 0.25, 0.25], [0, 0.6, 0], 0),
    ]),
    object("bvill009", "table", ["furniture"], [color(WOOD, "wood")], [
      tiled(box([6, 0.3, 3], [0, 2.6, 0], 0), "planks", 1.5),
      box([0.35, 2.45, 0.35], [-2.6, 1.23, -1.2], 0),
      box([0.35, 2.45, 0.35], [2.6, 1.23, -1.2], 0),
      box([0.35, 2.45, 0.35], [-2.6, 1.23, 1.2], 0),
      box([0.35, 2.45, 0.35], [2.6, 1.23, 1.2], 0),
    ]),
    object("bvill010", "stool", ["seat"], [color(WOOD, "wood")], [
      post(1.3, 0.2, [0, 1.8, 0], 0),
      post(0.16, 1.75, [0.4, 0.88, 0], 0),
      post(0.16, 1.75, [-0.2, 0.88, 0.35], 0),
      post(0.16, 1.75, [-0.2, 0.88, -0.35], 0),
    ]),
    object("bvill011", "handcart", ["cart"], [color(WOOD, "wood"), color(DARK_WOOD)], [
      tiled(box([4.5, 0.3, 3], [0, 2, 0], 0), "planks", 1.5),
      box([4.5, 0.9, 0.15], [0, 2.6, -1.45], 0),
      box([4.5, 0.9, 0.15], [0, 2.6, 1.45], 0),
      box([0.15, 0.9, 3], [-2.2, 2.6, 0], 0),
      wheel(3, 0.25, [0.4, 1.5, -1.7], 1),
      wheel(3, 0.25, [0.4, 1.5, 1.7], 1),
      rod(0.2, 4, [4, 2, -1], 0, 0, -10),
      rod(0.2, 4, [4, 2, 1], 0, 0, -10),
      box([0.25, 1.8, 0.25], [-1.9, 0.9, 0], 1),
    ]),
    object("bvill012", "wagon wheel", ["cart"], [color(DARK_WOOD, "wood"), color(IRON)], [
      { ...wheel(3.6, 0.3, [0, 1.75, 0.4], 0), turn: [0, 75, 0] },
      { ...wheel(0.8, 0.6, [0, 1.75, 0.4], 1), turn: [0, 75, 0] },
    ]),
    object("bvill013", "lamp post", ["light"], [color(IRON, "iron"), color(LIGHT, "light")], [
      post(0.6, 0.6, [0, 0.3, 0], 0),
      post(0.3, 9, [0, 4.5, 0], 0),
      rod(0.15, 1.6, [0.7, 8.6, 0], 0),
      box([0.8, 1.1, 0.8], [1.4, 7.9, 0], 1),
      { ...cone([1.1, 0.5, 1.1], [1.4, 8.7, 0], 0), turn: [45, 0, 0] },
    ]),
    object("bvill014", "signpost", ["sign"], [color(WOOD, "wood"), color("#d8c8a0", "boards")], [
      post(0.4, 8, [0, 4, 0], 0),
      sign(box([3.6, 0.8, 0.15], [1.7, 6.8, 0], 1), "east", "MILLBROOK", [3, 0.5]),
      sign(box([3.6, 0.8, 0.15], [-1.7, 5.7, 0], 1, [0, 0, 0]), "west", "KINGSHOLD", [3, 0.5]),
      wedge([0.8, 0.8, 0.15], [3.9, 6.8, 0], 1, [0, 0, 90]),
      wedge([0.8, 0.8, 0.15], [-3.9, 5.7, 0], 1, [0, 0, -90]),
    ]),
    object("bvill015", "hanging sign", ["sign"], [color(DARK_WOOD, "wood"), color("#c8b48a", "board"), color(IRON)], [
      post(0.5, 9, [0, 4.5, 0], 0),
      box([3.6, 0.35, 0.35], [1.6, 8.6, 0], 0),
      box([0.08 + 0.04, 0.6, 0.12], [1.2, 8.1, 0], 2),
      box([0.12, 0.6, 0.12], [2.8, 8.1, 0], 2),
      sign(box([2.4, 1.6, 0.2], [2, 7, 0], 1), "name", "INN", [2, 1]),
    ]),
    object("bvill016", "water bucket", ["water"], [color(WOOD, "wood"), color(IRON), color("#3a5a78")], [
      tiled(post(1.4, 1.3, [0, 0.65, 0], 0), "planks", 0.5),
      cut(post(1.2, 0.3, [0, 1.3, 0], 2)),
      post(1.46, 0.12, [0, 0.3, 0], 1),
      post(1.46, 0.12, [0, 1.05, 0], 1),
    ]),
    object("bvill017", "woodpile", ["wood"], [color("#7a5a3a", "bark"), color("#c4a070", "cut ends"), color(DARK_WOOD)], [
      ...[-1.5, -0.5, 0.5, 1.5].map((x) => rod(0.9, 3, [x * 0.9, 0.45, 0], 0, 90)),
      ...[-1, 0, 1].map((x) => rod(0.9, 3, [x * 0.9, 1.25, 0], 0, 90)),
      ...[-0.5, 0.5].map((x) => rod(0.9, 3, [x * 0.9, 2.05, 0], 0, 90)),
      box([0.3, 3, 0.3], [-2, 1.5, 0], 2),
      box([0.3, 3, 0.3], [2, 1.5, 0], 2),
    ]),
    object("bvill018", "chopping block", ["wood", "tool"], [color("#7a5a3a", "wood"), color("#c4a070"), color(IRON)], [
      post(2, 1.6, [0, 0.8, 0], 0),
      post(1.9, 0.1, [0, 1.62, 0], 1),
      rod(0.15, 2.6, [0.6, 2.5, 0], 0, 0, 55),
      wedge([0.5, 0.15, 0.7], [0.05, 1.65, 0], 2, [90, 0, 90]),
      rod(0.8, 1.6, [-1.5, 0.4, 0.8], 0, 30),
    ]),
  ],
};
