import {describe, it, expect} from "vitest";
import {ClassDraft} from "../ClassDraft";

const base = {
  name: "Puncher", description: "", colors: {major: "888888", minor: "CCCCCC"},
  resources: [], powers: [], primaryStats: [], statPriorities: [{name: "hybrid", secondaryStats: []}], wields: [],
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

  describe("stat priorities", () => {
    const priorities = (draft) => draft.data.statPriorities;

    it("pads a rank edit to 5 ranks, filling the given index", () => {
      const result = new ClassDraft(base, "puncher").setStatPriorityRank(0, 0, "crit_rating");
      expect(priorities(result)[0].secondaryStats).toEqual(["crit_rating", "", "", "", ""]);
    });

    it("sets a rank without disturbing the others or the name", () => {
      const draft = new ClassDraft({...base, statPriorities: [{name: "tank", secondaryStats: ["crit_rating", "haste_rating"]}]}, "puncher");
      const result = draft.setStatPriorityRank(0, 2, "mastery_rating");
      expect(priorities(result)).toEqual([{name: "tank", secondaryStats: ["crit_rating", "haste_rating", "mastery_rating", "", ""]}]);
    });

    it("renames a priority", () => {
      const result = new ClassDraft(base, "puncher").setStatPriorityName(0, "healing");
      expect(priorities(result)[0]).toEqual({name: "healing", secondaryStats: []});
    });

    it("adds a priority under the first unused name, up to 3", () => {
      let draft = new ClassDraft(base, "puncher").addStatPriority();
      expect(priorities(draft).map((p) => p.name)).toEqual(["hybrid", "dps"]);
      draft = draft.addStatPriority().addStatPriority();
      expect(priorities(draft).map((p) => p.name)).toEqual(["hybrid", "dps", "tank"]);
    });

    it("removes a priority", () => {
      const draft = new ClassDraft(base, "puncher").addStatPriority().removeStatPriority(0);
      expect(priorities(draft).map((p) => p.name)).toEqual(["dps"]);
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

  describe("resource cap", () => {
    it("addResource does nothing once there are 3", () => {
      const draft = new ClassDraft({...base, resources: [{name: "a"}, {name: "b"}, {name: "c"}]}, "puncher");
      expect(draft.addResource()).toBe(draft);
    });
  });

  describe("powers", () => {
    const punch = {name: "Punch", effects: []};
    const kick = {name: "Kick", effects: []};

    it("addPower appends a copy, suffixing a taken name", () => {
      const result = new ClassDraft({...base, powers: [punch]}, "puncher").addPower(punch);
      expect(result.data.powers.map((p) => p.name)).toEqual(["Punch", "Punch 2"]);
    });

    it("addPower does nothing once all 10 slots are full", () => {
      const draft = new ClassDraft({...base, powers: Array.from({length: 10}, (_, i) => ({name: `P${i}`}))}, "puncher");
      expect(draft.actionBarFull).toBe(true);
      expect(draft.addPower(punch)).toBe(draft);
    });

    it("updatePower and removePower act on the given slot only", () => {
      const draft = new ClassDraft({...base, powers: [punch, kick]}, "puncher");
      expect(draft.updatePower(1, {...kick, cooldown: 3}).data.powers).toEqual([punch, {...kick, cooldown: 3}]);
      expect(draft.removePower(0).data.powers).toEqual([kick]);
    });

    it("movePower swaps a power with its neighbor, ignoring moves off either end", () => {
      const draft = new ClassDraft({...base, powers: [punch, kick]}, "puncher");
      expect(draft.movePower(0, 1).data.powers).toEqual([kick, punch]);
      expect(draft.movePower(1, -1).data.powers).toEqual([kick, punch]);
      expect(draft.movePower(0, -1)).toBe(draft);
      expect(draft.movePower(1, 1)).toBe(draft);
    });
  });

  describe("passives", () => {
    it("addPassive appends a blank inherent status with a unique name", () => {
      const result = new ClassDraft(base, "puncher").addPassive().addPassive();
      expect(result.data.passives.map((p) => p.name)).toEqual(["New Passive", "New Passive 2"]);
      expect(result.data.passives[0].treatAs).toBe("inherent");
    });

    it("addPassive does nothing once there are 6", () => {
      const draft = new ClassDraft({...base, passives: Array.from({length: 6}, (_, i) => ({name: `P${i}`}))}, "puncher");
      expect(draft.addPassive()).toBe(draft);
    });

    it("updatePassive and removePassive act on the given passive only", () => {
      const draft = new ClassDraft({...base, passives: [{name: "A"}, {name: "B"}]}, "puncher");
      expect(draft.updatePassive(1, {name: "C"}).data.passives).toEqual([{name: "A"}, {name: "C"}]);
      expect(draft.removePassive(0).data.passives).toEqual([{name: "B"}]);
    });
  });
});
