import { describe, expect, it } from "vitest";
import { STATS, statusEffectFields } from "./fields.js";
import { addStatusEffect, amountStrips, chanceStrip, changeAmountStrip, changeStrip, doesStrip, durationStrip, isPassive, maxStacksStrip, stackingStrip, statAmountStrip, statIsPercent, statStrip, statusEffectChoices, statusSummary, TRIGGER_LABELS, triggerCooldownStrip } from "./statusChoices.js";

const made = { primaryStats: ["strength"] };

describe("how a status lasts", () => {
  it("lasts until removed by leaving duration out, which takes what hangs on it too", () => {
    const s = { kind: "buff", duration: 8, dispel: "magic", stacking: "stack", maxStacks: 3 };
    durationStrip(s).pick(0);
    expect(s).toEqual({ kind: "buff" });
    expect(durationStrip(s).value).toBe(0);
  });

  it("starts over when landed again by leaving stacking out", () => {
    const s = {};
    expect(stackingStrip(s).value).toBe("replace");
    stackingStrip(s).pick("refresh");
    expect(s.stacking).toBe("refresh");
    stackingStrip(s).pick("stack");
    expect(s).toEqual({ stacking: "stack", maxStacks: 3 });
    expect(maxStacksStrip(s).value).toBe(3);
    stackingStrip(s).pick("replace");
    expect(s).toEqual({});
    expect(maxStacksStrip(s)).toBeNull();
  });

  it("knows a passive by the class or a specialization holding it", () => {
    const c = { passives: [{ status: "a", level: 1 }], specializations: [{ id: "s", status: "b" }] };
    expect([isPassive(c, "a"), isPassive(c, "b"), isPassive(c, "c")]).toEqual([true, true, false]);
  });
});

describe("a stat effect", () => {
  it("changes in percent for a stat that multiplies, and by a number for one that adds", () => {
    const e = { type: "stat", stat: "damageDone", multiply: 0.9 };
    expect(statIsPercent(e)).toBe(true);
    expect(statAmountStrip(e).value).toBe(-10);
    statAmountStrip(e).pick(30);
    expect(e.multiply).toBe(1.3);
    statStrip(e, STATS).pick("armor");
    expect(e).toEqual({ type: "stat", stat: "armor", add: 5 });
    expect(statAmountStrip(e).value).toBe(5);
    statStrip(e, STATS).pick("damageTaken");
    expect(e).toEqual({ type: "stat", stat: "damageTaken", multiply: 1.1 });
  });

  it("keeps its amount going between stats of the same sort", () => {
    const e = { type: "stat", stat: "damageDone", multiply: 1.5 };
    statStrip(e, STATS).pick("healingDone");
    expect(e.multiply).toBe(1.5);
  });

  it("offers every stat", () => {
    const strip = statStrip({}, STATS);
    expect([...strip.options, ...strip.more].map((o) => o.value).sort()).toEqual([...STATS].sort());
  });

  it("leaves what the choices can't say to the fold-out", () => {
    expect(statAmountStrip({ stat: "armor", add: 1, multiply: 2 })).toBeNull();
    expect(statAmountStrip({ stat: "armor", set: 1 })).toBeNull();
  });
});

describe("other effects", () => {
  it("start out working", () => {
    expect(addStatusEffect(made, { kind: "debuff" }, "periodic")).toEqual({ type: "periodic", does: "damage", every: 2, amount: { attackPower: 0.1 } });
    expect(addStatusEffect({ primaryStats: ["intellect"] }, { kind: "buff" }, "absorb")).toEqual({ type: "absorb", amount: { spellPower: 2 } });
    expect(addStatusEffect(made, { kind: "debuff" }, "stat")).toMatchObject({ stat: "movementSpeed", multiply: 0.7 });
    expect(addStatusEffect(made, {}, "aura")).toEqual({ type: "aura" });
  });

  it("change a periodic to a resource without keeping the amount", () => {
    const e = { type: "periodic", does: "damage", amount: { attackPower: 0.1 } };
    doesStrip(e).pick("heal");
    expect(e.amount).toEqual({ attackPower: 0.1 });
    doesStrip(e).pick("resource");
    expect(e.amount).toBe(1);
    expect(amountStrips(made, e)).toHaveLength(1);
  });

  it("hold chance and cooldown by leaving them out when they do nothing", () => {
    const e = { type: "trigger" };
    chanceStrip(e).pick(25);
    expect(e.chance).toBe(0.25);
    expect(chanceStrip(e).value).toBe(25);
    chanceStrip(e).pick(100);
    expect(e).not.toHaveProperty("chance");
    triggerCooldownStrip(e).pick(5);
    expect(e.cooldown).toBe(5);
    triggerCooldownStrip(e).pick(0);
    expect(e).not.toHaveProperty("cooldown");
  });

  it("name every trigger", () => {
    const field = statusEffectFields({}).find((f) => f.key === "on" && !f.label);
    expect([...field.options, ...field.more].filter((on) => !TRIGGER_LABELS[on])).toEqual([]);
  });

  it("change an ability in percent where that fits", () => {
    const e = { type: "modify" };
    changeStrip(e, ["damage", "range"]).pick("damage");
    expect(e).toEqual({ type: "modify", change: "damage", multiply: 1.1 });
    expect(changeAmountStrip(e).value).toBe(10);
    expect(changeAmountStrip({ type: "modify", change: "cost", add: -1 })).toBeNull();
    expect(changeAmountStrip({ type: "modify", change: "range", add: 5 })).toBeNull();
  });

  it("offer the likeliest first and everything somewhere", () => {
    const { first, rest } = statusEffectChoices({ kind: "debuff" });
    expect(first[0]).toBe("periodic");
    const field = statusEffectFields({}).find((f) => f.key === "type");
    expect([...first, ...rest].sort()).toEqual([...field.options, ...field.more].sort());
  });
});

describe("a status's summary", () => {
  it("says each effect in a line", () => {
    const lines = statusSummary({ effects: [{ type: "stat", stat: "damageTaken", multiply: 0.7 }, { type: "stat", stat: "block", add: 15 }, { type: "periodic", does: "heal", every: 2 }, { type: "control", control: "stun" }, { type: "trigger", on: "block" }, { type: "aura" }] });
    expect(lines).toEqual(["Damage taken −30%", "Block +15", "Heals every 2 s", "Stun", "When: you block", "Aura"]);
  });
});
