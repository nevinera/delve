import { describe, expect, it } from "vitest";
import { CLIMB_FT, FAST, RUN_FT, moveBuilder } from "./builder.js";

const still = { forward: 0, strafe: 0, turn: 0, rise: false, drop: false, fast: false, takeoff: false };
const flat = () => 100;

describe("the builder", () => {
  it("runs along the ground", () => {
    const s = moveBuilder({ x: 0, y: 100, z: 0, yaw: 0, flying: false }, { ...still, forward: 1 }, 1, (x) => 100 + x / 10);
    expect(s.z).toBeCloseTo(RUN_FT);
    expect(s.y).toBeCloseTo(100);
    expect(s.flying).toBe(false);
  });

  it("takes off, rises while space is held, and hovers when it isn't", () => {
    let s = moveBuilder({ x: 0, y: 100, z: 0, yaw: 0, flying: false }, { ...still, takeoff: true, rise: true }, 0.5, flat);
    expect(s.flying).toBe(true);
    expect(s.y).toBeGreaterThan(100 + CLIMB_FT * 0.5);
    const hover = moveBuilder(s, still, 1, flat);
    expect(hover.y).toBe(s.y);
  });

  it("climbs faster the higher it is, and faster again when double-tapped", () => {
    const at = (y, fast) => moveBuilder({ x: 0, y, z: 0, yaw: 0, flying: true }, { ...still, rise: true, fast }, 0.1, flat).y - y;
    expect(at(1100, false)).toBeGreaterThan(at(200, false) * 5);
    expect(at(1100, true)).toBeCloseTo(at(1100, false) * FAST);
  });

  it("flies faster the higher it is", () => {
    const across = (y) => moveBuilder({ x: 0, y, z: 0, yaw: 0, flying: true }, { ...still, forward: 1 }, 1, flat).z;
    expect(across(2100)).toBeGreaterThan(across(110) * 20);
  });

  it("lands on touching the ground", () => {
    const s = moveBuilder({ x: 0, y: 101, z: 0, yaw: 0, flying: true }, { ...still, drop: true }, 1, flat);
    expect(s).toMatchObject({ y: 100, flying: false });
  });

  it("stands on the sea off the tiles", () => {
    expect(moveBuilder({ x: 0, y: 5, z: 0, yaw: 0, flying: false }, still, 0.1, () => null).y).toBe(0);
  });
});
