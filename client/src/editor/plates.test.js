import { gunzipSync, gzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { generateTile, prepareWorld } from "../world/generator.js";
import { LandGrid, PER_TILE } from "../world/landGrid.js";
import { kindSizes } from "../world/objects.js";
import { decodeTile, encodeTile } from "../world/tileCodec.js";
import { packPlates, unpackPlates } from "./plates.js";

// Gzipped tiles of a small island, two of them in plate (0, 0) and one in plate (1, 0).
function tileFiles() {
  const land = new LandGrid();
  for (let gz = -PER_TILE; gz <= 2 * PER_TILE; gz++) for (let gx = -PER_TILE; gx <= 18 * PER_TILE; gx++) land.set(gx, gz, 40);
  const ctx = prepareWorld({ land: land.data, pins: [], paths: [], water: { rivers: [], lakes: [] } }, "t");
  const files = new Map([["world.json", new Uint8Array([123, 125])]]);
  for (const [tx, tz] of [[0, 0], [1, 0], [16, 0]]) files.set(`places/continents/main/tiles/surface/${tx}/${tz}.dlt.gz`, gzipSync(encodeTile(generateTile(ctx, tx, tz))));
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
