import { DOOR, boards, color, flat, open, outline, put, railing, rect, stairs, stone, storey, structure, walls, window_ } from "./build.js";

// Military buildings: a watchtower and a compact keep with a walkable roof.

const STONE = "#8c8a84";
const DARK = "#6e6a62";
const BOARDS = "#9a7a50";
const SLIT = window_(4, 7);

// --- the watchtower: two walled storeys and an open top, stairs turning inside ---
const towerCells = rect(-1, -1, 3, 4);
const wellA = ["-1,1", "-1,0"];
const wellB = ["0,0", "0,1"];
const WATCHTOWER = structure({
  id: "bstru009",
  name: "watchtower",
  tags: ["tower", "military", "lookout"],
  palette: [color(STONE, "stone"), color(DARK, "trim"), color(BOARDS, "floors")],
  materials: { stone: stone(0, 1.25), trim: stone(1, 1), boards: boards(2) },
  floor: "boards",
  foundation: { kind: "plinth", material: "trim" },
  storeys: [
    storey(0, towerCells, open(open(walls(outline(towerCells), "stone"), ["0,3,n"], DOOR), ["2,0,w"], SLIT)),
    storey(1, towerCells.filter((k) => !wellA.includes(k)), open(walls(outline(towerCells), "stone"), ["-1,-1,n", "1,-1,n", "1,3,n", "2,1,w"], SLIT)),
    storey(2, towerCells.filter((k) => !wellB.includes(k))),
  ],
  components: [
    stairs(0, [-1, 1], 0, 2, 1, "boards"),
    railing(1, ["0,0,w", "0,1,w", "-1,2,n"], "boards"),
    stairs(1, [0, 0], 2, 2, 1, "boards"),
    railing(2, [...outline(towerCells), "0,0,w", "0,1,w", "1,0,w", "1,1,w", "0,0,n"], "trim"),
  ],
  objects: [put("bvill003", 6, 10), put("bvill001", 6, 1), put("bfort008", 6, -2), put("bfort002", 6, 2, { y: 20 }), put("bfort001", -2, -2, { y: 20, scale: 0.6 })],
});

// --- the keep: two storeys and a battlemented roof ---
const keepCells = rect(-3, -3, 6, 6);
const keepWellA = ["-3,1", "-3,0", "-3,-1"];
const battlements = [
  ...[-8, 0, 8].flatMap((x) => [put("bfort012", x, -11, { y: 20 }), put("bfort012", x, 11, { y: 20, yaw: 180 })]),
  ...[-4, 4].map((z) => put("bfort012", -11, z, { y: 20, yaw: 90 })),
  // None on the east side, where the roof stairs come up.
];
const KEEP = structure({
  id: "bstru010",
  name: "keep",
  tags: ["fort", "military", "castle"],
  palette: [color(STONE, "stone"), color(DARK, "trim"), color(BOARDS, "floors")],
  materials: { stone: stone(0, 2), trim: stone(1, 1), boards: boards(2) },
  floor: "boards",
  foundation: { kind: "plinth", material: "trim" },
  storeys: [
    storey(0, keepCells, open(open(walls(outline(keepCells), "stone"), ["-1,3,n", "0,3,n"], { ...DOOR, top: 9 }), ["-3,-2,w", "3,1,w", "-2,-3,n", "1,-3,n"], SLIT)),
    storey(1, keepCells.filter((k) => !keepWellA.includes(k)), open(walls(outline(keepCells), "stone"), ["-3,-2,w", "3,1,w", "-2,-3,n", "1,-3,n", "-2,3,n", "1,3,n"], SLIT)),
    storey(2, []),
  ],
  components: [
    stairs(0, [-3, 1], 0, 3, 1, "boards"),
    railing(1, ["-2,-1,w", "-2,0,w", "-2,1,w", "-3,2,n"], "boards"),
    stairs(1, [2, -2], 2, 3, 1, "boards"),
    flat(1, [-3, -3], [5, 6], "trim"),
    flat(1, [2, -3], [1, 1], "trim"),
    flat(1, [2, 1], [1, 2], "trim"),
    railing(2, ["2,-2,w", "2,-1,w", "2,0,w", "2,-2,n"], "trim"),
  ],
  objects: [
    put("bfort009", 0, -10.2),
    put("bfort014", 7, -7),
    put("bfort008", 8, 4),
    put("bfort004", -4, -6),
    put("bfort002", 3, 1),
    put("bhome002", -4, 7.6, { y: 10 }),
    put("bhome002", -0.5, 7.6, { y: 10 }),
    put("bhome002", 3, 7.6, { y: 10 }),
    put("bhome002", 6.5, 7.6, { y: 10 }),
    put("bvill009", 1, -6, { y: 10 }),
    put("bhome003", -6, 1, { y: 10 }),
    ...battlements,
    put("bfort001", -8, 7, { y: 20 }),
    put("bfort002", 0, 0, { y: 20 }),
  ],
});

export const MILITARY_STRUCTURES = { id: "military", name: "military", structures: [WATCHTOWER, KEEP] };
