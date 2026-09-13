import {describe, it, expect, vi, beforeEach} from "vitest";
import {saveUnitType} from "../saveUnitType";
import {commitFiles} from "../../github/commitFiles";

vi.mock("../../github/commitFiles", () => ({
  commitFiles: vi.fn(),
}));

const availableAbilities = {
  "units/goblin-raider/slash": {ability: {name: "Slash", castTime: null}, assetMap: {}},
};

describe("saveUnitType", () => {
  beforeEach(() => {
    commitFiles.mockReset();
  });

  it("commits both unit-types/<key>.json and its resolved .full.json companion", async () => {
    commitFiles.mockResolvedValue({commitSha: "abc123", branch: "main"});
    const unitTypeData = {
      name: "Goblin Raider",
      powers: [{$ref: "../abilities/units/goblin-raider/slash.json", referenceTo: "ability"}],
    };

    const result = await saveUnitType("goblin-raider", unitTypeData, availableAbilities);

    expect(commitFiles).toHaveBeenCalledWith(
      {
        "unit-types/goblin-raider.json": unitTypeData,
        "unit-types/goblin-raider.full.json": {name: "Goblin Raider", powers: [{name: "Slash", castTime: null}]},
      },
      {message: "Update Goblin Raider"}
    );
    expect(result).toEqual({commitSha: "abc123", branch: "main"});
  });

  it("falls back to the key in the commit message when the unit type has no name", async () => {
    commitFiles.mockResolvedValue({commitSha: "x", branch: "main"});

    await saveUnitType("goblin-raider", {name: "", powers: []}, availableAbilities);

    expect(commitFiles).toHaveBeenCalledWith(expect.anything(), {message: "Update goblin-raider"});
  });

  it("commits a nested key's JSON at unit-types/<key>.json and .full.json", async () => {
    commitFiles.mockResolvedValue({commitSha: "x", branch: "main"});
    const unitTypeData = {name: "Raider", powers: []};

    await saveUnitType("goblins/raider", unitTypeData, {});

    expect(commitFiles).toHaveBeenCalledWith(
      {"unit-types/goblins/raider.json": unitTypeData, "unit-types/goblins/raider.full.json": unitTypeData},
      {message: "Update Raider"}
    );
  });

  it("rejects, without committing anything, when a power references an ability that wasn't loaded", async () => {
    const unitTypeData = {name: "Goblin Raider", powers: [{$ref: "../abilities/units/goblin-raider/missing.json", referenceTo: "ability"}]};

    await expect(saveUnitType("goblin-raider", unitTypeData, availableAbilities)).rejects.toThrow(/No ability loaded/);
    expect(commitFiles).not.toHaveBeenCalled();
  });
});
