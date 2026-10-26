import { describe, it, expect } from "vitest";
import { DEFAULT_LOOK, resolveRecipe } from "./recipe.js";

describe("resolveRecipe", () => {
  it("fills in the defaults", () => {
    expect(resolveRecipe({ height: 5 })).toEqual({ ...DEFAULT_LOOK, height: 5 });
  });

  it("picks numbers in ranges and strings from lists", () => {
    const look = resolveRecipe({ height: [5, 7], hair: ["long", "bald"], colors: { primary: ["#111111", "#222222"] } }, () => 0.5);
    expect(look.height).toBe(6);
    expect(look.hair).toBe("bald");
    expect(look.colors.primary).toBe("#222222");
    expect(look.colors.skin).toBe(DEFAULT_LOOK.colors.skin);
  });

  it("drops parts it doesn't know", () => {
    const look = resolveRecipe({ hair: "dreadlocks", jewelry: ["earrings", "crown"] });
    expect(look.hair).toBe(DEFAULT_LOOK.hair);
    expect(look.jewelry).toEqual(["earrings"]);
  });

  it("frees no hand for an off-hand item beside a two-handed weapon", () => {
    expect(resolveRecipe({ weapon: "sword", offhand: "shield" }).offhand).toBe("shield");
    expect(resolveRecipe({ weapon: "greataxe", offhand: "shield" }).offhand).toBe("none");
  });
});
