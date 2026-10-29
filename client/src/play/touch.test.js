import { describe, expect, it } from "vitest";
import { stickKeys } from "./touch.js";

describe("the thumbstick", () => {
  it("presses nothing near its middle", () => {
    expect([...stickKeys(5, -10)]).toEqual([]);
  });

  it("runs forward and back, and strafes, on the diagonals too", () => {
    expect([...stickKeys(0, -50)]).toEqual(["w"]);
    expect([...stickKeys(0, 40)]).toEqual(["s"]);
    expect([...stickKeys(-35, -35)].sort()).toEqual(["q", "w"]);
    expect([...stickKeys(50, 0)]).toEqual(["e"]);
  });
});
