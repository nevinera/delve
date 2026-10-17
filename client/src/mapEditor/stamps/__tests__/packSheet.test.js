import {describe, expect, it} from "vitest";
import {packImages} from "../packSheet";

describe("packImages", () => {
  it("fills rows left to right, wrapping at maxWidth", () => {
    const result = packImages([{width: 100, height: 50}, {width: 100, height: 80}, {width: 100, height: 20}], {maxWidth: 250, gap: 2});
    expect(result.placements).toEqual([{x: 0, y: 0}, {x: 102, y: 0}, {x: 0, y: 82}]);
    expect(result).toMatchObject({width: 202, height: 102});
  });

  it("starts below an existing sheet and keeps its width", () => {
    const result = packImages([{width: 10, height: 10}], {startY: 64, minWidth: 128});
    expect(result.placements).toEqual([{x: 0, y: 64}]);
    expect(result).toMatchObject({width: 128, height: 74});
  });

  it("leaves the sheet as it was when there is nothing to add", () => {
    expect(packImages([], {startY: 64, minWidth: 128})).toEqual({placements: [], width: 128, height: 64});
  });

  it("puts an image wider than the sheet alone in its row", () => {
    const result = packImages([{width: 5, height: 5}, {width: 300, height: 5}], {maxWidth: 100});
    expect(result.placements[1]).toEqual({x: 0, y: 7});
    expect(result.width).toBe(300);
  });
});
