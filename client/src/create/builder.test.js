import { describe, expect, it } from "vitest";
import { CLIMB_FT, RUN_FT, SWIM_FT, SWIM_SPEED, hopEase, hopTo, moveBuilder } from "./builder.js";

const still = { forward: 0, strafe: 0, turn: 0, rise: false, drop: false, takeoff: false };
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

  it("climbs faster the higher it is", () => {
    const at = (y) => moveBuilder({ x: 0, y, z: 0, yaw: 0, flying: true }, { ...still, rise: true }, 0.1, flat).y - y;
    expect(at(1100)).toBeGreaterThan(at(200) * 5);
  });

  it("hops between steps doubling over the plate's middling height, and down to the ground", () => {
    expect(hopTo(100, 1, 300, 100)).toEqual({ y: 428, land: false });
    expect(hopTo(428, 1, 300, 100)).toEqual({ y: 556, land: false });
    expect(hopTo(556, 1, 300, 100)).toEqual({ y: 812, land: false });
    expect(hopTo(700, -1, 300, 100)).toEqual({ y: 556, land: false });
    expect(hopTo(428, -1, 300, 100)).toEqual({ y: 100, land: true });
    expect(hopTo(100, -1, 300, 100)).toBeNull();
    // On a peak over the plate's steps, up goes to the first step above it.
    expect(hopTo(900, 1, 300, 900)).toEqual({ y: 1324, land: false });
    // Steps within 32 ft are passed by.
    expect(hopTo(400, 1, 300, 100)).toEqual({ y: 556, land: false });
    expect(hopTo(580, -1, 300, 100)).toEqual({ y: 428, land: false });
  });

  it("speeds up and slows down at each end of a hop", () => {
    expect(hopEase(0)).toBe(0);
    expect(hopEase(1)).toBeCloseTo(1);
    expect(hopEase(0.5)).toBeCloseTo(0.5);
    expect(hopEase(0.1)).toBeLessThan(0.1);
    expect(hopEase(0.9)).toBeGreaterThan(0.9);
  });

  it("goes to the height a hop says, and lands where it ends on the ground", () => {
    const s = moveBuilder({ x: 0, y: 300, z: 0, yaw: 0, flying: true }, { ...still, y: 250 }, 0.1, flat);
    expect(s).toMatchObject({ y: 250, flying: true });
    expect(moveBuilder(s, { ...still, y: 100.5, land: true }, 0.1, flat)).toMatchObject({ y: 100, flying: false });
  });

  it("flies faster the higher it is", () => {
    const across = (y) => moveBuilder({ x: 0, y, z: 0, yaw: 0, flying: true }, { ...still, forward: 1 }, 1, flat).z;
    expect(across(2100)).toBeGreaterThan(across(110) * 20);
  });

  it("lands on touching the ground", () => {
    const s = moveBuilder({ x: 0, y: 101, z: 0, yaw: 0, flying: true }, { ...still, drop: true }, 1, flat);
    expect(s).toMatchObject({ y: 100, flying: false });
  });

  it("wades in shallow water, and swims slower in deep water, kept under its surface", () => {
    const [ground, water] = [() => 100, () => 103];
    const wade = moveBuilder({ x: 0, y: 100, z: 0, yaw: 0, flying: false }, { ...still, forward: 1 }, 1, ground, undefined, water);
    expect(wade).toMatchObject({ y: 100, swimming: false });
    expect(wade.z).toBeCloseTo(RUN_FT);
    const swim = moveBuilder({ x: 0, y: 100, z: 0, yaw: 0, flying: false }, { ...still, forward: 1 }, 1, () => 90, undefined, water);
    expect(swim).toMatchObject({ y: 103 - SWIM_FT, swimming: true });
    expect(swim.z).toBeCloseTo(RUN_FT * SWIM_SPEED);
  });

  it("swims where it comes to, flying down into deep water", () => {
    const s = moveBuilder({ x: 0, y: 101, z: 0, yaw: 0, flying: true }, { ...still, drop: true }, 1, () => 50, undefined, () => 100);
    expect(s).toMatchObject({ y: 101 - CLIMB_FT, flying: false, swimming: true });
  });

  it("swims the way it's pitched, up and down with space and F, and stays put when still", () => {
    const [bed, water] = [() => 50, () => 100];
    const at = (y, input) => moveBuilder({ x: 0, y, z: 0, yaw: 0, flying: false, swimming: true }, { ...still, ...input }, 1, bed, undefined, water);
    const speed = RUN_FT * SWIM_SPEED;
    const down = at(90, { forward: 1, pitch: -Math.PI / 6 });
    expect(down.y).toBeCloseTo(90 - speed / 2);
    expect(down.z).toBeCloseTo(speed * Math.cos(Math.PI / 6));
    expect(at(80, {})).toMatchObject({ y: 80, swimming: true });
    expect(at(80, { rise: true }).y).toBeCloseTo(80 + speed);
    expect(at(80, { drop: true }).y).toBeCloseTo(80 - speed);
    // Never over its surface, nor under its bed, nor taking off.
    expect(at(95, { rise: true, takeoff: true })).toMatchObject({ y: 100 - SWIM_FT, flying: false });
    expect(at(52, { drop: true }).y).toBe(50);
  });

  it("stands where the water's too shallow to swim in", () => {
    const s = moveBuilder({ x: 0, y: 90, z: 0, yaw: 0, flying: false, swimming: true }, { ...still, forward: 1 }, 1, (x, z) => (z > 5 ? 98 : 50), undefined, () => 100);
    expect(s).toMatchObject({ y: 98, swimming: false });
  });

  it("stands on the sea off the tiles", () => {
    expect(moveBuilder({ x: 0, y: 5, z: 0, yaw: 0, flying: false }, still, 0.1, () => null).y).toBe(0);
  });
});
