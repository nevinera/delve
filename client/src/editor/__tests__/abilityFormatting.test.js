import {describe, it, expect} from "vitest";
import {humanize, scalarFields, listFields, entrySummary, formatValue} from "../abilityFormatting";

describe("humanize", () => {
  it("humanizes a camelCase key", () => {
    expect(humanize("globalCooldown")).toEqual("Global cooldown");
  });

  it("humanizes an acronym-ish key", () => {
    expect(humanize("iconURL")).toEqual("Icon url");
  });
});

describe("scalarFields / listFields", () => {
  const ability = {name: "Punch", castTime: null, graphicEffects: [{a: 1}], soundEffects: []};

  it("scalarFields keeps only non-array values", () => {
    expect(scalarFields(ability)).toEqual([["name", "Punch"], ["castTime", null]]);
  });

  it("listFields keeps only array values", () => {
    expect(listFields(ability)).toEqual([["graphicEffects", [{a: 1}]], ["soundEffects", []]]);
  });
});

describe("entrySummary", () => {
  it("prefers type as a hint", () => {
    expect(entrySummary({type: "harm"}, 0)).toEqual("1. harm");
  });

  it("falls back to when", () => {
    expect(entrySummary({when: "impact"}, 2)).toEqual("3. impact");
  });

  it("falls back to a bare index", () => {
    expect(entrySummary({}, 4)).toEqual("5");
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
