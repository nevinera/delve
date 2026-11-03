import { describe, expect, it } from "vitest";
import { classPath, classProblems, classesOf, newAbility, newClass, newStatus } from "./classFile.js";
import { readAmount, setKey, writeAmount } from "./form.js";
import { readCondition, writeCondition } from "./fields.js";

const worldOf = (...classes) => ({
  files: new Map([["world.json", {}], ["objects/abcd1234.json", {}], ...classes.map((c) => [classPath(c.id), c])]),
  readJson(path) {
    return this.files.get(path);
  },
});

describe("classes", () => {
  it("makes a class with a file name the world accepts", () => {
    const made = newClass("Monk", () => 0.5);
    expect(made).toEqual({ id: "iiiiiiii", name: "Monk" });
    expect(classPath(made.id)).toBe("classes/iiiiiiii.json");
  });

  it("lists only the world's classes, by name", () => {
    const [b, a] = [{ id: "bbbbbbbb", name: "Monk" }, { id: "aaaaaaaa", name: "Cleric" }];
    expect(classesOf(worldOf(b, a))).toEqual([a, b]);
  });
});

describe("what's wrong with a class", () => {
  it("is nothing for a class that holds together", () => {
    const status = { ...newStatus(), id: "chil0001" };
    const made = {
      ...newClass(),
      resources: [{ key: "mana", name: "Mana", kind: "mana", color: "#0000ff" }],
      statuses: [status],
      abilities: [{ ...newAbility(), cost: [{ resource: "mana", percent: 2 }], effects: [{ type: "status", affects: "target", status: "chil0001" }] }],
      passives: [{ status: "chil0001", level: 1 }],
    };
    expect(classProblems(made)).toEqual([]);
  });

  it("names what a modify points at that's gone", () => {
    const made = {
      abilities: [{ id: "bolt0001", name: "Bolt" }],
      statuses: [
        { id: "good0001", name: "Good", effects: [{ type: "modify", abilities: ["bolt0001"], change: "cooldown", add: -2 }, { type: "modify", tag: "finisher", change: "damage", multiply: 1.1 }] },
        { id: "bad00001", name: "Bad", effects: [{ type: "modify", abilities: ["gone0001"], change: "cost", multiply: 0.5 }, { type: "modify", change: "cost", set: 0 }, { type: "modify", tag: "x", addEffects: [{ type: "status", affects: "self", status: "gone0002" }] }] },
      ],
    };
    expect(classProblems(made)).toEqual([
      "Bad modifies an ability this class doesn't have (gone0001).",
      "Bad needs an ability, a tag or a status to modify.",
      "Bad points at a status this class doesn't have (gone0002).",
    ]);
  });

  it("names the statuses a modify points at that are gone", () => {
    const made = {
      statuses: [
        { id: "good0001", name: "Good", effects: [{ type: "modify", statuses: ["good0001"], change: "duration", add: 2 }] },
        { id: "bad00001", name: "Bad", effects: [{ type: "modify", statuses: ["gone0001"], change: "maxStacks", add: 1 }, { type: "modify", statuses: ["good0001"], statusEffects: [{ type: "trigger", on: "cast", effect: { type: "status", affects: "self", status: "gone0002" } }] }] },
      ],
    };
    expect(classProblems(made)).toEqual([
      "Bad points at a status this class doesn't have (gone0001).",
      "Bad points at a status this class doesn't have (gone0002).",
    ]);
  });

  it("names what a trigger filter points at that's gone", () => {
    const made = {
      abilities: [{ id: "bolt0001", name: "Bolt" }],
      statuses: [
        { id: "good0001", name: "Good", effects: [{ type: "trigger", on: "cast", abilities: ["bolt0001"], statuses: ["good0001"], hit: "direct", effect: { type: "status", affects: "self", status: "good0001" } }] },
        { id: "bad00001", name: "Bad", effects: [{ type: "trigger", on: "crit", abilities: ["gone0001"], statuses: ["gone0002"] }] },
      ],
    };
    expect(classProblems(made)).toEqual([
      "Bad waits for an ability this class doesn't have (gone0001).",
      "Bad points at a status this class doesn't have (gone0002).",
    ]);
  });

  it("names what a narrowed stat counts that's gone", () => {
    const made = { statuses: [{ id: "good0001", name: "Good", effects: [{ type: "stat", stat: "damageDone", abilities: ["gone0001"], statuses: ["gone0002"], multiply: 1.1 }] }] };
    expect(classProblems(made)).toEqual([
      "Good counts an ability this class doesn't have (gone0001).",
      "Good points at a status this class doesn't have (gone0002).",
    ]);
  });

  it("reads and writes any-of conditions, and checks what's inside them", () => {
    const condition = { anyOf: [{ status: "bloo0001", on: "self" }, { status: "gone0001", on: "self" }] };
    expect(writeCondition(readCondition(condition))).toEqual(condition);
    const made = {
      abilities: [{ id: "bolt0001", name: "Bolt", effects: [{ type: "damage", affects: "target", when: [condition] }] }],
      statuses: [{ id: "bloo0001", name: "Blood", effects: [{ type: "none" }] }],
    };
    expect(classProblems(made)).toEqual(["Bolt points at a status this class doesn't have (gone0001)."]);
  });

  it("reads and writes not, targetIs and stacks conditions", () => {
    for (const condition of [{ not: { status: "bloo0001", on: "self" } }, { targetIs: "ally" }, { status: "bloo0001", on: "target", stacks: 5 }]) {
      expect(writeCondition(readCondition(condition))).toEqual(condition);
    }
    expect(classProblems({ statuses: [{ id: "bloo0001", name: "Blood", when: [{ not: { status: "gone0001", on: "self" } }], effects: [] }] })).toEqual([
      "Blood points at a status this class doesn't have (gone0001).",
    ]);
  });

  it("names what summons and units point at that's gone", () => {
    const made = {
      units: [{ id: "ghou0001", name: "Ghoul", abilities: ["claw0001", "gone0001"], autocast: ["bolt0001"] }],
      abilities: [
        { id: "claw0001", name: "Claw", effects: [] },
        { id: "bolt0001", name: "Bolt", effects: [{ type: "summon", unit: "ghou0001", statuses: ["gone0002"] }, { type: "summon", unit: "gone0003" }, { type: "command", ability: "gone0004", units: ["gone0005"] }] },
      ],
    };
    expect(classProblems(made)).toEqual([
      "Bolt points at a status this class doesn't have (gone0002).",
      "Bolt summons a unit this class doesn't have (gone0003).",
      "Bolt points at a unit this class doesn't have (gone0005).",
      "Bolt commands an ability this class doesn't have (gone0004).",
      "Ghoul uses an ability this class doesn't have (gone0001).",
      "Ghoul autocasts an ability it doesn't have (bolt0001).",
    ]);
  });

  it("names a param its target doesn't have", () => {
    const made = {
      statuses: [
        { id: "bark0001", name: "Bark", effects: [{ type: "stat", stat: "damageTaken", multiply: 0.8, param: "reduction" }] },
        { id: "oaks0001", name: "Oak", effects: [{ type: "modify", statuses: ["bark0001"], change: "reduction", add: -0.1 }, { type: "modify", statuses: ["bark0001"], change: "speed", add: 1 }, { type: "modify", statuses: ["bark0001"], change: "duration", add: 1 }] },
      ],
    };
    expect(classProblems(made)).toEqual(['Oak changes "speed", which Bark doesn\'t name.']);
  });

  it("names a cooldown effect's ability that's gone", () => {
    const made = { abilities: [{ id: "bolt0001", name: "Bolt", effects: [{ type: "cooldown", affects: "self", abilities: ["bolt0001", "gone0001"], by: 2 }] }] };
    expect(classProblems(made)).toEqual(["Bolt changes the cooldown of an ability this class doesn't have (gone0001)."]);
  });

  it("names what using up a status points at that's gone", () => {
    const made = {
      abilities: [{ id: "bolt0001", name: "Bolt", effects: [{ type: "consume", affects: "self", status: "gone0001" }] }],
      statuses: [{ id: "good0001", name: "Good", consumedBy: { abilities: ["bolt0001", "gone0002"], uses: 3 }, effects: [] }],
    };
    expect(classProblems(made)).toEqual([
      "Bolt points at a status this class doesn't have (gone0001).",
      "Good is used up by an ability this class doesn't have (gone0002).",
    ]);
  });

  it("names what points at what's gone", () => {
    const made = {
      ...newClass(),
      abilities: [{ ...newAbility(), name: "Bolt", cost: [{ resource: "ki", amount: 1 }], effects: [{ type: "status", affects: "target", status: "gone0001" }], requires: [{ status: "gone0002", on: "self" }] }],
      mastery: { name: "Focus" },
    };
    expect(classProblems(made)).toEqual([
      "Bolt uses a resource this class doesn't have (ki).",
      "Bolt points at a status this class doesn't have (gone0002).",
      "Bolt points at a status this class doesn't have (gone0001).",
      "The mastery needs a status picked.",
    ]);
  });
});

