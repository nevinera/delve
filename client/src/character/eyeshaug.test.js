import { describe, expect, it } from "vitest";
import { eyeshaugMesh } from "./eyeshaug.js";
import { resolveRecipe } from "./recipe.js";

describe("eyeshaugMesh", () => {
  it("hovers off the ground, its stalks rising to the look's height", () => {
    const { positions, bones } = eyeshaugMesh(resolveRecipe({ body: "eyeshaug", height: 8 }));
    const ys = positions.filter((_, i) => i % 3 === 1);
    expect(Math.min(...ys)).toBeGreaterThan(1);
    expect(Math.max(...ys)).toBeCloseTo(8, 0);
    expect(bones.filter((b) => /^stalk_\d$/.test(b.name))).toHaveLength(6);
  });
});
