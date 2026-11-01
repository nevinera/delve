import { describe, expect, it } from "vitest";
import { fishMesh } from "./fish.js";
import { resolveRecipe } from "./recipe.js";

describe("fishMesh", () => {
  it("floats off the ground, as long (or, for a ray, as wide) as the look's height", () => {
    for (const [body, axis] of [
      ["shark", 2],
      ["barracuda", 2],
      ["stingray", 0],
    ]) {
      const { positions, bones } = fishMesh(resolveRecipe({ body, height: 10 }));
      const ys = positions.filter((_, i) => i % 3 === 1);
      expect(Math.min(...ys), body).toBeGreaterThan(0.5);
      const along = positions.filter((_, i) => i % 3 === axis);
      expect(Math.max(...along) - Math.min(...along), body).toBeGreaterThan(9);
      expect(bones.find((b) => b.name === "mouth"), body).toBeTruthy();
    }
  });
});
