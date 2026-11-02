import { box, color, cone, crate, object, post, pyramid, rod, sphere, throughZ, tiled, wheel, withCuts } from "./pieces.js";

// Props for caves, in three collections: mines (carts, rails, timbering, lanterns, crates, tools,
// spoil heaps), natural caves (stone spikes and columns, crystals, fungi, roots, loose rock) and
// dens (kobold and troglodyte candles, totems, bones, nests, bedding). The ones that hang, such as
// stalactites and roots, stand on their tops, for hanging from a cave's ceiling.

const STONE = "#7a746c";
const WAX = "#efe6c8";
const CORE = "#ffe08a";
const WOOD = "#6a5038";
const IRON = "#4a4c50";
const BONE = "#e0d8c0";

const candle = (x, z, h) => [post(0.35, h, [x, h / 2, z], 0), cone([0.18, 0.35, 0.18], [x, h + 0.2, z], 1)];
const spike = (x, z, d, h, c, down = false) => cone([d, h, d], [x, down ? 30 - h / 2 : h / 2, z], c, down ? [0, 180, 0] : [0, 0, 0]);
const shroom = (x, z, h, d) => [post(d * 0.25, h, [x, h / 2, z], 0), sphere([d, d * 0.45, d], [x, h, z], 1)];
// A stone spike hanging from `top`, `h` long.
const hanging = (x, z, d, h, top, c) => cone([d, h, d], [x, top - h / 2, z], c, [0, 180, 0]);
const EARTH = "#6a5a48";
const CRYSTAL = "#9a7ae0";

