import { describe, it, expect } from "vitest";
import { DEFAULT_LOOK } from "./recipe.js";
import { HELD, OFFHANDS, WEAPON_STYLES, WEAPONS, heldBy, sheathOf, weaponMesh } from "./weapons.js";

describe("weaponMesh", () => {
  it("builds every item but none, and says which bone holds it", () => {
    expect(weaponMesh("none", DEFAULT_LOOK.colors)).toBeNull();
    for (const type of [...WEAPONS, ...OFFHANDS].filter((w) => w !== "none")) {
      const mesh = weaponMesh(type, DEFAULT_LOOK.colors);
      expect(mesh.positions.length).toBeGreaterThan(0);
      expect(mesh.colors.length).toBe(mesh.positions.length);
      expect(mesh.positions.every(Number.isFinite)).toBe(true);
      expect(HELD[type].bone).toMatch(/^(hand|lowerarm)_[lr]$/);
    }
  });

  it("moves one-handed weapons to the left hand in the off hand", () => {
    expect(heldBy("dagger", true).bone).toBe("hand_l");
    expect(heldBy("shield", true).bone).toBe("lowerarm_l");
  });

  it("puts one-handed items away at the hip across from their hand, and the rest on the back", () => {
    expect(sheathOf("sword")).toMatchObject({ place: "hip", side: "l" });
    expect(sheathOf("dagger", true)).toMatchObject({ place: "hip", side: "r" });
    expect(sheathOf("orb", true)).toMatchObject({ place: "hip", side: "r" });
    for (const type of ["greatsword", "maul", "staff", "bow", "gun", "shield"]) expect(sheathOf(type).place).toBe("back");
  });
});

describe("weapon styles", () => {
  it("dents crude and savage items, and gives savage ones spikes", () => {
    for (const type of ["sword", "axe", "maul", "shield"]) {
      const [fine, crude, savage] = WEAPON_STYLES.map((style) => weaponMesh(type, DEFAULT_LOOK.colors, style));
      expect(crude.positions.length).toBe(fine.positions.length);
      expect(crude.positions.some((v, i) => v !== fine.positions[i]), type).toBe(true);
      expect(savage.positions.length, type).toBeGreaterThan(fine.positions.length);
    }
  });
});
