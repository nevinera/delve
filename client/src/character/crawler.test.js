import { describe, expect, it } from "vitest";
import { crawlerMesh } from "./crawler.js";
import { resolveRecipe } from "./recipe.js";

describe("crawlerMesh", () => {
  it("stands on its feet, as tall as the look, a leg bone for each of its legs", () => {
    for (const [body, legs] of [
      ["spider", 8],
      ["scorpion", 8],
      ["beetle", 6],
    ]) {
      const { positions, bones } = crawlerMesh(resolveRecipe({ body, height: 4 }));
      const ys = positions.filter((_, i) => i % 3 === 1);
      expect(Math.min(...ys), body).toBeCloseTo(0, 0);
      expect(Math.max(...ys), body).toBeCloseTo(4, 3);
      expect(bones.filter((b) => /^leg_\d_01_/.test(b.name)).length, body).toBe(legs);
    }
  });
});
