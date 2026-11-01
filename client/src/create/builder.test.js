import { describe, expect, it } from "vitest";
import { CLIMB_FT, FAST, RUN_FT, SLIDE_FT, SWIM_FT, SWIM_SPEED, moveBuilder } from "./builder.js";

const still = { forward: 0, strafe: 0, turn: 0, rise: false, drop: false, takeoff: false };
const flat = () => 100;

describe("the builder", () => {
  it("runs along the ground", () => {
    const s = moveBuilder({ x: 0, y: 100, z: 0, yaw: 0, flying: false }, { ...still, forward: 1 }, 1, (x) => 100 + x / 10);
    expect(s.z).toBeCloseTo(RUN_FT);
    expect(s.y).toBeCloseTo(100);
    expect(s.flying).toBe(false);
  });

  it("can't walk up ground steeper than it walks on, slanting across it or not, and slides down it", () => {
    // Flat to x 10, then a face 60° steep.
    const face = (x) => Math.max(0, x - 10) * 1.73;
    let s = { x: 0, y: 0, z: 0, yaw: Math.PI / 4, flying: false };
    for (let n = 0; n < 20; n++) s = moveBuilder(s, { ...still, forward: 1 }, 0.1, face);
    expect(s.x).toBeLessThan(12);
    expect(s.z).toBeGreaterThan(20);
    const on = moveBuilder({ x: 30, y: face(30), z: 0, yaw: 0, flying: false }, still, 0.1, face);
    expect(on.x).toBeCloseTo(30 - SLIDE_FT * 0.1);
    // A 40° slope it walks up.
    const gentle = moveBuilder({ x: 0, y: 0, z: 0, yaw: Math.PI / 2, flying: false }, { ...still, forward: 1 }, 1, (x) => x * 0.84);
    expect(gentle.x).toBeCloseTo(RUN_FT);
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

  it("goes FAST times as fast forward, up or down, double-tapped", () => {
    const flying = { x: 0, y: 300, z: 0, yaw: 0, flying: true };
    const one = moveBuilder(flying, { ...still, forward: 1, rise: 1 }, 0.1, flat);
    const fast = moveBuilder(flying, { ...still, forward: 1, ahead: FAST, rise: FAST }, 0.1, flat);
    expect(fast.z).toBeCloseTo(one.z * FAST);
    expect(fast.y - 300).toBeCloseTo((one.y - 300) * FAST);
    const walk = moveBuilder({ x: 0, y: 100, z: 0, yaw: 0, flying: false }, { ...still, forward: 1, ahead: FAST }, 1, flat);
    expect(walk.z).toBeCloseTo(RUN_FT * FAST);
    // Backing up isn't any faster.
    expect(moveBuilder({ x: 0, y: 100, z: 0, yaw: 0, flying: false }, { ...still, forward: -1, ahead: FAST }, 1, flat).z).toBeGreaterThan(-RUN_FT);
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

  it("flies the way it's pitched, and walks level whatever the pitch", () => {
    const fly = (pitch) => moveBuilder({ x: 0, y: 100, z: 0, yaw: 0, flying: true }, { ...still, forward: 1, pitch }, 0.1, () => 0);
    const speed = 100; // FLY_PER_FT a foot over the ground
    const down = fly(-Math.PI / 6);
    expect(down.y).toBeCloseTo(100 - (speed * 0.1) / 2);
    expect(down.z).toBeCloseTo(speed * 0.1 * Math.cos(Math.PI / 6));
    expect(fly(Math.PI / 6).y).toBeCloseTo(100 + (speed * 0.1) / 2);
    // Flying down into the ground lands.
    expect(moveBuilder({ x: 0, y: 1, z: 0, yaw: 0, flying: true }, { ...still, forward: 1, pitch: -1 }, 1, () => 0)).toMatchObject({ y: 0, flying: false });
    const walk = moveBuilder({ x: 0, y: 100, z: 0, yaw: 0, flying: false }, { ...still, forward: 1, pitch: 1 }, 1, flat);
    expect(walk).toMatchObject({ y: 100, flying: false });
    expect(walk.z).toBeCloseTo(RUN_FT);
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
    let s = { x: 0, y: 5, z: 0, yaw: 0, flying: false };
    for (let n = 0; n < 10; n++) s = moveBuilder(s, still, 0.1, () => null);
    expect(s.y).toBe(0);
  });

  it("falls off an edge higher than a step, and can take off while falling", () => {
    const ledge = (x, z) => (z < 1 ? 20 : 0);
    let s = moveBuilder({ x: 0, y: 20, z: 0, yaw: 0, flying: false }, { ...still, forward: 1 }, 0.1, ledge);
    expect(s.y).toBeGreaterThan(19);
    expect(s.falling).toBeGreaterThan(0);
    const air = moveBuilder(s, { ...still, takeoff: true }, 0.1, ledge);
    expect(air.flying).toBe(true);
    for (let n = 0; n < 30; n++) s = moveBuilder(s, still, 0.1, ledge);
    expect(s.y).toBe(0);
    expect(s.falling).toBe(0);
  });

  it("flies as fast as its height over the land, not what's built on it", () => {
    const floor = () => 50;
    const land = () => 0;
    const s = moveBuilder({ x: 0, y: 100, z: 0, yaw: 0, flying: true }, { ...still, forward: 1 }, 0.1, floor, undefined, undefined, land);
    expect(s.z).toBeCloseTo(10);
  });
});

