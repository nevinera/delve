import {describe, it, expect} from "vitest";
import {widgetFor, selectOptions, entryFieldsFor} from "../entryFieldSchema";

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

describe("entryFieldsFor", () => {
  it("returns the full recognized graphicEffects field list, including ones absent from a plain-image entry", () => {
    const plainImageEntry = {sourceURL: "punch-impact.webp", duration: 0.3, when: "impact"};
    const fields = entryFieldsFor("graphicEffects", plainImageEntry);
    expect(fields).toContain("spriteColumns");
    expect(fields).toContain("spriteRows");
    expect(fields).toContain("spriteFrameCount");
    expect(fields).toContain("spriteFrameRate");
  });

  it("returns the full recognized soundEffects field list, including ones absent from a bare entry", () => {
    const bareEntry = {sourceURL: "punch.ogg", duration: 0.1, location: "affected", when: "impact", condition: "onHit"};
    const fields = entryFieldsFor("soundEffects", bareEntry);
    expect(fields).toContain("impactTiming");
    expect(fields).toContain("volumeScale");
  });

  it("falls back to the entry's own keys for a section with no recognized list (effects)", () => {
    const entry = {type: "harm", affects: "bTarget", amount: 10.0};
    expect(entryFieldsFor("effects", entry)).toEqual(["type", "affects", "amount"]);
  });
});
