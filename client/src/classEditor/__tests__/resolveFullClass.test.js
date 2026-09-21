import {describe, it, expect} from "vitest";
import {resolveFullClass} from "../resolveFullClass";

const availableAbilities = {
  "classes/puncher/punch": {ability: {name: "Punch", castTime: null}, assetMap: {}},
};

describe("resolveFullClass", () => {
  it("inlines a power's $ref into the real ability content", async () => {
    const classData = {
      name: "Puncher",
      powers: [{$ref: "../abilities/classes/puncher/punch.json", referenceTo: "ability"}],
    };

    const result = await resolveFullClass("puncher", classData, availableAbilities);

    expect(result).toEqual({name: "Puncher", powers: [{name: "Punch", castTime: null}]});
  });

  it("rebases the inlined ability's own asset URLs from abilities/classes/<key>/ to classes/", async () => {
    const abilities = {
      "classes/puncher/punch": {
        ability: {
          name: "Punch",
          iconURL: "../../../graphics/icons/punch.svg",
          graphicEffects: [{sourceURL: "../../../graphics/effects/punch-impact.webp"}],
        },
        assetMap: {},
      },
    };
    const classData = {powers: [{$ref: "../abilities/classes/puncher/punch.json", referenceTo: "ability"}]};

    const result = await resolveFullClass("puncher", classData, abilities);

    expect(result.powers[0]).toEqual({
      name: "Punch",
      iconURL: "../graphics/icons/punch.svg",
      graphicEffects: [{sourceURL: "../graphics/effects/punch-impact.webp"}],
    });
  });

  it("leaves non-reference fields untouched", async () => {
    const classData = {name: "Puncher", colors: {major: "AA2200", minor: "FFCC88"}, powers: []};

    const result = await resolveFullClass("puncher", classData, availableAbilities);

    expect(result).toEqual(classData);
  });

  it("throws a clear error when a referenced ability wasn't loaded", async () => {
    const classData = {powers: [{$ref: "../abilities/classes/puncher/missing.json", referenceTo: "ability"}]};

    await expect(resolveFullClass("puncher", classData, availableAbilities)).rejects.toThrow(/No ability loaded/);
  });

  it("throws for a reference type a class shouldn't contain", async () => {
    const classData = {powers: [{$ref: "../maps/main-chamber.json", referenceTo: "map"}]};

    await expect(resolveFullClass("puncher", classData, availableAbilities)).rejects.toThrow(/Don't know how to resolve a "map" reference/);
  });
});
