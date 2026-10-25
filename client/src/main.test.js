import { describe, it, expect } from "vitest";
import { threeRevision } from "./main.js";

describe("client entry", () => {
  it("loads three.js", () => {
    expect(Number(threeRevision)).toBeGreaterThan(0);
  });
});
