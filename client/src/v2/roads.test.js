import { describe, expect, it } from "vitest";
import { BED_STEP_FT, KINDS, bedAt, bedOf, changedRoadBoxes, roadTrack, roadsAt, shapeRoad, troubleOf } from "./roads.js";

const road = (kind, points, groundAt, seed = 0) => {
  const made = { kind, points: points.map(([x, z]) => [x, z, KINDS[kind].width]), seed };
  return { ...made, bed: bedOf(made, groundAt) };
};

describe("roadTrack", () => {
  it("rounds a corner, wider for wider kinds, and keeps its ends where they're drawn", () => {
    const points = [
      [0, 0, 6],
      [400, 0, 6],
      [400, 400, 6],
    ];
    const track = roadTrack(points, "trail", 3);
    expect([track.x[0], track.z[0]]).toEqual([0, 0]);
    expect([track.x.at(-1), track.z.at(-1)].map(Math.round)).toEqual([400, 400]);
    const nearest = (t) => Math.min(...t.x.map((x, k) => Math.hypot(x - 400, t.z[k])));
    // A circle 8 widths across, 48 ft, cuts a right angle's corner by about 10 ft.
    expect(nearest(track)).toBeGreaterThan(5);
    const wide = roadTrack(points.map(([x, z]) => [x, z, 14]), "road", 3);
    expect(nearest(wide)).toBeGreaterThan(nearest(track));
  });

  it("wobbles a little either side of a straight line", () => {
    const track = roadTrack(
      [
        [0, 0, 6],
        [1000, 0, 6],
      ],
      "trail",
      7,
    );
    const most = Math.max(...track.z.map(Math.abs));
    expect(most).toBeGreaterThan(0.3);
    expect(most).toBeLessThanOrEqual(3);
  });
});

describe("bedOf", () => {
  it("holds to its kind's grade over a bump", () => {
    const bump = (x) => 3 * Math.exp(-(((x - 300) / 20) ** 2));
    const made = road("road", [
      [0, 0],
      [600, 0],
    ], bump);
    const steepest = Math.max(...made.bed.slice(1).map((v, n) => Math.abs(v - made.bed[n]) / BED_STEP_FT));
    expect(steepest).toBeLessThanOrEqual(KINDS.road.grade + 0.02);
  });

  it("climbs a hill steeper than its grade rather than cut a trench up it", () => {
    const hill = (x) => 0.3 * x;
    const made = road("road", [
      [0, 0],
      [600, 0],
    ], hill);
    // At the top, it's come up to the ground rather than run on under it.
    expect(made.bed.at(-1)).toBeGreaterThan(hill(600) - 2);
    expect(troubleOf(made, hill).some((s) => s.why === "steep")).toBe(true);
  });

  it("follows gentle ground, evened out", () => {
    const made = road("trail", [
      [0, 0],
      [400, 0],
    ], (x) => 0.05 * x);
    expect(bedAt(made.bed, 200)).toBeCloseTo(10, 0);
  });
});

describe("shapeRoad", () => {
  // A hillside rising to the south, the road running east across it.
  const hill = (x, z) => 0.5 * z;
  const made = road("road", [
    [0, 0],
    [400, 0],
  ], hill);

  it("is level across the road, on a bench cut into the hillside", () => {
    const on = [-3, 0, 3].map((z) => shapeRoad(made, 200, z, hill(200, z)).height);
    expect(on[0]).toBeCloseTo(on[2], 1);
    // Uphill, a bank cut back to the ground; downhill, a slope built up to it.
    const above = shapeRoad(made, 200, 9, hill(200, 9));
    expect(above.height).toBeLessThan(hill(200, 9));
    expect(above.height).toBeGreaterThan(on[2]);
    const below = shapeRoad(made, 200, -12, hill(200, -12));
    expect(below.height).toBeGreaterThan(hill(200, -12));
  });

  it("leaves the ground alone well away from it", () => {
    expect(shapeRoad(made, 200, 80, hill(200, 80))).toBeNull();
  });

  it("lets a footpath lean with the ground across it", () => {
    const path = road("footpath", [
      [0, 0],
      [400, 0],
    ], hill);
    const [a, b] = [-1.4, 1.4].map((z) => shapeRoad(path, 200, z, hill(200, z)).height);
    expect(b).toBeGreaterThan(a);
  });

  it("gives the ground of the road nearest, where roads overlap", () => {
    const flat = () => 0;
    const low = { ...road("road", [
      [0, 0],
      [400, 0],
    ], flat), bed: Array(60).fill(-2) };
    const high = { ...road("road", [
      [0, 30],
      [400, 30],
    ], flat), bed: Array(60).fill(2) };
    expect(roadsAt([low, high], 200, 1, 0)).toBeCloseTo(-2, 5);
    expect(roadsAt([low, high], 200, 29, 0)).toBeCloseTo(2, 5);
    expect(roadsAt([low, high], 200, 200, 0)).toBe(0);
  });
});

describe("troubleOf", () => {
  it("finds where its bank's cut too deep", () => {
    const cliff = (x, z) => 2 * z;
    const made = road("road", [
      [0, 0],
      [400, 0],
    ], cliff);
    expect(troubleOf(made, cliff).some((s) => s.why === "deep")).toBe(true);
  });

  it("finds where it'd climb too steeply rather than run in a trench through a rise", () => {
    const ridge = (x) => Math.max(0, 40 - 0.6 * Math.abs(x - 300));
    const made = road("road", [
      [0, 0],
      [600, 0],
    ], ridge);
    const steep = troubleOf(made, ridge).filter((s) => s.why === "steep");
    expect(steep.length).toBeGreaterThan(0);
    expect(steep.every((s) => s.from > 150 && s.to < 450)).toBe(true);
  });

  it("gives one stretch for each run of trouble, when steep and deep overlap", () => {
    const wall = (x, z) => 2 * z + Math.max(0, 40 - 0.6 * Math.abs(x - 300));
    const made = road("road", [
      [0, 0],
      [600, 0],
    ], wall);
    const found = troubleOf(made, wall);
    for (const why of ["steep", "deep"]) {
      const runs = found.filter((s) => s.why === why);
      runs.slice(1).forEach((s, n) => expect(s.from).toBeGreaterThan(runs[n].to));
    }
  });

  it("finds nothing along a gentle road", () => {
    const gentle = (x) => 0.02 * x;
    const made = road("trail", [
      [0, 0],
      [400, 0],
    ], gentle);
    expect(troubleOf(made, gentle)).toEqual([]);
  });
});

describe("changedRoadBoxes", () => {
  it("gives boxes only for roads added, taken away or changed", () => {
    const a = { kind: "trail", points: [[0, 0, 6], [100, 0, 6]], seed: 1, bed: [0] };
    const b = { kind: "trail", points: [[500, 500, 6], [600, 500, 6]], seed: 2, bed: [0] };
    expect(changedRoadBoxes({ roads: [a] }, { roads: [a] })).toEqual([]);
    const boxes = changedRoadBoxes({ roads: [a] }, { roads: [a, b] });
    expect(boxes).toHaveLength(1);
    expect(boxes[0][0]).toBeLessThan(500);
    expect(boxes[0][2]).toBeGreaterThan(600);
  });
});
