import { describe, expect, it } from "vitest";
import { SOUNDS, VISUALS } from "./stock.js";
import { releaseRole, abilityTimeline, amountText, hitOn, hitText, moveAt } from "./timeline.js";

const kinds = ({ events }, kind) => events.filter((e) => e.kind === kind);
const damage = { type: "damage", affects: "target", amount: 10 };

describe("an ability's timeline", () => {
  it("swings a melee ability and lands it partway through", () => {
    const line = abilityTimeline({ name: "Jab", target: "enemy", range: "melee", effects: [damage] });
    expect(kinds(line, "clip")).toEqual([{ at: 0, kind: "clip", role: "attack", speed: 1 }]);
    expect(kinds(line, "hit")[0].at).toBeCloseTo(0.3);
    expect(kinds(line, "bar")).toEqual([]);
  });

  it("casts, lets go, and lands when the projectile arrives", () => {
    const ability = {
      name: "Bolt",
      school: "frost",
      target: "enemy",
      range: 120,
      castTime: 2,
      speed: 60,
      effects: [damage, { type: "resource", affects: "self", resource: "mana", amount: 1 }],
      visuals: [{ effect: "bolt", when: "launch", colors: ["#111111", "#222222"] }, { effect: "burst", when: "impact" }],
      sounds: [{ sound: "frost", when: "cast" }, { sound: "impact", when: "impact" }],
    };
    const line = abilityTimeline(ability, { distance: 30 });
    expect(kinds(line, "bar")[0]).toMatchObject({ at: 0, until: 2 });
    expect(kinds(line, "clip").map((c) => [c.at, c.role])).toEqual([[0, "channel"], [2, "cast"]]);
    expect(kinds(line, "projectile")).toEqual([expect.objectContaining({ at: 2, until: 2.5, effect: "bolt", colors: ["#111111", "#222222"] })]);
    expect(kinds(line, "hit").map((h) => [h.at, h.effect.type])).toEqual([[2, "resource"], [2.5, "damage"]]);
    expect(kinds(line, "visual")).toEqual([expect.objectContaining({ at: 2.5, effect: "burst", on: "target" })]);
    expect(kinds(line, "sound").map((s) => [s.at, s.sound])).toEqual([[0, "frost"], [2.5, "impact"]]);
    expect(line.duration).toBeGreaterThan(2.5);
  });

  it("holds a melee ability's cast at the ready and swings straight out of it", () => {
    const line = abilityTimeline({ name: "Heave", target: "enemy", range: "melee", castTime: 2, animation: "bigAttack", effects: [damage] });
    expect(kinds(line, "clip").map((c) => [c.at, c.role, c.loop])).toEqual([[0, "windup", true], [2, "released", undefined]]);
  });

  it("makes a visual last the cast or channel when its duration says cast", () => {
    const visuals = [{ effect: "motes", when: "cast", duration: "cast" }];
    const lasts = (ability) => kinds(abilityTimeline({ target: "enemy", effects: [], visuals, ...ability }), "visual")[0];
    expect(lasts({ castTime: 2.5 })).toMatchObject({ heldByCast: true, params: { duration: 2.5 } });
    expect(lasts({ castTime: 2, channel: { duration: 3 } }).params.duration).toBe(5);
    expect(lasts({}).params.duration).toBe(0);
  });

  it("flies a trail with the projectile even if its duration says cast", () => {
    const visuals = [{ effect: "embers", when: "flight", duration: "cast" }];
    const [{ trails }] = kinds(abilityTimeline({ target: "enemy", speed: 60, castTime: 2, effects: [], visuals }, { distance: 30 }), "projectile");
    expect(trails[0].params.duration).toBeUndefined();
  });

  it("shoots rather than casts for a physical ability with a ranged weapon", () => {
    const shot = { target: "enemy", range: 100, school: "physical", effects: [] };
    expect(kinds(abilityTimeline(shot, { ranged: true }), "clip")[0].role).toBe("shoot");
    expect(kinds(abilityTimeline(shot), "clip")[0].role).toBe("cast");
    expect(kinds(abilityTimeline({ ...shot, school: "fire" }, { ranged: true }), "clip")[0].role).toBe("cast");
  });

  it("lands a channel's effects on each tick", () => {
    const line = abilityTimeline({ name: "Drain", target: "enemy", range: 60, channel: { duration: 3, ticks: 3 }, effects: [damage], sounds: [{ sound: "shadow", when: "channel" }] });
    expect(kinds(line, "hit").map((h) => h.at)).toEqual([1, 2, 3]);
    expect(kinds(line, "sound").map((s) => s.at)).toEqual([1, 2, 3]);
    expect(kinds(line, "bar")[0]).toMatchObject({ until: 3, draining: true });
  });

  it("marks what an area effect covers", () => {
    const line = abilityTimeline({ target: "ground", range: 90, effects: [{ type: "damage", affects: "enemies", around: "ground", radius: 20 }], visuals: [{ effect: "ring", when: "impact" }] });
    expect(kinds(line, "area")[0]).toMatchObject({ radius: 20, around: "ground" });
    expect(kinds(line, "visual")[0].on).toBe("ground");
  });

  it("runs in on a charge, then attacks", () => {
    const line = abilityTimeline({ target: "enemy", range: 75, effects: [{ type: "move", affects: "self", kind: "charge", speed: 50 }] }, { distance: 55 });
    expect(kinds(line, "clip").map((c) => c.role)).toContain("run");
    expect(kinds(line, "clip").at(-1)).toMatchObject({ role: "attack", at: 1 });
  });
});

