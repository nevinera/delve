import { describe, it, expect } from "vitest";
import { screenFromTile, tileFromScreen } from "./mapView.js";

describe("map view coordinates", () => {
  const view = { x: 3, z: -2, scale: 40 };
  const size = { width: 800, height: 600 };

  it("puts the view position at the canvas center", () => {
    expect(screenFromTile(view, size, [3, -2])).toEqual([400, 300]);
  });

  it("converts screen positions back to tiles", () => {
    const tile = [5.25, -7.5];
    expect(tileFromScreen(view, size, screenFromTile(view, size, tile))).toEqual(tile);
  });
});
