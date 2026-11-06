import { gunzipSync, gzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { CELLS, CELL_FT, TILE_FT, WATER_KINDS } from "./constants.js";
import { kindSizes, makeObject } from "./objects.js";
import { decodeTile, encodeTile } from "./tileCodec.js";
import { packPlates, unpackPlates } from "./plates.js";


// A flat grass tile 40 ft up at (tx, tz), as a version 1 tile file has it, with `objects`.
function flatTile(tx, tz, objects = []) {
  const count = CELLS * CELLS;
  const layers = { height: new Float32Array(count).fill(40), water: new Float32Array(count).fill(NaN), waterKind: new Uint8Array(count), terrain: new Uint8Array(count), biome: new Uint8Array(count), forest: new Uint8Array(count), clutter: new Uint8Array(count) };
  const palettes = { terrain: ["grass", "dirt", "sand", "rock", "path", "shore", "mud", "moss"], biome: ["meadow"], water: [...WATER_KINDS] };
  return { coords: [tx, tz], layer: "surface", cells: CELLS, cellFt: CELL_FT, palettes, objects, generator: { version: 23, seed: 1 }, layers, falls: [], roads: [], rivers: [] };
}

// Gzipped tiles, two of them in plate (0, 0) and one in plate (1, 0), each with a stump and a boulder.
function tileFiles() {
  const files = new Map([["world.json", new Uint8Array([123, 125])]]);
  for (const [tx, tz] of [[0, 0], [1, 0], [16, 0]]) {
    const at = (u) => [tx * TILE_FT + u, tz * TILE_FT + u];
    const objects = [makeObject("stump", at(40), 0, 4), makeObject("boulder", at(120), 1, 4)].map((o, n) => ({ ...o, id: `${tx}.${tz}.${n}` }));
    files.set(`places/continents/main/tiles/surface/${tx}/${tz}.dlt.gz`, gzipSync(encodeTile(flatTile(tx, tz, objects))));
  }
  return files;
}

describe("plate files", () => {
  const files = tileFiles();

  it("packs tiles into plates with an index, and unpacks them again", async () => {
    const stored = await packPlates(files);
    expect([...stored.keys()].sort()).toEqual([
      "places/continents/main/plates.json",
      "places/continents/main/plates/surface/0_0.plate",
      "places/continents/main/plates/surface/1_0.plate",
      "world.json",
    ]);
    expect(Object.keys(JSON.parse(strFromU8(stored.get("places/continents/main/plates.json"))).plates)).toEqual(["surface/0_0", "surface/1_0"]);
    const back = await unpackPlates(stored);
    expect([...back.keys()].sort()).toEqual([...files.keys()].sort());
    const path = "places/continents/main/tiles/surface/1/0.dlt.gz";
    const [a, b] = [files, back].map((f) => decodeTile(gunzipSync(f.get(path))));
    expect([...b.layers.height]).toEqual([...a.layers.height]);
  });

  it("makes again only plates whose tiles changed", async () => {
    const cache = new Map();
    const first = await packPlates(files, { cache });
    const changed = new Map(files);
    // A new file for one tile, as an edit gives.
    changed.set("places/continents/main/tiles/surface/16/0.dlt.gz", new Uint8Array(files.get("places/continents/main/tiles/surface/16/0.dlt.gz")));
    const second = await packPlates(changed, { cache });
    expect(second.get("places/continents/main/plates/surface/0_0.plate")).toEqual(first.get("places/continents/main/plates/surface/0_0.plate"));
    expect(cache.get("places/continents/main/plates/surface/1_0.plate").sources[0]).toBe(changed.get("places/continents/main/tiles/surface/16/0.dlt.gz"));
  });

  it("makes a plate again when one of its kinds of object changes size", async () => {
    const cache = new Map();
    const path = "places/continents/main/plates/surface/0_0.plate";
    const first = await packPlates(files, { cache });
    const kinds = cache.get(path).kinds;
    expect(kinds.length).toBeGreaterThan(0);
    expect((await packPlates(files, { cache })).get(path)).toBe(first.get(path));
    const sizes = kindSizes();
    sizes[kinds[0]] = { ...sizes[kinds[0]], height: 99 };
    const resized = await packPlates(files, { cache, sizes });
    expect(resized.get(path)).not.toBe(first.get(path));
    expect(strFromU8(resized.get(path))).toMatch(new RegExp(` 99 ${kinds[0]}$`, "m"));
  });

  it("packs the same plates again from tiles it unpacked", async () => {
    const once = await packPlates(files);
    const twice = await packPlates(await unpackPlates(once));
    for (const [path, bytes] of once) expect(strFromU8(twice.get(path))).toBe(strFromU8(bytes));
  });
});
