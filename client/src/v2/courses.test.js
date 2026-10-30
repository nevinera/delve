import { describe, expect, it } from "vitest";
import { BELOW_FT, along, depthOf, lengthOf, onTrack, profile, shape, surfaceAt, trackOf } from "./courses.js";

const line = [[0, 0, 10], [100, 0, 10], [100, 100, 30]];

describe("courses", () => {
  it("measure where a place is from their line", () => {
    expect(lengthOf(line)).toBe(200);
    expect(along(line, 50, 4)).toEqual({ t: 50, d: 4, width: 10 });
    const bend = along(line, 104, 50);
    expect([bend.t, bend.d, bend.width]).toEqual([150, 4, 20]);
    expect(along(line, 50, 40, 10)).toBeNull();
  });

  it("wander either side of their line, by their width, and end where they're drawn", () => {
    const straight = [[0, 0, 10], [600, 0, 10]];
    const track = trackOf(straight, 7);
    expect([track.x[0], track.z[0]]).toEqual([0, 0]);
    expect(track.x.at(-1)).toBeCloseTo(600);
    expect(track.z.at(-1)).toBeCloseTo(0);
    const off = Math.max(...track.z.map(Math.abs));
    expect(off).toBeGreaterThan(4);
    expect(off).toBeLessThanOrEqual(12);
    expect(track.length).toBeGreaterThan(600);
    // Bending both ways, wider in its bends and pools.
    expect(Math.max(...track.bend)).toBeGreaterThan(0.3);
    expect(Math.min(...track.bend)).toBeLessThan(-0.3);
    expect(Math.max(...track.width) - Math.min(...track.width)).toBeGreaterThan(2);
    // Another seed wanders another way.
    expect(trackOf(straight, 8).z[40]).not.toBeCloseTo(track.z[40]);
    expect(onTrack(track, track.x[40], track.z[40] + 3).side).toBeCloseTo(3, 0);
  });

  it("keep a surface under the ground that never rises downstream", () => {
    const ground = (x) => (x < 50 ? 100 - x : x < 70 ? 80 : 100 - x);
    const surface = profile(line, ground);
    expect(surface[0]).toBe(100 - BELOW_FT);
    for (let k = 1; k < surface.length; k++) expect(surface[k]).toBeLessThanOrEqual(surface[k - 1]);
    expect(surface.at(-1)).toBeLessThan(0);
    expect(surfaceAt([10, 8, 6], 4)).toBe(9);
    expect(surfaceAt([10, 8, 6], 100)).toBe(6);
  });

  it("stop at the water they run into, and ease down to it", () => {
    // Ground 20 ft up to x = 100, then a lake at 10 over a bed at 0.
    const straight = [[0, 0, 6], [200, 0, 6]];
    const still = (x) => (x < 100 ? null : 10);
    const surface = profile(straight, (x) => (x < 100 ? 20 : 0), still);
    expect(surface[0]).toBe(20 - BELOW_FT);
    expect(surface.at(-1)).toBe(10);
    // 8 ft a step, at most a quarter foot a foot.
    for (let k = 1; k < surface.length; k++) expect(surface[k - 1] - surface[k]).toBeLessThanOrEqual(2.05);
    // Only as far as that takes: a steep course above it stays as steep.
    const steep = profile(straight, (x) => (x < 100 ? 100 - x : 0), still);
    expect(steep[0]).toBe(100 - BELOW_FT);
    expect(steep[3]).toBeLessThan(80);
  });

  it("carve a bed under their water, deepest outside their bends, and banks beside it", () => {
    const course = { type: "river", points: [[0, 0, 40], [1200, 0, 40]], surface: [50, 50], seed: 3 };
    const track = trackOf(course.points, 3);
    const k = track.bend.findIndex((b) => Math.abs(b) > 0.5);
    const [x, z, bend] = [track.x[k], track.z[k], track.bend[k]];
    // Square to the track there, toward the inside of the bend.
    const [dx, dz] = [track.x[k + 1] - track.x[k - 1], track.z[k + 1] - track.z[k - 1]];
    const d = Math.hypot(dx, dz);
    const [nx, nz] = [(-dz / d) * Math.sign(bend), (dx / d) * Math.sign(bend)];
    const at = (o) => shape(course, x + nx * o, z + nz * o);
    expect(at(0)).toMatchObject({ level: 50, wet: true });
    expect(at(-10).top).toBeLessThan(at(10).top);
    expect(at(0).top).toBeLessThan(50 - depthOf("river", 40) * 0.5);
    // Its bank's steeper outside than in.
    const [outer, inner] = [at(-(track.width[k] / 2 + 6)).top, at(track.width[k] / 2 + 6).top];
    expect(outer).toBeGreaterThan(inner);
    expect(shape(course, 600, 200)).toBeNull();
  });

  it("are deeper the wider they are, rivers more than streams", () => {
    expect(depthOf("stream", 6)).toBe(1.5);
    expect(depthOf("river", 40)).toBe(4);
    expect(depthOf("river", 400)).toBe(12);
  });
});
