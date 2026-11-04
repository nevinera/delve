import { describe, expect, it } from "vitest";
import { heldStatuses, knownAbilities } from "./build.js";
import { asUsed, hitWords, nextTarget, pickNearest, shownResources } from "./combat.js";

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
  it("says what a dispel removed and what an interrupt stopped", () => {
    const statuses = [{ id: "pois", name: "Poison" }];
    const abilities = [{ id: "bolt", name: "Bolt" }];
    expect(hitWords({ effect: "dispel", removed: "pois" }, statuses).text).toBe("Poison removed");
    expect(hitWords({ effect: "dispel", removed: "gone" }, statuses).text).toBe("gone removed");
    expect(hitWords({ effect: "interrupt", stopped: "bolt" }, statuses, abilities).text).toBe("Bolt interrupted");
  });

  it("shows damage, marking a crit", () => expect(hitWords({ effect: "damage", amount: 40, crit: true })).toEqual({ text: "40!", kind: "damage" }));
  it("shows healing", () => expect(hitWords({ effect: "heal", amount: 9 })).toEqual({ text: "+9", kind: "heal" }));
  it("names a status", () => expect(hitWords({ effect: "status", status: "c" }, [{ id: "c", name: "Chilled" }]).text).toBe("Chilled"));
  it("says when it was dodged or parried", () => expect(hitWords({ effect: "damage", missed: true, avoided: "parry" })).toEqual({ text: "parry", kind: "miss" }));
  it("says when it was blocked", () => expect(hitWords({ effect: "damage", amount: 4, blocked: true }).text).toBe("4 blocked"));
  it("says when it missed", () => expect(hitWords({ effect: "damage", missed: true })).toEqual({ text: "miss", kind: "miss" }));
  it("marks a tick apart from a direct hit", () => {
    expect(hitWords({ effect: "damage", amount: 5, ticked: "bleed" })).toEqual({ text: "5", kind: "damage combat-float-tick" });
    expect(hitWords({ effect: "heal", amount: 5, ticked: "mend" })).toEqual({ text: "+5", kind: "heal combat-float-tick" });
  });
  it("says nothing of the rest", () => expect(hitWords({ effect: "resource" })).toBeNull());
});

describe("an ability as it's used", () => {
  const ability = { id: "a", castTime: 2, channel: { duration: 3, ticks: 3 }, cost: [{ resource: "x", amount: 1 }] };
  it("takes the server's numbers", () => expect(asUsed(ability, { castTime: 1, channel: { duration: 6 }, cost: [{ resource: "x", amount: 2 }] })).toEqual({ id: "a", castTime: 1, channel: { duration: 6, ticks: 3 }, cost: [{ resource: "x", amount: 2 }] }));
  it("keeps its own when the server says nothing", () => expect(asUsed(ability, {})).toEqual(ability));
  it("takes the school and animation in force", () => expect(asUsed({ school: "holy", animation: "cast" }, { school: "physical", animation: "attack" })).toEqual({ school: "physical", animation: "attack" }));
  it("takes a cast time of none", () => expect(asUsed(ability, { castTime: 0 }).castTime).toBe(0));
});

describe("what you know", () => {
  const made = {
    resources: [{ key: "conviction" }, { key: "oath" }],
    specializations: [{ id: "s", abilities: ["spec"] }],
    talents: { 15: [{ id: "t", grants: [{ ability: "talent" }] }] },
    abilities: [{ id: "third", level: 3, cost: [{ resource: "oath" }] }, { id: "first", level: 1 }, { id: "spec", level: 1 }, { id: "talent", level: 1 }, { id: "fifth", level: 5, effects: [{ type: "resource", resource: "oath" }] }],
  };
  const ids = (list) => list.map((a) => a.id);

  it("goes by level, lowest first", () => expect(ids(knownAbilities(made, 3))).toEqual(["first", "third"]));
  it("leaves out what a spec or talent gives", () => expect(ids(knownAbilities(made, 20))).toEqual(["first", "third", "fifth"]));
  it("holds passives from their level, and mastery always", () => {
    const holder = { passives: [{ status: "a" }, { status: "b", level: 10 }], mastery: { status: "m" } };
    expect(heldStatuses(holder, 9)).toEqual(["a", "m"]);
    expect(heldStatuses(holder, 10)).toEqual(["a", "b", "m"]);
    expect(heldStatuses({}, 10)).toEqual([]);
  });
  it("shows the primary resource from the start", () => expect(ids(shownResources(made, []).map((r) => ({ id: r.key })))).toEqual(["conviction"]));
  it("shows another once something you know spends it", () => expect(shownResources(made, knownAbilities(made, 3))).toHaveLength(2));
  it("shows another once something you know gives it", () => expect(shownResources(made, [made.abilities[4]])).toHaveLength(2));
});
