import { DOOR, boards, color, gable, open, outline, put, railing, rect, span, stone, storey, structure, thatch, timber, walls, window_ } from "./build.js";

// Waterside structures: a dock, a bridge and a fishing hut, on stilts or stone ends.

const TIMBER = "#7a5a3a";
const BOARDS = "#8a6a44";
const STONE = "#8c8a84";

// --- the dock: a walkway out to a T-shaped head, railed ---
const dockCells = [...rect(0, -6, 2, 7), ...rect(-2, -8, 6, 2)];
const DOCK = structure({
  id: "bstru017",
  name: "dock",
  tags: ["dock", "water", "coast"],
  palette: [color(BOARDS, "boards"), color(TIMBER, "posts")],
  storeyFt: 8,
  materials: { boards: boards(0), timber: timber(1) },
  floor: "boards",
  foundation: { kind: "stilts", material: "timber" },
  storeys: [storey(0, dockCells)],
  components: [railing(0, outline(dockCells).filter((e) => e !== "0,1,n" && e !== "1,1,n"), "timber")],
  objects: [put("bcoas007", -6, -30), put("bcoas007", 14, -30), put("bcoas011", 11, -26), put("bcoas008", -4, -26), put("bcoas012", 4, -30)],
});

// --- the bridge: a railed span between two stone ends ---
const BRIDGE = structure({
  id: "bstru018",
  name: "bridge",
  tags: ["bridge", "water", "road"],
  palette: [color(STONE, "stone"), color(BOARDS, "deck")],
  storeyFt: 8,
  materials: { stone: stone(0), boards: boards(1) },
  floor: "stone",
  foundation: { kind: "plinth", material: "stone" },
  storeys: [storey(0, [...rect(0, 0, 2, 1), ...rect(0, 9, 2, 1)])],
  components: [span(0, [1, 1], 2, 8, 2, "boards")],
  objects: [],
});

// --- the fishing hut: a room and a porch on stilts ---
const hutCells = rect(0, 0, 3, 3);
const porch = rect(0, 3, 3, 1);
const HUT = structure({
  id: "bstru019",
  name: "fishing hut",
  tags: ["house", "coast", "fishing"],
  palette: [color(TIMBER, "walls"), color("#b89850", "roof"), color(BOARDS, "floor")],
  storeyFt: 9,
  materials: { timber: timber(0), roof: thatch(1), boards: boards(2) },
  floor: "boards",
  foundation: { kind: "stilts", material: "timber" },
  storeys: [storey(0, [...hutCells, ...porch], open(open(walls(outline(hutCells), "timber"), ["1,3,n"], DOOR), ["3,1,w", "0,1,w"], window_()))],
  components: [railing(0, ["0,3,w", "3,3,w", "0,4,n", "2,4,n"], "timber"), gable(0, [0, 0], [3, 3], "x", "roof", 0.8)],
  objects: [put("bhome002", 2.5, 5.5), put("bhome003", 9, 9.6, { scale: 0.8 }), put("bvill010", 8, 3), put("bcoas005", 2.5, 14), put("bcoas008", 9.5, 14), put("bcoas004", 6, -5)],
});

export const WATERSIDE_STRUCTURES = { id: "waterside", name: "waterside", structures: [DOCK, BRIDGE, HUT] };
