import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_LOOK } from "../character/recipe.js";
import { abilityFields, classFields, lookFields, overridesField, readCondition, statusFields, writeCondition } from "./fields.js";
import { readAmount, writeAmount } from "./form.js";

const schema = (name) => JSON.parse(readFileSync(new URL(`../../../docs/schema/${name}.schema.json`, import.meta.url)));
const common = schema("common").$defs;
const status = schema("status").properties;
const ability = schema("ability").properties;
const made = {};
const conditionListOf = () => abilityFields(made).find((field) => field.key === "requires");

const keysOf = (fields) => new Set(fields.map((field) => field.key));
const fieldOf = (fields, key) => fields.find((field) => field.key === key);
const missing = (properties, fields, except = []) => Object.keys(properties).filter((key) => !keysOf(fields).has(key) && !except.includes(key));

describe("the class editor's fields", () => {
  const abilities = abilityFields(made);
  const statuses = statusFields(made);
  const classes = classFields(made);
  const effects = fieldOf(abilities, "effects").fields;
  const statusEffects = fieldOf(statuses, "effects").fields;

  it("reach every key of the format", () => {
    expect(missing(ability, abilities, ["id"])).toEqual([]);
    expect(missing(ability.cost.items.properties, fieldOf(abilities, "cost").fields)).toEqual([]);
    expect(missing(ability.channel.properties, fieldOf(abilities, "channel").fields)).toEqual([]);
    expect(missing(status, statuses, ["id"])).toEqual([]);
    expect(missing(common.effect.properties, effects)).toEqual([]);
    expect(missing(status.effects.items.properties, statusEffects)).toEqual([]);
    expect(missing(common.perCount.properties, fieldOf(effects, "perCount").fields)).toEqual([]);
    expect(missing(common.resource.properties, fieldOf(classes, "resources").fields)).toEqual([]);
    const defs = schema("class").$defs;
    expect(missing(defs.unit.properties, fieldOf(classes, "units").fields)).toEqual([]);
    expect(missing(defs.specialization.properties, fieldOf(classes, "specializations").fields)).toEqual([]);
    expect(missing(schema("class").properties, classes, ["id", "abilities", "statuses"])).toEqual([]);
  });

  it("reach every part of a look", () => {
    expect(Object.keys(DEFAULT_LOOK).filter((key) => !keysOf(lookFields()).has(key))).toEqual([]);
  });

  it("have no raw JSON inputs", () => {
    const types = (fields) => fields.flatMap((field) => [field.type, ...(Array.isArray(field.fields) ? types(field.fields) : [])]);
    for (const fields of [abilities, statuses, classes]) expect(types(fields)).not.toContain("json");
  });

  it("reach every part of an amount", () => {
    const parts = fieldOf(effects, "amount").more().map((field) => field.key);
    const shown = ["base", "attackPower", "spellPower", ...parts];
    expect(Object.keys(common.amount.oneOf[2].properties).filter((key) => !shown.includes(key))).toEqual([]);
  });

  it("leave the plain things out of advanced", () => {
    const plain = (fields) => fields.filter((field) => !field.advanced).map((field) => field.key);
    expect(plain(abilities)).toEqual(["name", "level", "description", "icon", "school", "target", "range", "castTime", "cooldown", "cost", "effects"]);
    const damage = { type: "damage", affects: "target" };
    expect(plain(effects.filter((field) => !field.show || field.show(damage)))).toEqual(["type", "affects", "amount", "school"]);
  });

  it("never fill in an advanced value by drawing it", () => {
    const pick = (fields) => fields.filter((field) => field.advanced && field.type === "select" && field.none === undefined).map((field) => field.key);
    for (const fields of [abilities, statuses, classes, effects, statusEffects]) expect(pick(fields)).toEqual([]);
  });
});

describe("overrides in the form", () => {
  const field = overridesField(made, "statuses", () => statusFields(made), ["duration"], () => true);

  it("come back the same, with a removed setting as null", () => {
    for (const overrides of [{ stacking: "stack" }, { duration: null }, { leash: null, effects: [{ type: "stat" }] }]) {
      expect(field.write(field.read(overrides))).toEqual(overrides);
    }
  });

  it("don't fill anything in or hide anything", () => {
    const fields = field.fields();
    expect(fields.filter((f) => f.type === "select" && f.none === undefined)).toEqual([]);
    expect(fields.filter((f) => f.show)).toEqual([]);
    expect(fields.map((f) => f.key)).not.toContain("name");
  });
});

describe("amounts in the form", () => {
  it("come back the same", () => {
    for (const amount of [5, [1, 3], { attackPower: 1.5 }, { base: 3, spellPower: 2 }, { base: [1, 2], weapon: 1 }, { perSpent: { attackPower: 0.2 } }, { shareOf: { of: "stored", share: 0.5 } }, { attackPower: 1, minimum: 2, maximum: { maxHealth: 0.1 }, byMissingHealth: { upTo: 2 } }]) {
      expect(writeAmount(readAmount(amount))).toEqual(amount);
    }
  });
});

describe("conditions in the form", () => {
  it("hold their inner conditions as the file does, for their lists to read", () => {
    const list = conditionListOf();
    const form = readCondition({ not: { position: "behind" } });
    const items = form.not.map(list.read);
    expect(items[0].kind).toBe("position");
    expect(writeCondition({ kind: "not", not: items.map(list.write) })).toEqual({ not: { position: "behind" } });
  });

  it("stay the kind you pick, before anything else is set", () => {
    for (const kind of ["state", "position", "since", "resource", "holders", "unitsOut", "inArea", "spentAtLeast", "targetsHitAtLeast", "outcome", "targetHealthBelowMine", "group", "wielding"]) {
      expect(readCondition(writeCondition({ kind })).kind).toBe(kind);
    }
  });

  it("come back the same", () => {
    for (const condition of [{ health: "self", below: 30 }, { status: "abcd0001", on: "self", stacks: 2 }, { wielding: "dual" }, { not: { state: "casting", on: "target" } }, { anyOf: [{ stealthed: true }, { inCombat: false }] }, { targetHealthBelowMine: true }]) {
      expect(writeCondition(readCondition(condition))).toEqual(condition);
    }
  });
});
