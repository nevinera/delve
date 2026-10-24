import { describe, it, expect } from "vitest";
import { World } from "../world/world.js";
import { NavGrid, BLOCKED, WALK, WADE } from "../nav/navGrid.js";
import { findPath } from "../nav/astar.js";
import { lineOfSight } from "../nav/los.js";

const flatWorld = (height = 20) => {
  const world = new World(1, 1);
  world.height.fill(height);
  world.waterLevel = 16;
  return world;
};

const navFor = (world, blockers = []) => {
  const nav = new NavGrid(world);
  nav.build(blockers);
  return nav;
};

describe("NavGrid", () => {
  it("walks dry flat ground, wades shallows and blocks deep water and cliffs", () => {
    const world = flatWorld();
    for (let gz = 0; gz < 64; gz++) {
      for (let gx = 0; gx < 64; gx++) {
        const i = world.index(gx, gz);
        if (gx >= 20 && gx < 24) world.height[i] = 14; // shallow
        if (gx >= 30 && gx < 36) world.height[i] = 8; // deep
        if (gx >= 50) world.height[i] = 80; // cliff top
      }
    }
    const nav = navFor(world);

    expect(nav.walk[nav.squareAt(10 * 8, 100)]).toBe(WALK);
    expect(nav.walk[nav.squareAt(22 * 8, 100)]).toBe(WADE);
    expect(nav.walk[nav.squareAt(33 * 8, 100)]).toBe(BLOCKED);
    expect(nav.walk[nav.squareAt(50 * 8, 100)]).toBe(BLOCKED);
  });

  it("measures clearance so big units keep away from blockers", () => {
    const nav = navFor(flatWorld(), [{shape: "circle", x: 200, z: 200, r: 2}]);

    expect(nav.canStand(200, 200, 1)).toBe(false);
    expect(nav.canStand(206, 200, 1.5)).toBe(true);
    expect(nav.canStand(206, 200, 7)).toBe(false);
  });
});

describe("findPath", () => {
  it("goes around a wall", () => {
    const wall = {shape: "rect", x: 250, z: 250, rot: 0, hw: 2, hd: 80};
    const nav = navFor(flatWorld(), [wall]);

    const path = findPath(nav, {x: 200, z: 250}, {x: 300, z: 250}, 1.5);

    expect(path).not.toBeNull();
    expect(path.at(-1).x).toBeCloseTo(301, 0);
    expect(Math.max(...path.map((p) => Math.abs(p.z - 250)))).toBeGreaterThan(80);
  });

  it("finds nothing when the goal is walled off", () => {
    const walls = [
      {shape: "rect", x: 300, z: 250, rot: 0, hw: 40, hd: 2},
      {shape: "rect", x: 300, z: 330, rot: 0, hw: 40, hd: 2},
      {shape: "rect", x: 260, z: 290, rot: 0, hw: 2, hd: 40},
      {shape: "rect", x: 340, z: 290, rot: 0, hw: 2, hd: 40},
    ];
    const nav = navFor(flatWorld(), walls);

    expect(findPath(nav, {x: 100, z: 100}, {x: 300, z: 290}, 1.5)).toBeNull();
  });

  it("won't squeeze a big unit through a narrow gap", () => {
    const walls = [
      {shape: "rect", x: 250, z: 147, rot: 0, hw: 2, hd: 97},
      {shape: "rect", x: 250, z: 361, rot: 0, hw: 2, hd: 99},
    ];
    const nav = navFor(flatWorld(), walls);

    const small = findPath(nav, {x: 200, z: 253}, {x: 300, z: 253}, 1.5);
    const big = findPath(nav, {x: 200, z: 253}, {x: 300, z: 253}, 9);

    expect(small.length).toBeLessThan(3);
    expect(big === null || big.length > small.length).toBe(true);
  });
});

describe("lineOfSight", () => {
  it("sees across flat ground", () => {
    const world = flatWorld();
    const nav = navFor(world);

    expect(lineOfSight(world, nav, {x: 50, y: 25, z: 50}, {x: 400, y: 25, z: 50}).clear).toBe(true);
  });

  it("is blocked by a hill", () => {
    const world = flatWorld();
    for (let gz = 0; gz < 64; gz++) world.height[world.index(25, gz)] = 60;
    const nav = navFor(world);

    const los = lineOfSight(world, nav, {x: 50, y: 25, z: 50}, {x: 400, y: 25, z: 50});

    expect(los).toMatchObject({clear: false, reason: "terrain"});
  });

  it("is blocked by a hut but not by looking over it from high up", () => {
    const world = flatWorld();
    const nav = navFor(world, [{shape: "rect", x: 200, z: 50, rot: 0, hw: 8, hd: 6, top: 35}]);

    expect(lineOfSight(world, nav, {x: 50, y: 25, z: 50}, {x: 400, y: 25, z: 50}).reason).toBe("structure");
    expect(lineOfSight(world, nav, {x: 50, y: 60, z: 50}, {x: 400, y: 60, z: 50}).clear).toBe(true);
  });

  it("is blocked by enough forest", () => {
    const world = flatWorld();
    for (let gx = 20; gx < 30; gx++) world.forest[world.index(gx, 6)] = 255;
    const nav = navFor(world);

    expect(lineOfSight(world, nav, {x: 50, y: 25, z: 50}, {x: 400, y: 25, z: 50}).reason).toBe("forest");
  });
});
