import { describe, it, expect } from "vitest";
import { abilityReducer } from "../abilityReducer";

const baseState = { name: "Firebolt", speed: 60.0, maxRange: 40.0 };

describe("abilityReducer", () => {
  it("SET_FIELD updates the named field and leaves the rest untouched", () => {
    const result = abilityReducer(baseState, { type: "SET_FIELD", field: "speed", value: 80.0 });
    expect(result).toEqual({ name: "Firebolt", speed: 80.0, maxRange: 40.0 });
  });

  it("does not mutate the original state", () => {
    abilityReducer(baseState, { type: "SET_FIELD", field: "speed", value: 80.0 });
    expect(baseState.speed).toEqual(60.0);
  });

  it("returns the state unchanged for an unknown action type", () => {
    expect(abilityReducer(baseState, {type: "BOGUS"})).toBe(baseState);
  });

  describe("UPDATE_ENTRY_FIELD", () => {
    const stateWithEffects = {
      name: "Firebolt",
      graphicEffects: [
        {sourceURL: "a.png", when: "immediate"},
        {sourceURL: "b.png", when: "impact"},
      ],
    };

    it("updates the named field on the entry at the given index only", () => {
      const result = abilityReducer(stateWithEffects, {
        type: "UPDATE_ENTRY_FIELD", section: "graphicEffects", index: 1, field: "when", value: "always",
      });
      expect(result.graphicEffects[0]).toEqual({sourceURL: "a.png", when: "immediate"});
      expect(result.graphicEffects[1]).toEqual({sourceURL: "b.png", when: "always"});
    });

    it("does not mutate the original state", () => {
      abilityReducer(stateWithEffects, {
        type: "UPDATE_ENTRY_FIELD", section: "graphicEffects", index: 0, field: "when", value: "impact",
      });
      expect(stateWithEffects.graphicEffects[0].when).toEqual("immediate");
    });
  });

  describe("ADD_ENTRY", () => {
    it("appends the new entry to the end of the section's array", () => {
      const state = {name: "Firebolt", graphicEffects: [{sourceURL: "a.png"}]};
      const result = abilityReducer(state, {type: "ADD_ENTRY", section: "graphicEffects", entry: {sourceURL: "b.png"}});
      expect(result.graphicEffects).toEqual([{sourceURL: "a.png"}, {sourceURL: "b.png"}]);
    });

    it("creates the section array when it doesn't exist yet", () => {
      const state = {name: "Firebolt"};
      const result = abilityReducer(state, {type: "ADD_ENTRY", section: "effects", entry: {type: "harm"}});
      expect(result.effects).toEqual([{type: "harm"}]);
    });

    it("does not mutate the original state", () => {
      const state = {name: "Firebolt", graphicEffects: [{sourceURL: "a.png"}]};
      abilityReducer(state, {type: "ADD_ENTRY", section: "graphicEffects", entry: {sourceURL: "b.png"}});
      expect(state.graphicEffects).toEqual([{sourceURL: "a.png"}]);
    });
  });

  describe("REMOVE_ENTRY", () => {
    const stateWithThree = {
      name: "Firebolt",
      effects: [{type: "harm"}, {type: "heal"}, {type: "resource"}],
    };

    it("removes only the entry at the given index", () => {
      const result = abilityReducer(stateWithThree, {type: "REMOVE_ENTRY", section: "effects", index: 1});
      expect(result.effects).toEqual([{type: "harm"}, {type: "resource"}]);
    });

    it("does not mutate the original state", () => {
      abilityReducer(stateWithThree, {type: "REMOVE_ENTRY", section: "effects", index: 0});
      expect(stateWithThree.effects).toHaveLength(3);
    });
  });
});
