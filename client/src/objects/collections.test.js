import { describe, expect, it } from "vitest";
import { World } from "../editor/world.js";
import { adoptStrays, allCollections, collections, images, keepTemplate, wornImages } from "./collections.js";

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
    const structure = { materials: { stone: { tile: { image: "t2" }, inside: { image: "t3" } }, wood: {} } };
    expect([...wornImages([object], [structure])].sort()).toEqual(["d1", "t1", "t2", "t3"]);
  });

  it("moves structures kept with objects into structure collections named alike", () => {
    const world = World.empty();
    world.writeJson("collections.json", [{ id: "farm0001", name: "farm" }]);
    world.writeJson("objects/obj00001.json", { id: "obj00001", name: "crate", collection: "farm0001", pieces: [] });
    for (const id of ["barn0001", "shed0001"]) world.writeJson(`structures/${id}.json`, { id, name: id, collection: "farm0001", storeys: [], components: [], materials: {} });
    world.writeJson("structures/lost0001.json", { id: "lost0001", name: "lost", collection: "gone0001", storeys: [], components: [], materials: {} });
    expect(adoptStrays(world)).toBe(true);
    const names = collections(world, "structures").map((c) => c.name).sort();
    expect(names).toEqual(["farm", "my structures"]);
    const farm = allCollections(world, "structures").find((c) => c.name === "farm");
    expect(farm.entries.map((e) => e.name)).toEqual(["barn0001", "shed0001"]);
    expect(allCollections(world, "objects").find((c) => c.name === "farm" && c.kind !== "builtin").entries.map((e) => e.name)).toEqual(["crate"]);
    expect(adoptStrays(world)).toBe(false);
  });
});