describe("form values", () => {
  it("takes a key away when it's left empty", () => {
    const value = { a: 1, b: 2, c: [1] };
    setKey(value, "a", "");
    setKey(value, "b", NaN);
    setKey(value, "c", []);
    setKey(value, "d", 0);
    expect(value).toEqual({ d: 0 });
  });

  it("writes an amount the shortest way that says it", () => {
    expect(writeAmount({ min: 5, max: 5 })).toBe(5);
    expect(writeAmount(readAmount({ maxHealth: 0.1, shareOfTrigger: 0.5 }))).toEqual({ maxHealth: 0.1, shareOfTrigger: 0.5 });
    expect(writeAmount({ min: 5 })).toBe(5);
    expect(writeAmount({ min: 5, max: 9 })).toEqual([5, 9]);
    expect(writeAmount({ spellPower: 1.1 })).toEqual({ spellPower: 1.1 });
    expect(writeAmount({ min: 2, max: 3, weapon: 1 })).toEqual({ base: [2, 3], weapon: 1 });
    expect(writeAmount({})).toBeUndefined();
  });

  it("reads back each way of writing an amount", () => {
    for (const amount of [5, [5, 9], { spellPower: 1.1 }, { base: 2, mastery: 0.5 }, { base: [2, 3], weapon: 1 }, { base: 3, perSpent: { attackPower: 0.2 } }, { perSpent: 5 }]) expect(writeAmount(readAmount(amount))).toEqual(amount);
    expect(readAmount(undefined)).toEqual({});
  });

  it("keeps each kind of condition through the form", () => {
    for (const condition of [{ health: "target", below: 20 }, { health: "self", above: 50 }, { status: "abcd1234", on: "self" }, { stealthed: true }, { inCombat: false }]) {
      expect(writeCondition(readCondition(condition))).toEqual(condition);
    }
  });
});

describe("classProblems and points spent", () => {
  const cost = [{ resource: "combo", amount: 1, all: true }];
  const resources = [{ key: "combo" }, { key: "energy" }];
  const scaling = { type: "damage", affects: "target", amount: { perSpent: 5 } };

  it("takes a finisher that spends all", () => {
    expect(classProblems({ resources, abilities: [{ name: "Finish", cost, effects: [scaling] }] })).toEqual([]);
  });

  it("says when something scales with no cost that spends all", () => {
    expect(classProblems({ resources, abilities: [{ name: "Finish", effects: [scaling] }] })).toEqual(["Finish scales with points spent, but no cost spends all."]);
    expect(classProblems({ resources, statuses: [{ id: "s" }], abilities: [{ name: "Finish", effects: [{ type: "status", affects: "target", status: "s", durationPerSpent: 6 }] }] })).toHaveLength(1);
  });

  it("says when more than one cost spends all", () => {
    const two = [...cost, { resource: "energy", amount: 1, all: true }];
    expect(classProblems({ resources, abilities: [{ name: "Finish", cost: two, effects: [] }] })).toEqual(["Finish spends all of more than one resource, so it can't tell what to scale with."]);
  });
});
