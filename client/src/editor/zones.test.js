import { describe, it, expect } from "vitest";
import { World } from "./world.js";
import { createZone, listZones, saveZone, zonePath } from "./zones.js";

describe("zones", () => {
  it("creates a zone file keyed by its name", () => {
    const world = World.empty();
    const zone = createZone(world, "main", "Elm Shore");
    expect(zone.key).toBe("elm-shore");
    expect(world.readJson(zonePath("main", "elm-shore"))).toEqual({
      version: 2,
      name: "Elm Shore",
      region: [],
      strokes: [],
      pins: [],
    });
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
});
