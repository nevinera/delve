import { DOOR, color, drop, gable, leanTo, minus, open, outline, plain, put, railing, ramp, rect, rock, shingles, stairs, stone, storey, structure, thatch, timber, walls, window_ } from "./build.js";

// Buildings out in the wilds: a bandit hideout, a goblin workshop, a mine, caves and a crypt. The
// mine and caves are storeys dug into the ground, roofed over by a rock floor at ground level, with
// a ramp down from the surface.

const ROCK = "#6e6a62";
const TIMBER = "#7a5a3a";
const EARTH = "#6b5034";
const STONE = "#8a8680";
const SLATE = "#4a5468";

// --- the bandit hideout: a shack in a camp ---
const shackCells = rect(-2, -2, 3, 2);
const HIDEOUT = structure({
  id: "bstru011",
  name: "bandit hideout",
  tags: ["bandit", "camp"],
  palette: [color(TIMBER, "walls"), color("#8a7a50", "roof"), color(EARTH)],
  storeyFt: 8,
  materials: { timber: timber(0), roof: thatch(1), earth: plain(2) },
  floor: "earth",
  foundation: { kind: "posts", material: "timber" },
  storeys: [storey(0, shackCells, open(open(walls(outline(shackCells), "timber"), ["-1,0,n"], DOOR), ["1,-1,w"], window_()))],
  components: [{ ...leanTo(0, [-2, -2], [3, 2], 2, "roof", 0.3), ends: "timber" }],
  objects: [
    put("bband005", -5.5, -4.2),
    put("bband005", 1.8, -4.2),
    put("bband007", -2, -5.6, { scale: 0.7 }),
    put("bband004", -2, 9),
    put("bband001", 13, 2, { yaw: 90 }),
    put("bband012", 5, 10),
    put("bband010", -14, 10),
    ...[-8, 0, 8].map((x) => put("bband009", x, 18)),
    put("bband006", 10, -6, { yaw: -90 }),
    put("bvill005", -12, -2),
  ],
});

// --- the goblin workshop ---
const gobCells = rect(-2, -2, 4, 3);
const WORKSHOP = structure({
  id: "bstru012",
  name: "goblin workshop",
  tags: ["goblin", "workshop"],
  palette: [color("#8a5a3a", "walls"), color("#55565a", "roof"), color(EARTH)],
  storeyFt: 11,
  materials: { timber: timber(0), roof: shingles(1), earth: plain(2) },
  floor: "earth",
  foundation: { kind: "posts", material: "timber" },
  storeys: [storey(0, gobCells, open(open(walls(outline(gobCells), "timber"), ["-1,1,n", "0,1,n"], { ...DOOR, top: 9 }), ["2,-1,w"], window_()))],
  components: [{ ...leanTo(0, [-2, -2], [4, 3], 0, "roof", 0.3), ends: "timber" }],
  objects: [put("bgobl004", -3.5, -4.4), put("bgobl006", 5, -5), put("bgobl003", 5, 1.5), put("bgobl007", 11, -6), put("bgobl008", -13, 0, { yaw: 90 }), put("bgobl001", 9, 9), put("bgobl013", -6, 7)],
});

// --- the mine entrance: a ramp down into a timbered tunnel ---
const tunnel = rect(0, -4, 2, 5);
const mineRamp = rect(0, 1, 2, 4);
const mineCells = [...tunnel, ...mineRamp];
const MINE = structure({
  id: "bstru013",
  name: "mine entrance",
  tags: ["mine", "cave", "kobold"],
  palette: [color(ROCK, "rock"), color(TIMBER, "timber")],
  storeyFt: 12,
  materials: { rock: rock(0), timber: timber(1) },
  floor: "rock",
  foundation: { kind: "plinth", material: "rock" },
  storeys: [storey(-1, mineCells, drop(walls(outline(mineCells), "rock"), ["0,5,n", "1,5,n"])), storey(0, tunnel)],
  components: [ramp(-1, [1, 1], 2, 4, 2, "timber")],
  objects: [
    put("bcave008", 4, -14, { y: -12, yaw: 90 }),
    put("bcave012", 6, -6, { y: -12 }),
    put("bcave011", 1.6, -8, { y: -12, yaw: 90 }),
    put("bcave002", 1.8, -12, { y: -12 }),
    put("bvill004", 6, -1, { y: -12, scale: 0.7 }),
  ],
});

