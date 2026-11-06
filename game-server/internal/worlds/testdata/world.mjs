// Writes the fixtures the worlds tests read: a small version 2 world in world/, written by the
// client's own codecs, and in expected.json what /create finds on it: the ground's height and
// water at points and how steep its faces are there, what stands in each tile's slots (but on its road) and across the course's cascades, where
// objects placed by hand stand, footholds on the slabs, and the caves' floors and rock.
//
//   node game-server/internal/worlds/testdata/world.mjs
import { register } from "node:module";
import fs from "fs";
import * as THREE from "three";
import { strToU8 } from "fflate";

// The client imports JSON as Vite does.
register("data:text/javascript,export async function load(url, context, next) { return next(url, url.endsWith('.json') ? { ...context, importAttributes: { type: 'json' } } : context); }");
const client = (path) => import(new URL(`../../../../client/src/${path}`, import.meta.url));
const { encodePlate } = await client("v2/plate.js");
const { loadZipper } = await client("v2/zstd.js");
const { BiomeMap } = await client("v2/biomes.js");
const { makeSlots } = await client("v2/slots.js");
const { dryWater, WATER_TYPES } = await client("v2/water.js");
const { roadKindAt } = await client("v2/roads.js");
const { EMPTY_FT } = await client("create/ground.js");
const { Renditions } = await client("create/renditions.js");
const { Scatter } = await client("create/scatter.js");
const { setBuiltObjects } = await client("world/objects.js");
setBuiltObjects([]); // as any world starts, with the built-in ones
const { Placed } = await client("create/placed.js");
const { Things } = await client("create/things.js");
const { pressesOver } = await client("create/press.js");
const { slabFootholds } = await client("world/slabs.js");
const { trunkRadius } = await client("render/treeMeshes.js");
const { carve, encodeCaves, emptyColumns, floorAt, floorSlopeAt, tileIndex } = await client("v2/caves.js");
const { Caves } = await client("create/caves.js");

const here = new URL(".", import.meta.url);
const TILE_FT = 256;
const CELL_FT = 4;
const write = (path, bytes) => {
  const file = new URL(`world/${path}`, here);
  fs.mkdirSync(new URL(".", file), { recursive: true });
  fs.writeFileSync(file, bytes);
};

// Rolling ground, a cliff east of x 600, and a basin round (300, 300) with a lake in it.
function heightAt(x, z) {
  let h = 20 + 15 * Math.sin(x / 180) + 10 * Math.cos(z / 140);
  if (x > 600) h += Math.min(60, (x - 600) * 3);
  const d = Math.hypot(x - 300, z - 300);
  if (d < 110) h -= 25 * (1 - d / 110);
  return Math.round(h * 4) / 4;
}
const LAKE = 12;
// A stream along z 650, a foot over the ground.
const streamAt = (x, z) => Math.abs(z - 650) < 6 && x < 700;
// A road through the forest, where nothing grows.
const ROAD = { kind: "road", seed: 5, points: [[-200, 150, 14], [120, 120, 14], [380, 220, 14]] };

const AREAS = [
  { biome: "forest", points: [[-256, 0], [400, 0], [400, 400], [-256, 400]] },
  { biome: "rocky", points: [[400, 0], [768, 0], [768, 300], [400, 300]] },
  { biome: "swamp", points: [[0, 400], [300, 400], [300, 768], [0, 768]] },
  { biome: "fungal marsh", points: [[-256, 400], [0, 400], [0, 768], [-256, 768]] },
  { biome: "snowy forest", points: [[300, 400], [768, 400], [768, 768], [300, 768]] },
  { biome: "mangrove", points: [[200, 200], [400, 200], [400, 400], [200, 400]] },
];
const biomes = new BiomeMap(AREAS);

