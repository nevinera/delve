import {describe, it, expect} from "vitest";
import {UnitTypeDraft} from "../UnitTypeDraft";

const base = {
  name: "Goblin Raider", description: "", tokenImageUrl: [], tokenRadius: 1.5,
  maxHP: 20, dps: 4.0, attackSpeed: 1.0,
  resource: {name: "energy", color: "888888", max: 100.0, defaultValue: 100.0, returnRate: 0.0, isFluid: true},
  targeting: {type: "aggroTable"}, tactics: {type: "randomAvailable"}, powers: [],
};

describe("UnitTypeDraft", () => {
  describe("setField", () => {
    it("returns a new UnitTypeDraft with the field updated, leaving unitTypeKey and the rest intact", () => {
      const draft = new UnitTypeDraft(base, "goblin-raider");

      const result = draft.setField("name", "Goblin Brute");

      expect(result).not.toBe(draft);
      expect(result.data).toEqual({...base, name: "Goblin Brute"});
      expect(result.unitTypeKey).toBe("goblin-raider");
      expect(draft.data.name).toBe("Goblin Raider");
    });
  });

  describe("token images", () => {
    it("addTokenImage appends a blank entry", () => {
      const result = new UnitTypeDraft(base, "goblin-raider").addTokenImage();
      expect(result.data.tokenImageUrl).toEqual([""]);
    });

    it("updateTokenImage updates only the entry at the given index", () => {
      const draft = new UnitTypeDraft({...base, tokenImageUrl: ["a.webp", "b.webp"]}, "goblin-raider");
      const result = draft.updateTokenImage(1, "c.webp");
      expect(result.data.tokenImageUrl).toEqual(["a.webp", "c.webp"]);
    });

    it("removeTokenImage removes only the entry at the given index", () => {
      const draft = new UnitTypeDraft({...base, tokenImageUrl: ["a.webp", "b.webp"]}, "goblin-raider");
      const result = draft.removeTokenImage(0);
      expect(result.data.tokenImageUrl).toEqual(["b.webp"]);
    });
  });

  describe("updateResourceField", () => {
    it("merges the field into the existing resource", () => {
      const result = new UnitTypeDraft(base, "goblin-raider").updateResourceField("max", 200);
      expect(result.data.resource).toEqual({...base.resource, max: 200});
    });

    it("works even when there's no resource yet", () => {
      const draft = new UnitTypeDraft({...base, resource: undefined}, "goblin-raider");
      const result = draft.updateResourceField("name", "rage");
      expect(result.data.resource).toEqual({name: "rage"});
    });
  });

  describe("setTargetingType", () => {
    it("replaces targeting with just the given type", () => {
      const result = new UnitTypeDraft(base, "goblin-raider").setTargetingType("nearest");
      expect(result.data.targeting).toEqual({type: "nearest"});
    });
  });

  describe("setTacticsType", () => {
    it("switches to a rotation placeholder with an empty powers list", () => {
      const result = new UnitTypeDraft(base, "goblin-raider").setTacticsType("rotation");
      expect(result.data.tactics).toEqual({type: "rotation", powers: []});
    });

    it("switches to a scripted placeholder with a default duration and no events", () => {
      const result = new UnitTypeDraft(base, "goblin-raider").setTacticsType("scripted");
      expect(result.data.tactics).toEqual({type: "scripted", duration: 1.0, events: []});
    });

    it("switches back to randomAvailable with no extra fields", () => {
      const result = new UnitTypeDraft({...base, tactics: {type: "rotation", powers: ["a"]}}, "goblin-raider").setTacticsType("randomAvailable");
      expect(result.data.tactics).toEqual({type: "randomAvailable"});
    });
  });

  describe("rotation tactics", () => {
    const withRotation = {...base, tactics: {type: "rotation", powers: ["Slash"]}};

    it("addRotationPower appends the given default", () => {
      const result = new UnitTypeDraft(withRotation, "goblin-raider").addRotationPower("Bite");
      expect(result.data.tactics.powers).toEqual(["Slash", "Bite"]);
    });

    it("updateRotationPower updates only the entry at the given index", () => {
      const result = new UnitTypeDraft(withRotation, "goblin-raider").updateRotationPower(0, "Bite");
      expect(result.data.tactics.powers).toEqual(["Bite"]);
    });

    it("removeRotationPower removes only the entry at the given index", () => {
      const twoPowers = {...base, tactics: {type: "rotation", powers: ["Slash", "Bite"]}};
      const result = new UnitTypeDraft(twoPowers, "goblin-raider").removeRotationPower(0);
      expect(result.data.tactics.powers).toEqual(["Bite"]);
    });
  });

  describe("scripted tactics", () => {
    const withScripted = {...base, tactics: {type: "scripted", duration: 5.0, events: [{power: "Slash", at: 0}]}};

    it("setTacticsDuration updates the duration, defaulting a cleared value to 0", () => {
      const result = new UnitTypeDraft(withScripted, "goblin-raider").setTacticsDuration(null);
      expect(result.data.tactics.duration).toBe(0);
    });

    it("addScriptedEvent appends an event with the given default power at time 0", () => {
      const result = new UnitTypeDraft(withScripted, "goblin-raider").addScriptedEvent("Bite");
      expect(result.data.tactics.events).toEqual([{power: "Slash", at: 0}, {power: "Bite", at: 0}]);
    });

    it("updateScriptedEvent merges a field onto the entry at the given index only", () => {
      const result = new UnitTypeDraft(withScripted, "goblin-raider").updateScriptedEvent(0, "at", 2.5);
      expect(result.data.tactics.events).toEqual([{power: "Slash", at: 2.5}]);
    });

    it("removeScriptedEvent removes only the entry at the given index", () => {
      const result = new UnitTypeDraft(withScripted, "goblin-raider").removeScriptedEvent(0);
      expect(result.data.tactics.events).toEqual([]);
    });
  });

  describe("powers", () => {
    it("abilityKeyForPower returns the key for a filled slot", () => {
      const withPower = {...base, powers: [{$ref: "../abilities/units/goblin-raider/slash.json", referenceTo: "ability"}]};
      const draft = new UnitTypeDraft(withPower, "goblin-raider");
      expect(draft.abilityKeyForPower(0)).toBe("units/goblin-raider/slash");
    });

    it("addPower appends a new power entry", () => {
      const result = new UnitTypeDraft(base, "goblin-raider").addPower("units/goblins/slash");
      expect(result.data.powers).toEqual([{$ref: "../abilities/units/goblins/slash.json", referenceTo: "ability"}]);
    });

    it("setPower replaces an existing power entry in place", () => {
      const withPower = {...base, powers: [{$ref: "../abilities/units/goblin-raider/slash.json", referenceTo: "ability"}]};
      const result = new UnitTypeDraft(withPower, "goblin-raider").setPower(0, "units/goblin-raider/bite");
      expect(result.data.powers).toEqual([{$ref: "../abilities/units/goblin-raider/bite.json", referenceTo: "ability"}]);
    });

    it("removePower removes only the entry at the given index", () => {
      const twoPowers = {
        ...base,
        powers: [
          {$ref: "../abilities/units/goblin-raider/slash.json", referenceTo: "ability"},
          {$ref: "../abilities/units/goblin-raider/bite.json", referenceTo: "ability"},
        ],
      };
      const result = new UnitTypeDraft(twoPowers, "goblin-raider").removePower(0);
      expect(result.data.powers).toEqual([{$ref: "../abilities/units/goblin-raider/bite.json", referenceTo: "ability"}]);
    });
  });

  describe("currentPowerNames", () => {
    it("resolves each power's name from availableAbilities, skipping unresolved ones", () => {
      const withPowers = {
        ...base,
        powers: [
          {$ref: "../abilities/units/goblin-raider/slash.json", referenceTo: "ability"},
          {$ref: "../abilities/units/goblin-raider/missing.json", referenceTo: "ability"},
        ],
      };
      const availableAbilities = {"units/goblin-raider/slash": {ability: {name: "Slash"}}};

      const names = new UnitTypeDraft(withPowers, "goblin-raider").currentPowerNames(availableAbilities);

      expect(names).toEqual(["Slash"]);
    });
  });
});
