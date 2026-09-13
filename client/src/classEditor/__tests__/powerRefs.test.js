import {describe, it, expect} from "vitest";
import {abilityKeyForRef, refForAbilityKey} from "../powerRefs";

describe("refForAbilityKey", () => {
  it("builds a $ref relative to a flat class key's own file", () => {
    expect(refForAbilityKey("puncher", "classes/puncher/punch")).toBe("../abilities/classes/puncher/punch.json");
  });

  it("adds one extra '..' per nesting level in the class key", () => {
    expect(refForAbilityKey("hybrid/druid", "classes/hybrid/druid/wildshape")).toBe(
      "../../abilities/classes/hybrid/druid/wildshape.json"
    );
  });
});

describe("abilityKeyForRef", () => {
  it("round-trips a ref built by refForAbilityKey", () => {
    const ref = refForAbilityKey("puncher", "classes/puncher/punch");
    expect(abilityKeyForRef("puncher", {$ref: ref, referenceTo: "ability"})).toBe("classes/puncher/punch");
  });

  it("round-trips a nested class key's ref", () => {
    const ref = refForAbilityKey("hybrid/druid", "classes/hybrid/druid/wildshape");
    expect(abilityKeyForRef("hybrid/druid", {$ref: ref, referenceTo: "ability"})).toBe("classes/hybrid/druid/wildshape");
  });

  it("returns null for an inline ability entry (no $ref)", () => {
    expect(abilityKeyForRef("puncher", {name: "Punch", effects: []})).toBeNull();
  });

  it("returns null for a $ref that doesn't match this class's expected prefix", () => {
    expect(abilityKeyForRef("puncher", {$ref: "../../abilities/units/goblins/enrage.json", referenceTo: "ability"})).toBeNull();
  });
});
