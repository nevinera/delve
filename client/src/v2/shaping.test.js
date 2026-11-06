import { describe, expect, it } from "vitest";
import { shapedAt } from "./shaping.js";
import { trackOf } from "./courses.js";
import { FORD_FT } from "./roads.js";

const stream = { type: "stream", points: [[0, 0, 6], [400, 0, 6]], surface: [9, 9], seed: 1 };
const middle = () => {
  const track = trackOf(stream.points, stream.seed);
  const k = track.x.findIndex((x) => x >= 200);
  return [track.x[k], track.z[k]];
};

describe("shapedAt", () => {
  it("leaves the ground where nothing reaches", () => {
    expect(shapedAt(200, 300, 10, [stream])).toBe(10);
  });

  it("cuts a course's bed, and a road over it makes a ford", () => {
    const [x, z] = middle();
    const bed = shapedAt(x, z, 10, [stream]);
    expect(bed).toBeLessThan(9);
    const road = { kind: "trail", seed: 1, points: [[x, -100, 6], [x, 100, 6]], bed: Array(40).fill(10) };
    expect(shapedAt(x, z, 10, [stream], [road])).toBeCloseTo(9 - FORD_FT, 1);
  });
});
