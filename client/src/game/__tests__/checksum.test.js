import { describe, it, expect } from "vitest";
import { computeChecksum, canonicalUnit } from "../checksum";

const parityUnits = {
  "00000000-0000-0000-0000-000000000001": {
    zone_unit_identifier: "goblin_a",
    map_identifier: "cave_interior",
    position: { x: 111.9, y: 66.5, angle: 160 },
    health: 20,
    max_health: 20,
    resource: 100,
    max_resource: 100,
    status: "idle",
    target: null,
    active_status_effects: [
      {
        status_name: "poison",
        applier_id: "00000000-0000-0000-0000-000000000099",
        stacks: 2,
        expires_at: 1800000000000,
      },
    ],
  },
  "00000000-0000-0000-0000-000000000002": {
    zone_unit_identifier: "goblin_x",
    map_identifier: "cave_entrance",
    position: { x: 35, y: 45, angle: 0 },
    health: 20,
    max_health: 20,
    resource: 100,
    max_resource: 100,
    status: "idle",
    target: null,
    active_status_effects: [],
  },
};

const PARITY_CHECKSUM =
  "0ce5b46d994b057cb8c9e6c81c2ac1f8dfd04eacd86080fa5d5e9c524aa20f93";

describe("computeChecksum", () => {
  it("matches the parity fixture shared with Go and Ruby", async () => {
    expect(await computeChecksum(parityUnits)).toBe(PARITY_CHECKSUM);
  });

  it("is order-independent", async () => {
    const reversed = Object.fromEntries(
      Object.entries(parityUnits).reverse()
    );
    expect(await computeChecksum(reversed)).toBe(PARITY_CHECKSUM);
  });

  it("changes when a unit's health changes", async () => {
    const modified = {
      ...parityUnits,
      "00000000-0000-0000-0000-000000000001": {
        ...parityUnits["00000000-0000-0000-0000-000000000001"],
        health: 1,
      },
    };
    expect(await computeChecksum(modified)).not.toBe(PARITY_CHECKSUM);
  });
});

describe("canonicalUnit", () => {
  it("sorts effects by status_name:applier_id", () => {
    const unit = {
      ...parityUnits["00000000-0000-0000-0000-000000000001"],
      active_status_effects: [
        { status_name: "slow", applier_id: "a", stacks: 1, expires_at: 1000 },
        { status_name: "burn", applier_id: "a", stacks: 1, expires_at: 2000 },
      ],
    };
    const result = canonicalUnit(unit);
    expect(result.effects.map((e) => e.id)).toEqual(["burn:a", "slow:a"]);
  });
});
