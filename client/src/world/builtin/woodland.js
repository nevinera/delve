import { box, color, cone, cut, object, post, rod, sphere, tiled } from "./pieces.js";

// Woodland props: mushrooms, ferns, flowers, berries, reeds, lily pads, branches, dens, bones and
// webs.

const STEM = "#e8e0c8";
const LEAF = "#4f7f30";
const DARK_LEAF = "#3a6028";
const BARK = "#5a4430";
const BONE = "#e0d8c0";
const STONE = "#7c7a74";
const EARTH = "#5a4430";

const toadstool = (x, z, h, d, cap = 1) => [post(d * 0.3, h, [x, h / 2, z], 0), sphere([d, d * 0.5, d], [x, h, z], cap)];

// A frond `long` ft out from (x, z) toward yaw degrees, tipped up `tip`.
const frond = (x, z, long, yaw, tip, c, wide = 0.6) => {
  const r = (yaw * Math.PI) / 180;
  const half = (long / 2) * Math.cos((tip * Math.PI) / 180);
  return sphere([long, 0.15, wide], [x + Math.cos(r) * half, 0.3 + (long / 2) * Math.sin((tip * Math.PI) / 180), z - Math.sin(r) * half], c, [yaw, 0, tip]);
};

export const WOODLAND = {
  id: "woodland",
  name: "woodland",
  objects: [
    object("bwood001", "mushroom ring", ["mushroom", "fairy"], [color(STEM, "stems"), color("#b84a3a", "caps")], Array.from({ length: 9 }, (_, k) => {
      const a = (k / 9) * Math.PI * 2;
      return toadstool(Math.cos(a) * 3, Math.sin(a) * 3, 0.5 + (k % 3) * 0.2, 0.6 + (k % 2) * 0.2);
    }).flat()),
    object("bwood002", "toadstool", ["mushroom"], [color(STEM, "stem"), color("#c83a2a", "cap"), color("#f0ece0", "spots")], [
      ...toadstool(0, 0, 2.6, 3),
      ...[[0.8, 0.3], [-0.6, 0.7], [0.1, -0.9], [-0.8, -0.4], [0.5, 0.9]].map(([x, z]) => sphere([0.35, 0.2, 0.35], [x, 3.25 - Math.hypot(x, z) * 0.25, z], 2)),
    ]),
    object("bwood003", "fern", ["plant"], [color(LEAF, "leaves")], Array.from({ length: 8 }, (_, k) => frond(0, 0, 2.8 - (k % 2) * 0.6, k * 45 + 10, 30 + (k % 3) * 8, 0))),
    object("bwood004", "wildflowers", ["plant", "flowers"], [color("#e8d040", "flowers"), color("#a060c0", "other flowers"), color("#e8e8f0", "third flowers"), color(LEAF)], [
      sphere([3.6, 0.5, 3], [0, 0.15, 0], 3),
      ...[[0.8, 0.4, 0], [-0.9, 0.2, 1], [0.2, -1, 2], [-0.3, 0.9, 0], [1.2, -0.6, 1], [-1.3, -0.5, 2], [0.4, 1.1, 1], [-0.6, -1.1, 0]].flatMap(([x, z, c], n) => [
        post(0.1, 1 + (n % 3) * 0.3, [x, 0.5 + (n % 3) * 0.15, z], 3),
        sphere([0.35, 0.25, 0.35], [x, 1 + (n % 3) * 0.3, z], c),
      ]),
    ]),
    object("bwood005", "berry bush", ["plant", "food"], [color(DARK_LEAF, "leaves"), color("#a02040", "berries")], [
      sphere([3.6, 2.8, 3.2], [0, 1.4, 0], 0),
      sphere([2.4, 2, 2.2], [1.3, 1.2, 0.8], 0),
      sphere([2.2, 1.8, 2], [-1.2, 1, 0.9], 0),
      ...[[1.6, 1.6, 1.1], [-0.5, 2.5, 0.9], [0.4, 2, 1.5], [-1.6, 1.4, 1.5], [1.1, 2.5, -0.6], [-1, 2.2, -1.1], [0.2, 2.8, 0]].map((at) => sphere([0.3, 0.3, 0.3], at, 1)),
    ]),
    object("bwood006", "reeds", ["plant", "water"], [color("#7a9040", "reeds"), color("#6a4a2a", "heads")], [
      ...[[0, 0, 5], [0.5, 0.3, 4.2], [-0.4, 0.4, 4.6], [0.3, -0.5, 3.8], [-0.6, -0.3, 4], [0.9, -0.1, 3.4], [-0.9, 0.6, 3.2]].flatMap(([x, z, h], n) => [
        post(0.12, h, [x, h / 2, z], 0, { taper: 0.5 }),
        ...(n % 2 ? [] : [post(0.25, 0.8, [x, h * 0.8, z], 1)]),
      ]),
    ]),
    object("bwood007", "lily pads", ["plant", "water"], [color("#4f8a3a", "pads"), color("#f0c0d0", "flowers")], [
      post(1.6, 0.1, [0, 0.05, 0], 0),
      post(1.2, 0.1, [1.6, 0.05, 0.6], 0),
      post(1.4, 0.1, [-1.4, 0.05, 0.9], 0),
      post(1, 0.1, [0.5, 0.05, -1.4], 0),
      cone([0.6, 0.4, 0.6], [0.1, 0.3, 0.1], 1),
      cone([0.5, 0.35, 0.5], [-1.3, 0.28, 0.9], 1),
    ]),
    object("bwood008", "fallen branch", ["wood"], [color(BARK, "bark"), color(LEAF, "leaves")], [
      rod(0.6, 9, [0, 0.3, 0], 0, 0, 3),
      rod(0.3, 3.5, [1.5, 0.4, 1.1], 0, -40, 8),
      rod(0.3, 3, [-1.6, 0.35, -0.9], 0, 35, 5),
      rod(0.2, 2.2, [3, 0.4, -0.7], 0, 50, 5),
      sphere([1.6, 0.6, 1.2], [3.6, 0.4, 1.8], 1),
      sphere([1.2, 0.5, 1], [-3, 0.35, -1.6], 1),
    ]),
    object("bwood009", "hollow log", ["wood", "den"], [color(BARK, "bark"), color("#2e241a", "hollow"), color("#5f7f3a", "moss")], [
      tiled(rod(3.6, 12, [0, 1.7, 0], 0), "thatch", 2, 0.2),
      cut(rod(2.6, 13, [0, 1.8, 0], 1)),
      sphere([5, 0.8, 2.4], [-1.5, 3.3, 0], 2),
    ]),
    object("bwood010", "beast bones", ["bones"], [color(BONE, "bone")], [
      rod(0.5, 7, [0, 0.4, 0], 0),
      ...[-1.8, -0.9, 0, 0.9, 1.8].flatMap((x) => [
        { ...rod(0.25, 3, [x, 1.2, -0.9], 0, 90, 0), turn: [90, 0, 90 + 50] },
        { ...rod(0.25, 3, [x, 1.2, 0.9], 0, 90, 0), turn: [90, 0, 90 - 50] },
      ]),
      sphere([1.6, 1, 1.1], [4.2, 0.6, 0], 0),
      cone([0.9, 1, 0.7], [5.1, 0.45, 0], 0, [0, 0, -90]),
      cone([0.3, 1.6, 0.3], [4.4, 1.5, -0.5], 0, [0, -30, 20]),
      cone([0.3, 1.6, 0.3], [4.4, 1.5, 0.5], 0, [0, 30, 20]),
    ]),
    object("bwood011", "animal burrow", ["den"], [color(EARTH, "earth"), color("#1e1a14", "hole")], [
      sphere([6, 2.4, 5], [0, 0.3, 0], 0),
      cut({ ...rod(1.8, 4, [0.6, 0.7, 1.6], 1, 90, 0), turn: [90, 20, 90] }),
    ]),
    object("bwood012", "wolf den", ["den", "rock"], [color(STONE, "stone"), color("#1e1a14", "dark"), color(BONE)], [
      sphere([8, 6, 6], [-3.5, 2.5, 0], 0),
      sphere([7, 5, 6], [3.5, 2, 0.5], 0),
      sphere([9, 3, 7], [0, 5, -0.5], 0),
      box([4, 4, 0.2], [0, 2, 2.4], 1),
      sphere([3, 1.6, 2.4], [-5.5, 0.6, 3], 0),
      rod(0.25, 2, [1.5, 0.15, 4], 2, 30),
      rod(0.25, 1.6, [2, 0.15, 3.6], 2, -40),
      sphere([0.6, 0.5, 0.7], [-1.4, 0.25, 4.2], 2),
    ]),
    object("bwood013", "spider web", ["spider", "web"], [color("#e8e8ec", "silk"), color(BARK, "posts")], [
      box([0.5, 10, 0.5], [-4.2, 5, 0], 1),
      box([0.5, 10, 0.5], [4.2, 5, 0], 1),
      ...[0, 30, 60, 90, 120, 150].map((a) => box([0.1, 8, 0.1], [0, 5.5, 0], 0, [0, 0, a])),
      ...[1.2, 2.4, 3.6].flatMap((r) => [0, 60, 120, 180, 240, 300].map((a) => {
        const t = ((a + 30) * Math.PI) / 180;
        return box([r * 1.04, 0.1, 0.1], [Math.cos(t) * r * 0.87, 5.5 + Math.sin(t) * r * 0.87, 0], 0, [0, 0, a + 120]);
      })).slice(0, 18),
    ]),
    object("bwood014", "spider egg sacs", ["spider"], [color("#e0dcd0", "silk")], [
      sphere([1.6, 1.4, 1.4], [0, 0.6, 0], 0),
      sphere([1.2, 1.1, 1.1], [1.2, 0.5, 0.5], 0),
      sphere([1, 0.9, 1], [-0.9, 0.4, 0.8], 0),
      sphere([1.3, 1.2, 1.1], [0.3, 1.5, 0.2], 0),
      box([0.1, 3, 0.1], [0.2, 2.5, 0], 0, [0, 0, 15]),
    ]),
  ],
};
