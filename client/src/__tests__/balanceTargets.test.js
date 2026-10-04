import {describe, it, expect} from "vitest";
import {unitTargets, classTargetDps, targetFit, classSurvivalTarget, classSurvivalFit, referenceDps, referenceTimeToKill} from "../balanceTargets";

const close = (actual, expected) => actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 1));

describe("unitTargets", () => {
  it("assumes open when untagged, and has no targets above g1 yet", () => {
    expect(unitTargets([]).intendedFor).toBe("open");
    expect(unitTargets(undefined).intendedFor).toBe("open");
    expect(unitTargets(["g3", "solo"])).toEqual({untargeted: "g3"});
  });

  it("gives the solo open targets, defaulting the pull size to solo", () => {
    const t = unitTargets(["open"]);
    expect(t.pull).toBe("solo");
    close(t.hp, [300, 300]);
    close(t.dps, [8.33, 8.33]);
  });

  it("splits a pull's budget across its units", () => {
    const pair = unitTargets(["open", "pair"]);
    close(pair.hp, [195, 195]);
    close(pair.dps, [5.13, 5.13]);
    const swarm = unitTargets(["g1", "swarm"]);
    close(swarm.hp, [178.1, 285]);
    close(swarm.dps, [2.03, 3.04]);
  });

  it("gives g5 trash-pull units matching the party targets", () => {
    const t = unitTargets(["g5", "group"]);
    close(t.hp, [687.5, 916.7]);
    close(t.dps, [25.45, 31.8]);
  });

  it("applies role multipliers", () => {
    const t = unitTargets(["open", "glass", "melee"]);
    close(t.hp, [150, 150]);
    close(t.dps, [10.83, 10.83]);
    close(unitTargets(["open", "healer"]).hp, [201, 201]);
  });

  it("gives the time-to-kill target per gear profile and elevation", () => {
    const t = unitTargets(["open"]);
    close(t.ttd("offense", 0), [60, 60]);
    close(t.ttd("defense", -10), [138.5, 138.5]); // 500 * 3 / (8.33 * 1.3)
    expect(t.ttd("offense", 10)).toBeNull();
  });
});

describe("classTargetDps", () => {
  it("drops with elevation and by stat priority", () => {
    expect(classTargetDps(0)).toBe(25);
    expect(classTargetDps(-5)).toBe(20);
    expect(classTargetDps(-10)).toBe(10);
    expect(classTargetDps(0, "tank")).toBeCloseTo(16.67, 1);
    expect(classTargetDps(0, "healing")).toBeCloseTo(16.67, 1);
    expect(classTargetDps(-5, "hybrid")).toBe(16);
    expect(classTargetDps(0, "unknown")).toBe(25);
    expect(classTargetDps(10)).toBeNull();
  });
});

describe("targetFit", () => {
  it("rates within 10% on, within 25% near, else off", () => {
    expect(targetFit(26, [25, 25])).toBe("on");
    expect(targetFit(25, [20, 30])).toBe("on");
    expect(targetFit(30, [25, 25])).toBe("near");
    expect(targetFit(40, [25, 25])).toBe("off");
  });
});

