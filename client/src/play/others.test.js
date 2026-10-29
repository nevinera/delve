import { describe, expect, it } from "vitest";
import { speedOf, stepOf } from "./others.js";

const move = (m) => ({ forward: 0, strafe: 0, turn: 0, gait: "run", swim: false, jump: false, ...m });

describe("speedOf", () => {
  it("goes at the game's speeds", () => {
    expect(speedOf(move({}))).toBe(0);
    expect(speedOf(move({ forward: 1 }))).toBe(21);
    expect(speedOf(move({ forward: 1, gait: "walk" }))).toBe(7.5);
    expect(speedOf(move({ forward: -1 }))).toBe(13.5);
    expect(speedOf(move({ strafe: 1, gait: "sprint" }))).toBe(42);
    expect(speedOf(move({ forward: 1, swim: true }))).toBe(14.2);
  });
});

describe("stepOf", () => {
  it("goes the way the character faces, and left when strafing left", () => {
    const [dx, dz] = stepOf(move({ forward: 1 }), 0, 1);
    expect([dx, dz]).toEqual([0, 21]);
    const [lx, lz] = stepOf(move({ strafe: 1 }), 0, 1);
    expect(lx).toBeCloseTo(21);
    expect(lz).toBeCloseTo(0);
  });

  it("goes no faster on the diagonal", () => {
    const [dx, dz] = stepOf(move({ forward: 1, strafe: 1 }), 1, 1);
    expect(Math.hypot(dx, dz)).toBeCloseTo(21);
  });
});
