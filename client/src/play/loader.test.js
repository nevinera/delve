import { gunzipSync, gzipSync, strFromU8, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { packPlates } from "../editor/plates.js";
import { generateTile, prepareWorld } from "../world/generator.js";
import { LandGrid, PER_TILE } from "../world/landGrid.js";
import { decodeTile, encodeTile } from "../world/tileCodec.js";
import { PlayWorld, platesAround, rawUrl } from "./loader.js";
import { MemoryStore, PlateCache } from "./plateCache.js";

describe("playing a released world", () => {
  it("lists the plates around a tile", () => {
    expect(platesAround("main", [20, 3], 2)).toEqual(["places/continents/main/plates/surface/1_0.plate"]);
    expect(platesAround("main", [1, 1], 3)).toEqual([
      "places/continents/main/plates/surface/-1_-1.plate",
      "places/continents/main/plates/surface/0_-1.plate",
      "places/continents/main/plates/surface/-1_0.plate",
      "places/continents/main/plates/surface/0_0.plate",
    ]);
  });

  it("reads the world from raw GitHub at the commit, and plates as it goes, once each", async () => {
    const land = new LandGrid();
    for (let gz = -PER_TILE; gz <= 2 * PER_TILE; gz++) for (let gx = -PER_TILE; gx <= 2 * PER_TILE; gx++) land.set(gx, gz, 40);
    const ctx = prepareWorld({ land: land.data, pins: [], paths: [], water: { rivers: [], lakes: [] } }, "t");
    const files = await packPlates(new Map([["places/continents/main/tiles/surface/0/0.dlt.gz", gzipSync(encodeTile(generateTile(ctx, 0, 0)))]]));
    files.set("world.json", strToU8(JSON.stringify({ version: 1, name: "W", continents: [{ key: "main", name: "Main" }] })));
    files.set("places/continents/main/sketch.json", strToU8(JSON.stringify({ version: 5, pins: [{ id: "p1", kind: "spawn", at: [0.5, 0.5] }], paths: [] })));
    files.set("objects/abcd1234.json", strToU8(JSON.stringify({ id: "abcd1234", name: "x", palette: [], pieces: [] })));
    const fetched = [];
    const fetchFn = async (url) => {
      fetched.push(url);
      const path = url.replace(rawUrl("me/w", "c0ffee", ""), "");
      return files.has(path) ? new Response(files.get(path)) : new Response("", { status: 404 });
    };
    const cache = new PlateCache(new MemoryStore());
    const play = new PlayWorld({ repo: "me/w", sha: "c0ffee", paths: [...files.keys()], fetchFn, cache });
    await play.open();
    expect(play.world.files.has("places/continents/main/sketch.json")).toBe(true);
    expect(play.world.files.has("objects/abcd1234.json")).toBe(true);
    expect(await play.platesAround("main", [0, 0], 3)).toEqual(["0,0"]);
    const tile = play.world.files.get("places/continents/main/tiles/surface/0/0.dlt.gz");
    expect(decodeTile(gunzipSync(tile)).coords).toEqual([0, 0]);
    expect(await play.platesAround("main", [1, 1], 3)).toEqual([]);
    const plateUrls = () => fetched.filter((u) => u.endsWith(".plate"));
    expect(plateUrls()).toEqual(["https://raw.githubusercontent.com/me/w/c0ffee/places/continents/main/plates/surface/0_0.plate"]);

    // Played again (a reload, say), the plate comes from the cache, by its hash.
    const again = new PlayWorld({ repo: "me/w", sha: "c0ffee", paths: [...files.keys()], fetchFn, cache });
    await again.open();
    expect(await again.platesAround("main", [0, 0], 3)).toEqual(["0,0"]);
    expect(plateUrls()).toHaveLength(1);
    const hash = JSON.parse(strFromU8(files.get("places/continents/main/plates.json"))).plates["surface/0_0"];
    expect(await cache.store.plate(hash)).toMatchObject({ tiles: ["0,0"] });
  });
});
