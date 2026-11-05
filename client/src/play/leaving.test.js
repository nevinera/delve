import { describe, expect, it } from "vitest";
import { secondsLeft } from "./leaving.js";

describe("secondsLeft", () => {
  it("counts whole seconds down to 0", () => {
    expect(secondsLeft(20000)).toBe(20);
    expect(secondsLeft(19001)).toBe(20);
    expect(secondsLeft(400)).toBe(1);
    expect(secondsLeft(-5)).toBe(0);
  });
});
