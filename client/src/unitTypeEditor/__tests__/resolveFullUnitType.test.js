import {describe, it, expect} from "vitest";
import {resolveFullUnitType} from "../resolveFullUnitType";

const availableAbilities = {
  "units/goblin-raider/slash": {ability: {name: "Slash", castTime: null}, assetMap: {}},
};

describe("resolveFullUnitType", () => {
  it("inlines a power's $ref into the real ability content", async () => {
    const unitTypeData = {
      name: "Goblin Raider",
      powers: [{$ref: "../abilities/units/goblin-raider/slash.json", referenceTo: "ability"}],
    };

    const result = await resolveFullUnitType("goblin-raider", unitTypeData, availableAbilities);

    expect(result).toEqual({name: "Goblin Raider", powers: [{name: "Slash", castTime: null}]});
  });

  it("leaves non-reference fields untouched", async () => {
    const unitTypeData = {name: "Goblin Raider", tokenRadius: 1.5, powers: []};

    const result = await resolveFullUnitType("goblin-raider", unitTypeData, availableAbilities);

    expect(result).toEqual(unitTypeData);
  });

  it("throws a clear error when a referenced ability wasn't loaded", async () => {
    const unitTypeData = {powers: [{$ref: "../abilities/units/goblin-raider/missing.json", referenceTo: "ability"}]};

    await expect(resolveFullUnitType("goblin-raider", unitTypeData, availableAbilities)).rejects.toThrow(/No ability loaded/);
  });

  it("throws for a reference type a unit type shouldn't contain", async () => {
    const unitTypeData = {powers: [{$ref: "../maps/main-chamber.json", referenceTo: "map"}]};

    await expect(resolveFullUnitType("goblin-raider", unitTypeData, availableAbilities)).rejects.toThrow(/Don't know how to resolve a "map" reference/);
  });
});
