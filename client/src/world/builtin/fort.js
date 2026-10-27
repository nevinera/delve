import { box, color, cone, crate, cut, fire, object, post, rod, sack, sphere, tiled, wedge, wheel } from "./pieces.js";

// Fortress and military props: banners, braziers, targets, dummies, siege engines, a portcullis,
// battlements and watchfires.

const WOOD = "#7a5e40";
const DARK_WOOD = "#4e3a28";
const IRON = "#4a4c50";
const STONE = "#8c8a84";
const FLAME = "#f08a24";
const CORE = "#ffe08a";
const GOLD = "#d8b048";
const BLUE = "#2a4a8a";

export const FORT = {
  id: "fort",
  name: "fortress",
  objects: [
    object("bfort001", "banner pole", ["banner"], [color(BLUE, "banner"), color(GOLD, "trim"), color(DARK_WOOD, "pole")], [
      post(0.4, 16, [0, 8, 0], 2),
      rod(0.25, 4.4, [0, 15, 0], 2),
      box([4, 7, 0.1], [0, 11.3, 0.25], 0),
      box([4.1, 0.4, 0.12], [0, 14.6, 0.25], 1),
      wedge([4, 1.2, 0.1], [0, 7.2, 0.25], 0, [0, 180, 0]),
      box([1.4, 1.4, 0.12], [0, 11.6, 0.26], 1, [0, 0, 45]),
      sphere([0.7, 0.7, 0.7], [0, 16.3, 0], 1),
    ]),
    object("bfort002", "brazier", ["fire", "light"], [color(IRON, "iron"), color(FLAME, "flame"), color(CORE)], [
      ...[0, 120, 240].map((a) => {
        const r = (a * Math.PI) / 180;
        return { ...post(0.2, 3.6, [Math.cos(r) * 0.8, 1.7, -Math.sin(r) * 0.8], 0), turn: [a, 0, -12] };
      }),
      sphere([2.6, 1.4, 2.6], [0, 3.6, 0], 0),
      cut(post(2.6, 1, [0, 4.4, 0], 0)),
      cone([1.8, 2.2, 1.8], [0, 4.9, 0], 1),
      cone([1, 1.6, 1], [0, 4.6, 0], 2),
    ]),
    object("bfort003", "archery target", ["training"], [color("#e8e0cc", "face"), color("#b83a2a", "rings"), color(WOOD, "stand"), color(GOLD)], [
      { ...wheel(4, 0.6, [0, 3.2, 0], 0), turn: [0, 75, 0] },
      { ...wheel(3, 0.62, [0, 3.2, 0], 1), turn: [0, 75, 0] },
      { ...wheel(2, 0.64, [0, 3.2, 0], 0), turn: [0, 75, 0] },
      { ...wheel(1, 0.66, [0, 3.2, 0], 3), turn: [0, 75, 0] },
      box([0.3, 5, 0.3], [-1.4, 2.4, -0.4], 2, [0, -15, 0]),
      box([0.3, 5, 0.3], [1.4, 2.4, -0.4], 2, [0, -15, 0]),
      box([0.3, 4.6, 0.3], [0, 2.1, -1.5], 2, [0, 30, 0]),
    ]),
    object("bfort004", "training dummy", ["training"], [color("#c4ae86", "sacking"), color(WOOD, "post")], [
      post(0.4, 7, [0, 3.5, 0], 1),
      box([1.6, 0.3, 1.6], [0, 0.15, 0], 1),
      post(1.6, 2.6, [0, 4.5, 0], 0, { taper: 0.8 }),
      rod(0.5, 3.6, [0, 5.2, 0], 0),
      sphere([1.1, 1.2, 1.1], [0, 6.6, 0], 0),
      post(1.7, 0.25, [0, 3.4, 0], 1),
    ]),
    object("bfort005", "cannon", ["siege", "weapons"], [color(IRON, "barrel"), color(WOOD, "carriage"), color(DARK_WOOD)], [
      { type: "cylinder", size: [1.6, 7, 1.6], at: [0.8, 2.8, 0], turn: [0, 0, -84], color: 0, taper: 0.75 },
      sphere([1.6, 1.6, 1.6], [-2.6, 2.45, 0], 0),
      cut(rod(0.7, 1, [4.3, 3.1, 0], 0, 0, 6)),
      box([5, 1.2, 0.4], [-0.6, 1.8, -1], 1),
      box([5, 1.2, 0.4], [-0.6, 1.8, 1], 1),
      wheel(2.6, 0.3, [0.6, 1.3, -1.4], 2),
      wheel(2.6, 0.3, [0.6, 1.3, 1.4], 2),
      box([2, 0.5, 2.4], [-2.8, 0.25, 0], 1),
    ]),
    object("bfort006", "ballista", ["siege", "weapons"], [color(WOOD, "wood"), color(IRON, "iron"), color("#d8d0b8", "string")], [
      box([2, 1, 2], [0, 0.5, 0], 0),
      post(0.6, 2, [0, 2, 0], 0),
      box([6, 0.6, 0.8], [0, 3.2, 0], 0, [0, 0, 8]),
      box([0.4, 0.4, 7], [2.2, 3.6, 0], 0),
      box([0.4, 0.4, 2.2], [3.2, 3.7, -2.8], 0, [-35, 0, 0]),
      box([0.4, 0.4, 2.2], [3.2, 3.7, 2.8], 0, [35, 0, 0]),
      box([0.1, 0.1, 6.4], [-1.6, 3.4, 0], 2, [0, 0, 0]),
      rod(0.2, 6, [0.6, 3.75, 0], 1, 0, 8),
      cone([0.5, 1, 0.3], [3.9, 4.25, 0], 1, [0, 0, -82]),
    ]),
    object("bfort007", "cannonball pile", ["siege"], [color(IRON, "iron")], [
      ...[[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]].map(([x, z]) => sphere([1.2, 1.2, 1.2], [x, 0.6, z], 0)),
      sphere([1.2, 1.2, 1.2], [0, 1.45, 0], 0),
    ]),
    object("bfort008", "arrow barrel", ["weapons"], [color(WOOD, "wood"), color(IRON, "hoops"), color("#e8e0cc", "fletching")], [
      tiled(post(1.6, 2.6, [0, 1.3, 0], 0), "planks", 0.6),
      post(1.66, 0.15, [0, 0.5, 0], 1),
      post(1.66, 0.15, [0, 2.2, 0], 1),
      ...[[0, 0, 0], [0.4, 0.2, 8], [-0.4, 0.1, -8], [0.2, -0.4, 10], [-0.2, 0.4, -6], [0.35, -0.3, 5]].flatMap(([x, z, lean]) => [
        { ...post(0.08 + 0.04, 3.4, [x, 3, z], 0), turn: [0, lean, 0] },
        { ...cone([0.35, 0.6, 0.1], [x, 4.6, z + lean * 0.02], 2), turn: [0, lean, 0] },
      ]),
    ]),
    object("bfort009", "weapon rack", ["weapons"], [color(WOOD, "wood"), color(IRON, "blades"), color(BLUE, "shields")], [
      box([6, 0.4, 1.2], [0, 0.2, 0], 0),
      box([0.4, 5, 0.4], [-2.8, 2.5, 0], 0),
      box([0.4, 5, 0.4], [2.8, 2.5, 0], 0),
      box([6, 0.3, 0.6], [0, 3.6, 0], 0),
      ...[-2, -1, 0, 1, 2].flatMap((x) => [box([0.3, 3.6, 0.1], [x, 2.6, 0.3], 1), box([1, 0.2, 0.25], [x, 4.4, 0.3], 0), box([0.2, 0.7, 0.2], [x, 4.85, 0.3], 0)]),
      { ...wheel(2.6, 0.2, [-1.4, 1.5, 0.9], 2), turn: [0, 75, 0] },
      { ...wheel(2.6, 0.2, [1.4, 1.5, 0.9], 2), turn: [0, 75, 0] },
    ]),
    object("bfort010", "sack wall", ["barrier", "defence"], [color("#a89878", "sacks")], [
      ...[-3, -1.5, 0, 1.5, 3].flatMap((x) => sack(x, 0, 0, 0.8, 0, 90).slice(0, 1)),
      ...[-2.25, -0.75, 0.75, 2.25].flatMap((x) => sack(x, 0, 0, 0.8, 1.1, 90).slice(0, 1)),
      ...[-1.5, 0, 1.5].flatMap((x) => sack(x, 0, 0, 0.8, 2.2, 90).slice(0, 1)),
    ]),
    object("bfort011", "portcullis", ["gate", "defence"], [color(IRON, "iron")], [
      ...[-3.5, -2.1, -0.7, 0.7, 2.1, 3.5].flatMap((x) => [box([0.35, 10, 0.35], [x, 6, 0], 0), cone([0.35, 1, 0.35], [x, 0.5, 0], 0, [0, 180, 0])]),
      ...[2.5, 5, 7.5, 10].map((y) => box([7.6, 0.35, 0.3], [0, y, 0.1], 0)),
    ]),
    object("bfort012", "battlement", ["wall", "defence"], [color(STONE, "stone")], [
      tiled(box([8, 2, 2], [0, 1, 0], 0), "stone", 2),
      tiled(box([2.6, 2.4, 2], [-2.7, 3.2, 0], 0), "stone", 2),
      tiled(box([2.6, 2.4, 2], [2.7, 3.2, 0], 0), "stone", 2),
    ]),
    object("bfort013", "watchfire", ["fire", "light", "lookout"], [color(STONE, "stone"), color(DARK_WOOD), color(FLAME, "flame"), color(CORE)], [
      tiled(post(4, 4, [0, 2, 0], 0, { taper: 0.85 }), "stone", 1.5),
      post(3.8, 0.4, [0, 4.2, 0], 0),
      ...fire(0, 0, 1, 2, 3, 1.3).map((p) => ({ ...p, at: [p.at[0], p.at[1] + 4.4, p.at[2]] })),
    ]),
    object("bfort014", "supply crates", ["container", "military"], [color("#9a7a50", "wood"), color(DARK_WOOD, "bands"), color(BLUE, "marks")], [
      ...crate(-1.4, 0, 0, 2.6, 0, 1),
      ...crate(1.4, 0, 0, 2.6, 0, 1),
      ...crate(0, 2.6, 0, 2.6, 0, 1, 8),
      box([1.2, 1.2, 0.1], [-1.4, 1.3, 1.32], 2, [0, 0, 45]),
      box([1.2, 1.2, 0.1], [1.4, 1.3, 1.32], 2, [0, 0, 45]),
    ]),
  ],
};
