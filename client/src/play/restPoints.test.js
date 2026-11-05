import { describe, expect, it } from "vitest";
import { restPointBy } from "./restPoints.js";

describe("restPointBy", () => {
  const points = [
    { id: "a", at: [0, 0, 0] },
    { id: "b", at: [10, 5, 0] },
  ];

  it("picks the nearest rest point in reach, across the ground", () => {
    expect(restPointBy(points, 7, 0).id).toBe("b");
    expect(restPointBy(points, 2, 1).id).toBe("a");
  });

  it("picks none out of reach", () => {
    expect(restPointBy(points, 40, 40)).toBe(null);
  });
});