describe("classSurvivalTarget", () => {
  it("gives the doc's solo open numbers for each gear profile", () => {
    const squishy = classSurvivalTarget({priority: "dps", intendedFor: "open", pull: "solo", ee: 0});
    expect(squishy).toMatchObject({ttk: 12});
    expect(squishy.hpLost).toBeCloseTo(0.2, 3);
    expect(squishy.ttd).toBeCloseTo(60, 1);

    const hybrid = classSurvivalTarget({priority: "hybrid", intendedFor: "open", pull: "solo", ee: 0});
    expect(hybrid.ttk).toBeCloseTo(15, 1);
    expect(hybrid.hpLost).toBeCloseTo(0.125, 3);

    const tank = classSurvivalTarget({priority: "tank", intendedFor: "open", pull: "solo", ee: -5});
    expect(tank.ttk).toBeCloseTo(22.5, 1);
    expect(tank.hpLost).toBeCloseTo(0.15, 3);
  });

  it("treats a healer as a squishy that kills like a tank", () => {
    const healing = classSurvivalTarget({priority: "healing", intendedFor: "open", pull: "solo", ee: 0});
    expect(healing.ttk).toBeCloseTo(18, 1);
    expect(healing.hpLost).toBeCloseTo(0.3, 3);
  });

  it("applies the g1 and pull size multipliers", () => {
    const g1 = classSurvivalTarget({priority: "dps", intendedFor: "g1", pull: "solo", ee: 0});
    expect(g1.hpLost).toBeCloseTo(0.65, 3);
    const swarm = classSurvivalTarget({priority: "dps", intendedFor: "g1", pull: "swarm", ee: 0});
    expect(swarm.ttk).toBeCloseTo(57, 1);
    expect(swarm.hpLost).toBeCloseTo(1.04, 2);
    expect(swarm.ttd).toBeCloseTo(32, 0);
  });

  it("has no target for an unknown priority, elevation or untargeted content", () => {
    expect(classSurvivalTarget({priority: "bard", intendedFor: "open", pull: "solo", ee: 0})).toBeNull();
    expect(classSurvivalTarget({priority: "dps", intendedFor: "open", pull: "solo", ee: 10})).toBeNull();
    expect(classSurvivalTarget({priority: "dps", intendedFor: "g5", pull: "solo", ee: 0})).toBeNull();
  });
});

describe("classSurvivalFit", () => {
  const target = {ttk: 12, hpLost: 0.2, ttd: 60};
  const cell = {priority: "dps", elevation: 0, survives: false, ttd: 61, hpLostPct: 21};

  it("rates the two metrics separately", () => {
    expect(classSurvivalFit(cell, target)).toEqual({ttd: "on", hpLost: "on"});
    expect(classSurvivalFit({...cell, ttd: 20, hpLostPct: 40}, target)).toEqual({ttd: "off", hpLost: "off"});
  });

  it("counts surviving as on target for tanks and healers at ee 0, and too tanky otherwise", () => {
    expect(classSurvivalFit({...cell, priority: "tank", survives: true}, target).ttd).toBe("on");
    expect(classSurvivalFit({...cell, priority: "healing", survives: true}, target).ttd).toBe("on");
    expect(classSurvivalFit({...cell, priority: "tank", elevation: -5, survives: true}, target).ttd).toBe("tanky");
    expect(classSurvivalFit({...cell, survives: true}, target).ttd).toBe("tanky");
  });

  it("rates nothing without a target", () => {
    expect(classSurvivalFit(cell, null)).toEqual({ttd: null, hpLost: null});
  });
});

describe("referenceDps and referenceTimeToKill", () => {
  it("slows with elevation and by gear profile", () => {
    expect(referenceDps("offense", 0)).toBe(25);
    expect(referenceDps("defense", -10)).toBeCloseTo(6.67, 2);
    expect(referenceDps("offense", 10)).toBeNull();
    expect(referenceDps("bard", 0)).toBeNull();
  });

  it("is the unit's HP over that damage, matching the doc's tank row", () => {
    expect(referenceTimeToKill(300, "offense", 0)).toBe(12);
    expect(referenceTimeToKill(300, "defense", -10)).toBeCloseTo(45, 1);
    expect(referenceTimeToKill(undefined, "offense", 0)).toBeNull();
  });

  it("gives a unit's target as its HP range over the reference damage", () => {
    close(unitTargets(["open"]).ttk("offense", 0), [12, 12]);
    close(unitTargets(["g1", "swarm"]).ttk("offense", 0), [7.1, 11.4]);
    expect(unitTargets(["open"]).ttk("offense", 10)).toBeNull();
  });
});
