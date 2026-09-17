import {describe, it, expect} from "vitest";
import {computeFitView, MIN_ZOOM, MAX_ZOOM} from "../graphView";
import {NODE_RADIUS} from "../circleLayout";

describe("computeFitView", () => {
  it("returns null when there are no nodes", () => {
    expect(computeFitView([], 400, 300)).toBeNull();
  });

  it("returns null when the container hasn't been measured (zero size)", () => {
    expect(computeFitView([{x: 0, y: 0}], 0, 0)).toBeNull();
  });

  it("centers a single node at the middle of the container", () => {
    const fit = computeFitView([{x: 50, y: -20}], 400, 300);
    expect(fit.panX).toBeCloseTo(200 - fit.zoom * 50);
    expect(fit.panY).toBeCloseTo(150 - fit.zoom * -20);
  });

  it("centers on the mean of several nodes, not their bounding-box center", () => {
    // Mean of (0,0), (10,0), (100,0) is (36.67, 0) - well off the bbox
    // center (50, 0) - centering on the mean is the point of the test.
    const fit = computeFitView([{x: 0, y: 0}, {x: 10, y: 0}, {x: 100, y: 0}], 1000, 1000);
    const meanX = (0 + 10 + 100) / 3;
    expect(fit.panX).toBeCloseTo(500 - fit.zoom * meanX);
  });

  it("zooms out enough that every node (plus its port ring) fits in the container", () => {
    const fit = computeFitView([{x: -100, y: 0}, {x: 100, y: 0}], 400, 300);
    const contentWidth = 200 + NODE_RADIUS * 2;
    expect(fit.zoom).toBeLessThanOrEqual((400 * 0.85) / contentWidth + 1e-9);
  });

  it("clamps zoom to MAX_ZOOM for a tiny, tightly-clustered set of nodes", () => {
    const fit = computeFitView([{x: 0, y: 0}, {x: 1, y: 0}], 4000, 3000);
    expect(fit.zoom).toBe(MAX_ZOOM);
  });

  it("clamps zoom to MIN_ZOOM for a huge spread in a tiny container", () => {
    const fit = computeFitView([{x: -10000, y: 0}, {x: 10000, y: 0}], 100, 100);
    expect(fit.zoom).toBe(MIN_ZOOM);
  });
});