// Tiles -1 to 2 east, 0 to 2 south: plate -1,0 has the west column.
function tile(tx, tz) {
  const heights = new Float32Array(65 * 65);
  for (let j = 0; j <= 64; j++) for (let i = 0; i <= 64; i++) heights[j * 65 + i] = heightAt(tx * TILE_FT + i * CELL_FT, tz * TILE_FT + j * CELL_FT);
  const water = dryWater(64 * 64);
  let wet = false;
  for (let j = 0; j < 64; j++) {
    for (let i = 0; i < 64; i++) {
      const [x, z] = [tx * TILE_FT + (i + 0.5) * CELL_FT, tz * TILE_FT + (j + 0.5) * CELL_FT];
      const k = j * 64 + i;
      if (heightAt(x, z) < LAKE) [water.level[k], water.type[k], wet] = [LAKE, WATER_TYPES.indexOf("lake"), true];
      else if (streamAt(x, z)) [water.level[k], water.type[k], wet] = [heightAt(x, z) + 1, WATER_TYPES.indexOf("stream"), true];
    }
  }
  const road = new Uint8Array(64 * 64);
  for (let j = 0; j < 64; j++) for (let i = 0; i < 64; i++) road[j * 64 + i] = roadKindAt([ROAD], tx * TILE_FT + (i + 0.5) * CELL_FT, tz * TILE_FT + (j + 0.5) * CELL_FT);
  // One tile keeps slots no seed makes.
  const slots = tx === 2 && tz === 2 ? makeSlots(99, 99) : null;
  return { heights, biome: biomes.tile(tx, tz), slots, slotSeed: [tx, tz], water: wet ? water : null, cut: null, road: road.some((v) => v) ? road : null };
}

const plates = new Map([["0,0", new Map()], ["-1,0", new Map()]]);
for (let tz = 0; tz <= 2; tz++) {
  for (let tx = -1; tx <= 2; tx++) {
    const [px, pz] = [Math.floor(tx / 8), Math.floor(tz / 8)];
    plates.get(`${px},${pz}`).set((tz - pz * 8) * 8 + (tx - px * 8), tile(tx, tz));
  }
}
const files = new Map();
// Caves: a tunnel down from a mouth at (530, 300) to a domed cave, with a pocket in another
// network under its floor, a lone pocket deep in tile 0,0 and two far apart in heights in tile 1,0.
// Plate -1,0's are written before the zipper's loaded, a pocket, a cave and two big caves far
// apart in heights, so their cells take forms c1, c2 and c3.
const caveTiles = new Map();
const columnsOf = (tx, tz, make) => {
  const key = `${tx},${tz}`;
  if (!caveTiles.has(key) && make) caveTiles.set(key, emptyColumns());
  return caveTiles.get(key) ?? null;
};
const caveGround = (ci, cj) => heightAt((ci + 0.5) * 2, (cj + 0.5) * 2);
for (let n = 0; n <= 40; n++) {
  const u = n / 40;
  carve({ kind: "sphere", at: [530 + 20 * u, 17 - 33 * u, 300 + 100 * u], radius: 5 }, columnsOf, caveGround, { net: "tunnel" });
}
carve({ kind: "dome", at: [550, -20, 430], radii: [30, 20, 30], yaw: 0.3 }, columnsOf, caveGround, { net: "tunnel" });
carve({ kind: "sphere", at: [565, -45, 430], radius: 6 }, columnsOf, caveGround, { net: "under" });
carve({ kind: "sphere", at: [60, -30, 60], radius: 3 }, columnsOf, caveGround, { net: "lone" });
carve({ kind: "sphere", at: [300, -1100, 60], radius: 3 }, columnsOf, caveGround, { net: "far" });
carve({ kind: "sphere", at: [310, -10, 60], radius: 3 }, columnsOf, caveGround, { net: "far" });
carve({ kind: "sphere", at: [-100, -30, 100], radius: 3 }, columnsOf, caveGround, { net: "west" });
carve({ kind: "sphere", at: [-128, -20, 384], radius: 20 }, columnsOf, caveGround, { net: "west" });
carve({ kind: "cylinder", at: [-128, -1100, 640], radius: 64, half: [64, 3, 64] }, columnsOf, caveGround, { net: "west" });
carve({ kind: "cylinder", at: [-128, -20, 640], radius: 64, half: [64, 3, 64] }, columnsOf, caveGround, { net: "west" });
const cavesOf = (west) =>
  new Map([...caveTiles].filter(([key]) => key.startsWith("-") === west).map(([key, columns]) => [tileIndex(...key.split(",").map(Number)), columns]));
