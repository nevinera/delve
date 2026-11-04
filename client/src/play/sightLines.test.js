import { describe, expect, it } from "vitest";
import { sightColor } from "./sightLines.js";

describe("sightColor", () => {
  it("goes by the client until the server answers", () => {
    expect(sightColor(true)).toBe("clear");
    expect(sightColor(false)).toBe("blocked");
  });

  it("is red when they disagree", () => {
    expect(sightColor(true, true)).toBe("clear");
    expect(sightColor(false, false)).toBe("blocked");
    expect(sightColor(true, false)).toBe("disagree");
    expect(sightColor(false, true)).toBe("disagree");
  });
});
