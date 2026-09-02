import {describe, it, expect} from "vitest";
import {humanize, entryTypeLabel, entryHeading, formatValue} from "../abilityFormatting";

describe("humanize", () => {
  it("humanizes a camelCase key", () => {
    expect(humanize("globalCooldown")).toEqual("Global cooldown");
  });

  it("humanizes an acronym-ish key", () => {
    expect(humanize("iconURL")).toEqual("Icon url");
  });
});

describe("entryTypeLabel", () => {
  it("singularizes a section name", () => {
    expect(entryTypeLabel("graphicEffects")).toEqual("Graphic effect");
    expect(entryTypeLabel("soundEffects")).toEqual("Sound effect");
    expect(entryTypeLabel("effects")).toEqual("Effect");
  });
});

describe("entryHeading", () => {
  it("prefers type as a hint", () => {
    expect(entryHeading("effects", 0, {type: "harm"})).toEqual("Effect 1: harm");
  });

  it("falls back to when", () => {
    expect(entryHeading("graphicEffects", 2, {when: "impact"})).toEqual("Graphic effect 3: impact");
  });

  it("falls back to just the label and index with no hint", () => {
    expect(entryHeading("soundEffects", 4, {})).toEqual("Sound effect 5");
  });
});

describe("formatValue", () => {
  it("renders nil as an em dash", () => {
    expect(formatValue(null)).toEqual("—");
    expect(formatValue(undefined)).toEqual("—");
  });

  it("renders booleans as their string form", () => {
    expect(formatValue(true)).toEqual("true");
  });

  it("joins array elements with a comma", () => {
    expect(formatValue(["physical", "melee"])).toEqual("physical, melee");
  });

  it("joins nested object fields with humanized labels", () => {
    expect(formatValue({resourceName: "energy", delta: 10})).toEqual("Resource name: energy; Delta: 10");
  });

  it("stringifies plain scalars", () => {
    expect(formatValue(1.5)).toEqual("1.5");
  });
});
