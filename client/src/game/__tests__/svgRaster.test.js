import {describe, it, expect} from "vitest";
import {svgRasterSize} from "../svgRaster";

// loadSvgToCanvas itself needs a real 2D canvas context, which jsdom doesn't
// provide (see MapPreviewScene's own WebGL note) - only this pure sizing
// math is unit-tested.
describe("svgRasterSize", () => {
  it("targets pixelsPerFoot × feetDimensions when feetDimensions is already set", () => {
    expect(svgRasterSize(1283.718, 1538.266, {width: 100, height: 50}, {pixelsPerFoot: 8, maxDimension: 4096}))
      .toEqual({width: 800, height: 400});
  });

  it("clamps the feetDimensions-driven target down to maxDimension, preserving its own aspect ratio", () => {
    expect(svgRasterSize(1283.718, 1538.266, {width: 931, height: 1116}, {pixelsPerFoot: 8, maxDimension: 4096}))
      .toEqual({width: 3417, height: 4096});
  });

  it("never inflates the feetDimensions-driven target past its own density, even under the cap", () => {
    expect(svgRasterSize(1283.718, 1538.266, {width: 10, height: 10}, {pixelsPerFoot: 8, maxDimension: 4096}))
      .toEqual({width: 80, height: 80});
  });

  it("falls back to filling maxDimension at the SVG's own native aspect ratio when feetDimensions isn't set yet", () => {
    expect(svgRasterSize(2000, 1000, null, {maxDimension: 4096})).toEqual({width: 4096, height: 2048});
  });

  it("still upscales a small SVG via the fallback - re-rendering vector data at a higher resolution is lossless", () => {
    expect(svgRasterSize(100, 50, {width: 0, height: 0}, {maxDimension: 4096})).toEqual({width: 4096, height: 2048});
  });
});
