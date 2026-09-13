import {describe, it, expect} from "vitest";
import {abilityKeyForRef, refForAbilityKey} from "../abilityRefs";

describe("refForAbilityKey", () => {
  it("builds a $ref relative to a flat unit type key's own file", () => {
    expect(refForAbilityKey("goblin-raider", "units/goblin-raider/slash")).toBe("../abilities/units/goblin-raider/slash.json");
  });

  it("adds one extra '..' per nesting level in the unit type key", () => {
    expect(refForAbilityKey("goblins/raider", "units/goblins/raider/slash")).toBe(
      "../../abilities/units/goblins/raider/slash.json"
    );
  });
});

describe("abilityKeyForRef", () => {
  it("round-trips a ref built by refForAbilityKey", () => {
    const ref = refForAbilityKey("goblin-raider", "units/goblin-raider/slash");
    expect(abilityKeyForRef("goblin-raider", {$ref: ref, referenceTo: "ability"})).toBe("units/goblin-raider/slash");
  });

  it("round-trips a nested unit type key's ref", () => {
    const ref = refForAbilityKey("goblins/raider", "units/goblins/raider/slash");
    expect(abilityKeyForRef("goblins/raider", {$ref: ref, referenceTo: "ability"})).toBe("units/goblins/raider/slash");
  });

  it("returns null for an inline ability entry (no $ref)", () => {
    expect(abilityKeyForRef("goblin-raider", {name: "Slash", effects: []})).toBeNull();
  });

  it("returns null for a $ref that doesn't match this unit type's expected prefix", () => {
    expect(abilityKeyForRef("goblin-raider", {$ref: "../../abilities/classes/druid/wildshape.json", referenceTo: "ability"})).toBeNull();
  });
});
