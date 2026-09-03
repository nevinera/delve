import {describe, it, expect} from "vitest";
import {resolveStockAssetUrl} from "../resolveStockAssetUrl";

const stockAssets = {
  graphics: {arc: {url: "/abilities/graphics/arc.webp"}},
  sounds: {twang: {url: "/abilities/sounds/twang.ogg"}},
};

describe("resolveStockAssetUrl", () => {
  it("resolves a recognized stock reference against this app's own origin", () => {
    expect(resolveStockAssetUrl(":arc:", "graphics", stockAssets)).toEqual(`${window.location.origin}/abilities/graphics/arc.webp`);
  });

  it("checks the kind-specific list, not just any kind", () => {
    expect(resolveStockAssetUrl(":arc:", "sounds", stockAssets)).toBeNull();
  });

  it("returns null for a normal relative path, not a stock reference", () => {
    expect(resolveStockAssetUrl("../graphics/icons/x.svg", "graphics", stockAssets)).toBeNull();
  });

  it("returns null for an unrecognized stock name", () => {
    expect(resolveStockAssetUrl(":not-real:", "graphics", stockAssets)).toBeNull();
  });

  it("returns null when stockAssets is missing entirely", () => {
    expect(resolveStockAssetUrl(":arc:", "graphics", undefined)).toBeNull();
  });
});
