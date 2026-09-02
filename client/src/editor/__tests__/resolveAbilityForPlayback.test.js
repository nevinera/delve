import { describe, it, expect } from "vitest";
import { resolveAbilityForPlayback, assetOverrideKey } from "../resolveAbilityForPlayback";

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
});
