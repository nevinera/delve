import { describe, it, expect } from "vitest";
import { buildIndex, indexPath, updateIndexes } from "./continentIndex.js";
import { World } from "./world.js";
import { createZone, removeZone, saveZone, zonePath } from "./zones.js";

const tile = (x, z, layer = "surface") => `places/continents/main/tiles/${layer}/${x}/${z}.dlt.gz`;
const square = (x0, z0, x1, z1) => [[[[x0, z0], [x1, z0], [x1, z1], [x0, z1]]]];

function worldWithZones() {
  const world = World.empty();
  saveZone(world, "main", { ...createZone(world, "main", "West"), region: square(0, 0, 1.5, 1) });
  saveZone(world, "main", { ...createZone(world, "main", "East"), region: square(1.5, 0, 3, 1) });
  for (const x of [0, 1, 2]) world.files.set(tile(x, 0), new Uint8Array([1]));
  world.files.set(tile(1, 0, "-1"), new Uint8Array([1]));
  return world;
}

describe("buildIndex", () => {
  it("lists every tile with the zones touching it and its layers", () => {
    expect(buildIndex(worldWithZones(), "main")).toEqual({
      version: 2,
      tiles: {
        "0,0": { zones: ["west"], layers: ["surface"] },
        "1,0": { zones: ["east", "west"], layers: ["-1", "surface"] },
        "2,0": { zones: ["east"], layers: ["surface"] },
      },
    });
  });

  it("keeps a deleted zone's tiles, without the zone", () => {
    const world = worldWithZones();
    removeZone(world, "main", "east");
    expect(buildIndex(world, "main").tiles["2,0"]).toEqual({ zones: [], layers: ["surface"] });
  });

  it("keeps older-format zones from the previous index", () => {
    const world = World.empty();
    world.writeJson(zonePath("main", "cradle"), { version: 1, origin: [0, 0], tiles: [[0, 0]] });
    world.writeJson(indexPath("main"), { version: 1, tiles: { "0,0": { zone: "cradle", layers: ["surface"] } } });
    world.files.set(tile(0, 0), new Uint8Array([1]));
    expect(buildIndex(world, "main").tiles["0,0"].zones).toEqual(["cradle"]);
  });
});

describe("updateIndexes", () => {
  it("writes an index only for continents with tiles", () => {
    const world = World.empty();
    updateIndexes(world);
    expect(world.files.has(indexPath("main"))).toBe(false);
    world.files.set(tile(0, 0), new Uint8Array([1]));
    updateIndexes(world);
    expect(world.readJson(indexPath("main")).tiles["0,0"]).toEqual({ zones: [], layers: ["surface"] });
  });
});
