import { describe, expect, it } from "vitest";
import { resolveRecipe } from "./recipe.js";
import { serpentMesh } from "./serpent.js";

describe("serpentMesh", () => {
  it("lies on the ground, its head raised as high as the look, its tail far behind", () => {
    for (const body of ["snake", "cobra"]) {
      const { positions, bones } = serpentMesh(resolveRecipe({ body, height: 6 }));
      const ys = positions.filter((_, i) => i % 3 === 1);
      expect(Math.min(...ys), body).toBeCloseTo(0, 0);
      expect(Math.max(...ys), body).toBeCloseTo(6, 0);
      const at = Object.fromEntries(bones.map((b) => [b.name, b.at]));
      expect(at.mouth[2]).toBeGreaterThan(at.head[2]);
      expect(at.tail_end[2]).toBeLessThan(-20);
    }
  });
});
