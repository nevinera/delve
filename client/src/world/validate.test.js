import { gzipSync, strFromU8, strToU8 } from "fflate";
import { beforeAll, describe, expect, it } from "vitest";
import { packPlates } from "../editor/plates.js";
import { generateTile, prepareWorld } from "./generator.js";
import { LandGrid, PER_TILE } from "./landGrid.js";
import { encodeTile } from "./tileCodec.js";
import { validateWorld } from "./validate.js";

const json = (data) => strToU8(JSON.stringify(data));
const PLATE = "places/continents/main/plates/surface/0_0.plate";
const INDEX = "places/continents/main/plates.json";

// A small stored world: two tiles in one plate, with its indexes.
async function smallWorld() {
  const land = new LandGrid();
  for (let gz = -PER_TILE; gz <= 2 * PER_TILE; gz++) for (let gx = -PER_TILE; gx <= 3 * PER_TILE; gx++) land.set(gx, gz, 40);
  const ctx = prepareWorld({ land: land.data, pins: [], paths: [], water: { rivers: [], lakes: [] } }, "t");
  const tiles = new Map();
  for (const [tx, tz] of [[0, 0], [1, 0]]) tiles.set(`places/continents/main/tiles/surface/${tx}/${tz}.dlt.gz`, gzipSync(encodeTile(generateTile(ctx, tx, tz))));
  const files = await packPlates(tiles);
  files.set("world.json", json({ version: 1, name: "Small", continents: [{ key: "main", name: "Main" }], dungeons: [] }));
  files.set("places/continents/main/index.json", json({ version: 2, tiles: { "0,0": { zones: [], layers: ["surface"] }, "1,0": { zones: [], layers: ["surface"] } } }));
  return files;
}

const messages = (files) => validateWorld(files).map(({ path, message, warning }) => `${warning ? "warning: " : ""}${path}: ${message}`);

describe("validateWorld", () => {
  let world;
  beforeAll(async () => {
    world = await smallWorld();
  });
  const changed = (change) => {
    const files = new Map(world);
    change(files);
    return messages(files);
  };

  it("finds nothing wrong with a good world", () => {
    expect(messages(world)).toEqual([]);
  });

  it("needs world.json, and every continent in it", () => {
    expect(changed((f) => f.delete("world.json"))).toEqual(["world.json: is missing"]);
    expect(changed((f) => f.set("world.json", strToU8("{")))[0]).toMatch(/^world.json: isn't JSON/);
    expect(changed((f) => f.set("places/continents/other/sketch.json", json({ pins: [] })))).toEqual([
      "places/continents/other/sketch.json: is in continent other, which world.json doesn't list",
    ]);
  });

  it("checks plates against plates.json", () => {
    const index = JSON.parse(strFromU8(world.get(INDEX)));
    expect(changed((f) => f.set(INDEX, json({ ...index, plates: { ...index.plates, "surface/0_0": "0000000000000000" } })))).toEqual([`${INDEX}: has the wrong hash for plate surface/0_0`]);
    expect(changed((f) => f.set(INDEX, json({ ...index, plates: { ...index.plates, "surface/5_5": "0000000000000000" } })))).toEqual([`${INDEX}: lists plate surface/5_5, which isn't there`]);
    expect(changed((f) => f.delete(INDEX))).toEqual([`${INDEX}: is missing`]);
  });

  it("checks what plates hold", () => {
    const text = strFromU8(world.get(PLATE));
    const kind = text.match(/^object \S+ \S+ \S+ (\S+)$/m)[1];
    const broken = (from, to) => (f) => {
      f.set(PLATE, strToU8(text.replace(from, to)));
      f.delete(INDEX); // so the hash isn't what's wrong
    };
    const plateErrors = (from, to) => changed(broken(from, to)).filter((m) => m.startsWith(PLATE));
    expect(plateErrors(` ${kind}\n`, " notAThing\n")).toEqual([`${PLATE}: places notAThing, which isn't a kind of object the world has`]);
    expect(plateErrors(`object 0 `, "object 0 - - ").length).toBeGreaterThan(0);
    expect(plateErrors("plate 2 0,0 surface", "plate 2 1,0 surface")).toEqual([`${PLATE}: says it's plate 1,0 of surface, not 0,0 of surface`]);
    expect(plateErrors("plate 2 ", "plate 9 ")).toEqual([`${PLATE}: unsupported plate version 9`]);
    expect(plateErrors("layer biome", "layer nonsense")[0]).toMatch(/tile 0,0: unknown layer nonsense/);
  });

  it("checks the continent index against the plates", () => {
    const index = "places/continents/main/index.json";
    expect(changed((f) => f.set(index, json({ version: 2, tiles: { "0,0": { zones: [], layers: ["surface"] } } })))).toEqual([`${index}: doesn't list tile 1,0's surface layer`]);
    expect(changed((f) => f.set(index, json({ version: 2, tiles: { "0,0": { zones: ["gone"], layers: ["surface"] }, "1,0": { zones: [], layers: ["surface"] }, "9,9": { zones: [], layers: ["surface"] } } }))).sort()).toEqual([
      `${index}: lists tile 9,9's surface layer, which no plate has`,
      `warning: ${index}: says zone gone touches tile 0,0, but there's no such zone`,
    ]);
  });

  it("wants tiles in plates, and land blocks the right size", () => {
    expect(changed((f) => f.set("places/continents/main/tiles/surface/0/0.dlt.gz", new Uint8Array(4)))).toEqual([
      "places/continents/main/tiles/surface/0/0.dlt.gz: is a tile file: a stored world keeps its tiles in plates",
    ]);
    expect(changed((f) => f.set("places/continents/main/land/0_0.f32", new Uint8Array(12)))).toEqual(["places/continents/main/land/0_0.f32: is 12 bytes, not 262144"]);
  });

  it("checks the library", () => {
    expect(changed((f) => f.set("objects/abcd1234.json", json({ id: "abcd1234", name: "x", palette: [{ color: "#808080" }], pieces: [{ type: "box", size: [1, 1, 1], at: [0, 0, 0], turn: [0, 0, 0], color: 0, decals: [{ image: "zzzz9999", face: "0,1,0", at: [0.5, 0.5], size: [1, 1], turn: 0 }] }] })))).toEqual([
      "objects/abcd1234.json: wears image zzzz9999, which the world doesn't have",
    ]);
    expect(changed((f) => f.set("objects/abcd1234.json", json({ id: "other123", name: "x", palette: [], pieces: [] })))).toEqual([
      'objects/abcd1234.json: has id "other123", not abcd1234 as its name says',
    ]);
    expect(changed((f) => f.set("objects/abcd1234.json", json({ id: "abcd1234", name: "x", collection: "nope0000", palette: [], pieces: [] })))).toEqual([
      "warning: objects/abcd1234.json: is in collection nope0000, which collections.json doesn't list",
    ]);
    expect(changed((f) => f.set("structures/abcd1234.json", json({ id: "abcd1234" })))).toEqual(["structures/abcd1234.json: it needs a palette, materials, storeys, components and objects"]);
  });

  it("checks zones", () => {
    const zone = "places/continents/main/zones/vale.json";
    expect(changed((f) => f.set(zone, json({ version: 3, name: "Vale", region: [[[[0, 0], [1, 0], [1, 1]]]] })))).toEqual([]);
    expect(changed((f) => f.set(zone, json({ version: 3, name: "Vale", region: [[[0, 0]]] })))).toEqual([`${zone}: needs a region: polygons of rings of [x, z] points`]);
  });
});
