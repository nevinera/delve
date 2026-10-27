import { DOOR, boards, color, drop, gable, leanTo, open, outline, plain, plaster, put, railing, rect, shingles, stairs, stone, storey, structure, thatch, timber, walls, window_ } from "./build.js";

// Farm and village buildings: a farmhouse, barn and shed; a cottage, inn, chapel, smithy and
// lumber mill. Elwynn-style: stone below, plaster above, dark slate roofs.

const STONE = "#8c8a84";
const PLASTER = "#d8ccb0";
const SLATE = "#4a5468";
const TIMBER = "#7a5a3a";
const BOARDS = "#9a7a50";
const EARTH = "#6b5034";
const THATCH = "#b89850";

// The common palette: params stone, plaster and roof, then fixed timber and boards.
const palette = (roof = SLATE, walls = PLASTER) => [color(STONE, "stone"), color(walls, "walls"), color(roof, "roof"), color(TIMBER), color(BOARDS)];
const materials = () => ({ stone: stone(0), plaster: plaster(1), roof: shingles(2), timber: timber(3), boards: boards(4) });

// --- the cottage: one room, a hearth on the north wall ---
const cottageCells = rect(-2, -2, 4, 3);
const COTTAGE = structure({
  id: "bstru001",
  name: "cottage",
  tags: ["house", "village"],
  palette: palette(),
  materials: materials(),
  floor: "boards",
  foundation: { kind: "plinth", material: "stone" },
  storeys: [
    storey(0, cottageCells, open(open(walls(outline(cottageCells), "stone"), ["0,1,n"], DOOR), ["-2,1,n", "2,-2,w", "-2,-1,w", "1,-2,n"], window_())),
  ],
  components: [gable(0, [-2, -2], [4, 3], "x", "roof")],
  objects: [
    put("bhome006", 0, -6),
    put("bhome001", -5.2, -3.6),
    put("bvill009", 3, 0),
    put("bhome011", 4.5, 2.3, { yaw: 180 }),
    put("bhome011", 4, -2.3),
    put("bhome003", -5, 2.2),
    put("bhome005", 6.6, -5.5, { yaw: -90 }),
    put("bvill001", 6.4, 2.4),
  ],
});

// --- the farmhouse: two storeys, stairs up the west wall ---
const farmCells = rect(-3, -2, 5, 5);
const farmWell = ["-3,1", "-3,0", "-3,-1"];
const FARMHOUSE = structure({
  id: "bstru002",
  name: "farmhouse",
  tags: ["house", "farm"],
  palette: palette(),
  materials: materials(),
  floor: "boards",
  foundation: { kind: "plinth", material: "stone" },
  storeys: [
    storey(0, farmCells, open(open(walls(outline(farmCells), "stone"), ["-1,3,n"], DOOR), ["1,3,n", "-3,0,w", "2,-1,w", "2,1,w", "-2,-2,n"], window_())),
    storey(1, farmCells.filter((k) => !farmWell.includes(k)), open(walls(outline(farmCells), "plaster"), ["-2,3,n", "0,3,n", "-2,-2,n", "1,-2,n", "2,0,w"], window_())),
  ],
  components: [stairs(0, [-3, 1], 0, 3, 1, "timber"), railing(1, ["-2,-1,w", "-2,0,w", "-2,1,w", "-3,2,n"], "timber"), gable(1, [-3, -2], [5, 5], "x", "roof", 0.8)],
  objects: [
    put("bhome006", 2.6, -6),
    put("bvill009", 3, 0),
    put("bvill008", 3, 2.6),
    put("bhome011", -3, -3),
    put("bhome005", 6.6, -5, { yaw: -90 }),
    put("bvill001", -6, -1),
    put("bvill007", 5.6, 9.6),
    put("bhome001", 4.5, 3, { y: 10 }),
    put("bhome001", -1, -3.6, { y: 10 }),
    put("bhome004", 4, 10, { y: 10 }),
    put("bhome003", -1, 10.2, { y: 10 }),
    put("bhome015", -5.5, 5, { y: 10 }),
  ],
});

