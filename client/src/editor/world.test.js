import { describe, it, expect } from "vitest";
import { strToU8, unzipSync, zipSync } from "fflate";
import { World } from "./world.js";

describe("World", () => {
  it("starts empty with one continent", () => {
    const world = World.empty();
    expect([...world.files.keys()]).toEqual(["world.json"]);
    expect(world.info.continents).toEqual([{ key: "main", name: "Main" }]);
  });

  it("zips every file at its path within the world", () => {
    const world = World.empty();
    world.files.set("places/continents/main/index.json", strToU8("{}"));
    const paths = Object.keys(unzipSync(world.toZip()));
    expect(paths).toEqual(["places/continents/main/index.json", "world.json"]);
  });

  it("round-trips through a zip, keeping files it doesn't understand", () => {
    const world = World.empty();
    world.files.set("notes/readme.txt", strToU8("hello"));
    const loaded = World.fromZip(world.toZip());
    expect(loaded.info.name).toBe("New world");
    expect(new TextDecoder().decode(loaded.files.get("notes/readme.txt"))).toBe("hello");
  });
});

describe("World.fromZip", () => {
  it("strips a single top-level folder", () => {
    const zip = zipSync({ "core-main/world.json": strToU8('{"name":"Core","continents":[]}'), "core-main/a.txt": strToU8("a") });
    expect([...World.fromZip(zip).files.keys()].sort()).toEqual(["a.txt", "world.json"]);
  });

  it("makes a world.json from the continents it finds", () => {
    const zip = zipSync({ "places/continents/cartaxia/index.json": strToU8("{}") });
    expect(World.fromZip(zip).info.continents).toEqual([{ key: "cartaxia", name: "Cartaxia" }]);
  });

  it("rejects a zip that isn't a world", () => {
    expect(() => World.fromZip(zipSync({ "notes.txt": strToU8("hi") }))).toThrow(/no world.json/);
  });
});
