import {describe, it, expect} from "vitest";
import {effectSchool, hastePct, statContribution, timeBudget, hastedSeconds, amountBonus} from "../abilityStats";
import {combatStats} from "./combatStatsFixture";

describe("effectSchool", () => {
  it("treats heals and healing ticks as magic", () => {
    expect(effectSchool({type: "heal"})).toBe("magic");
    expect(effectSchool({type: "recurring", onTick: "heal", school: "physical"})).toBe("magic");
  });

  it("defaults to physical", () => {
    expect(effectSchool({type: "harm"})).toBe("physical");
    expect(effectSchool({type: "harm", school: "magic"})).toBe("magic");
  });
});

describe("hastePct and statContribution", () => {
  const cs = combatStats({physical: {haste_pct: 6, stat_contribution: 50}, magic: {haste_pct: 3, stat_contribution: 40}});

  it("read the server's figure for the school", () => {
    expect(hastePct(cs, "physical")).toBe(6);
    expect(hastePct(cs, "magic")).toBe(3);
    expect(statContribution(cs, "physical")).toBe(50);
    expect(statContribution(cs, "magic")).toBe(40);
  });

  it("are zero before the server has sent stats", () => {
    expect(hastePct(undefined, "magic")).toBe(0);
    expect(statContribution(undefined, "physical")).toBe(0);
  });
});

describe("timeBudget", () => {
  it("is the cast time when there is one", () => {
    expect(timeBudget({castTime: 2, globalCooldown: 1.5})).toBe(2);
  });

  it("is the global cooldown for instants", () => {
    expect(timeBudget({castTime: null, globalCooldown: 1.5})).toBe(1.5);
  });
});

describe("hastedSeconds", () => {
  it("shortens by haste percent", () => {
    expect(hastedSeconds(3, 50)).toBe(2);
  });
});

describe("amountBonus", () => {
  const base = {combatStats: combatStats({magic: {stat_contribution: 90}}), school: "magic", budget: 2};

  it("scales the stat over the time budget", () => {
    expect(amountBonus(base)).toBe(2);
  });

  it("doubles for heals, and again for recurring ticks", () => {
    expect(amountBonus({...base, isHeal: true})).toBe(4);
    expect(amountBonus({...base, isHeal: true, isRecurring: true})).toBe(8);
  });
});
