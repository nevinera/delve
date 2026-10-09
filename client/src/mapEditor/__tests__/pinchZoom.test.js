import {describe, it, expect} from "vitest";
import {pinchSpan, pinchView} from "../pinchZoom";

describe("pinchSpan", () => {
  it("measures two touches", () => {
    expect(pinchSpan({x: 0, y: 0}, {x: 30, y: 40})).toEqual({distance: 50, midpoint: {x: 15, y: 20}});
  });
});

describe("pinchView", () => {
  const start = {distance: 100, midpoint: {x: 200, y: 100}, zoom: 0.5, offset: {x: 0, y: 0}};

  it("zooms by the spread, keeping the midpoint's map point in place", () => {
    const view = pinchView(start, {distance: 200, midpoint: {x: 200, y: 100}});
    expect(view.zoom).toBe(1);
    // map point (400, 200) was under the midpoint, and still is
    expect(view.offset).toEqual({x: -200, y: -100});
  });

  it("pans with the midpoint", () => {
    const view = pinchView(start, {distance: 100, midpoint: {x: 250, y: 130}});
    expect(view).toEqual({zoom: 0.5, offset: {x: 50, y: 30}});
  });

  it("clamps the zoom", () => {
    expect(pinchView(start, {distance: 1000, midpoint: start.midpoint}, (z) => Math.min(z, 2)).zoom).toBe(2);
  });
});
