import { describe, expect, it } from "vitest";
import { costWords } from "./abilitiesPane.js";

describe("costWords", () => {
  it("says each kind of cost", () => {
    expect(costWords([{ resource: "mana", amount: 5 }])).toBe("5 mana");
    expect(costWords([{ resource: "mana", percent: 10 }])).toBe("10% mana");
    expect(costWords([{ resource: "combo", amount: 1, all: true }])).toBe("1+ combo, spends it all");
    expect(costWords([{ resource: "rage", amount: 2, upTo: 6 }])).toBe("2 to 6 rage");
    expect(costWords([{ resource: "mana", perSecond: 3 }])).toBe("3 mana a second");
    expect(costWords([{ resource: "a", amount: 1 }, { resource: "b", amount: 2 }])).toBe("1 a, 2 b");
  });
});
