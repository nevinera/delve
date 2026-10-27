import { box, color, cone, crate, object, post, rod, sign, sphere, tiled, wheel } from "./pieces.js";

// Goblin works: scrap, gears, drums, pipes, smokestacks, scaffolds, explosives and contraptions.

const RUST = "#8a5a3a";
const METAL = "#6a6e72";
const DARK = "#3a3c40";
const BRASS = "#c09a40";
const RED = "#b83a2a";
const LIGHT = "#9aff6a";

// A gear `d` across with `teeth` teeth: standing with its axle along z, or lying flat.
const gear = (d, at, c, teeth = 8, thick = 0.4, flat = false) => [
  flat ? post(d, thick, at, c) : wheel(d, thick, at, c),
  ...Array.from({ length: teeth }, (_, k) => {
    const a = (k / teeth) * 360;
    const r = (a * Math.PI) / 180;
    const [dx, dy] = [Math.cos(r) * d * 0.52, Math.sin(r) * d * 0.52];
    return flat ? box([d * 0.16, thick, d * 0.16], [at[0] + dx, at[1], at[2] - dy], c, [a, 0, 0]) : box([d * 0.16, d * 0.16, thick], [at[0] + dx, at[1] + dy, at[2]], c, [0, 0, a]);
  }),
];

const drum = (x, z, c, y = 0) => [post(2, 3, [x, y + 1.5, z], c), post(2.06, 0.15, [x, y + 0.8, z], 2), post(2.06, 0.15, [x, y + 2.2, z], 2), post(0.4, 0.15, [x + 0.5, y + 3.05, z], 2)];

