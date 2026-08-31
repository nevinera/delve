import { describe, it, expect } from "vitest";
import { hasLineOfSight } from "../collision.js";

describe("hasLineOfSight", () => {
  it("is clear with no barriers", () => {
    expect(hasLineOfSight(0, 0, 10, 0, [])).toBe(true);
  });

  it("is blocked by a wall crossing the line", () => {
    const barriers = [{ type: "wall", locations: [{ x: 5, y: -5 }, { x: 5, y: 5 }] }];
    expect(hasLineOfSight(0, 0, 10, 0, barriers)).toBe(false);
  });

  it("is clear when the wall doesn't cross the line", () => {
    const barriers = [{ type: "wall", locations: [{ x: 5, y: 10 }, { x: 5, y: 20 }] }];
    expect(hasLineOfSight(0, 0, 10, 0, barriers)).toBe(true);
  });

  it("is blocked by a circle the line passes through", () => {
    const barriers = [{ type: "circle", location: { x: 5, y: 0 }, radius: 2 }];
    expect(hasLineOfSight(0, 0, 10, 0, barriers)).toBe(false);
  });

  it("is clear when the circle is far from the line", () => {
    const barriers = [{ type: "circle", location: { x: 5, y: 20 }, radius: 2 }];
    expect(hasLineOfSight(0, 0, 10, 0, barriers)).toBe(true);
  });
});
