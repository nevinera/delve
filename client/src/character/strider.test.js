import { describe, expect, it } from "vitest";
import { STRIDERS, striderMesh, striderRoles } from "./strider.js";
import { resolveRecipe } from "./recipe.js";

describe("striderMesh", () => {
  it("stands on two feet as tall as the look, its tail level behind", () => {
    for (const body of Object.keys(STRIDERS)) {
      const { positions, bones } = striderMesh(resolveRecipe({ body, height: 6 }));
      const ys = positions.filter((_, i) => i % 3 === 1);
      const zs = positions.filter((_, i) => i % 3 === 2);
      expect(Math.min(...ys)).toBeGreaterThan(-0.1);
      expect(Math.min(...ys)).toBeLessThan(0.3);
      expect(Math.max(...ys)).toBeCloseTo(6, 0);
      expect(Math.min(...zs)).toBeLessThan(-0.5);
      expect(bones.find((b) => b.name === "mouth")).toBeTruthy();
    }
  });

  it("leaps, kicks or chomps for a big attack", () => {
    expect(striderRoles({ body: "raptor" }).bigAttack).toBe("Leap");
    expect(striderRoles({ body: "ostora" }).bigAttack).toBe("Kick");
    expect(striderRoles({ body: "tyrant" }).bigAttack).toBe("Chomp");
  });
});
