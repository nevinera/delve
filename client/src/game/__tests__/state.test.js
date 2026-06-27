import { describe, it, expect } from "vitest";
import { applyFullState, applyDelta } from "../state";

const unitA = {
  zone_unit_identifier: "goblin_a",
  map_identifier: "cave",
  position: { x: 10, y: 20, angle: 0 },
  health: 20,
  max_health: 20,
  resource: 100,
  max_resource: 100,
  status: "idle",
  target: null,
  active_status_effects: [],
};

describe("applyFullState", () => {
  it("returns the units from the message", () => {
    const result = applyFullState({ units: { "id-1": unitA } });
    expect(result["id-1"]).toEqual(unitA);
  });

  it("replaces existing units entirely", () => {
    const result = applyFullState({ units: {} });
    expect(result).toEqual({});
  });
});

describe("applyDelta", () => {
  const base = { "id-1": unitA };

  it("merges unit_updates into existing units", () => {
    const result = applyDelta(base, {
      unit_updates: { "id-1": { health: 10 } },
      unit_removals: [],
      effect_adds: [],
      effect_removes: [],
    });
    expect(result["id-1"].health).toBe(10);
    expect(result["id-1"].max_health).toBe(20);
  });

  it("adds new units from unit_updates", () => {
    const newUnit = { ...unitA, zone_unit_identifier: "goblin_b" };
    const result = applyDelta(base, {
      unit_updates: { "id-2": newUnit },
      unit_removals: [],
      effect_adds: [],
      effect_removes: [],
    });
    expect(result["id-2"].zone_unit_identifier).toBe("goblin_b");
    expect(result["id-1"]).toEqual(unitA);
  });

  it("removes units listed in unit_removals", () => {
    const result = applyDelta(base, {
      unit_updates: {},
      unit_removals: ["id-1"],
      effect_adds: [],
      effect_removes: [],
    });
    expect(result["id-1"]).toBeUndefined();
  });

  it("adds status effects via effect_adds", () => {
    const result = applyDelta(base, {
      unit_updates: {},
      unit_removals: [],
      effect_adds: [
        { unit_id: "id-1", status_identifier: "poison", expires_at: 9000 },
      ],
      effect_removes: [],
    });
    expect(result["id-1"].active_status_effects).toEqual([
      { status_identifier: "poison", expires_at: 9000 },
    ]);
  });

  it("deduplicates effect_adds by status_identifier", () => {
    const withEffect = {
      "id-1": {
        ...unitA,
        active_status_effects: [
          { status_identifier: "poison", expires_at: 1000 },
        ],
      },
    };
    const result = applyDelta(withEffect, {
      unit_updates: {},
      unit_removals: [],
      effect_adds: [
        { unit_id: "id-1", status_identifier: "poison", expires_at: 9000 },
      ],
      effect_removes: [],
    });
    const effects = result["id-1"].active_status_effects;
    expect(effects).toHaveLength(1);
    expect(effects[0].expires_at).toBe(9000);
  });

  it("removes status effects via effect_removes", () => {
    const withEffect = {
      "id-1": {
        ...unitA,
        active_status_effects: [
          { status_identifier: "poison", expires_at: 9000 },
        ],
      },
    };
    const result = applyDelta(withEffect, {
      unit_updates: {},
      unit_removals: [],
      effect_adds: [],
      effect_removes: [{ unit_id: "id-1", status_identifier: "poison" }],
    });
    expect(result["id-1"].active_status_effects).toEqual([]);
  });

  it("does not mutate the input units object", () => {
    const frozen = Object.freeze({ "id-1": Object.freeze({ ...unitA }) });
    expect(() =>
      applyDelta(frozen, {
        unit_updates: { "id-1": { health: 5 } },
        unit_removals: [],
        effect_adds: [],
        effect_removes: [],
      })
    ).not.toThrow();
  });
});