const cellForms = (bytes) => new TextDecoder().decode(bytes).split("\n").filter((l) => /^c\d/.test(l)).map((l) => l.split(" ")[0]);
files.set("places/continents/main/caves/-1_0.caves", encodeCaves([-1, 0], cavesOf(true)));

// Plate 0,0's heights are kept a line a chunk; plate -1,0's zipped, once the zipper's loaded.
files.set("places/continents/main/plates/0_0.plate", encodePlate({ coords: [0, 0], tiles: plates.get("0,0") }));
await loadZipper();
files.set("places/continents/main/plates/-1_0.plate", encodePlate({ coords: [-1, 0], tiles: plates.get("-1,0") }));
files.set("places/continents/main/caves/0_0.caves", encodeCaves([0, 0], cavesOf(false)));
console.log(`caves cells: ${["-1_0", "0_0"].flatMap((key) => cellForms(files.get(`places/continents/main/caves/${key}.caves`))).join(", ")}`);

const square = (n) => [[0, 0], [n, 0], [n, n], [0, n]];
const floorY = heightAt(100, 500) + 1;
const placed = {
  version: 1,
  objects: [
    { type: "boulder", at: [150, 560], yaw: 0.5, scale: 4 },
    { type: "stump", at: [420, 120], yaw: 0, scale: 5 },
    { type: "rubble", at: [112, 512], y: floorY, yaw: 0, scale: 6 },
    { type: "built:shed0001", at: [200, 600], yaw: 1, scale: 1, footprint: { rect: [4, 2] }, height: 3 },
    { type: "stump", at: [240, 610], yaw: 0, scale: 2, road: "roadtest" },
  ],
  slabs: [
    { at: [100, floorY, 500], turn: [0, 0, 0], outline: square(30), thickness: 1.5, surface: "floorboards" },
    { at: [100, floorY, 499], turn: [0, -90, 0], outline: [[0, 0], [10, 0], [10, 7], [14, 7], [14, 0], [30, 0], [30, 10], [0, 10]], thickness: 1, surface: "brick" },
    { at: [130, floorY, 500], turn: [0, 0, 20], outline: square(20), thickness: 1, surface: "stone" },
    // A slab and an object a road put there, which every reader takes as any other.
    { at: [150, floorY, 500], turn: [0, 0, 0], outline: square(10), thickness: 0.6, surface: "floorboards", road: "roadtest" },
  ],
};
files.set("places/continents/main/placed/0_0.json", strToU8(`${JSON.stringify(placed, null, 1)}\n`));

// A stream down a cascade: level, then falling 1.2 ft each 8 ft for 80 ft, then level again.
const surface = Array.from({ length: 100 }, (_, n) => 30 - 1.2 * Math.min(10, Math.max(0, n - 30)));
const water = { version: 1, bodies: [], courses: [{ type: "stream", seed: 3, points: [[40, 700, 6], [740, 690, 6]], surface }] };
files.set("places/continents/main/water.json", strToU8(`${JSON.stringify(water)}\n`));
files.set("places/continents/main/biomes.json", strToU8(`${JSON.stringify({ version: 1, areas: AREAS })}\n`));
const world = { version: 2, name: "Fixture", continents: [{ key: "main", name: "Main" }], dungeons: [], spawn: { continent: "main", at: [256, 51.2] } };
files.set("world.json", strToU8(`${JSON.stringify(world, null, 2)}\n`));
fs.rmSync(new URL("world", here), { recursive: true, force: true });
for (const [path, bytes] of files) write(path, bytes);

// What /create makes of it, as client/src/create/main.js sets it up.
const r = new Renditions();
for (const [key] of plates) r.addPlate(key.split(",").map(Number), files.get(`places/continents/main/plates/${key.replace(",", "_")}.plate`));
// Which tiles there are, from the plates rather than platters.
const has = (tx, tz) => plates.get(`${Math.floor(tx / 8)},${Math.floor(tz / 8)}`)?.has((tz - Math.floor(tz / 8) * 8) * 8 + (tx - Math.floor(tx / 8) * 8)) ?? false;
r.tile = (tx, tz) => (has(tx, tz) ? {} : null);
r.setBiomes(AREAS, false);
r.setWater(water, false);
const p = new Placed();
p.load([0, 0], files.get("places/continents/main/placed/0_0.json"));
r.pressesOver = (tx, tz) => pressesOver(p.near((tx + 0.5) * TILE_FT, (tz + 0.5) * TILE_FT, TILE_FT).slabs, tx, tz);
for (const key of plates.keys()) r.hasCells(...key.split(",").map((v) => Number(v) * 8));

