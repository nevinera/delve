import { describe, it, expect } from "vitest";
import { riverFlow } from "./rivers.js";

// Ground that falls 10ft per tile eastward, reaching the sea past x = 10.
const slope = (x) => 100 - 10 * x;
const river = (id, points) => ({ id, points, width: 30 });

describe("riverFlow", () => {
  it("runs each segment downhill, whichever way it was drawn", () => {
    const { flow } = riverFlow([river("a", [[1, 0], [3, 0], [2, 1]])], slope);
    expect(flow.get("a")).toEqual([true, false]);
  });

  it("keeps the drawn direction on level ground", () => {
    const { flow } = riverFlow([river("a", [[3, 0], [1, 0]])], () => 50);
    expect(flow.get("a")).toEqual([true]);
  });

  it("is happy with a river that reaches the sea", () => {
    expect(riverFlow([river("a", [[1, 0], [11, 0]])], slope).stuck).toEqual([]);
  });

  it("marks a river's low end on land as stuck", () => {
    expect(riverFlow([river("a", [[1, 0], [5, 0]])], slope).stuck).toEqual([[5, 0]]);
  });

  it("marks a dip in the middle of a river as stuck", () => {
    const valley = (x) => Math.abs(x - 5) * 10;
    expect(riverFlow([river("a", [[1, 0], [5, 0], [9, 0]])], valley).stuck).toEqual([[5, 0]]);
  });

  it("lets a river end by joining another's line", () => {
    const rivers = [river("main", [[1, 0], [11, 0]]), river("branch", [[2, 3], [4, 0]])];
    expect(riverFlow(rivers, slope).stuck).toEqual([]);
  });

  it("marks a point two rivers end at as stuck", () => {
    const rivers = [river("a", [[1, 0], [5, 0]]), river("b", [[1, 2], [5, 0]])];
    expect(riverFlow(rivers, slope).stuck).toEqual([[5, 0]]);
  });

  it("lets a shared point drain down either river", () => {
    const rivers = [river("a", [[1, 0], [5, 0]]), river("b", [[5, 0], [11, 0]])];
    expect(riverFlow(rivers, slope).stuck).toEqual([]);
  });
});
