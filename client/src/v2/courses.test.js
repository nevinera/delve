import { describe, expect, it } from "vitest";
import { BELOW_FT, along, depthOf, lengthOf, profile, shape, surfaceAt } from "./courses.js";

const line = [[0, 0, 10], [100, 0, 10], [100, 100, 30]];

describe("courses", () => {
  it("measure where a place is from their line", () => {
    expect(lengthOf(line)).toBe(200);
    expect(along(line, 50, 4)).toEqual({ t: 50, d: 4, width: 10 });
    const bend = along(line, 104, 50);
    expect([bend.t, bend.d, bend.width]).toEqual([150, 4, 20]);
    expect(along(line, 50, 40, 10)).toBeNull();
  });

  it("keep a surface under the ground that never rises downstream", () => {
    // Ground falling, then rising over a lip at x = 60, then falling again.
    const ground = (x, z) => (z > 0 ? 50 - z / 10 : x < 50 ? 100 - x : x < 70 ? 80 : 100 - x);
    const surface = profile(line, ground);
    expect(surface[0]).toBe(100 - BELOW_FT);
    // Over the lip it stays where it was before it, the lowest so far, at x = 48.
    expect(surface[8]).toBe(52 - BELOW_FT);
    expect(surface[12]).toBe(4 - BELOW_FT);
    for (let k = 1; k < surface.length; k++) expect(surface[k]).toBeLessThanOrEqual(surface[k - 1]);
    expect(surfaceAt([10, 8, 6], 4)).toBe(9);
    expect(surfaceAt([10, 8, 6], 100)).toBe(6);
  });

  it("stop at the water they run into, and ease down to it", () => {
    // Ground 20 ft up to x = 100, then a lake at 10 over a bed at 0.
    const straight = [[0, 0, 6], [200, 0, 6]];
    const ground = (x) => (x < 100 ? 20 : 0);
    const still = (x) => (x < 100 ? null : 10);
    const surface = profile(straight, ground, still);
    expect(surface.at(-1)).toBe(10);
    // 8 ft a step at most a quarter foot a foot: 2 ft a step up from the mouth.
    expect(surface[12]).toBe(12);
    expect(surface[11]).toBe(14);
    expect(surface[0]).toBe(20 - BELOW_FT);
    // Only as far as that takes: a steep course above it stays as steep.
    const steep = profile(straight, (x) => (x < 100 ? 100 - x : 0), still);
    expect(steep[0]).toBe(100 - BELOW_FT);
    expect(steep[11]).toBe(12 - BELOW_FT);
  });

  it("carve a bed under their water and banks beside it", () => {
    const course = { type: "river", points: [[0, 0, 40], [200, 0, 40]], surface: [50, 50] };
    const middle = shape(course, 100, 0);
    expect(middle).toEqual({ top: 50 - depthOf("river", 40), level: 50, wet: true });
    expect(shape(course, 100, 20).top).toBeCloseTo(50);
    expect(shape(course, 100, 26)).toMatchObject({ top: 54, wet: false });
    expect(shape(course, 100, 60)).toBeNull();
  });

  it("are deeper the wider they are, rivers more than streams", () => {
    expect(depthOf("stream", 6)).toBe(1.5);
    expect(depthOf("river", 40)).toBe(4);
    expect(depthOf("river", 400)).toBe(12);
  });
});
