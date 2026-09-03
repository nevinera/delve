import { describe, it, expect } from "vitest";
import { resolveAbilityForPlayback, assetOverrideKey, currentFieldValue } from "../resolveAbilityForPlayback";

describe("resolveAbilityForPlayback", () => {
  const assetMap = {
    "../graphics/icons/firebolt.svg": "data:image/svg+xml;base64,ICON",
    "../graphics/animations/firebolt.sprites2x2.png": "data:image/png;base64,ANIM",
    "../audio/firespell1.ogg": "data:audio/ogg;base64,SOUND",
  };

  const ability = {
    name: "Firebolt",
    iconURL: "../graphics/icons/firebolt.svg",
    graphicEffects: [{sourceURL: "../graphics/animations/firebolt.sprites2x2.png", duration: 0.5}],
    soundEffects: [{sourceURL: "../audio/firespell1.ogg", duration: 1.8}],
  };

  it("swaps iconURL and every effect sourceURL for their resolved asset", () => {
    const resolved = resolveAbilityForPlayback(ability, assetMap);
    expect(resolved.iconURL).toEqual("data:image/svg+xml;base64,ICON");
    expect(resolved.graphicEffects[0].sourceURL).toEqual("data:image/png;base64,ANIM");
    expect(resolved.soundEffects[0].sourceURL).toEqual("data:audio/ogg;base64,SOUND");
  });

  it("leaves other effect fields untouched", () => {
    const resolved = resolveAbilityForPlayback(ability, assetMap);
    expect(resolved.graphicEffects[0].duration).toEqual(0.5);
  });

  it("falls back to the original url when no asset was resolved server-side", () => {
    const resolved = resolveAbilityForPlayback(ability, {});
    expect(resolved.iconURL).toEqual("../graphics/icons/firebolt.svg");
    expect(resolved.graphicEffects[0].sourceURL).toEqual("../graphics/animations/firebolt.sprites2x2.png");
  });

  it("does not mutate the original ability", () => {
    resolveAbilityForPlayback(ability, assetMap);
    expect(ability.iconURL).toEqual("../graphics/icons/firebolt.svg");
  });

  it("prefers an iconURL override over the resolved assetMap value", () => {
    const resolved = resolveAbilityForPlayback(ability, assetMap, {iconURL: "blob:local-upload"});
    expect(resolved.iconURL).toEqual("blob:local-upload");
  });

  it("uses an iconURL override even when the ability has no iconURL at all", () => {
    const resolved = resolveAbilityForPlayback({...ability, iconURL: undefined}, assetMap, {iconURL: "blob:local-upload"});
    expect(resolved.iconURL).toEqual("blob:local-upload");
  });

  it("prefers a per-entry sourceURL override over the resolved assetMap value", () => {
    const overrides = {[assetOverrideKey("graphicEffects", 0, "sourceURL")]: "blob:local-graphic"};
    const resolved = resolveAbilityForPlayback(ability, assetMap, overrides);
    expect(resolved.graphicEffects[0].sourceURL).toEqual("blob:local-graphic");
    expect(resolved.soundEffects[0].sourceURL).toEqual("data:audio/ogg;base64,SOUND");
  });

  it("uses a per-entry sourceURL override even when the entry's own sourceURL is still empty", () => {
    // e.g. a freshly-added graphicEffect entry (placeholder sourceURL: "")
    // that the user has since uploaded a file into but not yet typed a path
    // for - the upload must still win, not silently fall through.
    const freshEntryAbility = {...ability, graphicEffects: [{sourceURL: "", duration: 0.3}]};
    const overrides = {[assetOverrideKey("graphicEffects", 0, "sourceURL")]: "blob:local-upload"};
    const resolved = resolveAbilityForPlayback(freshEntryAbility, assetMap, overrides);
    expect(resolved.graphicEffects[0].sourceURL).toEqual("blob:local-upload");
  });

  it("only applies an override to the entry at the matching index", () => {
    const twoEffectAbility = {
      ...ability,
      graphicEffects: [
        {sourceURL: "a.png", duration: 0.1},
        {sourceURL: "b.png", duration: 0.2},
      ],
    };
    const overrides = {[assetOverrideKey("graphicEffects", 1, "sourceURL")]: "blob:local-b"};
    const resolved = resolveAbilityForPlayback(twoEffectAbility, {}, overrides);
    expect(resolved.graphicEffects[0].sourceURL).toEqual("a.png");
    expect(resolved.graphicEffects[1].sourceURL).toEqual("blob:local-b");
  });

  describe("stock asset references", () => {
    const stockAssets = {
      icons: {heal: {url: "/abilities/icons/heal.svg"}},
      graphics: {arc: {url: "/abilities/graphics/arc.webp"}},
      sounds: {twang: {url: "/abilities/sounds/twang.ogg"}},
    };

    it("resolves a stock iconURL against this app's own origin, not assetMap", () => {
      const resolved = resolveAbilityForPlayback({...ability, iconURL: ":heal:"}, assetMap, {}, stockAssets);
      expect(resolved.iconURL).toEqual(`${window.location.origin}/abilities/icons/heal.svg`);
    });

    it("resolves a stock graphicEffects sourceURL against this app's own origin", () => {
      const stockAbility = {...ability, graphicEffects: [{sourceURL: ":arc:", duration: 0.3}]};
      const resolved = resolveAbilityForPlayback(stockAbility, assetMap, {}, stockAssets);
      expect(resolved.graphicEffects[0].sourceURL).toEqual(`${window.location.origin}/abilities/graphics/arc.webp`);
    });

    it("resolves a stock soundEffects sourceURL against this app's own origin", () => {
      const stockAbility = {...ability, soundEffects: [{sourceURL: ":twang:", duration: 0.12}]};
      const resolved = resolveAbilityForPlayback(stockAbility, assetMap, {}, stockAssets);
      expect(resolved.soundEffects[0].sourceURL).toEqual(`${window.location.origin}/abilities/sounds/twang.ogg`);
    });

    it("lets an upload override win over a stock reference, same as it does over assetMap", () => {
      const resolved = resolveAbilityForPlayback({...ability, iconURL: ":heal:"}, assetMap, {iconURL: "blob:local-upload"}, stockAssets);
      expect(resolved.iconURL).toEqual("blob:local-upload");
    });
  });
});

describe("currentFieldValue", () => {
  const ability = {
    name: "Firebolt",
    iconURL: "../graphics/icons/firebolt.svg",
    graphicEffects: [{sourceURL: "../graphics/animations/firebolt.sprites2x2.png", duration: 0.5}],
  };

  it("resolves a top-level field", () => {
    expect(currentFieldValue(ability, "iconURL")).toEqual("../graphics/icons/firebolt.svg");
  });

  it("resolves a per-entry field", () => {
    const key = assetOverrideKey("graphicEffects", 0, "sourceURL");
    expect(currentFieldValue(ability, key)).toEqual("../graphics/animations/firebolt.sprites2x2.png");
  });

  it("returns undefined for an out-of-range entry index", () => {
    const key = assetOverrideKey("graphicEffects", 5, "sourceURL");
    expect(currentFieldValue(ability, key)).toBeUndefined();
  });
});
