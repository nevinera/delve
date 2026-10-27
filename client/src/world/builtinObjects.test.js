import { describe, expect, it } from "vitest";
import { problems, shapeOf } from "./builtObjects.js";
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

  it("are placeable types in every world", () => {
    setBuiltObjects([]);
    for (const object of BUILTIN_OBJECTS) expect(specOf(`built:${object.id}`)?.built, object.name).toBe(object);
  });
});
