import {describe, it, expect} from "vitest";
import {isValidIdentifier, resolvePath, relativePath, zoneFile, mapFile, unitTypeFile} from "../worldPaths";

describe("worldPaths", () => {
  it("lays a world out under worlds/<world>/", () => {
    expect(zoneFile("small", "forest")).toEqual("worlds/small/zones/forest/forest.json");
    expect(mapFile("small", "forest", "hub")).toEqual("worlds/small/zones/forest/hub/hub.json");
    expect(unitTypeFile("small", "goblin")).toEqual("worlds/small/unit_types/goblin.json");
  });

  it("accepts letters, digits, underscores and dashes only", () => {
    expect(isValidIdentifier("low-cave_2")).toBe(true);
    expect(isValidIdentifier("small/forest")).toBe(false);
    expect(isValidIdentifier("")).toBe(false);
    expect(isValidIdentifier("a b")).toBe(false);
  });

  it("resolves relative paths against a file's directory", () => {
    expect(resolvePath("worlds/w/zones/a/a.json", "../../unit_types/x.json")).toEqual("worlds/w/unit_types/x.json");
    expect(resolvePath("worlds/w/zones/a/a.json", "./hub/hub.json")).toEqual("worlds/w/zones/a/hub/hub.json");
    expect(resolvePath("a.json", "../x.json")).toBeNull();
  });

  it("writes relative paths the way the content repo does", () => {
    expect(relativePath("worlds/w/zones/a/a.json", "worlds/w/unit_types/x.json")).toEqual("../../unit_types/x.json");
    expect(relativePath("worlds/w/w.json", "worlds/w/zones/a/a.json")).toEqual("./zones/a/a.json");
  });
});
