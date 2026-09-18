import {describe, it, expect} from "vitest";
import {collectAssetUrls} from "../collectAssetUrls";

describe("collectAssetUrls", () => {
  it("finds a top-level iconURL", () => {
    expect(collectAssetUrls({name: "Punch", iconURL: "../graphics/icons/punch.svg"})).toEqual(["../graphics/icons/punch.svg"]);
  });

  it("finds URLs nested inside arrays of entries", () => {
    const ability = {
      graphicEffects: [{sourceURL: "../graphics/effects/impact.webp", duration: 0.3}],
      soundEffects: [{sourceURL: "../sounds/punch.ogg", duration: 0.2}],
    };
    expect(collectAssetUrls(ability)).toEqual(["../graphics/effects/impact.webp", "../sounds/punch.ogg"]);
  });

  it("excludes a stock reference (':name:') from the result", () => {
    expect(collectAssetUrls({iconURL: ":heal:", sourceURL: ":arc:"})).toEqual([]);
  });

  it("ignores non-string values on a *URL-suffixed key", () => {
    expect(collectAssetUrls({iconURL: null})).toEqual([]);
  });

  it("ignores fields that don't end in URL", () => {
    expect(collectAssetUrls({name: "Punch", castTime: null})).toEqual([]);
  });

  it("returns an empty array for a scalar or empty input", () => {
    expect(collectAssetUrls(null)).toEqual([]);
    expect(collectAssetUrls({})).toEqual([]);
  });
});