const objects = [
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
    object("bcave015", "mine lantern", ["mine", "light"], [color(WOOD, "wood"), color(IRON, "iron"), color(CORE, "flame")], [
    post(0.6, 7, [0, 3.5, 0], 0),
    box([2, 0.4, 0.4], [0.8, 6.8, 0], 0),
    rod(0.1, 0.8, [1.6, 6.3, 0], 1, 0, 90),
    box([0.8, 1, 0.8], [1.6, 5.4, 0], 1),
    box([0.6, 0.7, 0.6], [1.6, 5.4, 0], 2),
    cone([0.9, 0.4, 0.9], [1.6, 6.05, 0], 1),
  ]),
  object("bcave016", "crate stack", ["mine", "crate"], [color(WOOD, "wood"), color(IRON, "bands")], [
    ...crate(-1.1, 0, 0, 2, 0, 1),
    ...crate(1.1, 0, 0.2, 2, 0, 1, 15),
    ...crate(0, 2, 0.1, 1.8, 0, 1, -10),
  ]),
  object("bcave017", "spoil heap", ["mine", "rock"], [color(EARTH, "earth"), color(STONE, "rock")], [
    sphere([7, 3, 6], [0, 0.6, 0], 0),
    sphere([4, 2.4, 4], [1, 1.6, 0.4], 0),
    sphere([1.2, 0.9, 1], [-2.2, 0.6, 1.8], 1),
    sphere([1, 0.8, 1], [2.4, 0.5, -1.6], 1),
    sphere([0.8, 0.6, 0.8], [0.4, 2.8, 0], 1),
  ]),
  object("bcave018", "shovel and pick", ["mine", "tool"], [color(WOOD, "handle"), color(IRON, "head")], [
    { ...post(0.2, 4.4, [0, 2.2, 0], 0), turn: [0, 0, 18] },
    box([0.9, 1.2, 0.1], [-0.75, 0.4, 0], 1, [0, 0, 18]),
    { ...post(0.2, 3.4, [1.2, 1.7, 0.4], 0), turn: [0, 0, -15] },
    { type: "cylinder", size: [0.3, 2, 0.3], at: [1.65, 3.3, 0.4], turn: [0, 0, 75], color: 1, taper: 0.3 },
  ]),
  object("bcave019", "timber prop", ["mine"], [color(WOOD, "wood")], [
    post(0.9, 8, [0, 4, 0], 0),
    tiled(box([3, 0.6, 1], [0, 8.3, 0], 0), "planks", 1.5),
    box([1.4, 0.4, 1.2], [0, 0.2, 0], 0),
  ]),
  object("bcave020", "stalactites", ["rock", "cave", "hanging"], [color(STONE, "stone")], [
    sphere([4, 1.2, 3.6], [0, 8, 0], 0),
    hanging(0, 0, 1.6, 6, 8, 0),
    hanging(1.2, 0.6, 1.1, 4, 8, 0),
    hanging(-1, 0.8, 0.9, 3, 8, 0),
    hanging(0.4, -1.1, 0.8, 2.5, 8, 0),
    hanging(-0.8, -0.6, 0.6, 1.8, 8, 0),
  ]),
  object("bcave021", "crystal cluster", ["rock", "cave", "crystal"], [color(CRYSTAL, "crystal"), color(STONE, "rock")], [
    sphere([2.6, 0.8, 2.4], [0, 0.2, 0], 1),
    pyramid([0.8, 3.2, 0.8], [0, 1.6, 0], 0),
    pyramid([0.6, 2.4, 0.6], [0.6, 1.1, 0.3], 0, [0, 0, -20]),
    pyramid([0.6, 2, 0.6], [-0.6, 1, 0.2], 0, [0, 30, 22]),
    pyramid([0.5, 1.6, 0.5], [0.2, 0.8, -0.6], 0, [-25, 0, 0]),
    pyramid([0.4, 1.2, 0.4], [-0.3, 0.6, 0.7], 0, [25, 0, 10]),
  ]),
  object("bcave022", "hanging roots", ["cave", "roots", "hanging"], [color("#5a4430", "roots"), color(EARTH, "earth")], [
    sphere([3, 0.8, 2.6], [0, 7, 0], 1),
    post(0.35, 5, [0, 4.5, 0], 0, { taper: 0.2 }),
    post(0.3, 3.6, [0.8, 5.2, 0.3], 0, { taper: 0.2 }),
    post(0.25, 4.2, [-0.7, 4.9, 0.5], 0, { taper: 0.2 }),
    post(0.2, 2.6, [0.3, 5.7, -0.8], 0, { taper: 0.2 }),
    post(0.2, 3, [-0.4, 5.5, -0.5], 0, { taper: 0.2 }),
  ]),
  object("bcave023", "loose rocks", ["rock", "cave"], [color(STONE, "stone")], [
    sphere([1.4, 0.9, 1.2], [0, 0.35, 0], 0, [20, 0, 0]),
    sphere([0.9, 0.6, 0.8], [1.3, 0.25, 0.7], 0),
    sphere([0.7, 0.5, 0.7], [-1.1, 0.2, 0.9], 0, [50, 0, 0]),
    sphere([0.6, 0.4, 0.5], [0.4, 0.15, -1.2], 0),
    sphere([0.5, 0.35, 0.5], [-0.8, 0.15, -0.7], 0),
  ]),
  object("bcave024", "flowstone", ["rock", "cave"], [color("#a89a84", "flowstone")], [
    sphere([5, 1.6, 4.4], [0, 0.4, 0], 0),
    sphere([3.8, 1.4, 3.4], [0.2, 1.3, 0.1], 0),
    sphere([2.6, 1.2, 2.4], [0.3, 2.1, 0.2], 0),
    sphere([1.4, 1, 1.3], [0.4, 2.8, 0.2], 0),
  ]),
  object("bcave025", "nest", ["den", "nest"], [color("#7a6040", "sticks"), color("#e8e0cc", "eggs")], [
    ...[0, 30, 60, 90, 120, 150].map((yaw) => rod(0.25, 3.6, [0, 0.35, 0], 0, yaw, 5)),
    post(3.2, 0.5, [0, 0.25, 0], 0),
    sphere([0.6, 0.8, 0.6], [0, 0.6, 0], 1),
    sphere([0.6, 0.8, 0.6], [0.5, 0.55, 0.3], 1, [0, 0, 20]),
    sphere([0.6, 0.8, 0.6], [-0.4, 0.55, 0.4], 1, [0, 0, -20]),
  ]),
  object("bcave026", "hide bedding", ["den", "kobold", "troglodyte"], [color("#8a6a4a", "hides"), color("#b09070", "fur")], [
    box([5, 0.3, 3.4], [0, 0.15, 0], 0, [8, 0, 0]),
    box([4, 0.3, 3], [0.4, 0.4, 0.2], 1, [-12, 0, 0]),
    sphere([1.6, 0.7, 1], [-1.6, 0.8, 0], 1),
  ]),
  object("bcave027", "gnawed scraps", ["den", "bones"], [color(BONE, "bone"), color("#7a3a2a", "scraps")], [
    rod(0.25, 1.8, [0, 0.15, 0], 0, 30),
    rod(0.2, 1.4, [0.8, 0.12, 0.6], 0, 110),
    sphere([0.7, 0.6, 0.8], [-0.7, 0.3, 0.5], 0),
    sphere([0.9, 0.4, 0.7], [0.5, 0.2, -0.7], 1),
    sphere([0.5, 0.3, 0.4], [-0.4, 0.15, -0.6], 1),
  ]),
];

const pick = (...ids) => ids.map((n) => objects.find((o) => o.id === `bcave0${n}`));

export const MINES = { id: "mines", name: "mines", objects: pick(..."08 09 10 11 12 15 16 17 18 19".split(" ")) };
export const NATURAL_CAVES = { id: "natural", name: "natural caves", objects: pick(..."03 04 07 13 20 21 22 23 24".split(" ")) };
export const DENS = { id: "dens", name: "cave dens", objects: pick(..."01 02 05 06 14 25 26 27".split(" ")) };
