import { describe, expect, it } from "vitest";
import { HOMEWARD, RESTING, withBuiltins } from "./builtins.js";

describe("withBuiltins", () => {
  it("adds Homeward and Resting last, in place of a class's own", () => {
    const made = withBuiltins({ id: "c", abilities: [{ id: "strike" }, { id: "homeward", name: "Mine" }], statuses: [{ id: "resting" }, { id: "chill" }] });
    expect(made.abilities.map((a) => a.id)).toEqual(["strike", "homeward"]);
    expect(made.abilities[1]).toBe(HOMEWARD);
    expect(made.statuses).toEqual([{ id: "chill" }, RESTING]);
    expect(HOMEWARD.castTime).toBe(10);
    expect(HOMEWARD.cooldown).toBe(1200);
  });

  it("leaves a missing class missing", () => {
    expect(withBuiltins(null)).toBe(null);
  });
});
