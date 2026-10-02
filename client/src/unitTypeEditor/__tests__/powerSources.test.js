import {describe, it, expect, vi} from "vitest";
import {expandPowers, fetchLibraryPower, fetchUnitTypePowers, listUnitTypeFiles} from "../powerSources";

function fakeClient(files, listing = []) {
  return {
    fetchFile: vi.fn((path) => Promise.resolve(path in files ? JSON.stringify(files[path]) : null)),
    listDirectory: vi.fn().mockResolvedValue(listing),
  };
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

describe("fetchLibraryPower", () => {
  it("rebases a library ability's URLs to the unit type's (nested) file", async () => {
    const client = fakeClient({"abilities/units/pound.json": {name: "Pound", iconURL: "../../graphics/icons/pound.png"}});

    const power = await fetchLibraryPower(client, "small/troll", "abilities/units/pound.json");

    expect(power).toEqual({name: "Pound", iconURL: "../../graphics/icons/pound.png"});
  });
});

describe("fetchUnitTypePowers", () => {
  it("expands another unit type's powers and rebases them to this unit type's file", async () => {
    const client = fakeClient({
      "unit_types/goblin.json": {name: "Goblin", powers: [{name: "Bite", iconURL: "../graphics/bite.png"}]},
    });

    const powers = await fetchUnitTypePowers(client, "small/troll", "unit_types/goblin.json");

    expect(powers).toEqual([{name: "Bite", iconURL: "../../graphics/bite.png"}]);
  });
});

describe("listUnitTypeFiles", () => {
  it("keeps only .json files, sorted", async () => {
    const client = fakeClient({}, ["unit_types/b.json", "unit_types/a.json", "unit_types/.DS_Store"]);
    expect(await listUnitTypeFiles(client)).toEqual(["unit_types/a.json", "unit_types/b.json"]);
  });
});