export const GOBLIN = {
  id: "goblin",
  name: "goblin works",
  objects: [
    object("bgobl001", "scrap pile", ["scrap"], [color(RUST, "rust"), color(METAL, "metal"), color(DARK)], [
      box([3, 1, 2], [0, 0.4, 0], 0, [20, 10, 5]),
      box([2, 2, 0.2], [0.8, 1, 0.8], 1, [40, 20, 0]),
      wheel(2, 0.3, [-1.4, 1, 0.6], 1),
      rod(0.3, 4, [0, 1.2, -0.4], 2, 30, 15),
      rod(0.3, 3, [0.6, 0.8, 1.2], 0, -50, 5),
      sphere([2.4, 1.4, 2], [-0.6, 0.5, -1], 0),
      box([1.2, 1, 1], [1.8, 0.5, -0.8], 2, [15, 0, 0]),
      cone([1, 1.6, 1], [-2.2, 0.8, -0.4], 1, [0, 0, 30]),
    ]),
    object("bgobl002", "big gear", ["machine", "scrap"], [color(BRASS, "metal")], [...gear(6, [0, 3.6, 0], 0, 10, 0.6), box([1, 0.6, 1.6], [0, 0.3, 0], 0)]),
    object("bgobl003", "gear heap", ["scrap", "machine"], [color(BRASS, "brass"), color(RUST, "rust")], [
      ...gear(3, [0, 0.2, 0], 0, 8, 0.4, true),
      ...gear(2.2, [0.6, 0.6, 0.5], 1, 6, 0.4, true),
      wheel(1.4, 0.3, [-1.4, 0.8, 0.8], 0),
    ]),
    object("bgobl004", "crude machine", ["machine"], [color(RUST, "body"), color(BRASS, "brass"), color(METAL), color(LIGHT, "lights")], [
      tiled(box([6, 4, 4], [0, 2.2, 0], 0), "planks", 1.2),
      post(1, 6, [1.8, 6.5, -0.8], 2, { taper: 0.8 }),
      cone([1.6, 0.8, 1.6], [1.8, 9.8, -0.8], 2, [0, 180, 0]),
      ...gear(3, [-1.4, 3.4, 2.1], 1, 8, 0.3),
      rod(0.4, 3, [-3.4, 1.5, 0], 2, 0, 30),
      sphere([0.5, 0.5, 0.5], [2.5, 3.4, 2.05], 3),
      sphere([0.5, 0.5, 0.5], [1.7, 3.4, 2.05], 3),
      box([1, 0.5, 0.6], [-2.6, 4.4, -1], 2),
    ]),
    object("bgobl005", "oil drum", ["container"], [color(RED, "paint"), color(METAL), color(DARK)], drum(0, 0, 0)),
    object("bgobl006", "oil drums", ["container"], [color(RED, "paint"), color("#3a6a8a", "other paint"), color(DARK)], [...drum(-1.1, 0, 0), ...drum(1.1, 0.2, 1), ...drum(0, -1.8, 0)]),
    object("bgobl007", "smokestack", ["machine"], [color(DARK, "iron"), color(RUST, "bands")], [
      tiled(box([3, 2, 3], [0, 1, 0], 1), "brick", 1),
      post(2, 22, [0, 13, 0], 0, { taper: 0.8 }),
      post(2.1, 0.4, [0, 8, 0], 1),
      post(1.9, 0.4, [0, 15, 0], 1),
      post(2.2, 0.8, [0, 24.2, 0], 0),
    ]),
    object("bgobl008", "pipes", ["machine"], [color(METAL, "pipes"), color(BRASS, "joints")], [
      rod(0.8, 8, [0, 0.4, 0], 0),
      sphere([1, 1, 1], [4, 0.5, 0], 1),
      post(0.8, 5, [4, 3, 0], 0),
      sphere([1, 1, 1], [4, 5.5, 0], 1),
      rod(0.8, 4, [2, 5.5, 0], 0),
      wheel(1.4, 0.3, [-1, 0.4, 0], 1),
      rod(0.6, 3, [-2, 0.3, 1.6], 0, 90),
      box([0.6, 0.8, 0.3], [4, 3, 0.5], 1),
    ]),
    object("bgobl009", "shack wall", ["building"], [color(RUST, "rust"), color(METAL, "metal"), color("#7a5e40", "wood")], [
      box([0.5, 8, 0.5], [-4, 4, 0], 2),
      box([0.5, 8, 0.5], [4, 4, 0], 2),
      tiled(box([4.2, 4, 0.15], [-1.9, 2.2, 0], 0), "planks", 0.6),
      tiled(box([4, 4.4, 0.15], [2, 2.4, 0.1], 1), "planks", 0.6),
      tiled(box([5, 3.6, 0.15], [-0.8, 5.8, -0.05], 1, [0, 0, 4]), "planks", 0.6),
      box([3, 3, 0.15], [2.5, 6.2, 0.06], 0, [0, 0, -6]),
    ]),
    object("bgobl010", "scaffold", ["building"], [color("#7a5e40", "wood")], [
      ...[[-4, -1.5], [4, -1.5], [-4, 1.5], [4, 1.5]].map(([x, z]) => box([0.4, 12, 0.4], [x, 6, z], 0)),
      tiled(box([8.8, 0.3, 3.4], [0, 5.5, 0], 0), "planks", 1.5),
      tiled(box([8.8, 0.3, 3.4], [0, 11, 0], 0), "planks", 1.5),
      box([10, 0.3, 0.3], [0, 3, -1.5], 0, [0, 0, 32]),
      box([10, 0.3, 0.3], [0, 8.5, 1.5], 0, [0, 0, -32]),
      box([8.8, 0.25, 0.25], [0, 6.6, 1.6], 0),
    ]),
    object("bgobl011", "explosives crate", ["container", "explosive"], [color("#9a7a50", "wood"), color("#4e3a28"), color(RED, "sticks")], [
      ...crate(0, 0, 0, 2.6, 0, 1),
      sign(box([2, 0.8, 0.1], [0, 1.3, 1.33], 1), "label", "BOOM", [1.6, 0.5], "0,0,1", "0"),
      ...[-0.6, -0.2, 0.2, 0.6].map((x) => post(0.35, 1.6, [x, 3.1, 0], 2)),
      post(0.08 + 0.04, 0.6, [0.6, 4.2, 0], 1),
    ]),
    object("bgobl012", "contraption", ["machine"], [color(BRASS, "brass"), color(RUST, "body"), color(LIGHT, "light")], [
      wheel(4, 0.4, [-2, 2, 0], 1),
      wheel(4, 0.4, [-2, 2, 2.4], 1),
      box([4, 1.6, 2.4], [0, 2.4, 1.2], 1),
      cone([2.6, 3, 2.6], [1, 5, 1.2], 0, [0, 180, 0]),
      post(0.4, 2, [1, 3.3, 1.2], 0),
      ...[0, 1, 2, 3].map((n) => post(0.8, 0.2, [-1.2, 3.4 + n * 0.35, 1.2], 0)),
      sphere([0.8, 0.8, 0.8], [-1.2, 4.9, 1.2], 2),
      rod(0.25, 3, [2.8, 2, 1.2], 0, 0, -20),
    ]),
    object("bgobl013", "goblin lamp", ["light"], [color(DARK, "iron"), color(LIGHT, "light"), color(BRASS)], [
      post(0.3, 8, [0, 4, 0], 0),
      rod(0.2, 2, [0.8, 7.8, 0], 0, 0, -20),
      sphere([1.2, 1.4, 1.2], [1.8, 7, 0], 1),
      post(0.8, 0.3, [1.8, 7.8, 0], 2),
      box([1.2, 0.3, 1.2], [0, 0.15, 0], 0),
    ]),
  ],
};
