import { describe, expect, it } from "vitest";
import { pieceCorners, problems, shapeOf } from "./builtObjects.js";
import { builtinImage } from "./builtinImages.js";
import { BUILTIN_OBJECTS } from "./builtinObjects.js";
import { setBuiltObjects, specOf } from "./objects.js";

describe("builtin objects", () => {
  it("are all sound, with unique ids starting with b", () => {
    const ids = new Set();
    for (const object of BUILTIN_OBJECTS) {
      expect(problems(object), object.name).toEqual([]);
      expect(object.id, object.name).toMatch(/^b[0-9a-z]{7}$/);
      expect(ids.has(object.id), object.id).toBe(false);
      ids.add(object.id);
      for (const piece of object.pieces) if (piece.tile) expect(builtinImage(piece.tile.image), object.name).toBeTruthy();
      expect(shapeOf(object).height, object.name).toBeGreaterThan(0);
    }
  });

  it("block line of sight but for the ones you see through", () => {
    expect(BUILTIN_OBJECTS.filter((o) => o.blocksSight === false).length).toBeGreaterThan(57);
    expect(BUILTIN_OBJECTS.find((o) => o.id === "bfarm011").blocksSight).toBe(false); // split-rail fence
    expect(BUILTIN_OBJECTS.find((o) => o.id === "bvill001").blocksSight).toBeUndefined(); // barrel
    for (const object of BUILTIN_OBJECTS.filter((o) => o.walkThrough)) expect(object.blocksSight, object.name).toBe(false);
  });

  it("have several members in every variant set", () => {
    const sizes = new Map();
    for (const { collection, variantSet } of BUILTIN_OBJECTS.filter((o) => o.variantSet)) sizes.set(`${collection}/${variantSet}`, (sizes.get(`${collection}/${variantSet}`) ?? 0) + 1);
    expect(sizes.size).toBeGreaterThan(100);
    for (const [set, size] of sizes) expect(size, set).toBeGreaterThan(1);
  });

  it("keep older objects with the sets they joined, and stalagmites in the caves", () => {
    const of = (id) => BUILTIN_OBJECTS.find((o) => o.id === id);
    expect(of("bcave023")).toMatchObject({ collection: "builtin:stones", variantSet: "loose rocks", walkThrough: true, blocksSight: false });
    expect(of("bwood003")).toMatchObject({ collection: "builtin:flora", variantSet: "ferns" });
    expect(of("bcave003")).toMatchObject({ collection: "builtin:natural", variantSet: "stalagmites" });
    for (const set of ["stalagmites", "stalactites"]) for (const object of BUILTIN_OBJECTS.filter((o) => o.name.startsWith(set) || o.variantSet === set)) expect(object.collection, object.name).toBe("builtin:natural");
  });

  it("vary in size when natural", () => {
    const of = (id) => BUILTIN_OBJECTS.find((o) => o.id === id);
    expect(of("bcave023").sizeVary).toBe(0.1); // loose rocks
    expect(of("bcave003").sizeVary).toBe(0.1); // stalagmites
    expect(of("bvill001").sizeVary).toBeUndefined(); // barrel
    expect(BUILTIN_OBJECTS.filter((o) => o.sizeVary).length).toBeGreaterThan(250);
  });

  it("don't reach far below the ground", () => {
    for (const object of BUILTIN_OBJECTS) {
      const lowest = Math.min(...object.pieces.filter((p) => !p.cut).flatMap((p) => pieceCorners(p).map((c) => c[1])));
      expect(lowest, object.name).toBeGreaterThan(-3);
    }
  });

  it("are placeable types in every world", () => {
    setBuiltObjects([]);
    for (const object of BUILTIN_OBJECTS) expect(specOf(`built:${object.id}`)?.built, object.name).toBe(object);
  });
});
