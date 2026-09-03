import {describe, it, expect} from "vitest";
import {graphicFieldsFor, soundFieldsFor} from "../stockAssetFields";

describe("graphicFieldsFor", () => {
  it("sets sourceURL to the colon-wrapped name and copies sprite fields when present", () => {
    const fields = graphicFieldsFor("magic-ball", {spriteColumns: 3, spriteRows: 3, spriteFrameRate: 12});
    expect(fields).toEqual({
      sourceURL: ":magic-ball:", spriteColumns: 3, spriteRows: 3, spriteFrameCount: null, spriteFrameRate: 12,
    });
  });

  it("nulls out every sprite field for a static (non-animated) pick", () => {
    const fields = graphicFieldsFor("glow", {});
    expect(fields).toEqual({
      sourceURL: ":glow:", spriteColumns: null, spriteRows: null, spriteFrameCount: null, spriteFrameRate: null,
    });
  });
});

describe("soundFieldsFor", () => {
  it("sets sourceURL and duration when the stock sound specifies one", () => {
    expect(soundFieldsFor("twang", {duration: 0.12})).toEqual({sourceURL: ":twang:", duration: 0.12});
  });

  it("omits duration (leaving the entry's own value alone) when the stock sound doesn't specify one", () => {
    expect(soundFieldsFor("mystery", {})).toEqual({sourceURL: ":mystery:"});
  });
});