describe("moves", () => {
  it("carries the caster to melee on a charge, and no further", () => {
    expect(moveAt({ kind: "charge", speed: 50 }, 0.5, 55).caster).toEqual([25, 0]);
    expect(moveAt({ kind: "charge", speed: 50 }, 5, 55).caster).toEqual([50, 0]);
  });

  it("arcs a leap, landing on the ground", () => {
    expect(moveAt({ kind: "leap", height: 8 }, 0.4, 25).caster[1]).toBeCloseTo(8);
    expect(moveAt({ kind: "leap", height: 8 }, 2, 25).caster).toEqual([20, 0]);
  });

  it("pushes and pulls the target", () => {
    expect(moveAt({ kind: "knockback", distance: 15 }, 2, 30).target).toEqual([15, 0]);
    expect(moveAt({ kind: "pull" }, 2, 30).target).toEqual([-25, 0]);
    expect(moveAt({ kind: "pull" }, -1, 30)).toEqual({});
  });
});

describe("what's shown", () => {
  it("reads each way of writing an amount", () => {
    expect(amountText(120)).toBe("120");
    expect(amountText([80, 120])).toBe("80-120");
    expect(amountText({ base: 5, spellPower: 1.1 })).toBe("5 + 1.1 × spell power");
    expect(amountText({ base: 5, perSpent: { attackPower: 0.2 } })).toBe("5 + 0.2 × attack power per point");
  });

  it("names what lands, and on whom", () => {
    expect(hitText({ type: "status", status: "c" }, [{ id: "c", name: "Chilled" }])).toBe("Chilled");
    expect(hitText({ type: "heal", amount: 5 })).toBe("+5");
    expect(hitOn({ affects: "self" }, { target: "enemy" })).toBe("caster");
    expect(hitOn({ affects: "target" }, { target: "self" })).toBe("caster");
    expect(hitOn({ affects: "target" }, { target: "enemy" })).toBe("target");
  });

  it("has unique stock names", () => {
    expect(new Set(VISUALS).size).toBe(VISUALS.length);
    expect(new Set(SOUNDS).size).toBe(SOUNDS.length);
  });
});

describe("releaseRole", () => {
  it("plays the nearest clip to the ability's animation", () => expect(releaseRole({ animation: "shieldBash", range: "melee" })).toBe("bigAttack"));
  it("plays nothing for none", () => expect(releaseRole({ animation: "none", range: "melee" })).toBeNull());
  it("goes by the ability without one", () => expect(releaseRole({ range: "melee" })).toBe("attack"));
});

describe("particle visuals on the timeline", () => {
  const ability = { name: "Test", school: "fire", target: "enemy", speed: 30, range: 40, visuals: [{ effect: "embers", when: "flight", rate: 5 }, { effect: "sparks", when: "impact", count: 9 }] };

  it("carries a visual's parameters", () => {
    const { events } = abilityTimeline(ability, { distance: 30 });
    const sparks = events.find((e) => e.kind === "visual" && e.effect === "sparks");
    expect(sparks.params.count).toBe(9);
  });

  it("puts flight visuals on the projectile", () => {
    const { events } = abilityTimeline(ability, { distance: 30 });
    expect(events.filter((e) => e.kind === "visual" && e.effect === "embers")).toEqual([]);
    expect(events.find((e) => e.kind === "projectile").trails.map((t) => t.effect)).toEqual(["embers"]);
  });
});
