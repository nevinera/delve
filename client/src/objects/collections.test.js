import { describe, expect, it } from "vitest";
import { World } from "../editor/world.js";
import { adoptStrays, allCollections, collections, images, wornImages } from "./collections.js";

describe("collections", () => {
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
    expect(allCollections(world, "objects").find((c) => c.name === "farm").entries.map((e) => e.name)).toEqual(["crate"]);
    expect(adoptStrays(world)).toBe(false);
  });
});
