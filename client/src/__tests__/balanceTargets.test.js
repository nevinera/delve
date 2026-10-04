import {describe, it, expect} from "vitest";
import {unitTargets, classTargetDps, targetFit} from "../balanceTargets";

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
  it("drops with elevation and for tanks or healers", () => {
    expect(classTargetDps(0)).toBe(25);
    expect(classTargetDps(-5)).toBe(20);
    expect(classTargetDps(-10)).toBe(10);
    expect(classTargetDps(0, "support")).toBeCloseTo(16.67, 1);
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
