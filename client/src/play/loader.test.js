import { gzipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { packPlates } from "../editor/plates.js";
import { generateTile, prepareWorld } from "../world/generator.js";
import { LandGrid, PER_TILE } from "../world/landGrid.js";
import { encodeTile } from "../world/tileCodec.js";
import { PlayWorld, findSpawn, platesAround, rawUrl } from "./loader.js";

describe("playing a released world", () => {
  it("finds the spawn point in the continents' sketches", () => {
    expect(findSpawn({ main: { pins: [{ kind: "hub" }] }, isle: { pins: [{ kind: "spawn", at: [3.5, 4] }] } })).toEqual({ continent: "isle", at: [3.5, 4] });
    expect(findSpawn({ main: { pins: [] } })).toBeNull();
  });

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
    const play = new PlayWorld({ repo: "me/w", sha: "c0ffee", paths: [...files.keys()], fetchFn });
    expect(await play.open()).toEqual({ continent: "main", at: [0.5, 0.5] });
    expect(play.world.files.has("objects/abcd1234.json")).toBe(true);
    expect(await play.platesAround("main", [0, 0], 3)).toEqual(["0,0"]);
    expect(play.world.files.has("places/continents/main/tiles/surface/0/0.dlt.gz")).toBe(true);
    expect(await play.platesAround("main", [1, 1], 3)).toEqual([]);
    expect(fetched.filter((u) => u.endsWith(".plate"))).toEqual(["https://raw.githubusercontent.com/me/w/c0ffee/places/continents/main/plates/surface/0_0.plate"]);
  });
});
