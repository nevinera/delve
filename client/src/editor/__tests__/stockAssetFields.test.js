import {describe, it, expect} from "vitest";
import {graphicFieldsFor, soundFieldsFor} from "../stockAssetFields";

describe("graphicFieldsFor", () => {
  it("sets sourceURL to the colon-wrapped name and copies sprite fields when present", () => {
    const fields = graphicFieldsFor("magic-ball", {spriteColumns: 3, spriteRows: 3, spriteFrameRate: 12});
    expect(fields).toEqual({
      sourceURL: ":magic-ball:", spriteColumns: 3, spriteRows: 3, spriteFrameCount: undefined, spriteFrameRate: 12,
    });
  });

  // undefined, not null: the server-side validators require an absent key,
  // not merely a null value, for an unset sprite field (see
  // Validators::Helpers#validate_graphic_sprite_sheet!) - JSON.stringify
  // drops an undefined-valued key entirely, clearing any stale value.
  it("clears every sprite field (as undefined) for a static (non-animated) pick", () => {
    const fields = graphicFieldsFor("glow", {});
    expect(fields).toEqual({
      sourceURL: ":glow:", spriteColumns: undefined, spriteRows: undefined, spriteFrameCount: undefined, spriteFrameRate: undefined,
    });
    expect(JSON.stringify(fields)).toEqual(JSON.stringify({sourceURL: ":glow:"}));
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
