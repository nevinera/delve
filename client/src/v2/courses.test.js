import { describe, expect, it } from "vitest";
import { BELOW_FT, along, boulders, cascadesOf, depthOf, fallFtOf, fallsOf, flowOf, levelAt, lengthOf, onTrack, profile, shape, SURFACE_STEP_FT, surfaceAt, trackOf } from "./courses.js";

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

  it("meet the water of a course they run into at its level, falling straight to it", () => {
    // Ground 20 ft up all along, and another course's water at 10 past x = 100.
    const straight = [[0, 0, 6], [200, 0, 6]];
    const surface = profile(straight, () => 20, () => null, 0, (x) => (x < 100 ? null : 10));
    const k = surface.indexOf(10);
    expect(k).toBeGreaterThan(80 / SURFACE_STEP_FT);
    expect(surface[k - 1]).toBe(20 - BELOW_FT);
    expect(surface[k]).toBe(10);
    expect(surface.at(-1)).toBe(10);
    // Arriving lower, backed up to it as far as it's lower.
    const low = profile(straight, (x) => (x < 50 ? 20 : 5), () => null, 0, (x) => (x < 100 ? null : 10));
    expect(low[0]).toBe(20 - BELOW_FT);
    expect(low.indexOf(10)).toBeLessThan(80 / SURFACE_STEP_FT);
    expect(Math.min(...low)).toBe(10);
  });

  it("keep under the ground past their edges", () => {
    // Ground falling away to one side, 1 ft a foot: the edge 5 ft out on that side is lower.
    const surface = profile([[0, 0, 6], [10, 0, 6]], (x, z) => 20 - Math.max(0, z));
    expect(Math.max(...surface)).toBeLessThanOrEqual(20 - 5 - 0.25 + 1);
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
    // A levee just over its water past its edge, lower further out.
    expect(at(track.width[k] / 2 + 1).levee).toBeCloseTo(50.5);
    expect(at(track.width[k] / 2 + 10).levee).toBeLessThan(50);
    expect(at(0).levee).toBe(-Infinity);
  });

  it("run downstream, faster down a fall and in their middle", () => {
    const course = { type: "river", points: [[0, 0, 40], [600, 0, 40]], surface: [...Array(40).fill(50), ...Array(40).fill(50).map((v, k) => v - k * 0.8)], seed: 2 };
    const track = trackOf(course.points, 2);
    const at = (t) => {
      const k = track.t.findIndex((v) => v >= t);
      return flowOf(course, track.x[k], track.z[k]).flow;
    };
    const [level, fall] = [at(100), at(400)];
    expect(level[0]).toBeGreaterThan(0);
    expect(level[2]).toBe(0);
    expect(Math.hypot(fall[0], fall[1])).toBeGreaterThan(Math.hypot(level[0], level[1]) * 2);
    expect(fall[2]).toBeCloseTo(Math.sqrt(0.1));
    expect(flowOf(course, 300, 200)).toBeNull();
  });

  it("fall where their surface drops steeply far enough, by their width", () => {
    // Level at 50, a 6 ft drop over one step, level, then a 3 ft one.
    const surface = [50, 50, 50, 44, 44, 44, 44, 41, 41, 41];
    const stream = { type: "stream", points: [[0, 0, 6], [72, 0, 6]], surface, seed: 1 };
    const falls = fallsOf(stream);
    expect(falls.map(({ t, top, bottom }) => [t, top, bottom])).toEqual([[16, 50, 44]]);
    expect(fallFtOf("river", 40)).toBe(8);
    expect(fallFtOf("river", 25)).toBe(5);
    expect(fallsOf({ ...stream, type: "river", points: [[0, 0, 40], [72, 0, 40]] })).toEqual([]);
    // It holds over its ledge, then steps down at the lip, not down a ramp.
    expect(falls[0].lip).toBe(20);
    expect(levelAt(stream, 15)).toBe(50);
    expect(levelAt(stream, 19)).toBe(50);
    expect(levelAt(stream, 21)).toBe(44);
    // The 3 ft drop's a cascade of one step, its pool at the level it falls to.
    expect(levelAt(stream, 52)).toBe(41);
  });

  it("cut cascades into steps and pools where they're steep but don't fall", () => {
    // Level at 100, then falling a foot every 4 for 100 ft, then level.
    const surface = Array.from({ length: 60 }, (_, k) => 100 - Math.min(25, Math.max(0, k - 5) * 2));
    const course = { type: "stream", points: [[0, 0, 6], [470, 0, 6]], surface, seed: 3 };
    expect(fallsOf(course)).toEqual([]);
    const [cascade] = cascadesOf(course);
    expect(cascade.t).toBe(40);
    expect(cascade.steps.length).toBeGreaterThan(5);
    // Flat in each pool, at the level its stretch reaches by the next step, never over it.
    for (const [n, step] of cascade.steps.entries()) {
      const next = cascade.steps[n + 1]?.t ?? cascade.end;
      expect(levelAt(course, step.t + 0.1)).toBe(step.bottom);
      expect(levelAt(course, next - 0.1)).toBe(step.bottom);
      expect(step.bottom).toBeLessThanOrEqual(surfaceAt(surface, next - 0.1) + 1e-9);
      expect(step.top).toBeGreaterThan(step.bottom);
    }
    // Boulders across each step, near it.
    const placed = boulders(course);
    expect(placed.length).toBeGreaterThanOrEqual(cascade.steps.length * 2);
    for (const { x, z, size } of placed) {
      expect(Math.min(...cascade.steps.map((step) => Math.hypot(step.x - x, step.z - z)))).toBeLessThan(6);
      expect(size).toBeGreaterThanOrEqual(2);
    }
  });

  it("carve plunge pools under their falls", () => {
    const course = { type: "river", points: [[0, 0, 20], [600, 0, 20]], surface: [...Array(30).fill(80), ...Array(50).fill(50)], seed: 4 };
    const [fall] = fallsOf(course);
    const track = trackOf(course.points, 4);
    const depthAt = (t) => {
      const k = track.t.findIndex((v) => v >= t);
      return shape(course, track.x[k], track.z[k]);
    };
    const [below, further] = [depthAt(fall.t + 10), depthAt(fall.t + 150)];
    expect(below.level).toBe(50);
    expect(50 - below.top).toBeGreaterThan(50 - further.top + 5);
  });

  it("are deeper the wider they are, rivers more than streams", () => {
    expect(depthOf("stream", 6)).toBe(1.5);
    expect(depthOf("river", 40)).toBe(4);
    expect(depthOf("river", 400)).toBe(12);
  });
});
