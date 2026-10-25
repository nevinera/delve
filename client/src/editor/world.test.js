import { describe, it, expect } from "vitest";
import { strToU8, unzipSync } from "fflate";
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
