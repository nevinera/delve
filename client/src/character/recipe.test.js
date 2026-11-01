import { describe, it, expect } from "vitest";
import { BODY_LOOKS, DEFAULT_LOOK, appearance, randomLook, resolveRecipe } from "./recipe.js";

describe("resolveRecipe", () => {
  it("takes a creature's look from its body, under the recipe's own settings", () => {
    const goblin = resolveRecipe({ body: "goblin" });
    expect(goblin.height).toBeGreaterThanOrEqual(BODY_LOOKS.goblin.height[0]);
    expect(goblin.height).toBeLessThanOrEqual(BODY_LOOKS.goblin.height[1]);
    expect(goblin.ears).toBe("long");
    const troll = resolveRecipe({ body: "troll", height: 10, colors: { eyes: "#ffffff" } });
    expect(troll.height).toBe(10);
    expect(troll.colors.eyes).toBe("#ffffff");
    expect(BODY_LOOKS.troll.colors.skin).toContain(troll.colors.skin);
  });

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
    const look = resolveRecipe({ hair: "beehive", jewelry: ["earrings", "crown"] });
    expect(look.hair).toBe(DEFAULT_LOOK.hair);
    expect(look.jewelry).toEqual(["earrings"]);
  });

  it("frees no hand for an off-hand item beside a two-handed weapon", () => {
    expect(resolveRecipe({ weapon: "sword", offhand: "shield" }).offhand).toBe("shield");
    expect(resolveRecipe({ weapon: "greataxe", offhand: "shield" }).offhand).toBe("none");
  });

  it("loads recipes from other versions, dropping what doesn't fit", () => {
    const look = resolveRecipe({ femininity: 0.8, height: "tall", build: 0.7, face: "glasses", colors: { hair: "red", eyes: "#00ff00", fur: "#111111" }, armor: { chest: { type: "cloth", colors: [7] } } });
    expect(look).not.toHaveProperty("femininity");
    expect(look.height).toBe(DEFAULT_LOOK.height);
    expect(look.build).toBe(0.7);
    expect(look.face).toEqual([]);
    expect(look.colors.hair).toBe(DEFAULT_LOOK.colors.hair);
    expect(look.colors.eyes).toBe("#00ff00");
    expect(look.colors).not.toHaveProperty("fur");
    expect(look.armor.chest.colors[0]).toMatch(/^#/);
  });

  it("makes random looks that load as they are", () => {
    for (let i = 0; i < 20; i++) {
      const look = randomLook();
      expect(resolveRecipe(look)).toEqual(look);
    }
  });
});

describe("appearance", () => {
  it("leaves out the gear a character only tries on", () => {
    const look = resolveRecipe({ weapon: "sword", armor: { chest: { type: "plate", colors: ["#888888", "#444444"] } }, hair: "long" });
    const kept = appearance(look);
    expect(kept).not.toHaveProperty("weapon");
    expect(kept).not.toHaveProperty("offhand");
    expect(kept).not.toHaveProperty("sheathed");
    expect(kept).not.toHaveProperty("armor");
    expect(kept.hair).toBe("long");
    expect(resolveRecipe(kept)).toEqual({ ...look, weapon: "none", offhand: "none", sheathed: false, armor: {} });
  });
});

describe("loadouts", () => {
  const draws = (values) => () => values.shift() ?? 0.5;

  it("wears one outfit, picked by weight", () => {
    const loadouts = [{ weapon: "dagger", weight: 3 }, { weapon: "bow" }];
    expect(resolveRecipe({ loadouts }, draws([0.7])).weapon).toBe("dagger");
    expect(resolveRecipe({ loadouts }, draws([0.8])).weapon).toBe("bow");
  });

  it("puts an outfit over its body's look, and the recipe's own settings over it", () => {
    const loadouts = [{ weapon: "maul", weaponStyle: "savage", armor: { chest: { type: "plate", style: "savage" } } }];
    const look = resolveRecipe({ body: "troll", loadouts });
    expect(look).toMatchObject({ weapon: "maul", weaponStyle: "savage", armor: { chest: { type: "plate", style: "savage" } } });
    expect(resolveRecipe({ body: "troll", loadouts, weapon: "axe" }).weapon).toBe("axe");
  });

  it("drops styles it doesn't know", () => {
    const look = resolveRecipe({ weapon: "sword", weaponStyle: "gilded", armor: { chest: { type: "chain", style: "gilded" } } });
    expect(look.weaponStyle).toBe("fine");
    expect(look.armor.chest.style).toBe("fine");
  });
});