const points = [];
for (let z = -10; z <= 780; z += 37.3) for (let x = -270; x <= 780; x += 41.7) points.push([Math.round(x * 10) / 10, Math.round(z * 10) / 10]);
points.push([110, 510], [100.5, 500.5], [129.9, 529.9], [0, 0], [-256, 0], [767.9, 767.9], [768, 100], [300, 300], [256, 51.2]);
const ground = points.map(([x, z]) => ({ at: [x, z], ground: r.heightAt(x, z), slope: r.slopeAt(x, z), water: r.waterCellAt(x, z)?.[0] ?? null }));

const scatter = new Scatter(new THREE.Scene(), r);
const fills = [];
for (let tz = 0; tz <= 2; tz++) {
  for (let tx = -1; tx <= 2; tx++) {
    const { trees, objects } = scatter.fill(tx, tz);
    fills.push({
      tile: [tx, tz],
      things: [
        ...trees.map((t) => ({ type: t.kind, x: t.x, z: t.z, yaw: 0, footprint: { circle: trunkRadius(t.kind, t.size) } })),
        ...objects.map((o) => ({ type: o.type, x: o.at[0], z: o.at[1], yaw: o.yaw, footprint: o.footprint, height: o.height })),
      ],
    });
  }
}

const things = new Things(new THREE.Scene(), p, (x, z) => r.heightAt(x, z) ?? EMPTY_FT);
const standing = p.near(0, 0, 10).objects.map((o) => ({ type: o.type, at: o.at, y: things.objectY(o) }));

const slabPoints = [[110, 510], [110, 499.5], [110, 498], [135, 510], [149, 510], [111, 499], [160, 510], [155, 505]];
const footholds = slabPoints.map(([x, z]) => ({ at: [x, z], footholds: placed.slabs.flatMap((slab) => slabFootholds(slab, x, z, Math.tan((50 * Math.PI) / 180))) }));

// Floors and rock in the caves, as /create stands on them and keeps the builder out of them.
const caves = new Caves(new THREE.Scene(), r);
for (const key of ["-1_0", "0_0"]) caves.load(files.get(`places/continents/main/caves/${key}.caves`), key.split("_").map(Number));
const cavePoints = [[530, 300], [531.3, 301.7], [535, 325], [540, 350], [545.5, 377.3], [550, 430], [553.1, 427.9], [565, 430], [566.2, 431.5], [575, 445], [520, 460], [60, 60], [310, 60], [300, 60], [500, 200], [-100, 100], [-128, 384], [-120.5, 390.7], [-128, 640], [-100, 600]];
const caveFloors = cavePoints.map(([x, z]) => {
  const g = r.heightAt(x, z) ?? EMPTY_FT;
  const spans = caves.spans(Math.floor(x / 2), Math.floor(z / 2));
  return { at: [x, z], ground: g, floors: spans.filter((s) => s.floor <= g).map((s) => floorAt((ci, cj) => caves.spans(ci, cj), x, z, s)), floorSlopes: spans.filter((s) => s.floor <= g).map((s) => floorSlopeAt((ci, cj) => caves.spans(ci, cj), x, z, s)), open: spans.some((s) => s.floor < g && g < s.ceiling), rock: [-60, -45, -30, -20, -10, 0, 10, 20].map((y) => ({ y, solid: caves.near(x, z) && caves.solid(x, y, z) && y < g })) };
});
fs.writeFileSync(new URL("expected.json", here), `${JSON.stringify({ ground, fills, standing, footholds, caveFloors })}\n`);
console.log(`${ground.length} points, ${fills.reduce((n, f) => n + f.things.length, 0)} things, ${standing.length} placed objects`);
