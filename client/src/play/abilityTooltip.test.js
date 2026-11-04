import { describe, expect, it } from "vitest";
import { isHolding, tooltipWords } from "./abilityTooltip.js";

describe("what a tooltip says", () => {
  const reckoning = { name: "Reckoning", cost: [{ resource: "conviction", amount: 3 }], range: "melee", castTime: 2.5, cooldown: 6, description: "A strike.", requires: [{ wielding: "twoHanded" }] };
  const holding = { look: { weapon: "greatsword" }, resources: { conviction: 3 }, names: { conviction: "Conviction" } };

  it("gives cost and range, then cast and cooldown, then what it needs", () => {
    expect(tooltipWords(reckoning, holding)).toEqual({
      name: "Reckoning",
      rows: [
        { left: "3 Conviction", right: "Melee Range", leftShort: false },
        { left: "2.5 sec cast", right: "6 sec cooldown" },
      ],
      needs: "Requires Two-Handed Weapon",
      missing: false,
      cooldownLeft: "",
      description: "A strike.",
    });
  });

  it("marks a cost you can't pay and a weapon you aren't holding", () => {
    const words = tooltipWords(reckoning, { ...holding, resources: { conviction: 2 }, look: { weapon: "sword", offhand: "shield" } });
    expect(words.rows[0].leftShort).toBe(true);
    expect(words.missing).toBe(true);
  });

  it("counts down a cooldown by whole seconds", () => {
    expect(tooltipWords(reckoning, { ...holding, cooldownLeft: 3.2 }).cooldownLeft).toBe("Cooldown remaining: 4 sec");
  });

  it("calls one with no cast time instant, and leaves out what it doesn't have", () => {
    const words = tooltipWords({ id: "plain" });
    expect(words.name).toBe("plain");
    expect(words.rows).toEqual([{ left: "Instant", right: "" }]);
    expect(words.needs).toBe("");
    expect(words.missing).toBe(false);
  });

  it("says channels, minutes, charges and range in feet", () => {
    const { rows } = tooltipWords({ range: 40, channel: { duration: 3 }, cooldown: 90, charges: 2 });
    expect(rows.map(({ left, right }) => [left, right])).toEqual([["", "40 ft range"], ["Channeled", "1.5 min cooldown, 2 charges"]]);
  });
});

describe("holding what an ability wants", () => {
  it("reads the look's hands", () => {
    expect(isHolding("shield", { weapon: "sword", offhand: "shield" })).toBe(true);
    expect(isHolding("shield", { weapon: "sword", offhand: "none" })).toBe(false);
    expect(isHolding("twoHanded", { weapon: "maul" })).toBe(true);
    expect(isHolding("oneHanded", { weapon: "maul" })).toBe(false);
    expect(isHolding("dual", { weapon: "sword", offhand: "axe" })).toBe(true);
    expect(isHolding("dual", { weapon: "sword", offhand: "orb" })).toBe(false);
    expect(isHolding(undefined, {})).toBe(true);
  });
});