// --- the small cave: a chamber, a side pocket and a ramp in ---
const smallRamp = rect(-1, 0, 2, 4);
const smallCells = [...rect(-2, -5, 5, 4), ...rect(3, -4, 2, 2), ...rect(-1, -1, 2, 1), ...smallRamp];
const SMALL_CAVE = structure({
  id: "bstru014",
  name: "small cave",
  tags: ["cave", "kobold", "troglodyte"],
  palette: [color(ROCK, "rock")],
  storeyFt: 12,
  materials: { rock: rock(0) },
  floor: "rock",
  foundation: { kind: "plinth", material: "rock" },
  storeys: [storey(-1, smallCells, drop(walls(outline(smallCells), "rock"), ["-1,4,n", "0,4,n"])), storey(0, minus(smallCells, smallRamp))],
  components: [ramp(-1, [0, 0], 2, 4, 2)],
  objects: [
    put("bcave003", -5, -17, { y: -12 }),
    put("bcave003", 9, -7, { y: -12, scale: 0.7 }),
    put("bcave007", 16, -12, { y: -12 }),
    put("bcave012", 17.5, -14.5, { y: -12 }),
    put("bcave006", 2, -10, { y: -12 }),
    put("bcave014", -3, -13, { y: -12 }),
    put("bcave002", 6, -17, { y: -12 }),
    put("bcave001", -5.5, -7, { y: -12 }),
    put("bcave005", 9, -13, { y: -12 }),
  ],
});

// --- the large cave: a hall below the entry, then a great hall below that ---
const largeRamp = rect(-1, 2, 2, 4);
const hole = rect(1, -2, 2, 4);
const upper = [...minus(rect(-3, -2, 6, 4), hole), ...rect(0, -3, 3, 1), ...largeRamp];
const lower = rect(-4, -8, 8, 11);
const upperEdges = walls([...outline(upper), ...outline(lower)], "rock");
drop(upperEdges, ["-1,6,n", "0,6,n", "-1,3,n", "0,3,n", "1,-2,w", "1,-1,w", "1,0,w", "1,1,w", "1,-2,n", "2,-2,n"]);
const LARGE_CAVE = structure({
  id: "bstru015",
  name: "large cave",
  tags: ["cave", "kobold", "troglodyte", "dungeon"],
  palette: [color(ROCK, "rock"), color("#7a5a3a", "timber")],
  storeyFt: 12,
  materials: { rock: rock(0), timber: timber(1) },
  floor: "rock",
  foundation: { kind: "plinth", material: "rock" },
  storeys: [storey(-2, lower, walls(outline(lower), "rock")), storey(-1, upper, upperEdges), storey(0, minus([...new Set([...upper, ...lower])], largeRamp))],
  components: [ramp(-1, [0, 2], 2, 4, 2), ramp(-2, [1, 1], 0, 4, 2), railing(-1, ["1,-2,w", "1,-1,w", "1,0,w", "1,1,w"], "timber")],
  objects: [
    put("bcave001", -10, -6, { y: -12 }),
    put("bcave005", -6, 2, { y: -12 }),
    put("bcave013", -6, -6, { y: -12 }),
    ...[
      ["bcave014", -10, -26],
      ["bcave014", 6, -26],
      ["bband004", -2, -20],
      ["bcave008", 12, -14],
      ["bcave009", 12, -24, 90],
      ["bcave005", -14, -16],
      ["bcave003", -13, 8],
      ["bcave003", 13, 6],
      ["bcave007", -12, -4],
      ["bcave006", 2, -28],
      ["bcave001", -6, -12],
      ["bcave001", 8, -8],
      ["bcave012", 14, -28],
      ["bband007", -12, -30, 30],
      ["bcave013", 0, 8],
    ].map(([id, x, z, yaw = 0]) => put(id, x, z, { y: -24, yaw })),
  ],
});

// --- the crypt: a mausoleum in a paved graveyard, stairs down to the tombs ---
const yard = rect(-2, -2, 5, 6);
const tomb = rect(-1, -2, 3, 3);
const cryptWell = ["-1,0", "-1,-1"];
const CRYPT = structure({
  id: "bstru016",
  name: "crypt",
  tags: ["crypt", "grave", "undead", "dungeon"],
  palette: [color(STONE, "stone"), color(SLATE, "roof"), color("#7a766e", "paving")],
  materials: { stone: stone(0), roof: shingles(1), paving: stone(2) },
  floor: "paving",
  foundation: { kind: "plinth", material: "stone" },
  storeys: [storey(-1, yard, walls(outline(yard), "stone")), storey(0, minus(yard, cryptWell), open(walls(outline(tomb), "stone"), ["0,1,n"], DOOR))],
  components: [stairs(-1, [-1, 0], 0, 2, 1, "stone"), railing(0, ["0,-1,w", "0,0,w"], "stone"), gable(0, [-1, -2], [3, 3], "z", "roof", 0.9)],
  objects: [
    put("bruin005", 6, 4, { y: -10 }),
    put("bruin005", 6, -4, { y: -10 }),
    put("bruin005", -4, 11, { y: -10, yaw: 90 }),
    put("bcave001", 10, -6, { y: -10 }),
    put("bcave001", 10, 13, { y: -10 }),
    put("bcave006", 4, 12, { y: -10 }),
    put("bques007", 0, -6, { y: -10, scale: 0.6 }),
    put("bruin001", -6, 8),
    put("bruin002", -2, 13),
    put("bruin003", 4, 9),
    put("bruin001", 9, 13),
    put("bruin004", 9, 7),
    put("bruin009", 10, -4),
  ],
});

export const WILDS_STRUCTURES = { id: "wilds", name: "wilds", structures: [HIDEOUT, WORKSHOP, MINE, SMALL_CAVE, LARGE_CAVE, CRYPT] };