// --- the barn: tall, double doors through ---
const barnCells = rect(-3, -2, 6, 4);
const BARN = structure({
  id: "bstru003",
  name: "barn",
  tags: ["farm", "animals"],
  palette: [color(STONE, "stone"), color("#8a3a2a", "walls"), color(SLATE, "roof"), color(EARTH)],
  storeyFt: 16,
  materials: { stone: stone(0), timber: timber(1), roof: shingles(2), earth: plain(3) },
  floor: "earth",
  foundation: { kind: "plinth", material: "stone" },
  storeys: [
    storey(0, barnCells, open(open(walls(outline(barnCells), "timber"), ["-1,2,n", "0,2,n", "-1,-2,n", "0,-2,n"], { ...DOOR, top: 12 }), ["3,-1,w", "-3,0,w"], window_(10, 13))),
  ],
  components: [gable(0, [-3, -2], [6, 4], "x", "roof", 0.9, 1.5)],
  objects: [
    put("bfarm003", -7.3, -3.4),
    put("bfarm002", -8, 4.5),
    put("bfarm001", 8, 5),
    put("bfarm001", 8, 3.2),
    put("bfarm001", 8, 4.1, { y: 1.6, yaw: 90 }),
    put("bfarm004", 0.5, -4.5),
    put("bfarm008", 8, -1.5),
    put("bfarm005", -3, 4.5, { yaw: 30 }),
  ],
});

// --- the open shed: three walls and a lean-to roof ---
const shedCells = rect(-2, -1, 4, 2);
const SHED = structure({
  id: "bstru004",
  name: "open shed",
  tags: ["farm", "animals", "shelter"],
  palette: [color(STONE, "stone"), color(TIMBER, "walls"), color(THATCH, "roof"), color(EARTH)],
  storeyFt: 9,
  materials: { stone: stone(0), timber: timber(1), roof: thatch(2), earth: plain(3) },
  floor: "earth",
  foundation: { kind: "plinth", material: "stone" },
  storeys: [storey(0, shedCells, drop(walls(outline(shedCells), "timber"), ["-1,1,n", "0,1,n"]))],
  components: [{ ...leanTo(0, [-2, -1], [4, 2], 2, "roof", 0.35, 1.5), ends: "timber" }],
  objects: [put("bfarm008", 0, -2.4), put("bfarm001", -5.5, 2), put("bfarm001", 5.5, 1.5, { yaw: 20 }), put("bvill007", -5.5, -1.5), put("bfarm020", 3, 2.5)],
});

// --- the inn: a common room below, a corridor and rooms above ---
const innCells = rect(-3, -3, 6, 5);
const innWell = ["-3,0", "-3,-1", "-3,-2"];
const innUpper = walls(outline(innCells), "plaster");
Object.assign(innUpper, walls(["-2,-2,n", "-1,-2,n", "0,-2,n", "1,-2,n", "2,-2,n"], "plaster"), walls(["-2,-2,w", "-2,-1,w", "-2,0,w", "0,-2,w", "0,-1,w", "0,0,w", "0,1,w"], "plaster"));
open(innUpper, ["-1,-2,n", "1,-2,n"], DOOR);
open(innUpper, ["-2,-3,n", "1,-3,n", "-1,2,n", "2,2,n", "3,-1,w", "3,1,w"], window_());
const INN = structure({
  id: "bstru005",
  name: "inn",
  tags: ["inn", "village", "house"],
  palette: palette(),
  storeyFt: 11,
  materials: materials(),
  floor: "boards",
  foundation: { kind: "plinth", material: "stone" },
  storeys: [
    storey(0, innCells, open(open(walls(outline(innCells), "stone"), ["0,2,n"], DOOR), ["-2,2,n", "2,2,n", "3,-2,w", "3,0,w", "-1,-3,n", "1,-3,n"], window_())),
    storey(1, innCells.filter((k) => !innWell.includes(k)), innUpper),
  ],
  components: [stairs(0, [-3, 0], 0, 3, 1, "timber"), railing(1, ["-3,1,n"], "timber"), gable(1, [-3, -3], [6, 5], "x", "roof")],
  objects: [
    put("bhome006", 3, -10),
    put("bvill009", -2, -3),
    put("bvill008", -2, -5.4),
    put("bvill008", -2, -0.6),
    put("bvill009", 6, -3),
    put("bvill008", 6, -5.4),
    put("bvill008", 6, -0.6),
    put("bvill009", 6, 4.5),
    put("bvill008", 6, 2.1),
    put("bvill002", -5.2, -9.8),
    put("bvill001", 10.2, 0.5),
    put("bvill004", 9.8, -9),
    put("bhome010", -2, -3, { y: 2.75 }),
    put("bhome013", 6, -3, { y: 2.75 }),
    put("bvill015", 6, 10.5),
    put("bhome001", -5.6, 2, { y: 11 }),
    put("bhome001", 2.5, 1.5, { y: 11 }),
    put("bhome001", 9.5, 1.5, { y: 11 }),
    put("bhome003", 6, 6.2, { y: 11 }),
  ],
});

