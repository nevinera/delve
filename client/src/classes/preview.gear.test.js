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
    expect(gearFor(made, {}, "greatsword")).toEqual({ weapon: "greatsword", offhand: "none" });
  });

  it("holds its starting gear unless the ability needs otherwise", () => {
    const starting = (startingGear, ability = {}) => gearFor({ ...made, startingGear }, ability);
    expect(starting({ weapon: "greatsword" })).toEqual({ weapon: "greatsword", offhand: "none" });
    expect(starting({ weapon: "bow" })).toEqual({ weapon: "bow", offhand: "none" });
    expect(starting({ weapon: "thrown" })).toEqual({ weapon: "thrown", offhand: "shield" });
    expect(starting({ offhand: "axe" })).toEqual({ weapon: "sword", offhand: "axe" });
    expect(starting({ offhand: "none" })).toEqual({ weapon: "sword", offhand: "none" });
    expect(starting({ weapon: "greatsword" }, { requires: [{ wielding: "shield" }] })).toEqual({ weapon: "sword", offhand: "shield" });
  });
});
