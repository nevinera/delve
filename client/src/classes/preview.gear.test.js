import { describe, expect, it } from "vitest";
import { gearFor } from "./preview.js";

describe("what the preview's character holds", () => {
  const made = { weapons: ["sword", "greatsword"], offhands: ["shield", "axe"] };
  const wielding = (wants) => gearFor(made, { requires: [{ wielding: wants }] });

  it("holds the class's first weapon and off hand, unless the ability needs otherwise", () => {
    expect(gearFor(made, {})).toEqual({ weapon: "sword", offhand: "shield" });
    expect(wielding("twoHanded")).toEqual({ weapon: "greatsword", offhand: "none" });
    expect(wielding("shield")).toEqual({ weapon: "sword", offhand: "shield" });
    expect(wielding("dual")).toEqual({ weapon: "sword", offhand: "axe" });
  });
});
