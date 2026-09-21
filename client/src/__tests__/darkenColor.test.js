import { describe, expect, it } from "vitest";
import { darkenHexColor } from "../darkenColor";

describe("darkenHexColor", () => {
  it("scales each channel by the given factor", () => {
    expect(darkenHexColor("AADD00", 0.5)).toBe("#556f00");
  });

  it("defaults the factor to 0.35", () => {
    expect(darkenHexColor("FFFFFF")).toBe("#595959");
  });

  it("accepts a leading #", () => {
    expect(darkenHexColor("#AADD00", 0.5)).toBe("#556f00");
  });

  it("falls back to neutral gray for a missing color", () => {
    expect(darkenHexColor(undefined)).toBe("#333333");
    expect(darkenHexColor(null)).toBe("#333333");
    expect(darkenHexColor("")).toBe("#333333");
  });

  it("falls back to neutral gray for a malformed color", () => {
    expect(darkenHexColor("not-a-color")).toBe("#333333");
    expect(darkenHexColor("ABC")).toBe("#333333");
  });
});
