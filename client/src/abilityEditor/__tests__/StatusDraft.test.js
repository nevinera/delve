import {describe, it, expect} from "vitest";
import {StatusDraft} from "../StatusDraft";

const status = {
  name: "Second Wind",
  shortName: "2ndWnd",
  treatAs: "buff",
  stacking: "replace",
  effects: [{type: "stat", statName: "movementSpeed", modifierType: "multiply", amount: 1.2}],
};

describe("StatusDraft", () => {
  describe("blank", () => {
    it("returns a minimal already-valid status", () => {
      expect(StatusDraft.blank().data).toEqual({name: "", shortName: "", treatAs: "buff", stacking: "replace", effects: []});
    });
  });

  describe("setField", () => {
    it("returns a new StatusDraft with the field updated, leaving the rest untouched", () => {
      const draft = new StatusDraft(status);

      const result = draft.setField("name", "Second Wind II");

      expect(result).not.toBe(draft);
      expect(result.data).toEqual({...status, name: "Second Wind II"});
      expect(draft.data.name).toBe("Second Wind");
    });
  });

  describe("aura effect", () => {
    it("addAuraEffect sets a blank aura effect", () => {
      const result = new StatusDraft(status).addAuraEffect();
      expect(result.data.auraEffect).toEqual({sourceURL: ""});
    });

    it("removeAuraEffect clears it", () => {
      const withAura = {...status, auraEffect: {sourceURL: "a.webp"}};
      const result = new StatusDraft(withAura).removeAuraEffect();
      expect(result.data.auraEffect).toBeNull();
    });

    it("updateAuraEffect merges fields onto the existing aura effect", () => {
      const withAura = {...status, auraEffect: {sourceURL: "a.webp", scale: 1.0}};
      const result = new StatusDraft(withAura).updateAuraEffect({scale: 1.3, opacity: 0.5});
      expect(result.data.auraEffect).toEqual({sourceURL: "a.webp", scale: 1.3, opacity: 0.5});
    });

    it("pickAuraStockGraphic writes sourceURL and sprite fields", () => {
      const withAura = {...status, auraEffect: {sourceURL: "a.webp"}};
      const stockGraphics = {glow: {spriteColumns: null, spriteRows: null, spriteFrameCount: null, spriteFrameRate: null}};

      const result = new StatusDraft(withAura).pickAuraStockGraphic("glow", stockGraphics);

      expect(result.data.auraEffect.sourceURL).toBe(":glow:");
    });
  });

  describe("status effects", () => {
    it("addStatusEffect appends a placeholder of the given type", () => {
      const result = new StatusDraft({...status, effects: []}).addStatusEffect("recurring");
      expect(result.data.effects).toEqual([{type: "recurring", tickRate: 1.0, onTick: "heal", amount: 1.0}]);
    });

    it("addStatusEffect defaults to a stat placeholder", () => {
      const result = new StatusDraft({...status, effects: []}).addStatusEffect();
      expect(result.data.effects[0].type).toBe("stat");
    });

    it("removeStatusEffect removes only the entry at the given index", () => {
      const twoEffects = {...status, effects: [{type: "stat"}, {type: "none"}]};
      const result = new StatusDraft(twoEffects).removeStatusEffect(0);
      expect(result.data.effects).toEqual([{type: "none"}]);
    });

    it("setStatusEffectType replaces the entry at the given index with a fresh placeholder", () => {
      const result = new StatusDraft(status).setStatusEffectType(0, "recurring");
      expect(result.data.effects).toEqual([{type: "recurring", tickRate: 1.0, onTick: "heal", amount: 1.0}]);
    });

    it("updateStatusEffect merges fields onto the entry at the given index only", () => {
      const twoEffects = {...status, effects: [{type: "stat", amount: 1.0}, {type: "stat", amount: 2.0}]};
      const result = new StatusDraft(twoEffects).updateStatusEffect(1, {amount: 5.0});
      expect(result.data.effects).toEqual([{type: "stat", amount: 1.0}, {type: "stat", amount: 5.0}]);
    });

    it("updateStatusEffect deletes a key entirely when given null, rather than storing null", () => {
      const withSchool = {...status, effects: [{type: "recurring", school: "physical"}]};
      const result = new StatusDraft(withSchool).updateStatusEffect(0, {school: null});
      expect(result.data.effects[0]).toEqual({type: "recurring"});
      expect("school" in result.data.effects[0]).toBe(false);
    });
  });
});
