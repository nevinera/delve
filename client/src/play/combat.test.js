import { describe, expect, it } from "vitest";
import { hitWords, nextTarget, pickNearest } from "./combat.js";

describe("pickNearest", () => {
  const units = [{ id: 1, x: 100, y: 100 }, { id: 2, x: 130, y: 100 }];

  it("takes the one nearest the click", () => expect(pickNearest(units, 125, 100).id).toBe(2));
  it("takes none out of reach", () => expect(pickNearest(units, 500, 500)).toBeNull());
});

describe("nextTarget", () => {
  const units = [{ id: 1, gap: 30 }, { id: 2, gap: 10 }, { id: 3, gap: 20 }];

  it("starts with the nearest", () => expect(nextTarget(units, null).id).toBe(2));
  it("goes further out", () => expect(nextTarget(units, 2).id).toBe(3));
  it("comes back round", () => expect(nextTarget(units, 1).id).toBe(2));
  it("finds no one where there's no one", () => expect(nextTarget([], null)).toBeNull());
});

describe("hitWords", () => {
  it("shows damage, marking a crit", () => expect(hitWords({ effect: "damage", amount: 40, crit: true })).toEqual({ text: "40!", kind: "damage" }));
  it("shows healing", () => expect(hitWords({ effect: "heal", amount: 9 })).toEqual({ text: "+9", kind: "heal" }));
  it("names a status", () => expect(hitWords({ effect: "status", status: "c" }, [{ id: "c", name: "Chilled" }]).text).toBe("Chilled"));
  it("says nothing of the rest", () => expect(hitWords({ effect: "resource" })).toBeNull());
});
