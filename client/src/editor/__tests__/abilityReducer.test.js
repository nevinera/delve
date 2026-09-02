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
});
