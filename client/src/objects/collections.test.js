import { describe, expect, it } from "vitest";
import { World } from "../world/world.js";
import { adoptStrays, allCollections, collections, images, keepTemplate, oneTilePerSet, wornImages } from "./collections.js";

describe("collections", () => {
  it("keeps templates in my templates, making it the first time, and lists them after the builtins", () => {
    const world = World.empty();
    const first = keepTemplate(world, { id: "tmpl0001", name: "hut", slabs: [], objects: [] });
    keepTemplate(world, { id: "tmpl0002", name: "shed", slabs: [], objects: [] });
    expect(collections(world, "templates")).toEqual([{ id: first.collection, name: "my templates" }]);
    const listed = allCollections(world, "templates");
    expect(listed.at(-1).entries.map((e) => [e.name, e.type])).toEqual([["hut", "template:tmpl0001"], ["shed", "template:tmpl0002"]]);
    expect(listed.slice(0, -1).every((c) => c.kind === "builtin")).toBe(true);
  });

  it("moves images kept with a collection to the world's", () => {
    const world = World.empty();
    world.writeJson("images/abcd1234.json", { id: "abcd1234", name: "bricks", kind: "tiled", collection: "c0000001", rows: [] });
    expect(adoptStrays(world)).toBe(true);
    expect(world.files.has("images/abcd1234.json")).toBe(false);
    expect(images(world)).toEqual([{ id: "abcd1234", name: "bricks", kind: "tiled", rows: [] }]);
    expect(adoptStrays(world)).toBe(false);
  });

  it("lists the images things wear", () => {
    const object = { pieces: [{ tile: { image: "t1" }, decals: [{ image: "d1" }] }, {}] };
    const template = { slabs: [{ surface: { color: "#ffffff", tile: { image: "t2" } } }, { surface: "floorboards" }] };
    expect([...wornImages([object], [template])].sort()).toEqual(["d1", "t1", "t2"]);
  });

  it("drops structures, which templates replaced, and puts stray objects in my objects", () => {
    const world = World.empty();
    world.writeJson("structure-collections.json", [{ id: "farm0001", name: "farm" }]);
    world.writeJson("structures/barn0001.json", { id: "barn0001", name: "barn", collection: "farm0001" });
    world.writeJson("objects/obj00001.json", { id: "obj00001", name: "crate", collection: "gone0001", pieces: [] });
    expect(adoptStrays(world)).toBe(true);
    expect([...world.files.keys()].filter((p) => p.includes("structure"))).toEqual([]);
    expect(allCollections(world, "objects").find((c) => c.kind === "own")).toMatchObject({ name: "my objects", entries: [{ name: "crate" }] });
    expect(adoptStrays(world)).toBe(false);
  });
});

describe("oneTilePerSet", () => {
  it("folds a variant set into one tile, counting its members", () => {
    const entry = (type, variantSet) => ({ key: type, type, name: type, object: { variantSet } });
    const tiles = oneTilePerSet([entry("a", "rocks"), entry("b"), entry("c", "rocks"), entry("d", "alone")]);
    expect(tiles.map((t) => t.name)).toEqual(["rocks (2)", "b", "alone"]);
    expect(tiles[0].type).toBe("a");
    expect(tiles[0].members).toEqual(["a", "c"]);
    expect(tiles[1].members).toEqual(["b"]);
  });
});
