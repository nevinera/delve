import {describe, it, expect} from "vitest";
import {describeEffects, hastedCastTime, abilitySchool} from "../abilityEffectText";
import {combatStats} from "./combatStatsFixture";

const noStats = {combatStats: combatStats()};

describe("describeEffects", () => {
  it("shows an authored harm range with no stats", () => {
    const ability = {castTime: null, globalCooldown: 1, effects: [{type: "harm", affects: "bTarget", amount: [2, 4], range: 5}]};
    expect(describeEffects(ability, noStats)).toEqual([["Deals 2-4 physical damage to the target (range 5)"]]);
  });

  it("adds the stat bonus over the gcd for an instant", () => {
    const ability = {castTime: null, globalCooldown: 1.5, effects: [{type: "harm", affects: "bTarget", amount: 10, school: "magic", range: 30}]};
    const out = describeEffects(ability, {combatStats: combatStats({magic: {stat_contribution: 90}})});
    expect(out[0][0]).toBe("Deals 12 magic damage to the target (range 30)"); // 10 + 90/90*1.5 = 11.5 -> 12
  });

  it("uses the cast time as the budget and doubles heal bonus", () => {
    const ability = {castTime: 2, globalCooldown: 1, effects: [{type: "heal", affects: "self", amount: 10}]};
    const out = describeEffects(ability, {combatStats: combatStats({magic: {stat_contribution: 90}})});
    expect(out[0][0]).toBe("Heals self for 14"); // 10 + 1*2*2
  });

  it("describes resource effects", () => {
    const ability = {globalCooldown: 1, effects: [{type: "resource", affects: "self", resourceName: "fury", delta: 3}, {type: "resource", affects: "self", resourceName: "mana", delta: -2}]};
    expect(describeEffects(ability, noStats)).toEqual([["Restores 3 fury on self"], ["Drains 2 mana on self"]]);
  });

  it("describes a status with stat and recurring effects, hasting ticks", () => {
    const ability = {
      globalCooldown: 1,
      effects: [{
        type: "status", affects: "bTarget", duration: 10,
        status: {name: "Burn", treatAs: "debuff", effects: [
          {type: "recurring", tickRate: 2, onTick: "harm", amount: 5, school: "magic"},
          {type: "stat", statName: "damageDone", modifierType: "multiply", amount: 1.1},
        ]},
      }],
    };
    const out = describeEffects(ability, {combatStats: combatStats({magic: {haste_pct: 100}})});
    expect(out[0]).toEqual([
      "Applies Burn (debuff) to the target for 10s",
      "  Deals magic damage: 5 every 1s",
      "  Damage done x1.1",
    ]);
  });
});

describe("hastedCastTime", () => {
  it("is null for instants", () => {
    expect(hastedCastTime({castTime: null, effects: []}, combatStats())).toBeNull();
  });

  it("shrinks by the ability's school haste", () => {
    const ability = {castTime: 3, effects: [{type: "harm", school: "magic"}]};
    expect(hastedCastTime(ability, combatStats({magic: {haste_pct: 50}}))).toBe(2);
  });
});

describe("abilitySchool", () => {
  it("is magic if any effect is magic or a heal", () => {
    expect(abilitySchool({effects: [{type: "harm"}, {type: "heal"}]})).toBe("magic");
    expect(abilitySchool({effects: [{type: "harm"}]})).toBe("physical");
  });
});
