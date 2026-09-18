import {describe, it, expect} from "vitest";
import {WalkSimState} from "../WalkSimState";

describe("WalkSimState", () => {
  it("defaults to inactive", () => {
    expect(new WalkSimState().active).toBe(false);
  });

  it("start returns a new, active instance", () => {
    const state = new WalkSimState();
    const result = state.start();
    expect(result).not.toBe(state);
    expect(result.active).toBe(true);
  });

  it("stop returns a new, inactive instance", () => {
    const result = new WalkSimState(true).stop();
    expect(result.active).toBe(false);
  });
});
