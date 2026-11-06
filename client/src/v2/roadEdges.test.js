import { describe, expect, it } from "vitest";
import { EDGES, allEdges, edgesOf, wetIn } from "./roadEdges.js";
import { roadTrack } from "./roads.js";
import { Placed } from "../create/placed.js";
import { setBuiltObjects } from "../world/objects.js";

setBuiltObjects([]);
const road = (id, kind, points, width = { road: 14, trail: 6, footpath: 3 }[kind]) => ({ id, kind, seed: 3, points: points.map(([x, z]) => [x, z, width]), bed: [0] });
const straight = (id, kind, z = 0) => road(id, kind, [[0, z], [1200, z]]);

describe("edgesOf", () => {
  it("lines both sides of a road with edge stones, just past its edges, and puts in a milestone", () => {
    const made = edgesOf(straight("roadaaaa", "road"), []);
    const stones = made.filter((o) => o.type === EDGES.road[0].type);
    expect(stones.length).toBeGreaterThan(80);
    expect(stones.every((o) => o.road === "roadaaaa")).toBe(true);
    const sides = stones.map((o) => Math.sign(o.at[1]));
    expect(sides.filter((s) => s > 0).length).toBe(sides.filter((s) => s < 0).length);
    expect(stones.every((o) => Math.abs(o.at[1]) > 4.5 && Math.abs(o.at[1]) < 12)).toBe(true);
    expect(made.filter((o) => o.type === EDGES.road[1].type)).toHaveLength(1);
  });

  it("puts waymark posts beside a trail now and then, a side at a time, and few cairns by a footpath", () => {
    const posts = edgesOf(straight("roadbbbb", "trail"), []);
    expect(posts.length).toBeGreaterThan(4);
    expect(posts.length).toBeLessThan(10);
    expect(new Set(posts.map((o) => Math.sign(o.at[1]))).size).toBe(2);
    expect(edgesOf(straight("roadcccc", "footpath"), []).length).toBeLessThan(4);
  });

  it("leaves them out of the water and off other roads", () => {
    const main = straight("roadaaaa", "road");
    const wet = (x) => x > 400 && x < 600;
    const crossing = road("roaddddd", "road", [[800, -200], [800, 200]]);
    const made = edgesOf(main, [main, crossing], wet);
    expect(made.some((o) => o.at[0] > 410 && o.at[0] < 590)).toBe(false);
    expect(made.some((o) => Math.abs(o.at[0] - 800) < 6)).toBe(false);
    expect(made.some((o) => o.at[0] > 600 && o.at[0] < 780)).toBe(true);
  });

  it("follows the road's track round its corners", () => {
    const bend = road("roadeeee", "road", [[0, 0], [400, 0], [400, 400]]);
    const track = roadTrack(bend.points, bend.kind, bend.seed);
    for (const o of edgesOf(bend, [])) {
      const d = Math.min(...track.x.map((x, k) => Math.hypot(x - o.at[0], track.z[k] - o.at[1])));
      expect(d).toBeGreaterThan(6);
      expect(d).toBeLessThan(12);
    }
  });

  it("is the same each time, and nothing for a road with no id", () => {
    expect(edgesOf(straight("roadaaaa", "trail"), [])).toEqual(edgesOf(straight("roadaaaa", "trail"), []));
    expect(edgesOf({ ...straight("x", "trail"), id: undefined }, [])).toEqual([]);
  });
});

describe("wetIn", () => {
  it("finds bodies' outlines and courses' water", () => {
    const wet = wetIn({
      bodies: [{ type: "lake", level: 5, points: [[0, 0], [100, 0], [100, 100], [0, 100]] }],
      courses: [{ type: "stream", points: [[0, 500, 6], [400, 500, 6]], surface: [9, 9], seed: 1 }],
    });
    expect(wet(50, 50)).toBe(true);
    expect(wet(200, 200)).toBe(false);
    expect(wet(200, 500)).toBe(true);
    expect(wet(200, 560)).toBe(false);
  });
});

describe("Placed's road things", () => {
  it("adds what roads put there, keeps what's the same, and takes away the rest", () => {
    const placed = new Placed();
    const hand = { type: "boulder", at: [10, 10], yaw: 0, scale: 3 };
    placed.put([hand]);
    const roads = [straight("roadaaaa", "trail")];
    expect(placed.setRoadThings(allEdges(roads))).toBe(true);
    const count = () => placed.near(600, 0, 2000).objects.filter((o) => o.road).length;
    const first = count();
    expect(first).toBeGreaterThan(4);
    placed.changed.clear();
    expect(placed.setRoadThings(allEdges(roads))).toBe(false);
    expect(placed.changed.size).toBe(0);
    expect(placed.setRoadThings([])).toBe(true);
    expect(count()).toBe(0);
    expect(placed.near(600, 0, 2000).objects).toContain(hand);
  });

  it("keeps the road they're for in the placed file", () => {
    const placed = new Placed();
    placed.setRoadThings(allEdges([straight("roadaaaa", "trail")]));
    const [, bytes] = [...placed.unsavedFiles("main")][0];
    const json = JSON.parse(new TextDecoder().decode(bytes));
    expect(json.objects.every((o) => o.road === "roadaaaa" && o.footprint)).toBe(true);
  });
});
