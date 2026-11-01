import { describe, expect, it } from "vitest";
import { batMesh } from "./bat.js";
import { resolveRecipe } from "./recipe.js";

describe("batMesh", () => {
  it("hangs in the air, as wide across its wings as the look's height", () => {
    const { positions, bones } = batMesh(resolveRecipe({ body: "bat", height: 10 }));
    const ys = positions.filter((_, i) => i % 3 === 1);
    const xs = positions.filter((_, i) => i % 3 === 0);
    expect(Math.min(...ys)).toBeGreaterThan(2);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(10, 0);
    expect(bones.find((b) => b.name === "mouth")).toBeTruthy();
  });
});
