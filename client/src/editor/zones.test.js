import { describe, it, expect } from "vitest";
import { World } from "./world.js";
import { createZone, listZones, loadSketch, moveIntoSketch, olderZones, removeZone, saveZone, sketchPath, zonePath } from "./zones.js";

describe("zones", () => {
  it("creates a zone file keyed by its name", () => {
    const world = World.empty();
    const zone = createZone(world, "main", "Elm Shore");
    expect(zone.key).toBe("elm-shore");
    expect(world.readJson(zonePath("main", "elm-shore"))).toEqual({ version: 3, name: "Elm Shore", region: [] });
  });

  it("keeps keys unique", () => {
    const world = World.empty();
    createZone(world, "main", "Cradle");
    expect(createZone(world, "main", "Cradle").key).toBe("cradle-2");
  });

  it("lists a continent's zones and saves changes without the key", () => {
    const world = World.empty();
    const zone = createZone(world, "main", "Cradle");
    createZone(world, "other", "Elsewhere");
    saveZone(world, "main", { ...zone, name: "The Cradle" });
    expect(listZones(world, "main").map((z) => [z.key, z.name])).toEqual([["cradle", "The Cradle"]]);
    expect(world.readJson(zonePath("main", "cradle")).key).toBeUndefined();
  });

  it("removes a zone's file and nothing else", () => {
    const world = World.empty();
    createZone(world, "main", "Cradle");
    world.files.set("places/continents/main/tiles/surface/0/0.dlt.gz", new Uint8Array([1]));
    removeZone(world, "main", "cradle");
    expect([...world.files.keys()].sort()).toEqual(["places/continents/main/tiles/surface/0/0.dlt.gz", "world.json"]);
  });

  it("sets aside zone files from before regions", () => {
    const world = World.empty();
    createZone(world, "main", "Elm Shore");
    world.writeJson(zonePath("main", "cradle"), { version: 1, origin: [0, 0], tiles: [] });
    expect(listZones(world, "main").map((z) => z.key)).toEqual(["elm-shore"]);
    expect(olderZones(world, "main")).toEqual(["cradle"]);
  });

  it("starts with an empty sketch", () => {
    expect(loadSketch(World.empty(), "main")).toEqual({ version: 1, pins: [], strokes: [] });
  });

  it("moves zones' own pins and strokes into the sketch, renumbering clashes", () => {
    const world = World.empty();
    const region = [[[[0, 0], [4, 0], [4, 4]]]];
    world.writeJson(zonePath("main", "a"), { version: 2, name: "A", region, pins: [{ id: "p1", kind: "height", at: [1, 1], height: 5 }], strokes: [{ id: "s1", kind: "river", points: [], width: 30 }] });
    world.writeJson(zonePath("main", "b"), { version: 2, name: "B", region, pins: [{ id: "p1", kind: "biome", at: [2, 2], biome: "forest" }], strokes: [] });
    expect(moveIntoSketch(world, "main")).toEqual(["a", "b"]);
    const sketch = world.readJson(sketchPath("main"));
    expect(sketch.pins.map((p) => [p.id, p.kind])).toEqual([["p1", "height"], ["p2", "biome"]]);
    expect(sketch.strokes.map((s) => s.id)).toEqual(["s1"]);
    expect(world.readJson(zonePath("main", "b"))).toEqual({ version: 3, name: "B", region });
    expect(listZones(world, "main").map((z) => z.key)).toEqual(["a", "b"]);
    expect(moveIntoSketch(world, "main")).toEqual([]);
  });
});
