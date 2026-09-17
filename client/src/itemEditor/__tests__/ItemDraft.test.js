import {describe, it, expect} from "vitest";
import {ItemDraft} from "../ItemDraft";

const base = {identifier: "sword-of-doom", name: "Sword of Doom", slot: "main_hand", elvl: 100, primary: "strength", weaponType: "sword", secondaries: ["stamina"]};

describe("ItemDraft", () => {
  describe("setField", () => {
    it("returns a new ItemDraft with the field updated, leaving the rest untouched", () => {
      const draft = new ItemDraft(base);

      const result = draft.setField("name", "Sword of Ruin");

      expect(result).not.toBe(draft);
      expect(result.data).toEqual({...base, name: "Sword of Ruin"});
      expect(draft.data.name).toBe("Sword of Doom"); // original untouched
    });
  });

  describe("slot/shield/secondaries accessors", () => {
    it("slot defaults to an empty string when unset", () => {
      expect(new ItemDraft({}).slot).toBe("");
    });

    it("shield is only true for a flagged off_hand item", () => {
      expect(new ItemDraft({slot: "off_hand", shield: true}).shield).toBe(true);
      expect(new ItemDraft({slot: "main_hand", shield: true}).shield).toBe(false);
      expect(new ItemDraft({slot: "off_hand", shield: false}).shield).toBe(false);
    });

    it("secondaries defaults to an empty array when not an array", () => {
      expect(new ItemDraft({}).secondaries).toEqual([]);
      expect(new ItemDraft({secondaries: null}).secondaries).toEqual([]);
    });
  });

  describe("primaryEligible/weaponTypeEligible", () => {
    it("excludes ring and neck from primary eligibility", () => {
      expect(new ItemDraft({slot: "ring"}).primaryEligible).toBe(false);
      expect(new ItemDraft({slot: "neck"}).primaryEligible).toBe(false);
      expect(new ItemDraft({slot: "chest"}).primaryEligible).toBe(true);
    });

    it("excludes a shield from both primary and weaponType eligibility", () => {
      const shieldDraft = new ItemDraft({slot: "off_hand", shield: true});
      expect(shieldDraft.primaryEligible).toBe(false);
      expect(shieldDraft.weaponTypeEligible).toBe(false);
    });

    it("only weapon slots are weaponType-eligible", () => {
      expect(new ItemDraft({slot: "main_hand"}).weaponTypeEligible).toBe(true);
      expect(new ItemDraft({slot: "chest"}).weaponTypeEligible).toBe(false);
    });
  });

  describe("setSlot", () => {
    it("clears weaponType and primary when switching to a ring slot", () => {
      const result = new ItemDraft(base).setSlot("ring");

      expect(result.data.slot).toBe("ring");
      expect(result.data.primary).toBeNull();
      expect(result.data.weaponType).toBeNull();
    });

    it("clears shield when switching away from off_hand", () => {
      const draft = new ItemDraft({slot: "off_hand", shield: true});

      const result = draft.setSlot("main_hand");

      expect(result.data.shield).toBe(false);
    });

    it("keeps primary/weaponType when switching between two eligible weapon slots", () => {
      const result = new ItemDraft(base).setSlot("two_hand");

      expect(result.data.primary).toBe("strength");
      expect(result.data.weaponType).toBe("sword");
    });

    it("clears primary/weaponType when switching to off_hand while already shielded", () => {
      // Simulates the field panel's own sequencing (setShield keeps the
      // slot itself unchanged) - if a caller ever set slot to off_hand
      // while data.shield is already true, the new slot's eligibility
      // must still be computed from the *prospective* shield state.
      const draft = new ItemDraft({...base, slot: "main_hand", shield: true});

      const result = draft.setSlot("off_hand");

      expect(result.data.primary).toBeNull();
      expect(result.data.weaponType).toBeNull();
    });
  });

  describe("setShield", () => {
    it("clears primary and weaponType when turned on", () => {
      const draft = new ItemDraft({...base, slot: "off_hand"});

      const result = draft.setShield(true);

      expect(result.data.shield).toBe(true);
      expect(result.data.primary).toBeNull();
      expect(result.data.weaponType).toBeNull();
    });

    it("doesn't restore primary/weaponType when turned back off - just clears the flag", () => {
      const draft = new ItemDraft({...base, slot: "off_hand", shield: true, primary: null, weaponType: null});

      const result = draft.setShield(false);

      expect(result.data.shield).toBe(false);
      expect(result.data.primary).toBeNull();
    });
  });

  describe("toggleSecondary", () => {
    it("adds a stat not already present, under the slot's cap", () => {
      const draft = new ItemDraft({slot: "ring", secondaries: ["stamina"]}); // ring caps at 2

      const result = draft.toggleSecondary("crit_rating");

      expect(result.data.secondaries).toEqual(["stamina", "crit_rating"]);
    });

    it("removes a stat already present", () => {
      const draft = new ItemDraft({slot: "ring", secondaries: ["stamina", "crit_rating"]});

      const result = draft.toggleSecondary("stamina");

      expect(result.data.secondaries).toEqual(["crit_rating"]);
    });

    it("is a no-op (returns the same instance) when adding past the slot's cap", () => {
      const draft = new ItemDraft({slot: "ring", secondaries: ["stamina", "crit_rating"]}); // already at ring's cap of 2

      const result = draft.toggleSecondary("haste_rating");

      expect(result).toBe(draft);
      expect(result.data.secondaries).toEqual(["stamina", "crit_rating"]);
    });
  });
});
