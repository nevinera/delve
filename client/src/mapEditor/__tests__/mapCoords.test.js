import {describe, it, expect} from "vitest";
import {pixelToFeet, feetToPixel, feetSpacingToPixelsX, feetSpacingToPixelsY} from "../mapCoords";

const PIXEL_DIMENSIONS = {width: 2000, height: 1000};
const FEET_DIMENSIONS = {width: 100, height: 50};

describe("pixelToFeet", () => {
  it("maps the top-left pixel corner to (0, feetHeight) - feet-y increases upward", () => {
    expect(pixelToFeet(0, 0, PIXEL_DIMENSIONS, FEET_DIMENSIONS)).toEqual({x: 0, y: 50});
  });

  it("maps the bottom-left pixel corner to (0, 0)", () => {
    expect(pixelToFeet(0, 1000, PIXEL_DIMENSIONS, FEET_DIMENSIONS)).toEqual({x: 0, y: 0});
  });

  it("maps the center pixel to the center in feet", () => {
    expect(pixelToFeet(1000, 500, PIXEL_DIMENSIONS, FEET_DIMENSIONS)).toEqual({x: 50, y: 25});
  });
});

describe("feetToPixel", () => {
  it("is the inverse of pixelToFeet", () => {
    const px = 437, py = 812;
    const feet = pixelToFeet(px, py, PIXEL_DIMENSIONS, FEET_DIMENSIONS);
    const roundTripped = feetToPixel(feet.x, feet.y, PIXEL_DIMENSIONS, FEET_DIMENSIONS);
    expect(roundTripped.x).toBeCloseTo(px, 6);
    expect(roundTripped.y).toBeCloseTo(py, 6);
  });

  it("maps feet-origin (0, 0) to the bottom-left pixel corner", () => {
    expect(feetToPixel(0, 0, PIXEL_DIMENSIONS, FEET_DIMENSIONS)).toEqual({x: 0, y: 1000});
  });
});

describe("feetSpacingToPixelsX / feetSpacingToPixelsY", () => {
  it("scales a real-world spacing to pixels independently per axis", () => {
    // 2000px / 100ft = 20px/ft on x; 1000px / 50ft = 20px/ft on y too here,
    // but the two are computed independently (dimensions need not match).
    expect(feetSpacingToPixelsX(5, PIXEL_DIMENSIONS, FEET_DIMENSIONS)).toBeCloseTo(100, 6);
    expect(feetSpacingToPixelsY(5, PIXEL_DIMENSIONS, FEET_DIMENSIONS)).toBeCloseTo(100, 6);
  });

  it("differs per axis when the image/feet aspect ratios differ", () => {
    const skewedFeet = {width: 100, height: 100}; // same feet size, non-square image
    expect(feetSpacingToPixelsX(5, PIXEL_DIMENSIONS, skewedFeet)).toBeCloseTo(100, 6);
    expect(feetSpacingToPixelsY(5, PIXEL_DIMENSIONS, skewedFeet)).toBeCloseTo(50, 6);
  });
});