// --- the chapel: tall and narrow, benches facing an altar ---
const chapelCells = rect(-2, -4, 4, 7);
const tall = window_(4, 11);
const CHAPEL = structure({
  id: "bstru006",
  name: "chapel",
  tags: ["church", "village"],
  palette: palette(SLATE, STONE),
  storeyFt: 14,
  materials: materials(),
  floor: "stone",
  foundation: { kind: "plinth", material: "stone" },
  storeys: [
    storey(
      0,
      chapelCells,
      open(open(open(walls(outline(chapelCells), "stone"), ["-1,3,n", "0,3,n"], { ...DOOR, top: 10 }), ["-2,-3,w", "-2,-1,w", "-2,1,w", "2,-3,w", "2,-1,w", "2,1,w"], tall), ["-1,-4,n", "0,-4,n"], window_(6, 12)),
    ),
  ],
  components: [gable(0, [-2, -4], [4, 7], "z", "roof", 1.1)],
  objects: [
    put("bques007", 0, -12.6),
    put("bhome010", -4.5, -13),
    put("bhome010", 4.5, -13),
    ...[-6, -2, 2, 6].flatMap((z) => [put("bvill008", -3.75, z, { scale: 0.75 }), put("bvill008", 3.75, z, { scale: 0.75 })]),
  ],
});

// --- the smithy: open to the south, a forge and racks ---
const smithyCells = rect(-2, -2, 4, 3);
const SMITHY = structure({
  id: "bstru007",
  name: "smithy",
  tags: ["workshop", "village"],
  palette: palette(SLATE, STONE),
  materials: materials(),
  floor: "stone",
  foundation: { kind: "plinth", material: "stone" },
  storeys: [storey(0, smithyCells, drop(walls(outline(smithyCells), "stone"), ["-1,1,n", "0,1,n"]))],
  components: [{ ...leanTo(0, [-2, -2], [4, 3], 2, "roof", 0.4, 1.5), ends: "stone" }],
  objects: [
    put("bfort002", -4.5, -4),
    put("bfort009", 2, -6.4),
    put("bvill018", -4.5, 1),
    put("bvill016", -6.3, -1.4),
    put("bfort014", 5, 1, { scale: 0.7 }),
    put("bvill001", 6.3, -3.5),
  ],
});

// --- the lumber mill: open to the south, a waterwheel at the east end ---
const millCells = rect(-3, -2, 6, 4);
const MILL = structure({
  id: "bstru008",
  name: "lumber mill",
  tags: ["mill", "workshop", "wood"],
  palette: [color(STONE, "stone"), color(TIMBER, "walls"), color(SLATE, "roof"), color(BOARDS)],
  storeyFt: 12,
  materials: { stone: stone(0), timber: timber(1), roof: shingles(2), boards: boards(3) },
  floor: "boards",
  foundation: { kind: "plinth", material: "stone" },
  storeys: [storey(0, millCells, drop(walls(outline(millCells), "timber"), ["-2,2,n", "-1,2,n", "0,2,n", "1,2,n"]))],
  components: [gable(0, [-3, -2], [6, 4], "x", "roof", 0.6, 1.5)],
  objects: [
    put("bmill012", 0, 0),
    put("bmill001", -7, 0),
    put("bmill003", 5.2, -5.4),
    put("bmill011", 6, 4),
    put("bmill007", 16, 0, { yaw: 90 }),
    put("bmill008", -16, 10, { yaw: 180 }),
    put("bmill005", 2, 12),
    put("bmill006", -6, 14),
  ],
});

export const FARMSTEAD_STRUCTURES = { id: "farmstead", name: "farmstead", structures: [FARMHOUSE, BARN, SHED] };
export const VILLAGE_STRUCTURES = { id: "village", name: "village", structures: [COTTAGE, INN, CHAPEL, SMITHY, MILL] };
