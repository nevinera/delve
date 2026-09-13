import {describe, it, expect} from "vitest";
import {rawItemStats} from "../itemStats";

// Cross-checked against spec/services/item_stats/raw_spec.rb (the Ruby
// source of truth this mirrors) - same cases, translated from
// primary_stat/secondary_stats/source_json.shield to this draft's
// primary/secondaries/shield field names.
describe("rawItemStats", () => {
  it("computes a fully-itemized head piece (1.5x factor)", () => {
    const stats = rawItemStats({slot: "head", primary: "strength", secondaries: ["crit_rating", "haste_rating", "stamina"]});

    expect(stats.strength).toBeCloseTo(22.5, 1);
    expect(stats.crit_rating).toBeCloseTo(15, 1);
    expect(stats.haste_rating).toBeCloseTo(15, 1);
    expect(stats.stamina).toBeCloseTo(30, 1);
  });

  it("grants base stamina on armor slots even without itemized stamina", () => {
    const stats = rawItemStats({slot: "waist", primary: "strength", secondaries: ["haste_rating"]});
    expect(stats.stamina).toBeCloseTo(10, 1);
  });

  it("does not grant base stamina on rings, necks, or weapons", () => {
    for (const slot of ["ring", "neck", "main_hand"]) {
      const stats = rawItemStats({slot, primary: null, secondaries: []});
      expect(stats.stamina ?? 0).toBe(0);
    }
  });

  it("applies the two-hander's 4x factor", () => {
    const stats = rawItemStats({slot: "two_hand", primary: "strength", secondaries: ["stamina", "crit_rating", "haste_rating"]});
    expect(stats.strength).toBeCloseTo(60, 1);
  });

  describe("redistribution when stats are omitted", () => {
    it("increases remaining secondaries by 26.7% when only the primary is missing (chest, 3/3 secondaries)", () => {
      const stats = rawItemStats({slot: "chest", primary: null, secondaries: ["crit_rating", "haste_rating", "versatility_rating"]});
      expect(stats.crit_rating).toBeCloseTo(19.0, 0);
      expect(stats.haste_rating).toBeCloseTo(19.0, 0);
      expect(stats.versatility_rating).toBeCloseTo(19.0, 0);
    });

    it("increases remaining secondaries by 70% when the primary and one secondary are missing (chest, 2/3 secondaries)", () => {
      const stats = rawItemStats({slot: "chest", primary: null, secondaries: ["crit_rating", "haste_rating"]});
      expect(stats.crit_rating).toBeCloseTo(25.5, 0);
      expect(stats.haste_rating).toBeCloseTo(25.5, 0);
    });

    it("increases the primary when a secondary is missing", () => {
      const stats = rawItemStats({slot: "waist", primary: "strength", secondaries: ["haste_rating"]});
      expect(stats.strength).toBeCloseTo(15 * 1.3, 0);
      expect(stats.haste_rating).toBeCloseTo(10 * 1.3, 0);
    });
  });

  describe("rings and necks", () => {
    it("never has a primary, and its absence doesn't count as 'missing'", () => {
      const stats = rawItemStats({slot: "ring", primary: null, secondaries: ["crit_rating", "haste_rating"]});
      expect(stats.crit_rating).toBeCloseTo(10, 1);
      expect(stats.haste_rating).toBeCloseTo(10, 1);
    });
  });

  describe("shields", () => {
    it("grants the fixed 2.5x Defence Rating instead of a primary", () => {
      const stats = rawItemStats({slot: "off_hand", shield: true, primary: null, secondaries: []});
      expect(stats.defence_rating).toBeCloseTo(75, 1);
    });

    it("adds itemized secondaries and defence_rating on top of the fixed component", () => {
      const stats = rawItemStats({slot: "off_hand", shield: true, primary: null, secondaries: ["defence_rating", "stamina", "mastery_rating"]});
      expect(stats.defence_rating).toBeCloseTo(75 + 20, 1);
      expect(stats.stamina).toBeCloseTo(20, 1);
      expect(stats.mastery_rating).toBeCloseTo(20, 1);
    });

    it("does not count the fixed component as a 'filled' stat for redistribution", () => {
      const stats = rawItemStats({slot: "off_hand", shield: true, primary: null, secondaries: ["stamina"]});
      expect(stats.stamina).toBeCloseTo(10 * 2.0 * 2.2, 0);
    });
  });

  it("returns only the base armor stamina for a completely unitemized item", () => {
    const stats = rawItemStats({slot: "chest", primary: null, secondaries: []});
    expect(stats.strength ?? 0).toBe(0);
    expect(stats.crit_rating ?? 0).toBe(0);
    expect(stats.stamina).toBeCloseTo(15, 1);
  });
});
