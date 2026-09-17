import {describe, it, expect} from "vitest";
import {circleLayout, NODE_RADIUS} from "../circleLayout";

describe("circleLayout", () => {
  it("returns an empty layout for no nodes", () => {
    expect(circleLayout([])).toEqual({});
  });

  it("places a single node at the origin", () => {
    expect(circleLayout(["only"])).toEqual({only: {x: 0, y: 0}});
  });

  it("spaces nodes evenly around a circle with circumference 6 * nodeRadius * nodeCount", () => {
    const positions = circleLayout(["a", "b", "c", "d"], {nodeRadius: 10});
    const circumference = 6 * 10 * 4;
    const expectedRadius = circumference / (2 * Math.PI);

    // 4 evenly-spaced nodes land at 0°, 90°, 180°, 270°.
    expect(positions.a.x).toBeCloseTo(expectedRadius);
    expect(positions.a.y).toBeCloseTo(0);
    expect(positions.b.x).toBeCloseTo(0);
    expect(positions.b.y).toBeCloseTo(expectedRadius);
    expect(positions.c.x).toBeCloseTo(-expectedRadius);
    expect(positions.c.y).toBeCloseTo(0);
    expect(positions.d.x).toBeCloseTo(0);
    expect(positions.d.y).toBeCloseTo(-expectedRadius);
  });

  it("grows the radius as more nodes are added, keeping per-node spacing constant", () => {
    const few = circleLayout(["a", "b", "c"], {nodeRadius: 10});
    const many = circleLayout(Array.from({length: 12}, (_, i) => `n${i}`), {nodeRadius: 10});

    const radiusOf = (positions, key) => Math.hypot(positions[key].x, positions[key].y);
    expect(radiusOf(many, "n0")).toBeGreaterThan(radiusOf(few, "a"));
  });

  it("defaults to NODE_RADIUS for spacing when no override is given", () => {
    const positions = circleLayout(["a", "b"]);
    const circumference = 6 * NODE_RADIUS * 2;
    const expectedRadius = circumference / (2 * Math.PI);
    expect(Math.hypot(positions.a.x, positions.a.y)).toBeCloseTo(expectedRadius);
  });
});
