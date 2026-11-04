import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { baseFiles, libraryRecords, openPlan, recordsDiffering, withoutLibrary } from "./keptOpen.js";

const json = (value) => strToU8(JSON.stringify(value, null, 2));

describe("baseFiles", () => {
  it("reads a repo's files as they are", () => {
    const files = new Map([["world.json", json({})]]);
    expect([...baseFiles(files).keys()]).toEqual(["world.json"]);
  });

  it("takes a zip's top directory off", () => {
    const zip = zipSync({ "top/world.json": json({}), "top/classes/a.json": json({}) });
    expect([...baseFiles(zip).keys()].sort()).toEqual(["classes/a.json", "world.json"]);
  });
});

describe("the library's part of a world", () => {
  const files = new Map([["world.json", json({ name: "x" })], ["classes/paladin1.json", json({ id: "paladin1" })], ["objects/abcd1234.json", json({ id: "abcd1234" })], ["places/continents/main/plates/0_0.plate", strToU8("bytes")]]);

  it("holds classes and objects, as compact JSON, and nothing else", () => {
    const records = libraryRecords(files);
    expect([...records.keys()].sort()).toEqual(["classes/paladin1.json", "objects/abcd1234.json"]);
    expect(records.get("classes/paladin1.json")).toBe('{"id":"paladin1"}');
  });

  it("counts what's different, new and gone", () => {
    const a = new Map([["x", "1"], ["y", "2"], ["z", "3"]]);
    const b = new Map([["x", "1"], ["y", "changed"], ["w", "4"]]);
    expect(recordsDiffering(a, b)).toBe(3);
    expect(recordsDiffering(a, a)).toBe(0);
  });

  it("drops only the library's changes", () => {
    const changes = new Map([["classes/paladin1.json", json({})], ["objects/abcd1234.json", null], ["places/continents/main/plates/0_0.plate", strToU8("moved")], ["world.json", json({})]]);
    expect([...withoutLibrary(changes).keys()].sort()).toEqual(["places/continents/main/plates/0_0.plate", "world.json"]);
  });
});

describe("openPlan", () => {
  const base = { kept: new Map(), source: { repo: "me/world", commitSha: "abc" }, repo: "me/world", head: "abc", changes: new Map() };

  it("keeps the commit it has, changes and all", () => {
    expect(openPlan(base)).toBe("keep");
    expect(openPlan({ ...base, changes: new Map([["a", null]]) })).toBe("keep");
    expect(openPlan({ ...base, repo: "ME/World" })).toBe("keep");
  });

  it("loads with nothing to lose", () => {
    expect(openPlan({ ...base, head: "def" })).toBe("load");
    expect(openPlan({ ...base, kept: null })).toBe("load");
  });

  it("asks before losing changes", () => {
    const changes = new Map([["a", null]]);
    expect(openPlan({ ...base, head: "def", changes })).toBe("ask");
    expect(openPlan({ ...base, repo: "me/other", changes })).toBe("ask");
  });
});
