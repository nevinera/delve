import { describe, it, expect } from "vitest";
import { World } from "./world.js";
import { createZone, listZones, loadSketch, moveIntoSketch, olderZones, removeZone, saveZone, sketchPath, upgradeSketch, zonePath } from "./zones.js";

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
    expect(loadSketch(World.empty(), "main")).toEqual({ version: 5, pins: [], paths: [], water: { rivers: [], lakes: [] } });
  });

  it("turns older sketches' watercourses into water bodies", () => {
    const world = World.empty();
    const region = [[[[0, 0], [2, 0], [2, 2], [0, 2]]]];
    world.writeJson(sketchPath("main"), { version: 4, pins: [], paths: [], watercourses: { key: "k", rivers: [{ points: [[0, 0], [1, 1]], width: 12 }], pools: [{ region, level: 30 }] } });
    const sketch = loadSketch(world, "main");
    expect(sketch.watercourses).toBeUndefined();
    expect(sketch.water.rivers).toEqual([{ id: "w1", points: [[0, 0], [1, 1]], width: 12 }]);
    expect(sketch.water.lakes).toEqual([{ id: "l1", seed: [1, 1], level: 30 }]);
  });

  it("moves zones' own pins into the sketch, renumbering clashes and dropping their lines", () => {
    const world = World.empty();
    const region = [[[[0, 0], [4, 0], [4, 4]]]];
    world.writeJson(zonePath("main", "a"), { version: 2, name: "A", region, pins: [{ id: "p1", kind: "height", at: [1, 1], height: 5 }], strokes: [{ id: "s1", kind: "road", points: [], width: 16 }, { id: "s2", kind: "river", points: [], width: 30 }] });
    world.writeJson(zonePath("main", "b"), { version: 2, name: "B", region, pins: [{ id: "p1", kind: "biome", at: [2, 2], biome: "forest" }], strokes: [] });
    expect(moveIntoSketch(world, "main")).toEqual(["a", "b"]);
    const sketch = world.readJson(sketchPath("main"));
    expect(sketch.pins.map((p) => [p.id, p.kind])).toEqual([["p1", "height"], ["p2", "biome"]]);
    expect(sketch.strokes).toBeUndefined();
    expect(world.readJson(zonePath("main", "b"))).toEqual({ version: 3, name: "B", region });
    expect(listZones(world, "main").map((z) => z.key)).toEqual(["a", "b"]);
    expect(moveIntoSketch(world, "main")).toEqual([]);
  });

  it("drops rivers and roads kept as lines, counting them", () => {
    const drawn = { version: 1, pins: [], strokes: [{ id: "s1", kind: "river", points: [] }, { id: "s2", kind: "road", points: [] }] };
    expect(upgradeSketch(drawn)).toEqual({ rivers: 1, roads: 1 });
    expect(drawn).toEqual({ version: 5, pins: [] });
    expect(upgradeSketch(drawn)).toEqual({ rivers: 0, roads: 0 });
    const confirmed = { version: 2, pins: [{ id: "p1", kind: "source", confirmed: "1" }], strokes: [{ id: "s1", kind: "river", points: [] }], pools: [{}] };
    expect(upgradeSketch(confirmed)).toEqual({ rivers: 0, roads: 0 });
    expect(confirmed).toEqual({ version: 5, pins: [{ id: "p1", kind: "source" }] });
  });
});
