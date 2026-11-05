import { describe, expect, it } from "vitest";
import { HOMEWARD, withHomeward } from "./homeward.js";

describe("withHomeward", () => {
  it("adds Homeward last, in place of a class's own", () => {
    const made = withHomeward({ id: "c", abilities: [{ id: "strike" }, { id: "homeward", name: "Mine" }] });
    expect(made.abilities.map((a) => a.id)).toEqual(["strike", "homeward"]);
    expect(made.abilities[1]).toBe(HOMEWARD);
    expect(HOMEWARD.castTime).toBe(10);
    expect(HOMEWARD.cooldown).toBe(1200);
  });

  it("leaves a missing class missing", () => {
    expect(withHomeward(null)).toBe(null);
  });
});
