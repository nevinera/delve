import { describe, expect, it } from "vitest";
import { World } from "../editor/world.js";
import { adoptStrays, images, wornImages } from "./collections.js";

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
});
