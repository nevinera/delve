import { describe, expect, it } from "vitest";
import { addEffect, aimStrip, costOf, cooldownStrip, flightStrip, isFree, moveStrip, powerStrip, reachStrip, setAim, setWho, strengthStrip, timingStrip, toggleCost, whoChoices, whoOf, whoStrip } from "./abilityChoices.js";
import { newAbility } from "./classFile.js";

const made = { primaryStats: ["strength"], resources: [{ key: "rage", kind: "rage" }, { key: "oath", kind: "points" }] };
const ability = (more = {}) => ({ ...newAbility(), ...more });

describe("what it aims at", () => {
  it("takes the range away when it has no target", () => {
    const a = ability({ range: 30, speed: 40 });
    aimStrip(a).pick("self");
    expect(a.target).toBe("self");
    expect(a).not.toHaveProperty("range");
    expect(a).not.toHaveProperty("speed");
    expect(reachStrip(a)).toBeNull();
  });

  it("gives a range back when it needs one, a number for the ground", () => {
    const a = ability({ target: "self", range: undefined });
    delete a.range;
    setAim(a, "ally");
    expect(a.range).toBe(40);
    setAim(a, "enemy");
    expect(a.range).toBe(40);
    const melee = ability();
    setAim(melee, "ground");
    expect(melee.range).toBe(30);
    expect(reachStrip(melee).options.map((o) => o.value)).not.toContain("melee");
  });

  it("moves effects off a target it no longer has, and leaves the rest", () => {
    const a = ability();
    const hit = addEffect(made, a, "damage");
    const onYou = addEffect(made, a, "heal");
    const marks = { type: "consume", affects: "target" };
    a.effects.push(marks);
    expect(whoOf(hit)).toBe("target");
    expect(whoOf(onYou)).toBe("self");
    setAim(a, "none");
    expect(whoOf(hit)).toBe("enemies:self");
    expect(hit.radius).toBe(8);
    expect(whoOf(onYou)).toBe("self");
    expect(marks.affects).toBe("target");
    setAim(a, "ground");
    expect(whoOf(hit)).toBe("enemies:self");
  });
});

describe("reach and flight", () => {
  it("only offers flight to what's at a distance", () => {
    const a = ability();
    expect(flightStrip(a)).toBeNull();
    reachStrip(a).pick(40);
    expect(a.range).toBe(40);
    const flight = flightStrip(a);
    expect(flight.value).toBe(0);
    flight.pick(50);
    expect(a.speed).toBe(50);
    flightStrip(a).pick(0);
    expect(a).not.toHaveProperty("speed");
    a.speed = 50;
    reachStrip(a).pick("melee");
    expect(a).not.toHaveProperty("speed");
  });
});

describe("timing", () => {
  it("is instant by leaving things out", () => {
    const a = ability({ castTime: 2 });
    expect(timingStrip(a).value).toBe(2);
    timingStrip(a).pick(0);
    expect(a).not.toHaveProperty("castTime");
    cooldownStrip(a).pick(30);
    expect(a.cooldown).toBe(30);
    cooldownStrip(a).pick(0);
    expect(a).not.toHaveProperty("cooldown");
  });

  it("swaps a cast for a channel and back", () => {
    const a = ability({ castTime: 2 });
    timingStrip(a).pick("channel");
    expect(a).not.toHaveProperty("castTime");
    expect(a.channel).toEqual({ duration: 3, ticks: 3 });
    expect(timingStrip(a).value).toBe("channel");
    timingStrip(a).pick(1.5);
    expect(a).not.toHaveProperty("channel");
    expect(a.castTime).toBe(1.5);
  });
});

describe("cost", () => {
  it("toggles a resource, and is free with none", () => {
    const a = ability();
    expect(isFree(a)).toBe(true);
    toggleCost(made, a, "oath");
    expect(costOf(a, "oath")).toEqual({ resource: "oath", amount: 1 });
    toggleCost(made, a, "rage");
    expect(costOf(a, "rage").amount).toBe(10);
    toggleCost(made, a, "oath");
    toggleCost(made, a, "rage");
    expect(a).not.toHaveProperty("cost");
  });
});

describe("effects", () => {
  it("start on what's likeliest for the aim and the class", () => {
    expect(addEffect(made, ability(), "damage")).toEqual({ type: "damage", affects: "target", amount: { attackPower: 1 } });
    expect(addEffect({ primaryStats: ["intellect"] }, ability({ target: "ally" }), "heal")).toEqual({ type: "heal", affects: "target", amount: { spellPower: 1 } });
    expect(whoOf(addEffect(made, ability({ target: "ground" }), "damage"))).toBe("enemies:ground");
    expect(whoOf(addEffect(made, ability({ target: "self" }), "status"))).toBe("self");
    expect(addEffect(made, ability(), "resource")).toMatchObject({ affects: "self", resource: "rage", amount: 1 });
    expect(addEffect(made, ability(), "move")).toMatchObject({ kind: "charge", affects: "self" });
    expect(addEffect(made, ability({ target: "ground" }), "area")).toMatchObject({ affects: "enemies", around: "ground", radius: 10, lasts: 8, every: 1 });
  });

  it("set who they land on, cleaning up after an area", () => {
    const e = { type: "damage", affects: "target" };
    setWho(e, "enemies:cone");
    expect(e).toEqual({ type: "damage", affects: "enemies", cone: 90, radius: 8 });
    setWho(e, "enemies:target");
    expect(e).toEqual({ type: "damage", affects: "enemies", around: "target", radius: 8 });
    setWho(e, "target");
    expect(e).toEqual({ type: "damage", affects: "target" });
  });

  it("don't offer to hurt allies or heal enemies", () => {
    const a = ability();
    expect(whoChoices(a, { type: "damage" }).filter((w) => w.startsWith("allies") || w === "self")).toEqual([]);
    expect(whoChoices(a, { type: "heal" }).filter((w) => w.startsWith("enemies"))).toEqual([]);
  });

  it("still show a target the choices don't offer", () => {
    const strip = whoStrip(ability(), { type: "status", affects: "hit" });
    expect(strip.value).toBe("hit");
    expect(strip.options.find((o) => o.value === "hit").label).toBe("Whoever it hits");
  });

  it("keep the rest of an amount when the strength or power changes", () => {
    const e = { type: "damage", affects: "target", amount: { base: 10, attackPower: 1.4, weapon: 1 } };
    expect(strengthStrip(made, e).value).toBe(1.4);
    strengthStrip(made, e).pick(2.5);
    expect(e.amount).toEqual({ base: 10, attackPower: 2.5, weapon: 1 });
    powerStrip(made, e).pick("spellPower");
    expect(e.amount).toEqual({ base: 10, spellPower: 2.5, weapon: 1 });
    expect(powerStrip(made, e).value).toBe("spellPower");
  });

  it("move whoever the kind of movement moves", () => {
    const a = ability();
    const e = addEffect(made, a, "move");
    moveStrip(a, e).pick("knockback");
    expect(e).toMatchObject({ kind: "knockback", affects: "target", distance: 20 });
    moveStrip(a, e).pick("charge");
    expect(e.affects).toBe("self");
    expect(e).not.toHaveProperty("distance");
  });
});
