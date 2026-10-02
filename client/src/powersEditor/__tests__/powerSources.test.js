import {describe, it, expect, vi} from "vitest";
import {IMPORT_SOURCE_TYPES, expandPowers, powerUploadFiles} from "../powerSources";

function fakeClient(files, listings = {}) {
  return {
    fetchFile: vi.fn((path) => Promise.resolve(path in files ? JSON.stringify(files[path]) : null)),
    listDirectory: vi.fn((path) => Promise.resolve(listings[path] ?? [])),
  };
}

function sourceType(id) {
  return IMPORT_SOURCE_TYPES.find((type) => type.id === id);
}

describe("expandPowers", () => {
  it("replaces a $ref power with the referenced ability, rebasing its asset URLs", async () => {
    const client = fakeClient({
      "abilities/units/goblins/slash.json": {name: "Slash", iconURL: "../../../graphics/icons/slash.png"},
    });
    const data = {name: "Goblin", powers: [{$ref: "../abilities/units/goblins/slash.json", referenceTo: "ability"}, {name: "Inline"}]};

    const result = await expandPowers(client, data, "unit_types/goblin.json");

    expect(result.powers).toEqual([{name: "Slash", iconURL: "../graphics/icons/slash.png"}, {name: "Inline"}]);
  });

  it("throws when a $ref points at a missing file", async () => {
    const data = {powers: [{$ref: "../abilities/nope.json", referenceTo: "ability"}]};
    await expect(expandPowers(fakeClient({}), data, "unit_types/goblin.json")).rejects.toThrow(/abilities\/nope.json/);
  });
});

describe("IMPORT_SOURCE_TYPES", () => {
  describe("power library", () => {
    const listing = {abilities: ["abilities/top.json", "abilities/units/goblins/pound.json", "abilities/units/goblins/tangle.json", "abilities/classes/puncher/punch.json"]};

    it("lists each folder holding abilities as a source", async () => {
      const sources = await sourceType("library").listSources(fakeClient({}, listing), "classes/puncher.json");

      expect(sources).toEqual([
        {id: "abilities", label: "(top level)"},
        {id: "abilities/classes/puncher", label: "classes/puncher"},
        {id: "abilities/units/goblins", label: "units/goblins"},
      ]);
    });

    it("loads just that folder's own abilities, rebased to the owning file", async () => {
      const client = fakeClient(
        {"abilities/units/goblins/pound.json": {name: "Pound", iconURL: "../../../graphics/pound.png"}},
        {"abilities/units/goblins": ["abilities/units/goblins/pound.json", "abilities/units/goblins/deeper/x.json"]}
      );

      const powers = await sourceType("library").loadPowers(client, "abilities/units/goblins", "unit_types/small/troll.json");

      expect(powers).toEqual([{name: "Pound", iconURL: "../../graphics/pound.png"}]);
    });
  });

  describe("unit types", () => {
    it("lists every other unit type, skipping .full.json companions", async () => {
      const client = fakeClient({}, {unit_types: ["unit_types/goblin.json", "unit_types/goblin.full.json", "unit_types/troll.json"]});

      const sources = await sourceType("unitType").listSources(client, "unit_types/troll.json");

      expect(sources).toEqual([{id: "unit_types/goblin.json", label: "goblin"}]);
    });

    it("expands the source's powers and rebases them to the owning file", async () => {
      const client = fakeClient({"unit_types/goblin.json": {name: "Goblin", powers: [{name: "Bite", iconURL: "../graphics/bite.png"}]}});

      const powers = await sourceType("unitType").loadPowers(client, "unit_types/goblin.json", "classes/demo/brute.json");

      expect(powers).toEqual([{name: "Bite", iconURL: "../../graphics/bite.png"}]);
    });
  });

  describe("classes", () => {
    it("lists classes from classes/", async () => {
      const client = fakeClient({}, {classes: ["classes/puncher.json", "classes/demo.json"]});

      const sources = await sourceType("class").listSources(client, "unit_types/goblin.json");

      expect(sources.map((s) => s.label)).toEqual(["demo", "puncher"]);
    });
  });
});

describe("powerUploadFiles", () => {
  it("maps each upload to its field's path, relative to the owning file", () => {
    const icon = new File(["i"], "slash.png");
    const powers = [{name: "Slash", iconURL: "../graphics/icons/slash.png"}];

    expect(powerUploadFiles("classes/puncher.json", powers, {0: {iconURL: icon}})).toEqual({
      files: {"graphics/icons/slash.png": icon},
      missing: [],
    });
  });

  it("labels an upload whose field is blank", () => {
    const result = powerUploadFiles("classes/puncher.json", [{name: "Slash"}], {0: {iconURL: new File(["i"], "x.png")}});

    expect(result.missing).toEqual(["Slash iconURL"]);
  });
});
