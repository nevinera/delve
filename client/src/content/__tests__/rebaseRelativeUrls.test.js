import { describe, expect, it } from "vitest";
import { dirname, rebaseRelativeUrls } from "../rebaseRelativeUrls";

describe("dirname", () => {
  it("returns everything before the last slash", () => {
    expect(dirname("zones/goblin-cave/goblin-cave.json")).toBe("zones/goblin-cave");
  });

  it("returns empty string for a bare filename", () => {
    expect(dirname("punch.json")).toBe("");
  });
});

describe("rebaseRelativeUrls", () => {
  it("rewrites a same-directory reference into a subdirectory-relative one", () => {
    // The bug this fixes: a map's imageUrl ("./x.webp", same dir as the
    // map file) embedded into the zone one directory up.
    const data = { imageUrl: "./gc1-goblin-cave-entrance.webp", thumbnailUrl: "gc1-goblin-cave-entrance.thumb.webp" };

    const result = rebaseRelativeUrls(data, "zones/goblin-cave/gc1-goblin-cave-entrance", "zones/goblin-cave");

    expect(result).toEqual({
      imageUrl: "gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.webp",
      thumbnailUrl: "gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.thumb.webp",
    });
  });

  it("adds more ../ when the target directory is shallower than the source", () => {
    // unit_types/goblin.json's tokenImageUrl ("../tokens/...") embedded a
    // level deeper, into zones/goblin-cave.
    const data = { tokenImageUrl: "../tokens/unit/goblin-1.webp" };

    const result = rebaseRelativeUrls(data, "unit_types", "zones/goblin-cave");

    expect(result).toEqual({ tokenImageUrl: "../../tokens/unit/goblin-1.webp" });
  });

  it("removes ../ segments when the target directory is deeper than the source", () => {
    // abilities/classes/puncher/punch.json's iconURL embedded into classes/
    // (2 levels shallower).
    const data = { iconURL: "../../../graphics/icons/punch.svg" };

    const result = rebaseRelativeUrls(data, "abilities/classes/puncher", "classes");

    expect(result).toEqual({ iconURL: "../graphics/icons/punch.svg" });
  });

  it("rebases every string in a tokenImageUrl array", () => {
    const data = { tokenImageUrl: ["../tokens/unit/goblin-1.webp", "../tokens/unit/goblin-2.webp"] };

    const result = rebaseRelativeUrls(data, "unit_types", "zones/goblin-cave");

    expect(result).toEqual({
      tokenImageUrl: ["../../tokens/unit/goblin-1.webp", "../../tokens/unit/goblin-2.webp"],
    });
  });

  it("recurses into nested objects and arrays, e.g. an ability's effects", () => {
    const data = {
      iconURL: "../../../graphics/icons/punch.svg",
      graphicEffects: [{ sourceURL: "../../../graphics/effects/punch-impact.webp", duration: 0.3 }],
    };

    const result = rebaseRelativeUrls(data, "abilities/classes/puncher", "classes");

    expect(result).toEqual({
      iconURL: "../graphics/icons/punch.svg",
      graphicEffects: [{ sourceURL: "../graphics/effects/punch-impact.webp", duration: 0.3 }],
    });
  });

  it("leaves an absolute URL untouched", () => {
    const data = { iconURL: "https://cdn.example.com/icon.svg" };

    expect(rebaseRelativeUrls(data, "abilities", "classes")).toEqual(data);
  });

  it("leaves a stock reference untouched", () => {
    const data = { iconURL: ":sparkle:" };

    expect(rebaseRelativeUrls(data, "abilities", "classes")).toEqual(data);
  });

  it("leaves non-URL fields alone", () => {
    const data = { name: "Punch", globalCooldown: 1.5, tags: ["melee"] };

    expect(rebaseRelativeUrls(data, "abilities", "classes")).toEqual(data);
  });

  it("is a no-op when source and target directories match", () => {
    const data = { sourceURL: "../graphics/effects/x.webp" };

    expect(rebaseRelativeUrls(data, "classes", "classes")).toEqual(data);
  });
});
