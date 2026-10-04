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

  describe("setResourceType", () => {
    it("replaces resource with the preset's full details", () => {
      const result = new UnitTypeDraft(base, "goblin-raider").setResourceType("mana");
      expect(result.data.resource).toEqual({name: "mana", color: "4488FF", max: 100.0, defaultValue: 100.0, returnRate: 2.0, isFluid: true});
    });

    it("drops resource entirely for a falsy id (none)", () => {
      const result = new UnitTypeDraft(base, "goblin-raider").setResourceType("");
      expect(result.data.resource).toBeUndefined();
      expect(result.data).not.toHaveProperty("resource");
    });

    it("leaves the draft unchanged for an unknown id", () => {
      const draft = new UnitTypeDraft(base, "goblin-raider");
      const result = draft.setResourceType("rage");
      expect(result).toBe(draft);
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
    const slash = {name: "Slash", effects: []};
    const bite = {name: "Bite", effects: []};

    it("addPower appends a copy of the given ability", () => {
      const result = new UnitTypeDraft(base, "goblin-raider").addPower(slash);
      expect(result.data.powers).toEqual([slash]);
    });

    it("addPower suffixes a name that's already taken", () => {
      const draft = new UnitTypeDraft({...base, powers: [slash, {name: "Slash 2"}]}, "goblin-raider");
      expect(draft.addPower(slash).data.powers[2].name).toBe("Slash 3");
    });

    it("removePower removes only the entry at the given index", () => {
      const result = new UnitTypeDraft({...base, powers: [slash, bite]}, "goblin-raider").removePower(0);
      expect(result.data.powers).toEqual([bite]);
    });

    it("updatePower replaces the power at the given index", () => {
      const result = new UnitTypeDraft({...base, powers: [slash, bite]}, "goblin-raider").updatePower(1, {...bite, cooldown: 5});
      expect(result.data.powers).toEqual([slash, {...bite, cooldown: 5}]);
    });

    it("updatePower carries a rename through to rotation tactics", () => {
      const draft = new UnitTypeDraft({...base, powers: [slash, bite], tactics: {type: "rotation", powers: ["Slash", "Bite", "Slash"]}}, "goblin-raider");
      const result = draft.updatePower(0, {...slash, name: "Rend"});
      expect(result.data.tactics.powers).toEqual(["Rend", "Bite", "Rend"]);
    });

    it("updatePower carries a rename through to scripted events", () => {
      const tactics = {type: "scripted", duration: 5, events: [{power: "Slash", at: 0}, {power: "Bite", at: 2}]};
      const result = new UnitTypeDraft({...base, powers: [slash, bite], tactics}, "goblin-raider").updatePower(0, {...slash, name: "Rend"});
      expect(result.data.tactics.events).toEqual([{power: "Rend", at: 0}, {power: "Bite", at: 2}]);
    });

    it("powerNames lists each named power", () => {
      const draft = new UnitTypeDraft({...base, powers: [slash, {effects: []}, bite]}, "goblin-raider");
      expect(draft.powerNames).toEqual(["Slash", "Bite"]);
    });
  });

  describe("balance tags", () => {
    it("sets, replaces and clears one tag per exclusive category", () => {
      const options = ["open", "g1", "g5"];
      let draft = new UnitTypeDraft(base, "goblin-raider").setExclusiveTag(options, "open");
      expect(draft.tags).toEqual(["open"]);

      draft = draft.setExclusiveTag(["solo", "pair"], "pair").setExclusiveTag(options, "g1");
      expect(draft.tags).toEqual(["pair", "g1"]);

      draft = draft.setExclusiveTag(options, null);
      expect(draft.tags).toEqual(["pair"]);
    });

    it("toggles role tags, with tough and glass excluding each other", () => {
      let draft = new UnitTypeDraft(base, "goblin-raider").toggleRoleTag("healer").toggleRoleTag("tough");
      expect(draft.tags).toEqual(["healer", "tough"]);

      draft = draft.toggleRoleTag("glass");
      expect(draft.tags).toEqual(["healer", "glass"]);

      draft = draft.toggleRoleTag("healer");
      expect(draft.tags).toEqual(["glass"]);
    });

    it("drops the tags field once it's empty", () => {
      const draft = new UnitTypeDraft({...base, tags: ["buffs"]}, "goblin-raider").toggleRoleTag("buffs");
      expect(draft.data).toEqual(base);
    });
  });
});
