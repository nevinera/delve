import { describe, expect, it } from "vitest";
import { addMastery, addResource, addSpecialization, grantNewAbility, grantNewStatus, offhandStrip, primaryStrip, removeSpecialization, requiresStrip, resourceKindStrip, resourceMaxStrip, resourceRegenStrip, settleStartingGear, startingOffhandStrip, startingWeaponStrip, toggleArmor, armorOf, weaponStrip } from "./classChoices.js";
import { classProblems } from "./classFile.js";
import { addTalent, pageTiles, GENERAL } from "./spellbook.js";
import { isPassive } from "./statusChoices.js";

describe("what a class wields and wears", () => {
  it("keeps stats and weapons in the order they're picked, since first means best", () => {
    const made = {};
    primaryStrip(made).pick("intellect");
    primaryStrip(made).pick("strength");
    expect(made.primaryStats).toEqual(["intellect", "strength"]);
    primaryStrip(made).pick("intellect");
    primaryStrip(made).pick("strength");
    expect(made).not.toHaveProperty("primaryStats");
    weaponStrip(made).pick("mace");
    weaponStrip(made).pick("sword");
    expect(made.weapons).toEqual(["mace", "sword"]);
  });

  it("doesn't offer a shield as a weapon", () => {
    expect(weaponStrip({}).options.map((o) => o.value)).not.toContain("shield");
    expect(offhandStrip({}).options.map((o) => o.value)).toContain("shield");
  });

  it("always starts with something it can hold, the first until told otherwise", () => {
    const made = {};
    weaponStrip(made).pick("mace");
    expect(made.startingGear).toEqual({ weapon: "mace" });
    expect(startingWeaponStrip(made)).toBeNull();
    weaponStrip(made).pick("sword");
    expect(startingWeaponStrip(made).options.map((o) => o.value)).toEqual(["mace", "sword"]);
    startingWeaponStrip(made).pick("sword");
    weaponStrip(made).pick("mace");
    expect(made.startingGear.weapon).toBe("sword");
    weaponStrip(made).pick("axe");
    weaponStrip(made).pick("sword");
    expect(made.startingGear.weapon).toBe("axe");
    weaponStrip(made).pick("axe");
    expect(made).not.toHaveProperty("startingGear");
  });

  it("can start with nothing in the off hand, until it has none to hold", () => {
    const made = {};
    expect(startingOffhandStrip(made)).toBeNull();
    offhandStrip(made).pick("shield");
    expect(made.startingGear).toEqual({ offhand: "shield" });
    offhandStrip(made).pick("orb");
    startingOffhandStrip(made).pick("none");
    offhandStrip(made).pick("shield");
    expect(made.startingGear.offhand).toBe("none");
    offhandStrip(made).pick("orb");
    expect(made).not.toHaveProperty("startingGear");
  });

  it("fills in what an older class left out", () => {
    const made = { weapons: ["maul", "sword"], offhands: ["shield"] };
    settleStartingGear(made);
    expect(made.startingGear).toEqual({ weapon: "maul", offhand: "shield" });
  });

  it("wears from level 1 until told otherwise", () => {
    const made = {};
    toggleArmor(made, "plate");
    expect(armorOf(made, "plate")).toEqual({ type: "plate", level: 1 });
    toggleArmor(made, "plate");
    expect(made).not.toHaveProperty("armor");
  });
});

describe("resources", () => {
  it("start with a key that's free, and pass the class's checks", () => {
    const made = { id: "x", name: "x" };
    expect(addResource(made, "mana")).toEqual({ key: "mana", kind: "mana", name: "Mana", color: "#4080e0" });
    expect(addResource(made, "points")).toMatchObject({ key: "points", max: 5 });
    expect(addResource(made, "points").key).toBe("points2");
    expect(classProblems(made)).toEqual([]);
  });

  it("only have a most and a regen as points", () => {
    const r = { key: "a", kind: "points", max: 5, regen: 1 };
    expect(resourceMaxStrip(r).value).toBe(5);
    resourceRegenStrip(r).pick(0);
    expect(r).not.toHaveProperty("regen");
    resourceKindStrip(r).pick("mana");
    expect(r).toEqual({ key: "a", kind: "mana" });
    expect(resourceMaxStrip(r)).toBeNull();
    expect(resourceRegenStrip(r)).toBeNull();
    resourceKindStrip(r).pick("points");
    expect(r.max).toBe(5);
  });
});

describe("specializations and mastery", () => {
  it("make a specialization with an id, and clear it from talents when it goes", () => {
    const made = { talents: { 15: [{ id: "t", grants: [{ status: "a", spec: "x" }] }] } };
    const spec = addSpecialization(made);
    expect(spec.id).toHaveLength(8);
    made.talents[15][0].grants[0].spec = spec.id;
    removeSpecialization(made, spec);
    expect(made).not.toHaveProperty("specializations");
    expect(made.talents[15][0].grants[0]).toEqual({ status: "a" });
  });

  it("make a mastery along with its status, held for good", () => {
    const made = {};
    const status = addMastery(made);
    expect(made.mastery.status).toBe(status.id);
    expect(status.kind).toBe("hidden");
    expect(isPassive(made, status.id)).toBe(true);
  });
});

describe("a talent", () => {
  it("is offered after one in the tier above", () => {
    const made = {};
    const above = addTalent(made, 15);
    const talent = addTalent(made, 20);
    expect(requiresStrip(made, above, 15)).toBeNull();
    requiresStrip(made, talent, 20).pick(above.id);
    expect(talent.requires).toBe(above.id);
    requiresStrip(made, talent, 20).pick("");
    expect(talent).not.toHaveProperty("requires");
  });

  it("gives a new ability, listed with the talents' on the spellbook", () => {
    const made = {};
    const talent = addTalent(made, 25);
    talent.name = "Vault";
    const ability = grantNewAbility(made, talent, talent.grants[0], "25");
    expect(ability).toMatchObject({ name: "Vault", level: 25 });
    expect(talent.grants[0].ability).toBe(ability.id);
    const { rows, fromTalents } = pageTiles(made, GENERAL);
    expect(rows).toEqual([]);
    expect(fromTalents.map((t) => t.id)).toEqual([ability.id]);
  });

  it("gives a new status, not shown and held for good", () => {
    const made = { statuses: [{ id: "s", name: "new status", kind: "buff" }] };
    const talent = addTalent(made, 15);
    grantNewStatus(made, talent, talent.grants[0], "s");
    expect(made.statuses[0].kind).toBe("hidden");
    expect(isPassive(made, "s")).toBe(true);
  });
});
