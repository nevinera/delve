import { describe, it, expect } from "vitest";
import { ARMOR_SLOTS, ARMOR_TYPES } from "./armor.js";
import { bodyMesh } from "./body.js";
import { resolveRecipe } from "./recipe.js";

const mesh = (armor) => bodyMesh(resolveRecipe({ armor }));

describe("armor", () => {
  it("builds every type in every slot, weighted to real bones", () => {
    const bare = mesh({});
    for (const slot of ARMOR_SLOTS) {
      for (const type of ARMOR_TYPES) {
        const dressed = mesh({ [slot]: { type } });
        const changed = dressed.positions.length !== bare.positions.length || dressed.colors.some((v, i) => v !== bare.colors[i]);
        expect(changed, `${type} ${slot}`).toBe(true);
        expect(Math.max(...dressed.skinIndex)).toBeLessThan(dressed.bones.length);
      }
    }
  });

  it("marks only chain for the mail texture", () => {
    const marked = (type) => mesh({ chest: { type } }).mail.some((m) => m === 1);
    expect(marked("chain")).toBe(true);
    expect(marked("plate")).toBe(false);
  });

  it("fills in a type's colors when a recipe leaves them out", () => {
    expect(resolveRecipe({ armor: { head: { type: "plate" } } }).armor.head.colors).toHaveLength(2);
  });
});
