import {describe, it, expect} from "vitest";
import {buildLayoutMetadata} from "../layoutMetadata";

describe("buildLayoutMetadata", () => {
  it("wraps the positions map as-is", () => {
    const positions = {"gc1-goblin-cave-entrance": {x: 10, y: 20}};
    expect(buildLayoutMetadata(positions)).toEqual({positions});
  });

  it("wraps an empty override map the same way", () => {
    expect(buildLayoutMetadata({})).toEqual({positions: {}});
  });
});
