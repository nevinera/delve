import { describe, it, expect } from "vitest";
import { visibleUnits } from "../stealthView";

const plain = {zone_unit_identifier: "brute", position: {x: 1, y: 2, angle: 0}};
const sneak = {zone_unit_identifier: "sneak", position: null, stealthed: true};

describe("visibleUnits", () => {
  it("returns the same units when nothing is stealthed", () => {
    const units = {a: plain};
    expect(visibleUnits(units, undefined)).toBe(units);
  });

  it("leaves out stealthed units this player doesn't detect", () => {
    expect(visibleUnits({a: plain, b: sneak}, undefined)).toEqual({a: plain});
  });

  it("places detected stealthed units, with how well they're seen", () => {
    const view = {b: {position: {x: 5, y: 6, angle: 90}, visibility: "faint"}};
    const units = {a: plain, b: sneak};
    const visible = visibleUnits(units, view);
    expect(visible.b.position).toEqual({x: 5, y: 6, angle: 90});
    expect(visible.b.stealth_visibility).toBe("faint");
    expect(units.b.position).toBeNull();
  });
});
