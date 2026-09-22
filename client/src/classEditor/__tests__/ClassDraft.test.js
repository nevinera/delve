import {describe, it, expect} from "vitest";
import {ClassDraft} from "../ClassDraft";

const base = {
  name: "Puncher", description: "", colors: {major: "888888", minor: "CCCCCC"},
  resources: [], powers: [], primaryStats: [], secondaryStats: [], wields: [],
};

describe("ClassDraft", () => {
  describe("setField", () => {
    it("returns a new ClassDraft with the field updated, leaving classKey and the rest of the data intact", () => {
      const draft = new ClassDraft(base, "puncher");

      const result = draft.setField("name", "Brawler");

      expect(result).not.toBe(draft);
      expect(result.data).toEqual({...base, name: "Brawler"});
      expect(result.classKey).toBe("puncher");
      expect(draft.data.name).toBe("Puncher");
    });
  });

  describe("setColor", () => {
    it("merges the given color into colors, leaving the other one untouched", () => {
      const result = new ClassDraft(base, "puncher").setColor("major", "8B4513");
      expect(result.data.colors).toEqual({major: "8B4513", minor: "CCCCCC"});
    });
  });

  describe("togglePrimaryStat", () => {
    it("adds a stat not already present", () => {
      const result = new ClassDraft(base, "puncher").togglePrimaryStat("strength");
      expect(result.data.primaryStats).toEqual(["strength"]);
    });

    it("removes a stat already present", () => {
      const draft = new ClassDraft({...base, primaryStats: ["strength", "agility"]}, "puncher");
      const result = draft.togglePrimaryStat("strength");
      expect(result.data.primaryStats).toEqual(["agility"]);
    });
  });

  describe("setSecondaryStatRank", () => {
    it("pads to 5 ranks, filling the given index", () => {
      const result = new ClassDraft(base, "puncher").setSecondaryStatRank(0, "crit_rating");
      expect(result.data.secondaryStats).toEqual(["crit_rating", "", "", "", ""]);
    });

    it("sets a rank without disturbing the others", () => {
      const draft = new ClassDraft({...base, secondaryStats: ["crit_rating", "haste_rating"]}, "puncher");
      const result = draft.setSecondaryStatRank(2, "mastery_rating");
      expect(result.data.secondaryStats).toEqual(["crit_rating", "haste_rating", "mastery_rating", "", ""]);
    });
  });

  describe("setWields", () => {
    it("sets both hands", () => {
      const result = new ClassDraft(base, "puncher").setWields("axe", "dagger");
      expect(result.data.wields).toEqual(["axe", "dagger"]);
    });

    it("drops a blank off-hand rather than storing an empty string", () => {
      const result = new ClassDraft(base, "puncher").setWields("axe", "");
      expect(result.data.wields).toEqual(["axe"]);
    });
  });

  describe("resources", () => {
    it("addResource appends a blank resource", () => {
      const result = new ClassDraft(base, "puncher").addResource();
      expect(result.data.resources).toEqual([{name: "", color: "888888", max: 100, defaultValue: 0, returnRate: 0, isFluid: false}]);
    });

    it("removeResource removes only the entry at the given index", () => {
      const draft = new ClassDraft({...base, resources: [{name: "energy"}, {name: "mana"}]}, "puncher");
      const result = draft.removeResource(0);
      expect(result.data.resources).toEqual([{name: "mana"}]);
    });

    it("updateResourceField updates a single field on the entry at the given index only", () => {
      const draft = new ClassDraft({...base, resources: [{name: "energy", max: 100}, {name: "mana", max: 50}]}, "puncher");
      const result = draft.updateResourceField(1, "max", 75);
      expect(result.data.resources).toEqual([{name: "energy", max: 100}, {name: "mana", max: 75}]);
    });

    it("setPrimaryResource marks only the entry at the given index as primary", () => {
      const draft = new ClassDraft({...base, resources: [{name: "energy"}, {name: "mana"}]}, "puncher");
      const result = draft.setPrimaryResource(1);
      expect(result.data.resources).toEqual([
        {name: "energy", displayType: null},
        {name: "mana", displayType: "primary"},
      ]);
    });

    it("setPrimaryResource clears displayType from whichever entry previously held it", () => {
      const draft = new ClassDraft(
        {...base, resources: [{name: "energy", displayType: "primary"}, {name: "mana"}]},
        "puncher"
      );
      const result = draft.setPrimaryResource(1);
      expect(result.data.resources).toEqual([
        {name: "energy", displayType: null},
        {name: "mana", displayType: "primary"},
      ]);
    });
  });

  describe("power slots", () => {
    it("abilityKeyForPowerSlot returns null for an empty slot", () => {
      const draft = new ClassDraft(base, "puncher");
      expect(draft.abilityKeyForPowerSlot(0)).toBeNull();
    });

    it("abilityKeyForPowerSlot returns the key for a filled slot", () => {
      const withPower = {...base, powers: [{$ref: "../abilities/classes/puncher/punch.json", referenceTo: "ability"}]};
      const draft = new ClassDraft(withPower, "puncher");
      expect(draft.abilityKeyForPowerSlot(0)).toBe("classes/puncher/punch");
    });

    it("setPowerSlot appends when filling the first empty slot", () => {
      const result = new ClassDraft(base, "puncher").setPowerSlot(0, "classes/puncher/punch");
      expect(result.data.powers).toEqual([{$ref: "../abilities/classes/puncher/punch.json", referenceTo: "ability"}]);
    });

    it("setPowerSlot replaces an already-filled slot in place", () => {
      const withPower = {...base, powers: [{$ref: "../abilities/classes/puncher/punch.json", referenceTo: "ability"}]};
      const result = new ClassDraft(withPower, "puncher").setPowerSlot(0, "classes/puncher/kick");
      expect(result.data.powers).toEqual([{$ref: "../abilities/classes/puncher/kick.json", referenceTo: "ability"}]);
    });

    it("clearPowerSlot removes the slot and reflows the ones after it", () => {
      const twoPowers = {
        ...base,
        powers: [
          {$ref: "../abilities/classes/puncher/punch.json", referenceTo: "ability"},
          {$ref: "../abilities/classes/puncher/kick.json", referenceTo: "ability"},
        ],
      };
      const result = new ClassDraft(twoPowers, "puncher").clearPowerSlot(0);
      expect(result.data.powers).toEqual([{$ref: "../abilities/classes/puncher/kick.json", referenceTo: "ability"}]);
    });

    it("resolves a nested class key's power ref with the matching '../' depth", () => {
      const result = new ClassDraft(base, "hybrid/druid").setPowerSlot(0, "classes/hybrid/druid/wildshape");
      expect(result.data.powers[0].$ref).toBe("../../abilities/classes/hybrid/druid/wildshape.json");
    });
  });
});
