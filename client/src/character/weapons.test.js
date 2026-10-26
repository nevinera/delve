import { describe, it, expect } from "vitest";
import { DEFAULT_LOOK, WEAPONS } from "./recipe.js";
import { HELD, weaponMesh } from "./weapons.js";

const lowest = (positions) => Math.min(...positions.filter((_, i) => i % 3 === 1));

describe("weaponMesh", () => {
  it("builds every weapon but none, and says which hand holds it", () => {
    expect(weaponMesh("none", DEFAULT_LOOK.colors)).toBeNull();
    for (const type of WEAPONS.filter((w) => w !== "none")) {
      const mesh = weaponMesh(type, DEFAULT_LOOK.colors);
      expect(mesh.positions.length).toBeGreaterThan(0);
      expect(mesh.colors.length).toBe(mesh.positions.length);
      expect(HELD[type].hand).toMatch(/^hand_[lr]$/);
    }
  });

  it("rests a staff on the ground below the grip", () => {
    expect(lowest(weaponMesh("staff", DEFAULT_LOOK.colors, { ground: 2.5 }).positions)).toBeCloseTo(-2.5, 1);
  });
});
