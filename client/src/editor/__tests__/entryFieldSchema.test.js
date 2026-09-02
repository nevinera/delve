import {describe, it, expect} from "vitest";
import {widgetFor, selectOptions} from "../entryFieldSchema";

describe("widgetFor", () => {
  it("recognizes the enum fields as selects", () => {
    for (const field of ["from", "to", "when", "condition", "location", "impactTiming", "type", "affects"]) {
      expect(widgetFor(field)).toEqual("select");
    }
  });

  it("recognizes amount/range as ranges", () => {
    expect(widgetFor("amount")).toEqual("range");
    expect(widgetFor("range")).toEqual("range");
  });

  it("recognizes tags", () => {
    expect(widgetFor("tags")).toEqual("tags");
  });

  it("recognizes known numeric fields", () => {
    for (const field of ["duration", "scale", "spriteColumns", "spriteRows", "spriteFrameCount", "spriteFrameRate", "volumeScale", "delta"]) {
      expect(widgetFor(field)).toEqual("number");
    }
  });

  it("treats status as readonly", () => {
    expect(widgetFor("status")).toEqual("readonly");
  });

  it("falls back to text for everything else", () => {
    expect(widgetFor("sourceURL")).toEqual("text");
    expect(widgetFor("color")).toEqual("text");
    expect(widgetFor("resourceName")).toEqual("text");
    expect(widgetFor("somethingUnknown")).toEqual("text");
  });
});

describe("selectOptions", () => {
  it("returns the options for a known select field", () => {
    expect(selectOptions("when")).toEqual(["immediate", "impact"]);
  });

  it("includes an empty option for nullable enum fields", () => {
    expect(selectOptions("to")).toContain("");
    expect(selectOptions("impactTiming")).toContain("");
  });

  it("returns an empty array for a non-select field", () => {
    expect(selectOptions("duration")).toEqual([]);
  });
});
