import { describe, expect, it } from "vitest";
import { facing } from "./compass.js";

describe("facing", () => {
  it("names the 16 points, north being -z", () => {
    expect(facing(Math.PI)).toBe("N");
    expect(facing(0)).toBe("S");
    expect(facing(Math.PI / 2)).toBe("E");
    expect(facing(-Math.PI / 2)).toBe("W");
    expect(facing((3 * Math.PI) / 4)).toBe("NE");
    expect(facing(Math.PI - Math.PI / 8)).toBe("NNE");
  });
});
