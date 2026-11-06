import { describe, expect, it } from "vitest";
import { crossingThings, crossingsOf } from "./roadCrossings.js";
import { bedOf, roadTrack } from "./roads.js";
import { slabProblems, slabTop } from "../world/slabs.js";

const flat = () => 10;
const road = (id, kind, points, width = { road: 14, trail: 6, footpath: 3 }[kind]) => {
  const out = { id, kind, seed: 3, points: points.map(([x, z]) => [x, z, width]) };
  return { ...out, bed: bedOf(out, flat) };
};
const north = (id, kind) => road(id, kind, [[0, -300], [0, 300]]);
const water = (type, width) => ({ bodies: [], courses: [{ type, points: [[-400, 0, width], [400, 0, width]], surface: [9, 9], seed: 1 }] });

describe("crossingsOf", () => {
  it("finds where a road's in a course's water", () => {
    const found = crossingsOf(north("roadaaaa", "road"), water("river", 60).courses);
    expect(found).toHaveLength(1);
    const [{ from, to, type, level }] = found;
    expect(type).toBe("river");
    expect(level).toBe(9);
    expect(to - from).toBeGreaterThan(55);
    expect(to - from).toBeLessThan(80);
  });

  it("counts a course's pools as its water", () => {
    const river = water("river", 20);
    river.courses[0].pools = [{ level: 9.5, from: 300, to: 500, points: [[-100, -100], [100, -100], [100, 100], [-100, 100]] }];
    const [{ from, to, level }] = crossingsOf(north("roadaaaa", "road"), river.courses);
    expect(to - from).toBeGreaterThan(195);
    expect(level).toBe(9.5);
  });
});

describe("crossingThings", () => {
  it("bridges a river with sound slabs, bank to bank, over its water, for the road", () => {
    const main = north("roadaaaa", "road");
    const river = water("river", 60);
    const [{ from, to }] = crossingsOf(main, river.courses);
    const track = roadTrack(main.points, main.kind, main.seed);
    const [za, zb] = [from, to].map((t) => track.z[track.t.findIndex((v) => v >= t)]);
    const things = crossingThings([main], river);
    expect(things.length).toBeGreaterThan(3);
    expect(things.every((thing) => thing.outline && thing.road === "roadaaaa")).toBe(true);
    for (const slab of things) expect(slabProblems(slab, [])).toEqual([]);
    const corners = things.filter((slab) => slab.surface === "floorboards").flatMap(slabTop);
    const zs = corners.map(([, , z]) => z);
    expect(Math.min(...zs)).toBeLessThan(za - 2);
    expect(Math.max(...zs)).toBeGreaterThan(zb + 2);
    // Ends on the road's bed, the middle over the water.
    const middle = corners.filter(([, , z]) => z > za + 10 && z < zb - 10);
    expect(middle.length).toBeGreaterThan(0);
    expect(middle.every(([, y]) => y >= 10.4)).toBe(true);
    const ends = corners.filter(([, , z]) => z < za - 2 || z > zb + 2);
    expect(ends.every(([, y]) => Math.abs(y - 10.3) < 0.2)).toBe(true);
    // As wide as the road, across it.
    const xs = corners.map(([x]) => x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(13);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(20);
  });

  it("splits a wide river's bridge into pieces, each within a slab's reach", () => {
    const things = crossingThings([north("roadaaaa", "trail")], water("river", 200));
    const decks = things.filter((slab) => slab.surface === "floorboards");
    expect(decks.length).toBeGreaterThan(4);
    for (const slab of things) expect(slabProblems(slab, [])).toEqual([]);
  });

  it("strews stones over a stream's ford, and builds no bridge", () => {
    const main = north("roadaaaa", "trail");
    const things = crossingThings([main], water("stream", 8));
    expect(things.length).toBeGreaterThan(0);
    expect(things.every((thing) => thing.type === "built:broad012" && !thing.outline && thing.road === "roadaaaa")).toBe(true);
    const track = roadTrack(main.points, main.kind, main.seed);
    const [{ from, to }] = crossingsOf(main, water("stream", 8).courses);
    const [za, zb] = [from, to].map((t) => track.z[track.t.findIndex((v) => v >= t)]);
    for (const { at } of things) {
      expect(at[1]).toBeGreaterThan(za - 3);
      expect(at[1]).toBeLessThan(zb + 3);
      expect(Math.min(...track.x.map((x, k) => Math.hypot(x - at[0], track.z[k] - at[1])))).toBeLessThan(3);
    }
  });

  it("puts nothing where a road crosses no water, or has no bed yet", () => {
    expect(crossingThings([road("roadaaaa", "road", [[0, 100], [0, 300]])], water("river", 60))).toEqual([]);
    expect(crossingThings([{ ...north("roadaaaa", "road"), bed: null }], water("river", 60))).toEqual([]);
  });
});
