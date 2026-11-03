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
    expect(writeAmount({ min: 5 })).toBe(5);
    expect(writeAmount({ min: 5, max: 9 })).toEqual([5, 9]);
    expect(writeAmount({ spellPower: 1.1 })).toEqual({ spellPower: 1.1 });
    expect(writeAmount({ min: 2, max: 3, weapon: 1 })).toEqual({ base: [2, 3], weapon: 1 });
    expect(writeAmount({})).toBeUndefined();
  });

  it("reads back each way of writing an amount", () => {
    for (const amount of [5, [5, 9], { spellPower: 1.1 }, { base: 2, mastery: 0.5 }, { base: [2, 3], weapon: 1 }]) expect(writeAmount(readAmount(amount))).toEqual(amount);
    expect(readAmount(undefined)).toEqual({});
  });

  it("keeps each kind of condition through the form", () => {
    for (const condition of [{ health: "target", below: 20 }, { health: "self", above: 50 }, { status: "abcd1234", on: "self" }, { stealthed: true }, { inCombat: false }]) {
      expect(writeCondition(readCondition(condition))).toEqual(condition);
    }
  });
});
